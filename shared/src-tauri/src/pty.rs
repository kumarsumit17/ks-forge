//! Terminal sessions: one shell (or other program) per pane, on a PTY on macOS and a
//! ConPTY on Windows through `portable-pty`.
//!
//! Output is read on a thread of its own and sent to the pane's channel as raw bytes, as
//! large as one read gives (up to 64 KiB), so a burst of output costs a few messages, not
//! one per line. xterm.js decodes UTF-8 itself, also across chunk boundaries.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};

use crate::integration::{self, Integration};
use crate::msg;
use crate::msg::Msg;

const READ_CHUNK: usize = 64 * 1024;
/// How long the last output may take to arrive after the program ended.
const EXIT_GRACE: std::time::Duration = std::time::Duration::from_secs(1);

/// What to start in a pane: a profile's program, with its folder and variables.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SpawnSpec {
    pub program: String,
    pub args: Vec<String>,
    /// Empty: the home folder. A folder that does not exist also falls back to home.
    pub cwd: String,
    pub env: HashMap<String, String>,
    pub shell_integration: bool,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Exit {
    pub id: u32,
    pub code: u32,
}

struct Session {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    pid: Option<u32>,
}

#[derive(Default)]
pub struct Ptys {
    next: AtomicU32,
    map: Mutex<HashMap<u32, Arc<Session>>>,
}

pub struct Context<'a> {
    pub home: &'a Path,
    pub integration_dir: &'a Path,
    pub version: &'a str,
}

impl Ptys {
    /// Starts `spec`. Output goes to `out`; `exited` runs once when the program ends,
    /// after its last output was sent.
    pub fn spawn(
        self: &Arc<Self>,
        spec: &SpawnSpec,
        ctx: &Context,
        out: impl Fn(Vec<u8>) + Send + 'static,
        exited: impl FnOnce(Exit) + Send + 'static,
    ) -> Result<u32, Msg> {
        let size = PtySize { rows: spec.rows.max(2), cols: spec.cols.max(2), pixel_width: 0, pixel_height: 0 };
        let pair = native_pty_system().openpty(size).map_err(|e| msg!("error.ptyOpen", detail = e))?;
        let cmd = build_command(spec, ctx);
        let mut child = pair.slave.spawn_command(cmd).map_err(|e| msg!("error.spawn", program = &spec.program, detail = e))?;
        drop(pair.slave);
        let reader = pair.master.try_clone_reader().map_err(|e| msg!("error.ptyOpen", detail = e))?;
        let writer = pair.master.take_writer().map_err(|e| msg!("error.ptyOpen", detail = e))?;
        let id = self.next.fetch_add(1, Ordering::Relaxed) + 1;
        let session = Arc::new(Session {
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            killer: Mutex::new(child.clone_killer()),
            pid: child.process_id(),
        });
        self.map.lock().expect("pty map").insert(id, session);

        let (done_tx, done_rx) = std::sync::mpsc::channel::<()>();
        std::thread::Builder::new()
            .name(format!("pty-read-{id}"))
            .spawn(move || {
                read_loop(reader, out);
                let _ = done_tx.send(());
            })
            .map_err(|e| msg!("error.spawn", program = &spec.program, detail = e))?;
        let ptys = Arc::clone(self);
        std::thread::Builder::new()
            .name(format!("pty-wait-{id}"))
            .spawn(move || {
                let code = child.wait().map(|s| s.exit_code()).unwrap_or(1);
                // Dropping the master closes the ConPTY on Windows. The last output is read
                // until the pipe ends, but ConPTY does not always end it, so the exit is
                // reported after at most EXIT_GRACE either way.
                ptys.map.lock().expect("pty map").remove(&id);
                let _ = done_rx.recv_timeout(EXIT_GRACE);
                exited(Exit { id, code });
            })
            .map_err(|e| msg!("error.spawn", program = &spec.program, detail = e))?;
        Ok(id)
    }

    fn get(&self, id: u32) -> Option<Arc<Session>> {
        self.map.lock().ok()?.get(&id).cloned()
    }

    pub fn write(&self, id: u32, data: &[u8]) -> Result<(), Msg> {
        let s = self.get(id).ok_or_else(|| msg!("error.noSession"))?;
        let mut w = s.writer.lock().map_err(|_| msg!("error.noSession"))?;
        w.write_all(data).and_then(|()| w.flush()).map_err(|e| msg!("error.write", detail = e))
    }

    pub fn resize(&self, id: u32, cols: u16, rows: u16) -> Result<(), Msg> {
        let s = self.get(id).ok_or_else(|| msg!("error.noSession"))?;
        let m = s.master.lock().map_err(|_| msg!("error.noSession"))?;
        m.resize(PtySize { rows: rows.max(2), cols: cols.max(2), pixel_width: 0, pixel_height: 0 })
            .map_err(|e| msg!("error.write", detail = e))
    }

    pub fn kill(&self, id: u32) {
        if let Some(s) = self.get(id)
            && let Ok(mut k) = s.killer.lock()
        {
            let _ = k.kill();
        }
    }

    pub fn ids(&self) -> Vec<u32> {
        self.map.lock().map(|m| m.keys().copied().collect()).unwrap_or_default()
    }

    pub fn kill_all(&self) {
        let ids: Vec<u32> = self.map.lock().map(|m| m.keys().copied().collect()).unwrap_or_default();
        for id in ids {
            self.kill(id);
        }
    }

    /// The sessions where a program other than the shell itself is running (macOS: the
    /// terminal's foreground process group is not the shell's; Windows: the shell has a
    /// child process).
    pub fn busy(&self, ids: &[u32]) -> Vec<u32> {
        ids.iter().copied().filter(|id| self.get(*id).is_some_and(|s| is_busy(&s))).collect()
    }
}

#[cfg(unix)]
fn is_busy(s: &Session) -> bool {
    let Some(pid) = s.pid else { return false };
    let leader = s.master.lock().ok().and_then(|m| m.process_group_leader());
    leader.is_some_and(|l| l > 0 && l as u32 != pid)
}

/// ConPTY does not report a foreground program, so the shell's child processes tell.
#[cfg(windows)]
fn is_busy(s: &Session) -> bool {
    s.pid.is_some_and(crate::platform::has_running_children)
}

#[cfg(not(any(unix, windows)))]
fn is_busy(_: &Session) -> bool {
    false
}

fn read_loop(mut reader: Box<dyn Read + Send>, out: impl Fn(Vec<u8>)) {
    let mut buf = vec![0u8; READ_CHUNK];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => out(buf[..n].to_vec()),
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => {}
            Err(_) => break,
        }
    }
}

/// The folder a session starts in: the spec's when it is a folder, else home.
pub fn start_dir(cwd: &str, home: &Path) -> PathBuf {
    let p = Path::new(cwd);
    if !cwd.is_empty() && p.is_absolute() && p.is_dir() { p.to_path_buf() } else { home.to_path_buf() }
}

fn build_command(spec: &SpawnSpec, ctx: &Context) -> CommandBuilder {
    let mut program = spec.program.clone();
    let mut args = spec.args.clone();
    let mut env: Vec<(String, String)> = Vec::new();
    if spec.shell_integration {
        let Integration { program: p, args: a, env: e } = integration::apply(&program, &args, ctx.integration_dir);
        program = p;
        args = a;
        env = e;
    }
    let mut cmd = CommandBuilder::new(&program);
    cmd.args(&args);
    cmd.cwd(start_dir(&spec.cwd, ctx.home));
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "KSForge");
    cmd.env("TERM_PROGRAM_VERSION", ctx.version);
    // Apps opened from the Finder or Dock get no LANG; shells then treat text as ASCII.
    if cfg!(target_os = "macos") && std::env::var_os("LANG").is_none() && std::env::var_os("LC_ALL").is_none() {
        cmd.env("LANG", "en_US.UTF-8");
    }
    for (k, v) in env {
        cmd.env(k, v);
    }
    for (k, v) in &spec.env {
        if !k.is_empty() && !k.contains('=') {
            cmd.env(k, v);
        }
    }
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;

    fn run(spec: SpawnSpec) -> (String, u32) {
        let ptys = Arc::new(Ptys::default());
        let home = std::env::temp_dir();
        let ctx = Context { home: &home, integration_dir: &home, version: "0.0.0" };
        let (tx, rx) = mpsc::channel::<Option<Vec<u8>>>();
        let tx2 = tx.clone();
        let code = Arc::new(Mutex::new(None));
        let code2 = Arc::clone(&code);
        let id = ptys.spawn(
            &spec,
            &ctx,
            move |b| {
                let _ = tx.send(Some(b));
            },
            move |e| {
                *code2.lock().unwrap() = Some(e.code);
                let _ = tx2.send(None);
            },
        )
        .expect("spawn");
        let mut out = Vec::new();
        let mut answered = false;
        while let Ok(Some(b)) = rx.recv_timeout(Duration::from_secs(20)) {
            out.extend(b);
            // ConPTY asks for the cursor position at start and waits for the answer, as a
            // terminal (xterm.js in the app) gives it.
            if !answered && out.windows(4).any(|w| w == b"\x1b[6n") {
                answered = true;
                let _ = ptys.write(id, b"\x1b[1;1R");
            }
        }
        let text = String::from_utf8_lossy(&out).into_owned();
        let c = code.lock().unwrap().unwrap_or_else(|| panic!("no exit reported; output so far: {text:?}"));
        (text, c)
    }

    #[cfg(unix)]
    #[test]
    fn a_program_runs_on_a_pty_and_reports_its_exit() {
        let (out, code) = run(SpawnSpec {
            program: "/bin/sh".into(),
            args: vec!["-c".into(), "[ -t 1 ] && echo tty:$TERM; exit 3".into()],
            cols: 80,
            rows: 24,
            ..Default::default()
        });
        assert!(out.contains("tty:xterm-256color"), "{out:?}");
        assert_eq!(code, 3);
    }

    #[cfg(windows)]
    #[test]
    fn a_program_runs_on_a_conpty_and_reports_its_exit() {
        let (out, code) = run(SpawnSpec {
            program: "cmd.exe".into(),
            args: vec!["/c".into(), "echo forge-%TERM%& exit 3".into()],
            cols: 80,
            rows: 24,
            ..Default::default()
        });
        assert!(out.contains("forge-xterm-256color"), "{out:?}");
        assert_eq!(code, 3);
    }

    #[test]
    fn a_missing_folder_starts_at_home() {
        let home = std::env::temp_dir();
        assert_eq!(start_dir("", &home), home);
        assert_eq!(start_dir("/no/such/folder/here", &home), home);
        assert_eq!(start_dir("relative", &home), home);
        let here = std::env::current_dir().unwrap();
        assert_eq!(start_dir(here.to_str().unwrap(), &home), here);
    }
}
