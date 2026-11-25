//! The shells found on this computer, offered as profiles (specs/plan.md, 3): zsh, bash and
//! fish on macOS; PowerShell 7, Windows PowerShell, Command Prompt, Git Bash and the WSL
//! distributions on Windows.

use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FoundShell {
    /// Stable across runs, so settings can name it ("zsh", "pwsh", "wsl-Ubuntu").
    pub id: String,
    pub name: String,
    pub program: String,
    pub args: Vec<String>,
    /// A Lucide icon name for the interface.
    pub icon: String,
    /// The user's login shell (macOS) or the first found (Windows).
    pub default: bool,
}

fn shell(id: &str, name: &str, program: &Path, args: &[&str], icon: &str) -> FoundShell {
    FoundShell {
        id: id.to_string(),
        name: name.to_string(),
        program: program.to_string_lossy().into_owned(),
        args: args.iter().map(|s| s.to_string()).collect(),
        icon: icon.to_string(),
        default: false,
    }
}

/// The first of `names` found in `PATH` or the extra folders.
fn find(names: &[&str], extra: &[&str]) -> Option<PathBuf> {
    let path = std::env::var_os("PATH").unwrap_or_default();
    let mut dirs: Vec<PathBuf> = std::env::split_paths(&path).collect();
    dirs.extend(extra.iter().map(PathBuf::from));
    for name in names {
        for d in &dirs {
            let p = d.join(name);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

#[cfg(not(windows))]
pub fn detect() -> Vec<FoundShell> {
    let extra = ["/bin", "/usr/bin", "/usr/local/bin", "/opt/homebrew/bin", "/opt/local/bin"];
    let login = std::env::var("SHELL").ok().filter(|s| Path::new(s).is_file());
    let mut out = Vec::new();
    for (id, name, icon) in [("zsh", "zsh", "terminal"), ("bash", "bash", "square-terminal"), ("fish", "fish", "fish")] {
        // The login shell keeps its own path (it may be a newer copy from Homebrew).
        let program = login.as_deref().filter(|s| s.rsplit('/').next() == Some(id)).map(PathBuf::from).or_else(|| find(&[id], &extra));
        if let Some(p) = program {
            out.push(shell(id, name, &p, &["-l"], icon));
        }
    }
    if let Some(l) = &login
        && !out.iter().any(|s| &s.program == l)
    {
        let stem = l.rsplit('/').next().unwrap_or("shell").to_string();
        out.insert(0, shell(&stem, &stem, Path::new(l), &["-l"], "terminal"));
    }
    mark_default(&mut out, login.as_deref());
    out
}

#[cfg(windows)]
pub fn detect() -> Vec<FoundShell> {
    let pf = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into());
    let root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
    let mut out = Vec::new();
    if let Some(p) = find(&["pwsh.exe"], &[&format!("{pf}\\PowerShell\\7")]) {
        out.push(shell("pwsh", "PowerShell", &p, &[], "terminal"));
    }
    if let Some(p) = find(&["powershell.exe"], &[&format!("{root}\\System32\\WindowsPowerShell\\v1.0")]) {
        out.push(shell("powershell", "Windows PowerShell", &p, &[], "square-terminal"));
    }
    if let Some(p) = find(&["cmd.exe"], &[&format!("{root}\\System32")]) {
        out.push(shell("cmd", "Command Prompt", &p, &[], "square-chevron-right"));
    }
    let git = PathBuf::from(format!("{pf}\\Git\\bin\\bash.exe"));
    if git.is_file() {
        out.push(shell("git-bash", "Git Bash", &git, &["-l"], "git-branch"));
    }
    if let Some(wsl) = find(&["wsl.exe"], &[&format!("{root}\\System32")]) {
        for d in wsl_distributions(&wsl) {
            // Start in the Linux home folder rather than the Windows one.
            out.push(shell(&format!("wsl-{d}"), &d, &wsl, &["-d", &d, "--cd", "~"], "box"));
        }
    }
    mark_default(&mut out, None);
    out
}

#[cfg(windows)]
fn wsl_distributions(wsl: &Path) -> Vec<String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let Ok(o) = std::process::Command::new(wsl).args(["-l", "-q"]).creation_flags(CREATE_NO_WINDOW).output() else {
        return Vec::new();
    };
    if !o.status.success() {
        return Vec::new();
    }
    parse_wsl_list(&o.stdout)
}

/// `wsl -l -q` prints UTF-16LE, one name per line.
#[cfg_attr(not(windows), allow(dead_code))]
fn parse_wsl_list(bytes: &[u8]) -> Vec<String> {
    let units: Vec<u16> = bytes.as_chunks::<2>().0.iter().map(|c| u16::from_le_bytes(*c)).collect();
    String::from_utf16_lossy(&units)
        .lines()
        .map(|l| l.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}' || c == '\0').to_string())
        .filter(|l| !l.is_empty() && l.chars().all(|c| c.is_alphanumeric() || "-_.".contains(c)))
        .collect()
}

fn mark_default(out: &mut [FoundShell], login: Option<&str>) {
    let i = login.and_then(|l| out.iter().position(|s| s.program == l)).unwrap_or(0);
    if let Some(s) = out.get_mut(i) {
        s.default = true;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn at_least_one_shell_is_found_and_one_is_the_default() {
        let found = detect();
        assert!(!found.is_empty(), "no shell found");
        assert_eq!(found.iter().filter(|s| s.default).count(), 1);
        for s in &found {
            assert!(Path::new(&s.program).is_file(), "{s:?}");
        }
    }

    #[test]
    fn wsl_names_are_read_from_utf16() {
        let text = "Ubuntu-24.04\r\ndocker-desktop\r\n\r\n";
        let bytes: Vec<u8> = text.encode_utf16().flat_map(u16::to_le_bytes).collect();
        assert_eq!(parse_wsl_list(&bytes), vec!["Ubuntu-24.04", "docker-desktop"]);
    }
}
