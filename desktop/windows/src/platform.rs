//! Windows-only code (specs/plan-per-platform.md, 2.2), compiled into the app's crate from
//! `shared/src-tauri/src/lib.rs`. Code both systems share stays in `shared/`.
//!
//! - The window look: no system title bar; the interface draws the tabs and the minimise,
//!   maximise and close buttons in one bar.
//! - The running-program check (ConPTY does not report one): the shell's child processes.
//! - The taskbar jump list (New window, each profile), administrator profiles, Narrator and
//!   NVDA detection, the acrylic blur.

use std::sync::Mutex;

use tauri::utils::{WindowEffect, config::WindowEffectsConfig};
use tauri::{WebviewWindowBuilder, Wry};
use windows::Win32::Foundation::{CloseHandle, PROPERTYKEY};
use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
use windows::Win32::System::Com::{CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx, CoUninitialize};
use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS};
use windows::Win32::System::Variant::VT_LPWSTR;
use windows::Win32::UI::Shell::Common::{IObjectArray, IObjectCollection};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::Win32::UI::Shell::{DestinationList, EnumerableObjectCollection, ICustomDestinationList, IShellLinkW, ShellExecuteW, ShellLink};
use windows::Win32::UI::WindowsAndMessaging::{SPI_GETSCREENREADER, SW_SHOWNORMAL, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS, SystemParametersInfoW};
use windows::core::{GUID, HSTRING, Interface, PWSTR, w};

/// The window's Windows look: no system title bar; the interface draws the tabs and the
/// minimise, maximise and close buttons in one bar. The shadow keeps the resize borders.
pub fn window_builder<'a, M: tauri::Manager<Wry>>(b: WebviewWindowBuilder<'a, Wry, M>) -> WebviewWindowBuilder<'a, Wry, M> {
    b.decorations(false).shadow(true)
}

/// The blur behind a translucent terminal.
pub fn blur_effects() -> WindowEffectsConfig {
    WindowEffectsConfig { effects: vec![WindowEffect::Acrylic], ..Default::default() }
}

// ----- Running-program check -----

/// Console helpers that run beside a shell without being a program the user started.
const HELPERS: [&str; 4] = ["conhost.exe", "openconsole.exe", "wslhost.exe", "wsl.exe"];

/// Whether the shell with this process id has a child process the user started (a build,
/// an editor, ssh), so closing its pane would stop it.
pub fn has_running_children(pid: u32) -> bool {
    children_of(pid).iter().any(|name| !HELPERS.contains(&name.to_ascii_lowercase().as_str()))
}

fn children_of(pid: u32) -> Vec<String> {
    let mut out = Vec::new();
    // SAFETY: a process snapshot, walked with a correctly sized entry and closed at the end.
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return out };
        let mut e = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut ok = Process32FirstW(snap, &mut e).is_ok();
        while ok {
            if e.th32ParentProcessID == pid && e.th32ProcessID != pid {
                let len = e.szExeFile.iter().position(|&c| c == 0).unwrap_or(e.szExeFile.len());
                out.push(String::from_utf16_lossy(&e.szExeFile[..len]));
            }
            ok = Process32NextW(snap, &mut e).is_ok();
        }
        let _ = CloseHandle(snap);
    }
    out
}

// ----- Jump list -----

/// `PKEY_Title`, the text a jump-list task shows.
const PKEY_TITLE: PROPERTYKEY = PROPERTYKEY { fmtid: GUID::from_u128(0xf29f85e0_4ff9_1068_ab91_08002b27b3d9), pid: 2 };

static JUMP_LIST: Mutex<String> = Mutex::new(String::new());

/// The taskbar jump list: "New window", then each profile (at most ten). Runs COM on a
/// thread of its own; a failure is only logged.
pub fn update_jump_list(profiles: &[(String, String)], new_window: &str) {
    let Ok(exe) = std::env::current_exe() else { return };
    let exe = exe.to_string_lossy().into_owned();
    let profiles: Vec<(String, String)> = profiles.iter().take(10).cloned().collect();
    let new_window = if new_window.is_empty() { "New window".to_string() } else { new_window.to_string() };
    std::thread::spawn(move || {
        // SAFETY: COM is initialised on this thread for the calls below and released after.
        let result = unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let r = build_jump_list(&exe, &profiles, &new_window);
            CoUninitialize();
            r
        };
        let status = match result {
            Ok(()) => format!("ok:{}", profiles.len() + 1),
            Err(e) => {
                eprintln!("jump list: {e}");
                format!("error:{e}")
            }
        };
        if let Ok(mut s) = JUMP_LIST.lock() {
            *s = status;
        }
    });
}

unsafe fn build_jump_list(exe: &str, profiles: &[(String, String)], new_window: &str) -> windows::core::Result<()> {
    unsafe {
        let list: ICustomDestinationList = CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER)?;
        let mut slots = 0u32;
        let _removed: IObjectArray = list.BeginList(&mut slots)?;
        let tasks: IObjectCollection = CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;
        tasks.AddObject(&shell_link(exe, "--new-window", new_window)?)?;
        for (id, name) in profiles {
            tasks.AddObject(&shell_link(exe, &format!("-p \"{}\"", id.replace('"', "")), name)?)?;
        }
        let array: IObjectArray = tasks.cast()?;
        list.AddUserTasks(&array)?;
        list.CommitList()
    }
}

unsafe fn shell_link(exe: &str, args: &str, title: &str) -> windows::core::Result<IShellLinkW> {
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        link.SetPath(&HSTRING::from(exe))?;
        link.SetArguments(&HSTRING::from(args))?;
        link.SetIconLocation(&HSTRING::from(exe), 0)?;
        let store: IPropertyStore = link.cast()?;
        // The title as a VT_LPWSTR PROPVARIANT; `wide` outlives the SetValue call, which copies it.
        let mut wide: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
        let mut value = PROPVARIANT::default();
        (*value.Anonymous.Anonymous).vt = VT_LPWSTR;
        (*value.Anonymous.Anonymous).Anonymous.pwszVal = PWSTR(wide.as_mut_ptr());
        store.SetValue(&PKEY_TITLE, &value)?;
        store.Commit()?;
        Ok(link)
    }
}

// ----- Administrator profiles -----

/// Starts an elevated copy of the app for a profile marked "Run as administrator" (one
/// window cannot mix elevated and normal programs). Windows asks the user first (UAC).
pub fn run_elevated(profile: &str) -> bool {
    let Ok(exe) = std::env::current_exe() else { return false };
    let args = HSTRING::from(format!("-p \"{}\" --elevated", profile.replace('"', "")));
    // SAFETY: ShellExecuteW with valid wide strings; a result above 32 means success.
    let r = unsafe { ShellExecuteW(None, w!("runas"), &HSTRING::from(exe.as_os_str()), &args, None, SW_SHOWNORMAL) };
    r.0 as isize > 32
}

/// Whether this copy was started elevated by `run_elevated`.
pub fn is_elevated_copy() -> bool {
    std::env::args().any(|a| a == "--elevated")
}

// ----- Narrator, NVDA -----

/// Whether a screen reader runs (Narrator, NVDA, JAWS set this system flag).
pub fn screen_reader_active() -> bool {
    let mut on = windows::core::BOOL(0);
    // SAFETY: SPI_GETSCREENREADER writes one BOOL.
    let r = unsafe { SystemParametersInfoW(SPI_GETSCREENREADER, 0, Some(&mut on as *mut _ as *mut core::ffi::c_void), SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0)) };
    r.is_ok() && on.as_bool()
}

/// For the self-test: the jump list was written, and the process list can be read (this
/// app's own process has children: the WebView2 helpers).
pub fn self_check() -> String {
    let jump = JUMP_LIST.lock().map(|s| s.clone()).unwrap_or_default();
    let own = children_of(std::process::id()).len();
    format!("jumplist={} processList={}", if jump.is_empty() { "pending" } else { &jump }, if own > 0 { "ok" } else { "empty" })
}
