//! Handing things to the system: links to the default browser, text files to the editor, and the
//! clipboard for the shortcuts that are not the system's own (Ctrl+Shift+C/V on Windows).

use std::path::Path;
use std::process::Command;

use crate::msg;
use crate::msg::Msg;

/// Only web and mail links are opened; anything else in terminal output is ignored.
pub fn is_openable_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    (lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("mailto:"))
        && url.len() < 8192
        && !url.chars().any(|c| c.is_control() || c == '"')
}

pub fn open_url(url: &str) -> Result<(), Msg> {
    if !is_openable_url(url) {
        return Err(msg!("error.badLink"));
    }
    launch(url)
}


/// Opens a text file in the system's text editor.
pub fn open_in_editor(path: &Path) -> Result<(), Msg> {
    let r = if cfg!(target_os = "macos") {
        Command::new("open").arg("-t").arg(path).spawn()
    } else if cfg!(windows) {
        Command::new("notepad.exe").arg(path).spawn()
    } else {
        Command::new("xdg-open").arg(path).spawn()
    };
    r.map(|_| ()).map_err(|e| msg!("error.open", detail = e))
}

fn launch(target: &str) -> Result<(), Msg> {
    let r = if cfg!(target_os = "macos") {
        Command::new("open").arg(target).spawn()
    } else if cfg!(windows) {
        // Not `cmd /c start`, which would read & and ^ in the link as commands.
        Command::new("rundll32.exe").arg("url.dll,FileProtocolHandler").arg(target).spawn()
    } else {
        Command::new("xdg-open").arg(target).spawn()
    };
    r.map(|_| ()).map_err(|e| msg!("error.open", detail = e))
}

pub fn clipboard_read() -> Result<String, Msg> {
    arboard::Clipboard::new().and_then(|mut c| c.get_text()).map_err(|e| msg!("error.clipboard", detail = e))
}

pub fn clipboard_write(text: &str) -> Result<(), Msg> {
    arboard::Clipboard::new().and_then(|mut c| c.set_text(text)).map_err(|e| msg!("error.clipboard", detail = e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_web_and_mail_links_open() {
        assert!(is_openable_url("https://example.com/a?b=c&d"));
        assert!(is_openable_url("HTTP://example.com"));
        assert!(is_openable_url("mailto:someone@example.com"));
        assert!(!is_openable_url("file:///etc/passwd"));
        assert!(!is_openable_url("javascript:alert(1)"));
        assert!(!is_openable_url("https://example.com/\"quoted"));
        assert!(!is_openable_url("https://example.com/\nnext"));
    }
}
