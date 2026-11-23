//! Shell integration (specs/plan.md, 3): zsh, bash, fish and PowerShell report their folder
//! (OSC 7) and mark each prompt and command with its exit status (OSC 133). The scripts are
//! our own, are written to the app's data folder at start, and load **after** the user's own
//! startup files, without editing them:
//!
//! - zsh: `ZDOTDIR` points at our folder, whose files run the user's files first and then
//!   hand `ZDOTDIR` back.
//! - bash: `--rcfile` with our file, which runs the user's login files or `~/.bashrc`.
//! - fish: `--init-command` sources our file after the user's config.
//! - PowerShell: `-NoExit -EncodedCommand` with our script, after the user's profile. Passed
//!   as a command, not a file, so the execution policy does not block it.
//!
//! A profile with arguments that run a command (`-c`, `-Command`, a script) is left as it is.

use std::path::Path;

const ZSHENV: &str = include_str!("integration/zshenv.zsh");
const ZPROFILE: &str = include_str!("integration/zprofile.zsh");
const ZSHRC: &str = include_str!("integration/zshrc.zsh");
const BASH: &str = include_str!("integration/ksforge.bash");
const FISH: &str = include_str!("integration/ksforge.fish");
const PWSH: &str = include_str!("integration/ksforge.ps1");

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Shell {
    Zsh,
    Bash,
    Fish,
    Pwsh,
}

/// The shell a program is, from its file name (`/bin/zsh`, `pwsh.exe`, …).
pub fn shell_of(program: &str) -> Option<Shell> {
    let name = program.rsplit(['/', '\\']).next().unwrap_or(program).to_ascii_lowercase();
    let stem = name.strip_suffix(".exe").unwrap_or(&name);
    match stem {
        "zsh" => Some(Shell::Zsh),
        "bash" => Some(Shell::Bash),
        "fish" => Some(Shell::Fish),
        "pwsh" | "powershell" => Some(Shell::Pwsh),
        _ => None,
    }
}

/// Writes the scripts into `dir` (the app's data folder). Called at start, so an update of
/// the app brings its new scripts.
pub fn install(dir: &Path) -> std::io::Result<()> {
    let zsh = dir.join("zsh");
    std::fs::create_dir_all(&zsh)?;
    for (name, text) in [(".zshenv", ZSHENV), (".zprofile", ZPROFILE), (".zshrc", ZSHRC)] {
        ks_utility::atomic::write_atomic(&zsh.join(name), text.as_bytes())?;
    }
    ks_utility::atomic::write_atomic(&dir.join("ksforge.bash"), BASH.as_bytes())?;
    ks_utility::atomic::write_atomic(&dir.join("ksforge.fish"), FISH.as_bytes())?;
    Ok(())
}

pub struct Integration {
    pub program: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
}

/// The program, arguments and variables that start `program` with the integration.
pub fn apply(program: &str, args: &[String], dir: &Path) -> Integration {
    let plain = || Integration { program: program.to_string(), args: args.to_vec(), env: Vec::new() };
    let lower: Vec<String> = args.iter().map(|a| a.to_ascii_lowercase()).collect();
    let has = |names: &[&str]| lower.iter().any(|a| names.contains(&a.as_str()));
    let path = |p: &Path| p.to_string_lossy().into_owned();
    match shell_of(program) {
        Some(Shell::Zsh) => {
            if has(&["-c"]) || args.iter().any(|a| !a.starts_with('-')) {
                return plain();
            }
            let user = std::env::var("ZDOTDIR").ok().filter(|s| !s.is_empty());
            let mut env = vec![("ZDOTDIR".to_string(), path(&dir.join("zsh")))];
            if let Some(u) = user {
                env.push(("KSF_USER_ZDOTDIR".to_string(), u));
            }
            Integration { program: program.to_string(), args: args.to_vec(), env }
        }
        Some(Shell::Bash) => {
            if has(&["-c", "--rcfile", "--init-file", "--norc", "--posix"]) || args.iter().any(|a| !a.starts_with('-')) {
                return plain();
            }
            // A login bash ignores --rcfile, so it starts as a plain interactive shell and
            // our file runs the login files itself.
            let login = has(&["-l", "--login"]);
            let mut a: Vec<String> = args.iter().filter(|x| *x != "-l" && *x != "--login").cloned().collect();
            a.insert(0, path(&dir.join("ksforge.bash")));
            a.insert(0, "--rcfile".to_string());
            if !a.iter().any(|x| x == "-i") {
                a.push("-i".to_string());
            }
            let env = if login { vec![("KSF_BASH_LOGIN".to_string(), "1".to_string())] } else { Vec::new() };
            Integration { program: program.to_string(), args: a, env }
        }
        Some(Shell::Fish) => {
            if has(&["-c", "--command"]) || args.iter().any(|a| !a.starts_with('-')) {
                return plain();
            }
            let mut a = args.to_vec();
            a.push("--init-command".to_string());
            a.push(format!("source '{}'", path(&dir.join("ksforge.fish")).replace('\'', "\\'")));
            Integration { program: program.to_string(), args: a, env: Vec::new() }
        }
        Some(Shell::Pwsh) => {
            if has(&["-command", "-c", "-file", "-f", "-encodedcommand", "-ec", "-e"]) {
                return plain();
            }
            let mut a = args.to_vec();
            if !has(&["-noexit"]) {
                a.push("-NoExit".to_string());
            }
            if !has(&["-nologo"]) {
                a.push("-NoLogo".to_string());
            }
            a.push("-EncodedCommand".to_string());
            a.push(encode_command(PWSH));
            Integration { program: program.to_string(), args: a, env: Vec::new() }
        }
        None => plain(),
    }
}

/// PowerShell's `-EncodedCommand`: base64 of the UTF-16LE text.
pub fn encode_command(script: &str) -> String {
    let bytes: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    base64(&bytes)
}

fn base64(data: &[u8]) -> String {
    const A: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for c in data.chunks(3) {
        let n = (u32::from(c[0]) << 16) | (u32::from(*c.get(1).unwrap_or(&0)) << 8) | u32::from(*c.get(2).unwrap_or(&0));
        for (i, shift) in [18, 12, 6, 0].into_iter().enumerate() {
            if i <= c.len() {
                out.push(A[((n >> shift) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn v(a: &[&str]) -> Vec<String> {
        a.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn shells_are_known_by_file_name() {
        assert_eq!(shell_of("/bin/zsh"), Some(Shell::Zsh));
        assert_eq!(shell_of("C:\\Program Files\\Git\\bin\\bash.exe"), Some(Shell::Bash));
        assert_eq!(shell_of("/opt/homebrew/bin/fish"), Some(Shell::Fish));
        assert_eq!(shell_of("pwsh.exe"), Some(Shell::Pwsh));
        assert_eq!(shell_of("POWERSHELL.EXE"), Some(Shell::Pwsh));
        assert_eq!(shell_of("cmd.exe"), None);
        assert_eq!(shell_of("/usr/bin/zshx"), None);
    }

    #[test]
    fn zsh_gets_our_zdotdir_and_keeps_its_arguments() {
        let dir = PathBuf::from("/data/si");
        let i = apply("/bin/zsh", &v(&["-l"]), &dir);
        assert_eq!(i.args, v(&["-l"]));
        assert!(i.env.iter().any(|(k, val)| k == "ZDOTDIR" && val.ends_with("zsh")));
        assert!(apply("/bin/zsh", &v(&["-c", "ls"]), &dir).env.is_empty());
        assert!(apply("/bin/zsh", &v(&["script.zsh"]), &dir).env.is_empty());
    }

    #[test]
    fn login_bash_runs_our_rcfile_and_the_login_files() {
        let dir = PathBuf::from("/data/si");
        let i = apply("/bin/bash", &v(&["-l"]), &dir);
        assert_eq!(i.args[0], "--rcfile");
        assert!(i.args[1].ends_with("ksforge.bash"));
        assert!(!i.args.contains(&"-l".to_string()));
        assert!(i.args.contains(&"-i".to_string()));
        assert_eq!(i.env, vec![("KSF_BASH_LOGIN".to_string(), "1".to_string())]);
        assert_eq!(apply("/bin/bash", &v(&["-c", "true"]), &dir).args, v(&["-c", "true"]));
    }

    #[test]
    fn fish_and_powershell_load_the_script_after_their_own() {
        let dir = PathBuf::from("/data/si");
        let f = apply("fish", &[], &dir);
        assert_eq!(f.args[0], "--init-command");
        let p = apply("pwsh.exe", &v(&["-NoLogo"]), &dir);
        assert_eq!(p.args[..2], v(&["-NoLogo", "-NoExit"]));
        assert_eq!(p.args[2], "-EncodedCommand");
        assert_eq!(apply("pwsh.exe", &v(&["-Command", "dir"]), &dir).args, v(&["-Command", "dir"]));
        assert_eq!(apply("cmd.exe", &[], &dir).args, Vec::<String>::new());
    }

    #[test]
    fn encoded_commands_are_base64_of_utf16() {
        // "dir" in UTF-16LE is 64 00 69 00 72 00.
        assert_eq!(encode_command("dir"), "ZABpAHIA");
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn scripts_are_written() {
        let dir = std::env::temp_dir().join(format!("ksforge-si-{}", std::process::id()));
        install(&dir).unwrap();
        assert!(dir.join("zsh/.zshrc").is_file());
        assert!(dir.join("ksforge.bash").is_file());
        assert!(dir.join("ksforge.fish").is_file());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
