//! App updates (specs/plan.md, 6): asks GitHub for the newest release of this app, and
//! when it is newer than the running copy, downloads its installer for this system, checks
//! it against the SHA-256 GitHub lists for the file, and opens it. This is the app's one
//! network request: on the button, and once a day while "Check for updates automatically"
//! is on (the interface decides when; `due` says whether a day has passed).
//!
//! The decisions (versions, the daily schedule, reading the release, which file, the
//! checksum rule) are the suite's shared ones from `ks_utility::app_update`
//! (ks-utility `specs/app-update.md`); this file does the request, download and opening.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use futures_util::StreamExt;
use ks_utility::app_update::{self, Outcome, Platform, Repo};
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;

use crate::msg;
use crate::msg::Msg;

pub const REPO: &str = "kumarsumit17/ks-forge";
const STATE_FILE: &str = "app-update.json";
const TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone, Debug, PartialEq, Eq)]
struct Found {
    version: String,
    file: String,
    size: u64,
    url: String,
    sha256: String,
}

/// What the interface's update store reads (ks-utility `CheckResult`).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "result")]
pub enum Check {
    UpToDate { version: String },
    Available { update: Info },
    NoInstaller { version: String },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Info {
    pub version: String,
    pub size: u64,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct State {
    last_check: u64,
}

pub struct Updater {
    current: String,
    dir: PathBuf,
    found: Mutex<Option<Found>>,
    busy: AtomicBool,
}

impl Updater {
    pub fn new(current: String, data_dir: &Path) -> Self {
        Self { current, dir: data_dir.to_path_buf(), found: Mutex::new(None), busy: AtomicBool::new(false) }
    }

    /// A tagged build, and no check in the last day.
    pub fn due(&self) -> bool {
        let last = std::fs::read(self.dir.join(STATE_FILE))
            .ok()
            .and_then(|b| serde_json::from_slice::<State>(&b).ok())
            .filter(|s| s.last_check > 0)
            .map(|s| UNIX_EPOCH + Duration::from_secs(s.last_check));
        app_update::check_due(true, &self.current, last, SystemTime::now())
    }

    fn client() -> Result<reqwest::Client, String> {
        reqwest::Client::builder().timeout(TIMEOUT).build().map_err(|e| e.to_string())
    }

    pub async fn check(&self) -> Result<Check, Msg> {
        let repo = repo();
        let json = fetch_text(&repo).await.map_err(|e| msg!("common.appUpdate.checkFailed", detail = e))?;
        let _ = std::fs::create_dir_all(&self.dir);
        if let Ok(data) = serde_json::to_vec(&State { last_check: now_secs() }) {
            let _ = ks_utility::atomic::write_atomic(&self.dir.join(STATE_FILE), &data);
        }
        let release = app_update::parse_release(&json, &repo).ok_or_else(|| msg!("common.appUpdate.unreadable"))?;
        let asset = Platform::current().and_then(|p| app_update::pick_asset(&release.assets, p, &repo));
        let (found, check) = match app_update::decide(&release, &self.current, asset) {
            Outcome::UpToDate { .. } => (None, Check::UpToDate { version: self.current.clone() }),
            Outcome::NoInstaller { version } => (None, Check::NoInstaller { version }),
            Outcome::Available { version, asset } => {
                let info = Info { version: version.clone(), size: asset.size };
                (Some(Found { version, file: asset.name, size: asset.size, url: asset.url, sha256: asset.sha256 }), Check::Available { update: info })
            }
        };
        if let Ok(mut f) = self.found.lock() {
            *f = found;
        }
        Ok(check)
    }

    /// Downloads the installer found by the last check, checks it, and opens it. Returns
    /// "macos" or "windows" (ks-utility `Opened`); on Windows the app then quits.
    pub async fn install(&self) -> Result<&'static str, Msg> {
        let found = self.found.lock().ok().and_then(|f| f.clone()).ok_or_else(|| msg!("common.appUpdate.none"))?;
        if self.busy.swap(true, Ordering::SeqCst) {
            return Err(msg!("common.appUpdate.busy"));
        }
        let r = self.fetch_and_open(&found).await;
        self.busy.store(false, Ordering::SeqCst);
        r
    }

    async fn fetch_and_open(&self, found: &Found) -> Result<&'static str, Msg> {
        let dir = self.dir.join("app-update");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).map_err(|e| msg!("common.appUpdate.downloadFailed", detail = e))?;
        let file = dir.join(&found.file);
        download(&found.url, &file, found.size).await.map_err(|e| msg!("common.appUpdate.downloadFailed", detail = e))?;
        let f2 = file.clone();
        let got = tokio::task::spawn_blocking(move || ks_utility::sha256::sha256_file(&f2))
            .await
            .map_err(|e| msg!("common.appUpdate.downloadFailed", detail = e))?
            .map_err(|e| msg!("common.appUpdate.downloadFailed", detail = e))?;
        if !ks_utility::sha256::sha256_matches(&got, &found.sha256) {
            let _ = std::fs::remove_file(&file);
            return Err(msg!("common.appUpdate.damaged"));
        }
        if let Err(e) = mark_from_internet(&file, &found.url) {
            eprintln!("could not mark the update as downloaded: {e}");
        }
        crate::system::open_path(&file).map_err(|m| msg!("common.appUpdate.openFailed", detail = m.code))?;
        Ok(if cfg!(windows) { "windows" } else { "macos" })
    }
}

async fn fetch_text(repo: &Repo) -> Result<String, String> {
    let client = Updater::client()?;
    let mut req = client.get(repo.latest_release_api_url());
    for (k, v) in repo.request_headers() {
        req = req.header(k, v);
    }
    let resp = req.send().await.map_err(|e| e.without_url().to_string())?;
    if resp.status() != reqwest::StatusCode::OK {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    let mut body = Vec::new();
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.without_url().to_string())?;
        if body.len() + chunk.len() > app_update::MAX_RESPONSE_BYTES {
            return Err("response too large".into());
        }
        body.extend_from_slice(&chunk);
    }
    String::from_utf8(body).map_err(|e| e.to_string())
}

async fn download(url: &str, to: &Path, size: u64) -> Result<(), String> {
    let client = reqwest::Client::builder().build().map_err(|e| e.to_string())?;
    let resp = client.get(url).header("User-Agent", "ks-forge").send().await.map_err(|e| e.without_url().to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    let mut out = tokio::fs::File::create(to).await.map_err(|e| e.to_string())?;
    let mut stream = resp.bytes_stream();
    let mut n: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.without_url().to_string())?;
        n += chunk.len() as u64;
        if n > size {
            return Err("larger than the release lists".into());
        }
        out.write_all(&chunk).await.map_err(|e| e.to_string())?;
    }
    out.flush().await.map_err(|e| e.to_string())?;
    if n != size {
        return Err("incomplete".into());
    }
    Ok(())
}

/// Marks the file as downloaded from the internet, so the system checks it as it would a
/// browser download (macOS quarantine attribute, Windows zone identifier).
fn mark_from_internet(file: &Path, url: &str) -> std::io::Result<()> {
    if cfg!(target_os = "macos") {
        let value = format!("0081;{:x};KS Forge;", now_secs());
        let s = std::process::Command::new("xattr").arg("-w").arg("com.apple.quarantine").arg(value).arg(file).status()?;
        if !s.success() {
            return Err(std::io::Error::other("xattr failed"));
        }
    } else if cfg!(windows) {
        let mut ads = file.as_os_str().to_owned();
        ads.push(":Zone.Identifier");
        std::fs::write(PathBuf::from(ads), format!("[ZoneTransfer]\r\nZoneId=3\r\nHostUrl={url}\r\n"))?;
    }
    Ok(())
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

fn repo() -> Repo {
    Repo::parse(REPO).expect("the repository name is valid")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn release_json(names: &[&str]) -> String {
        let assets: Vec<String> = names
            .iter()
            .map(|n| {
                format!(
                    r#"{{"name":"{n}","size":10,"browser_download_url":"https://github.com/{REPO}/releases/download/v0.2.0/{n}","digest":"sha256:{}"}}"#,
                    "a".repeat(64)
                )
            })
            .collect();
        format!(r#"{{"tag_name":"v0.2.0","assets":[{}]}}"#, assets.join(","))
    }

    #[test]
    fn our_release_files_match_the_shared_rules() {
        let repo = repo();
        let json = release_json(&["ks-forge-v0.2.0-macos-arm64.dmg", "ks-forge-v0.2.0-windows-x64-setup.exe"]);
        let r = app_update::parse_release(&json, &repo).expect("readable");
        let mac = app_update::pick_asset(&r.assets, Platform::MacosArm64, &repo).expect("mac file");
        assert_eq!(mac.name, "ks-forge-v0.2.0-macos-arm64.dmg");
        let win = app_update::pick_asset(&r.assets, Platform::WindowsX64, &repo).expect("windows file");
        assert_eq!(win.name, "ks-forge-v0.2.0-windows-x64-setup.exe");
    }

    #[test]
    fn the_daily_check_skips_development_builds() {
        let dir = std::env::temp_dir().join(format!("ksforge-upd-{}", std::process::id()));
        assert!(!Updater::new("0.0.0".into(), &dir).due());
        assert!(Updater::new("0.1.0".into(), &dir).due());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
