//! KS Forge: the Tauri side. Terminal sessions (PTY / ConPTY), the shells found here, shell
//! integration, the settings file, the clipboard, links and app updates. Everything the
//! user sees is in the interface (`shared/src`).

mod integration;
pub mod msg;
mod pty;
mod settings;
mod shells;
mod system;
mod updates;

use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::msg::Msg;

struct App {
    ptys: Arc<pty::Ptys>,
    settings: Arc<settings::SettingsFile>,
    updater: updates::Updater,
    home: PathBuf,
    integration_dir: PathBuf,
    version: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    platform: &'static str,
    home: String,
    settings_path: String,
    repo: &'static str,
}

#[tauri::command]
fn app_info(app: State<App>) -> AppInfo {
    let platform = if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(windows) {
        "windows"
    } else {
        "linux"
    };
    AppInfo {
        version: app.version.clone(),
        platform,
        home: app.home.to_string_lossy().into_owned(),
        settings_path: app.settings.path().to_string_lossy().into_owned(),
        repo: updates::REPO,
    }
}

#[tauri::command]
async fn shells_detect() -> Vec<shells::FoundShell> {
    tauri::async_runtime::spawn_blocking(shells::detect).await.unwrap_or_default()
}

#[tauri::command]
fn pty_spawn(handle: AppHandle, app: State<App>, spec: pty::SpawnSpec, output: Channel<InvokeResponseBody>) -> Result<u32, Msg> {
    let ctx = pty::Context { home: &app.home, integration_dir: &app.integration_dir, version: &app.version };
    app.ptys.spawn(
        &spec,
        &ctx,
        move |bytes| {
            let _ = output.send(InvokeResponseBody::Raw(bytes));
        },
        move |exit| {
            let _ = handle.emit("pty-exit", exit);
        },
    )
}

#[tauri::command]
fn pty_write(app: State<App>, id: u32, data: String) -> Result<(), Msg> {
    app.ptys.write(id, data.as_bytes())
}

#[tauri::command]
fn pty_resize(app: State<App>, id: u32, cols: u16, rows: u16) -> Result<(), Msg> {
    app.ptys.resize(id, cols, rows)
}

#[tauri::command]
fn pty_kill(app: State<App>, id: u32) {
    app.ptys.kill(id);
}

#[tauri::command]
fn pty_busy(app: State<App>, ids: Vec<u32>) -> Vec<u32> {
    app.ptys.busy(&ids)
}

#[tauri::command]
fn settings_read(app: State<App>) -> Option<String> {
    app.settings.read()
}

#[tauri::command]
fn settings_write(app: State<App>, text: String) -> Result<(), Msg> {
    app.settings.write(&text).map_err(|e| msg!("error.settingsWrite", detail = e))
}

#[tauri::command]
fn settings_open_file(app: State<App>) -> Result<(), Msg> {
    if app.settings.read().is_none() {
        app.settings.write("{}\n").map_err(|e| msg!("error.settingsWrite", detail = e))?;
    }
    system::open_in_editor(app.settings.path())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), Msg> {
    system::open_url(&url)
}

#[tauri::command]
fn clipboard_read() -> Result<String, Msg> {
    system::clipboard_read()
}

#[tauri::command]
fn clipboard_write(text: String) -> Result<(), Msg> {
    system::clipboard_write(&text)
}

#[tauri::command]
fn update_due(app: State<App>) -> bool {
    app.updater.due()
}

#[tauri::command]
async fn update_check(app: State<'_, App>) -> Result<updates::Check, Msg> {
    app.updater.check().await
}

#[tauri::command]
async fn update_install(app: State<'_, App>) -> Result<&'static str, Msg> {
    app.updater.install().await
}

/// The self-test (KS_FORGE_SELFTEST=1, used on CI and in development): the interface drives
/// tabs, splits, a shell, themes and settings in the real window, then reports here.
#[tauri::command]
fn selftest_enabled() -> bool {
    std::env::var_os("KS_FORGE_SELFTEST").is_some()
}

#[tauri::command]
fn selftest_report(handle: AppHandle, ok: bool, report: String) {
    if !selftest_enabled() {
        return;
    }
    println!("KS_FORGE_SELFTEST {} {report}", if ok { "PASS" } else { "FAIL" });
    handle.state::<App>().ptys.kill_all();
    handle.exit(if ok { 0 } else { 1 });
}

#[cfg(target_os = "macos")]
fn menu(handle: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
    // Only what does not clash with the terminal's own shortcuts: no Cmd+W "Close Window",
    // no Undo or Cut. Settings and Quit go through the interface (it asks before closing
    // running programs).
    let settings = MenuItemBuilder::with_id("openSettings", "Settings…").accelerator("CmdOrCtrl+,").build(handle)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit KS Forge").accelerator("CmdOrCtrl+Q").build(handle)?;
    let app_menu = SubmenuBuilder::new(handle, "KS Forge")
        .item(&PredefinedMenuItem::about(handle, Some("About KS Forge"), Some(AboutMetadata::default()))?)
        .separator()
        .item(&settings)
        .separator()
        .item(&PredefinedMenuItem::hide(handle, None)?)
        .item(&PredefinedMenuItem::hide_others(handle, None)?)
        .item(&PredefinedMenuItem::show_all(handle, None)?)
        .separator()
        .item(&quit)
        .build()?;
    let edit = SubmenuBuilder::new(handle, "Edit")
        .item(&PredefinedMenuItem::copy(handle, None)?)
        .item(&PredefinedMenuItem::paste(handle, None)?)
        .build()?;
    let window = SubmenuBuilder::new(handle, "Window")
        .item(&PredefinedMenuItem::minimize(handle, None)?)
        .item(&PredefinedMenuItem::maximize(handle, None)?)
        .item(&PredefinedMenuItem::fullscreen(handle, None)?)
        .build()?;
    MenuBuilder::new(handle).items(&[&app_menu, &edit, &window]).build()
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            // The self-test never touches the user's settings.
            let config_dir = if selftest_enabled() {
                std::env::temp_dir().join(format!("ks-forge-selftest-{}", std::process::id()))
            } else {
                app.path().app_config_dir()?
            };
            let data_dir = app.path().app_data_dir()?;
            let home = app.path().home_dir()?;
            let integration_dir = data_dir.join("shell-integration");
            if let Err(e) = integration::install(&integration_dir) {
                eprintln!("could not write the shell integration scripts: {e}");
            }
            let version = app.package_info().version.to_string();
            let settings = Arc::new(settings::SettingsFile::new(&config_dir));
            let watch_handle = handle.clone();
            Arc::clone(&settings).watch(move |text| {
                let _ = watch_handle.emit("settings-file-changed", text);
            });
            app.manage(App {
                ptys: Arc::new(pty::Ptys::default()),
                settings,
                updater: updates::Updater::new(version.clone(), &data_dir),
                home,
                integration_dir,
                version,
            });
            #[cfg(target_os = "macos")]
            {
                app.set_menu(menu(&handle)?)?;
                app.on_menu_event(|app, event| {
                    let _ = app.emit("menu-action", event.id().0.as_str());
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            shells_detect,
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            pty_busy,
            settings_read,
            settings_write,
            settings_open_file,
            open_url,
            clipboard_read,
            clipboard_write,
            update_due,
            update_check,
            update_install,
            selftest_enabled,
            selftest_report,
        ])
        .build(tauri::generate_context!())
        .expect("error while building KS Forge")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                app.state::<App>().ptys.kill_all();
            }
        });
}
