//! The settings file (specs/plan.md, 3): one `settings.json` in the app's config folder.
//! The interface owns its shape and defaults; here it is read, written atomically and
//! watched, so an edit in another editor applies at once. A file the interface cannot read
//! never stops the app: it keeps its last good settings and says what is wrong.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

pub const FILE_NAME: &str = "settings.json";
const POLL: Duration = Duration::from_millis(700);

pub struct SettingsFile {
    path: PathBuf,
    /// The text last written or read by us, so our own writes are not reported as edits.
    last: Mutex<Option<String>>,
}

impl SettingsFile {
    pub fn new(dir: &Path) -> Self {
        Self { path: dir.join(FILE_NAME), last: Mutex::new(None) }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// The file's text, or None when there is none yet.
    pub fn read(&self) -> Option<String> {
        let text = std::fs::read_to_string(&self.path).ok()?;
        *self.last.lock().ok()? = Some(text.clone());
        Some(text)
    }

    pub fn write(&self, text: &str) -> std::io::Result<()> {
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        ks_utility::atomic::write_atomic(&self.path, text.as_bytes())?;
        if let Ok(mut l) = self.last.lock() {
            *l = Some(text.to_string());
        }
        Ok(())
    }

    /// The new text when the file changed since we last read or wrote it.
    pub fn changed(&self) -> Option<String> {
        let text = std::fs::read_to_string(&self.path).ok()?;
        let mut last = self.last.lock().ok()?;
        if last.as_deref() == Some(text.as_str()) {
            return None;
        }
        *last = Some(text.clone());
        Some(text)
    }

    /// Calls `on_change` with the new text after each outside edit, on a thread of its own.
    pub fn watch(self: std::sync::Arc<Self>, on_change: impl Fn(String) + Send + 'static) {
        let _ = std::thread::Builder::new().name("settings-watch".into()).spawn(move || {
            let mut seen: Option<SystemTime> = None;
            loop {
                std::thread::sleep(POLL);
                let m = std::fs::metadata(&self.path).and_then(|m| m.modified()).ok();
                if m != seen {
                    seen = m;
                    if let Some(text) = self.changed() {
                        on_change(text);
                    }
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn own_writes_are_not_edits_and_outside_writes_are() {
        let dir = std::env::temp_dir().join(format!("ksforge-settings-{}", std::process::id()));
        let f = SettingsFile::new(&dir);
        assert_eq!(f.read(), None);
        f.write("{\"a\":1}").unwrap();
        assert_eq!(f.changed(), None);
        std::fs::write(f.path(), "{\"a\":2}").unwrap();
        assert_eq!(f.changed().as_deref(), Some("{\"a\":2}"));
        assert_eq!(f.changed(), None);
        assert_eq!(f.read().as_deref(), Some("{\"a\":2}"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
