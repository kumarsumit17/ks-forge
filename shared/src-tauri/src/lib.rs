//! KS Forge: the Tauri side. Terminal sessions (PTY / ConPTY), the shells found here, shell
//! integration, the settings file, the clipboard, links and app updates. Everything the
//! user sees is in the interface (`shared/src`).

mod integration;
pub mod msg;
mod pty;
mod session_store;
mod settings;
mod shells;
mod system;
mod updates;
mod wins;

// Code for one system lives in its platform folder (KS-Suite specs/platform-folders.md).
#[cfg(target_os = "macos")]
#[path = "../../../desktop/mac/src/platform.rs"]
mod platform;
#[cfg(windows)]
#[path = "../../../desktop/windows/src/platform.rs"]
mod platform;
#[cfg(not(any(target_os = "macos", windows)))]
mod platform {
    pub fn window_builder<'a, M: tauri::Manager<tauri::Wry>>(
        b: tauri::WebviewWindowBuilder<'a, tauri::Wry, M>,
    ) -> tauri::WebviewWindowBuilder<'a, tauri::Wry, M> {
        b
    }
    pub fn blur_effects() -> tauri::utils::config::WindowEffectsConfig {
        tauri::utils::config::WindowEffectsConfig::default()
    }
    pub fn screen_reader_active() -> bool {
        false
    }
    pub fn self_check() -> String {
        String::new()
    }
}

use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::msg::Msg;

struct App {
    ptys: Arc<pty::Ptys>,
    windows: wins::Windows,
    session: session_store::SessionStore,
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
    /// Windows: this copy was started elevated for an administrator profile.
    elevated: bool,
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
        elevated: std::env::args().any(|a| a == "--elevated"),
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

/// Whether any window has a program running in front, for Quit.
#[tauri::command]
fn pty_busy_any(app: State<App>) -> bool {
    !app.ptys.busy(&app.ptys.ids()).is_empty()
}

#[tauri::command]
fn window_request(window: tauri::WebviewWindow, app: State<App>) -> wins::Request {
    app.windows.take(window.label())
}

#[tauri::command]
fn window_new(handle: AppHandle, app: State<App>, cwd: Option<String>, profile: Option<String>) -> Result<String, Msg> {
    app.windows.open(&handle, wins::Request { cwd, profile, layout: None }).map_err(|e| msg!("error.window", detail = e))
}

#[tauri::command]
fn session_save(window: tauri::WebviewWindow, app: State<App>, layout: serde_json::Value) {
    app.session.save(window.label(), layout);
}

/// Quit, after the interface asked about running programs: every window's layout is kept.
#[tauri::command]
fn app_quit(handle: AppHandle, app: State<App>) {
    app.session.quitting();
    app.ptys.kill_all();
    handle.exit(0);
}

#[tauri::command]
fn settings_read(app: State<App>) -> Option<String> {
    app.settings.read()
}

/// Writes the settings and tells the other windows, which apply them too.
#[tauri::command]
fn settings_write(window: tauri::WebviewWindow, app: State<App>, text: String) -> Result<(), Msg> {
    app.settings.write(&text).map_err(|e| msg!("error.settingsWrite", detail = e))?;
    let from = window.label().to_string();
    let _ = window.app_handle().emit_filter("settings-synced", text, |t| match t {
        tauri::EventTarget::WebviewWindow { label } | tauri::EventTarget::Window { label } | tauri::EventTarget::Webview { label } => label != &from,
        _ => false,
    });
    Ok(())
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


/// Opens a tab for `request` in the window in front, or a new window when asked or when
/// there is none (Dock menu, Finder, a second launch on Windows).
fn open_request(app: &AppHandle, request: wins::Request, new_window: bool) {
    if !new_window && let Some(w) = wins::front(app) {
        let _ = w.emit_to(w.label(), "open-request", &request);
        let _ = w.unminimize();
        let _ = w.set_focus();
        return;
    }
    if let Err(e) = app.state::<App>().windows.open(app, request) {
        eprintln!("could not open a window: {e}");
    }
}

/// The folder for a path from Finder or Explorer: the path itself, or a file's folder.
fn folder_of(path: &std::path::Path) -> Option<String> {
    let dir = if path.is_dir() { Some(path) } else { path.parent() };
    dir.filter(|d| d.is_dir()).map(|d| d.to_string_lossy().into_owned())
}

/// The menu bar's labels (the interface's language) and the user's shortcuts (macOS).
#[tauri::command]
#[allow(unused_variables)]
fn menu_update(handle: AppHandle, text: serde_json::Value, secure: bool) -> Result<(), Msg> {
    #[cfg(target_os = "macos")]
    {
        let text: std::collections::HashMap<String, platform::MenuText> = serde_json::from_value(text).unwrap_or_default();
        let menu = platform::build_menu(&handle, &text, secure).map_err(|e| msg!("error.menu", detail = e))?;
        handle.set_menu(menu).map_err(|e| msg!("error.menu", detail = e))?;
    }
    Ok(())
}

/// The profiles, for the Dock menu (macOS) and the taskbar jump list (Windows).
#[tauri::command]
#[allow(unused_variables)]
fn profiles_changed(profiles: Vec<(String, String)>, new_window: String, new_tab: String) {
    #[cfg(target_os = "macos")]
    platform::set_dock_profiles(profiles, new_window, new_tab);
    #[cfg(windows)]
    platform::update_jump_list(&profiles, &new_window);
}

/// Secure Keyboard Entry (macOS).
#[tauri::command]
#[allow(unused_variables)]
fn secure_input(on: bool) {
    #[cfg(target_os = "macos")]
    platform::set_secure_input(on);
}

/// The blur behind a translucent background (macOS: under-window material; Windows: acrylic).
#[tauri::command]
fn window_set_blur(window: tauri::WebviewWindow, on: bool) -> Result<(), Msg> {
    let effects = if on { Some(platform::blur_effects()) } else { None };
    window.set_effects(effects).map_err(|e| msg!("error.window", detail = e))
}

/// Opens a profile marked "Run as administrator" in an elevated copy of the app (Windows).
#[tauri::command]
#[allow(unused_variables)]
fn run_elevated(profile: String) -> bool {
    #[cfg(windows)]
    {
        platform::run_elevated(&profile)
    }
    #[cfg(not(windows))]
    {
        false
    }
}

/// Whether a screen reader runs (VoiceOver, Narrator, NVDA), for screen reader mode "auto".
#[tauri::command]
fn screen_reader_active() -> bool {
    platform::screen_reader_active()
}

/// For the self-test: this system's integrations are in place.
#[tauri::command]
fn selftest_platform() -> String {
    platform::self_check()
}

/// Milliseconds since the process started, for the self-test's start-up measurement.
#[tauri::command]
fn app_uptime_ms() -> u64 {
    START.get().map_or(0, |t| t.elapsed().as_millis() as u64)
}

static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();

#[tauri::command]
fn selftest_report(handle: AppHandle, ok: bool, report: String) {
    if !selftest_enabled() {
        return;
    }
    let line = format!("KS_FORGE_SELFTEST {} {report}", if ok { "PASS" } else { "FAIL" });
    println!("{line}");
    // A Windows release build has no console, so the result also goes to a file if asked.
    if let Some(path) = std::env::var_os("KS_FORGE_SELFTEST_OUT") {
        let _ = std::fs::write(path, format!("{line}\n"));
    }
    handle.state::<App>().ptys.kill_all();
    handle.exit(if ok { 0 } else { 1 });
}


/// "Reopen windows and tabs" (`restoreSession` in settings.json), on unless set to false.
fn restore_enabled(settings_text: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(settings_text)
        .ok()
        .and_then(|v| v.get("restoreSession").and_then(serde_json::Value::as_bool))
        .unwrap_or(true)
}

/// At start: a folder or profile from the command line opens one window for it; otherwise
/// the windows of the last run come back (when on), or one new window.
fn open_first_windows(handle: &AppHandle, restore: bool) {
    let app = handle.state::<App>();
    let args: Vec<String> = std::env::args().collect();
    let mut requests = Vec::new();
    if let Some(r) = wins::request_from_args(&args) {
        requests.push(r);
    } else if restore && !selftest_enabled() {
        requests.extend(app.session.load().into_iter().map(|layout| wins::Request { layout: Some(layout), ..Default::default() }));
    }
    if requests.is_empty() {
        requests.push(wins::Request::default());
    }
    for r in requests {
        if let Err(e) = app.windows.open(handle, r) {
            eprintln!("could not open a window: {e}");
        }
    }
}

pub fn run() {
    let _ = START.set(std::time::Instant::now());
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();
    // Windows: a second launch (Explorer's "Open in KS Forge", the jump list, a shortcut)
    // opens a tab in the running app. An elevated copy stays on its own.
    #[cfg(windows)]
    if !platform::is_elevated_copy() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let new_window = wins::wants_new_window(&args);
            let request = wins::request_from_args(&args).unwrap_or_default();
            open_request(app, request, new_window);
        }));
    }
    builder
        .plugin(tauri_plugin_notification::init())
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
            let restore = settings.read().as_deref().map(restore_enabled).unwrap_or(true);
            app.manage(App {
                ptys: Arc::new(pty::Ptys::default()),
                windows: wins::Windows::default(),
                session: session_store::SessionStore::new(&data_dir),
                settings,
                updater: updates::Updater::new(version.clone(), &data_dir),
                home,
                integration_dir,
                version,
            });
            #[cfg(target_os = "macos")]
            {
                app.set_menu(platform::build_menu(&handle, &Default::default(), false)?)?;
                let dock_handle = handle.clone();
                platform::install(move |r| match r {
                    platform::Request::NewWindow => open_request(&dock_handle, wins::Request::default(), true),
                    platform::Request::NewTab { profile } => open_request(&dock_handle, wins::Request { profile, ..Default::default() }, false),
                    platform::Request::Folder { path, new_window } => {
                        if let Some(cwd) = folder_of(std::path::Path::new(&path)) {
                            open_request(&dock_handle, wins::Request { cwd: Some(cwd), ..Default::default() }, new_window);
                        }
                    }
                });
                app.on_menu_event(|app, event| {
                    // Menu commands act on the window in front.
                    if let Some(w) = wins::front(app) {
                        let _ = w.emit_to(w.label(), "menu-action", event.id().0.as_str());
                    } else if event.id().0 == "newWindow" {
                        let _ = app.state::<App>().windows.open(app, wins::Request::default());
                    }
                });
            }
            open_first_windows(&handle, restore);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let app = window.app_handle();
                let last = app.webview_windows().is_empty();
                app.state::<App>().session.closed(window.label(), last);
            }
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
            pty_busy_any,
            window_request,
            window_new,
            session_save,
            app_quit,
            menu_update,
            profiles_changed,
            secure_input,
            window_set_blur,
            screen_reader_active,
            selftest_platform,
            run_elevated,
            selftest_enabled,
            selftest_report,
            app_uptime_ms,
        ])
        .build(tauri::generate_context!())
        .expect("error while building KS Forge")
        .run(|app, event| match event {
            tauri::RunEvent::Exit => app.state::<App>().ptys.kill_all(),
            // Folders opened with KS Forge in Finder, or dropped on its Dock icon.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Opened { urls } => {
                for url in urls {
                    if let Ok(path) = url.to_file_path()
                        && let Some(cwd) = folder_of(&path)
                    {
                        open_request(app, wins::Request { cwd: Some(cwd), ..Default::default() }, false);
                    }
                }
            }
            _ => {}
        });
}
