//! Windows of the app (specs/plan-per-platform.md, step 2): each has its own tabs and its
//! own copy of the interface. A window is opened with a request (a folder, a profile, or a
//! layout to restore) that its interface reads once when it starts.

use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// What a new window opens with. All empty: one tab with the default profile.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Request {
    pub cwd: Option<String>,
    pub profile: Option<String>,
    /// A saved layout (tabs, panes, folders) to rebuild.
    pub layout: Option<serde_json::Value>,
}

#[derive(Default)]
pub struct Windows {
    next: AtomicU32,
    requests: Mutex<HashMap<String, Request>>,
}

const OFFSET: f64 = 28.0;

impl Windows {
    pub fn open(&self, app: &AppHandle, request: Request) -> tauri::Result<String> {
        let label = format!("w{}", self.next.fetch_add(1, Ordering::Relaxed) + 1);
        if let Ok(mut r) = self.requests.lock() {
            r.insert(label.clone(), request);
        }
        let mut b = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
            .title("KS Forge")
            .inner_size(1100.0, 700.0)
            .min_inner_size(480.0, 300.0)
            // Shown at once: a window that was never on screen may not load its page. The dark
            // background (the default theme's) avoids a white flash before the page paints.
            .visible(true)
            .background_color(tauri::window::Color(0x14, 0x12, 0x1f, 0xff))
            .transparent(true);
        // A new window steps down and right from the one in front.
        if let Some(front) = app.webview_windows().values().find(|w| w.is_focused().unwrap_or(false))
            && let (Ok(p), Ok(scale)) = (front.outer_position(), front.scale_factor())
        {
            let p = p.to_logical::<f64>(scale);
            b = b.position(p.x + OFFSET, p.y + OFFSET);
        }
        crate::platform::window_builder(b).build()?;
        Ok(label)
    }

    /// The request a window was opened with; given once.
    pub fn take(&self, label: &str) -> Request {
        self.requests.lock().ok().and_then(|mut r| r.remove(label)).unwrap_or_default()
    }
}

/// The window in front, or any window.
pub fn front(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    let all = app.webview_windows();
    all.values().find(|w| w.is_focused().unwrap_or(false)).cloned().or_else(|| all.values().next().cloned())
}

/// Reads `-d <folder>` / `--dir <folder>` and `-p <profile>` / `--profile <profile>` from a
/// command line (the program name first). None when neither is given.
pub fn request_from_args(args: &[String]) -> Option<Request> {
    let mut r = Request::default();
    let mut it = args.iter().skip(1);
    while let Some(a) = it.next() {
        match a.as_str() {
            "-d" | "--dir" => r.cwd = it.next().cloned(),
            "-p" | "--profile" => r.profile = it.next().cloned(),
            _ => {}
        }
    }
    if r.cwd.is_none() && r.profile.is_none() { None } else { Some(r) }
}


#[cfg(test)]
mod tests {
    use super::*;

    fn v(a: &[&str]) -> Vec<String> {
        a.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn folders_and_profiles_are_read_from_the_command_line() {
        assert_eq!(request_from_args(&v(&["ks-forge"])), None);
        let r = request_from_args(&v(&["ks-forge.exe", "-d", "C:\\Users\\me\\code", "-p", "pwsh"])).unwrap();
        assert_eq!(r.cwd.as_deref(), Some("C:\\Users\\me\\code"));
        assert_eq!(r.profile.as_deref(), Some("pwsh"));
        let r = request_from_args(&v(&["ks-forge", "--dir", "/tmp"])).unwrap();
        assert_eq!(r.cwd.as_deref(), Some("/tmp"));
        assert_eq!(request_from_args(&v(&["ks-forge", "-d"])), None);
    }
}
