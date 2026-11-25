//! Session restore (specs/plan-per-platform.md, step 2): each window saves its layout (tabs,
//! panes, folders, profiles, titles) here whenever it changes; the file is read at the next
//! start when "Reopen windows and tabs" is on. A window the user closes is forgotten, unless
//! it is the last one (closing the last window is quitting, as on Windows); windows open at
//! quit are kept. Shells start again in their folders; scrollback is not saved.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

pub const FILE_NAME: &str = "session.json";

pub struct SessionStore {
    path: PathBuf,
    windows: Mutex<BTreeMap<String, serde_json::Value>>,
    quitting: AtomicBool,
}

impl SessionStore {
    pub fn new(dir: &Path) -> Self {
        Self { path: dir.join(FILE_NAME), windows: Mutex::new(BTreeMap::new()), quitting: AtomicBool::new(false) }
    }

    /// The layouts saved by the last run, oldest window first.
    pub fn load(&self) -> Vec<serde_json::Value> {
        let Ok(text) = std::fs::read_to_string(&self.path) else { return Vec::new() };
        match serde_json::from_str::<serde_json::Value>(&text) {
            Ok(serde_json::Value::Array(list)) => list.into_iter().filter(|v| v.is_object()).take(20).collect(),
            _ => Vec::new(),
        }
    }

    pub fn save(&self, label: &str, layout: serde_json::Value) {
        if self.quitting.load(Ordering::SeqCst) {
            return;
        }
        if let Ok(mut w) = self.windows.lock() {
            w.insert(label.to_string(), layout);
        }
        self.write();
    }

    /// A window closed. `last`: it was the only one left, so it is kept for the next start.
    pub fn closed(&self, label: &str, last: bool) {
        if self.quitting.load(Ordering::SeqCst) || last {
            return;
        }
        if let Ok(mut w) = self.windows.lock() {
            w.remove(label);
        }
        self.write();
    }

    /// From here on nothing changes: the windows open now are the ones to restore.
    pub fn quitting(&self) {
        self.write();
        self.quitting.store(true, Ordering::SeqCst);
    }

    fn write(&self) {
        let Ok(w) = self.windows.lock() else { return };
        // Labels are "w1", "w2", …: order by number, the oldest window first.
        let mut list: Vec<(&String, &serde_json::Value)> = w.iter().collect();
        list.sort_by_key(|(k, _)| k.trim_start_matches('w').parse::<u32>().unwrap_or(u32::MAX));
        let values: Vec<&serde_json::Value> = list.into_iter().map(|(_, v)| v).collect();
        if let Ok(text) = serde_json::to_vec_pretty(&values) {
            if let Some(dir) = self.path.parent() {
                let _ = std::fs::create_dir_all(dir);
            }
            let _ = ks_utility::atomic::write_atomic(&self.path, &text);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn closed_windows_are_forgotten_but_the_last_and_those_open_at_quit_are_kept() {
        let dir = std::env::temp_dir().join(format!("ksforge-session-{}", std::process::id()));
        let s = SessionStore::new(&dir);
        s.save("w2", json!({"tabs": [2]}));
        s.save("w10", json!({"tabs": [10]}));
        s.save("w1", json!({"tabs": [1]}));
        assert_eq!(SessionStore::new(&dir).load(), vec![json!({"tabs": [1]}), json!({"tabs": [2]}), json!({"tabs": [10]})]);
        s.closed("w2", false);
        assert_eq!(SessionStore::new(&dir).load().len(), 2);
        s.quitting();
        s.closed("w1", false);
        s.save("w1", json!({"tabs": ["changed"]}));
        assert_eq!(SessionStore::new(&dir).load(), vec![json!({"tabs": [1]}), json!({"tabs": [10]})]);
        let s2 = SessionStore::new(&dir);
        s2.save("w1", json!({"only": true}));
        s2.closed("w1", true);
        assert_eq!(SessionStore::new(&dir).load(), vec![json!({"only": true})]);
        std::fs::write(dir.join(FILE_NAME), "not json").unwrap();
        assert!(SessionStore::new(&dir).load().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
