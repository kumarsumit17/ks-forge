//! App updates (specs/plan.md, 6): asks GitHub for the newest release of this app, and
//! when it is newer than the running copy, downloads its installer for this system, checks
//! it against the SHA-256 GitHub lists for the file, and opens it. This is the app's one
//! network request: on the button, and once a day while "Check for updates automatically"
//! is on (the interface decides when; `due` says whether a day has passed).
//!
//! The decisions (versions, the daily schedule, reading the release, which file, the
//! checksum rule) are the suite's shared ones from `ks_utility::app_update`
//! (ks-utility `specs/app-update.md`); this file does the request, download and opening.
//!
//! Each platform has its own version (`mac-vX.Y.Z`, `windows-vX.Y.Z`; a plain `vX.Y.Z`
//! releases both), and a platform release is not marked latest, so the release list is read
//! and the newest release for this platform is taken (KS-Suite specs/versioning-signing.md,
//! "Platform tags").

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

pub const REPO: &str = "kumasumit/ks-forge";
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
        let platform = Platform::current().ok_or_else(|| msg!("common.appUpdate.unreadable"))?;
        let json = fetch_text(&repo.releases_api_url(), &repo).await.map_err(|e| msg!("common.appUpdate.checkFailed", detail = e))?;
        let _ = std::fs::create_dir_all(&self.dir);
        if let Ok(data) = serde_json::to_vec(&State { last_check: now_secs() }) {
            let _ = ks_utility::atomic::write_atomic(&self.dir.join(STATE_FILE), &data);
        }
        let release = app_update::parse_releases(&json, &repo, platform).ok_or_else(|| msg!("common.appUpdate.unreadable"))?.release;
        let asset = app_update::pick_asset(&release.assets, platform, &repo);
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
        // ks-utility marks the file as downloaded from the internet (quarantine on macOS, the
        // internet zone on Windows) and opens it; the interface then quits the app (Windows at
        // once, macOS after MAC_QUIT_AFTER) so the copy can be replaced.
        let opened = app_update::install::open(&file, "KS Forge").map_err(|e| msg!("common.appUpdate.openFailed", detail = e))?;
        Ok(match opened {
            app_update::install::Opened::Windows => "windows",
            app_update::install::Opened::Mac => "macos",
        })
    }
}

async fn fetch_text(url: &str, repo: &Repo) -> Result<String, String> {
    let client = Updater::client()?;
    let mut req = client.get(url);
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

    fn entry(tag: &str, names: &[&str]) -> String {
        let assets: Vec<String> = names
            .iter()
            .map(|n| format!(r#"{{"name":"{n}","size":10,"browser_download_url":"https://github.com/{REPO}/releases/download/{tag}/{n}","digest":"sha256:{}"}}"#, "b".repeat(64)))
            .collect();
        format!(r#"{{"tag_name":"{tag}","draft":false,"prerelease":false,"assets":[{}]}}"#, assets.join(","))
    }

    #[test]
    fn each_platform_takes_its_own_newest_release_from_the_list() {
        let repo = repo();
        let list = format!(
            "[{},{},{}]",
            entry("windows-v0.4.0", &["ks-forge-v0.4.0-windows-x64-setup.exe"]),
            entry("mac-v0.3.0", &["ks-forge-v0.3.0-macos-arm64.dmg"]),
            entry("v0.2.0", &["ks-forge-v0.2.0-macos-arm64.dmg", "ks-forge-v0.2.0-windows-x64-setup.exe"])
        );
        let mac = app_update::parse_releases(&list, &repo, Platform::MacosArm64).unwrap();
        assert_eq!((mac.tag.as_str(), mac.release.version.as_str()), ("mac-v0.3.0", "0.3.0"));
        let win = app_update::parse_releases(&list, &repo, Platform::WindowsX64).unwrap();
        assert_eq!((win.tag.as_str(), win.release.version.as_str()), ("windows-v0.4.0", "0.4.0"));
        let asset = app_update::pick_asset(&mac.release.assets, Platform::MacosArm64, &repo).unwrap();
        assert_eq!(asset.name, "ks-forge-v0.3.0-macos-arm64.dmg");
    }

    #[test]
    fn the_daily_check_skips_development_builds() {
        let dir = std::env::temp_dir().join(format!("ksforge-upd-{}", std::process::id()));
        assert!(!Updater::new("0.0.0".into(), &dir).due());
        assert!(Updater::new("0.1.0".into(), &dir).due());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
