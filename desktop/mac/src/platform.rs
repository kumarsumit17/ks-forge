//! macOS-only code (specs/plan-per-platform.md, 2.1), compiled into the app's crate from
//! `shared/src-tauri/src/lib.rs`. Code both systems share stays in `shared/`.
//!
//! - The window look: traffic lights in our tab bar.
//! - The menu bar, built from the interface's labels (English or Hindi) and the user's own
//!   shortcuts, so a rebound key never fights a menu.
//! - The Dock menu (New Window, New Tab, each profile).
//! - Finder: the "New KS Forge Tab/Window Here" services; folders opened with the app or
//!   dropped on its Dock icon arrive as `RunEvent::Opened` (Info.plist declares folders).
//! - Secure Keyboard Entry, VoiceOver detection, the background blur effect.

use std::cell::RefCell;
use std::collections::HashMap;
use std::ffi::c_char;
use std::sync::{Mutex, OnceLock};

use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject, Imp, NSObject, Sel};
use objc2::{ClassType, MainThreadMarker, MainThreadOnly, define_class, msg_send, sel};
use objc2_app_kit::{NSApplication, NSMenu, NSMenuItem, NSPasteboard, NSWorkspace};
use objc2_foundation::{NSArray, NSString, NSURL};
use serde::Deserialize;
use tauri::menu::{AboutMetadata, CheckMenuItemBuilder, Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::utils::{WindowEffect, config::WindowEffectsConfig};
use tauri::{AppHandle, LogicalPosition, TitleBarStyle, WebviewWindowBuilder, Wry};

/// The window's macOS look: the traffic lights sit in our tab bar, with no title text.
pub fn window_builder<'a, M: tauri::Manager<Wry>>(b: WebviewWindowBuilder<'a, Wry, M>) -> WebviewWindowBuilder<'a, Wry, M> {
    b.title_bar_style(TitleBarStyle::Overlay).hidden_title(true).traffic_light_position(LogicalPosition::new(14.0, 19.0))
}

/// The blur behind a translucent terminal.
pub fn blur_effects() -> WindowEffectsConfig {
    WindowEffectsConfig { effects: vec![WindowEffect::UnderWindowBackground], state: Some(tauri::utils::WindowEffectState::Active), ..Default::default() }
}

// ----- Menu bar -----

/// One menu item's text and shortcut, from the interface (`menu_update`).
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default)]
pub struct MenuText {
    pub label: String,
    /// The user's shortcut in the interface's form ("shift+cmd+t"); empty for none.
    pub shortcut: String,
}

/// The interface's shortcut ("shift+cmd+t", "alt+cmd+left", "cmd+=") as a menu accelerator.
pub fn accelerator(shortcut: &str) -> Option<String> {
    if shortcut.is_empty() {
        return None;
    }
    let mut parts: Vec<String> = Vec::new();
    for p in shortcut.split('+') {
        let name = match p {
            "cmd" => "Cmd".to_string(),
            "ctrl" => "Ctrl".to_string(),
            "alt" => "Alt".to_string(),
            "shift" => "Shift".to_string(),
            "=" => "Equal".to_string(),
            "-" => "Minus".to_string(),
            "," => "Comma".to_string(),
            "." => "Period".to_string(),
            "/" => "Slash".to_string(),
            "\\" => "Backslash".to_string(),
            ";" => "Semicolon".to_string(),
            "'" => "Quote".to_string(),
            "`" => "Backquote".to_string(),
            "[" => "BracketLeft".to_string(),
            "]" => "BracketRight".to_string(),
            "left" => "ArrowLeft".to_string(),
            "right" => "ArrowRight".to_string(),
            "up" => "ArrowUp".to_string(),
            "down" => "ArrowDown".to_string(),
            "enter" => "Enter".to_string(),
            "tab" => "Tab".to_string(),
            "escape" => "Escape".to_string(),
            "space" => "Space".to_string(),
            "backspace" => "Backspace".to_string(),
            "delete" => "Delete".to_string(),
            "home" => "Home".to_string(),
            "end" => "End".to_string(),
            "pageup" => "PageUp".to_string(),
            "pagedown" => "PageDown".to_string(),
            k if k.len() == 1 && k.chars().all(|c| c.is_ascii_alphanumeric()) => k.to_ascii_uppercase(),
            k if k.starts_with('f') && k[1..].parse::<u8>().is_ok() => k.to_ascii_uppercase(),
            _ => return None,
        };
        parts.push(name);
    }
    Some(parts.join("+"))
}

/// The menu bar. `text` holds the interface's labels and shortcuts by action id; anything
/// missing falls back to English with no shortcut.
pub fn build_menu(handle: &AppHandle, text: &HashMap<String, MenuText>, secure: bool) -> tauri::Result<Menu<Wry>> {
    let item = |id: &str, fallback: &str| {
        let t = text.get(id).cloned().unwrap_or_default();
        let label = if t.label.is_empty() { fallback.to_string() } else { t.label };
        let mut b = MenuItemBuilder::with_id(id, label);
        if let Some(a) = accelerator(&t.shortcut) {
            b = b.accelerator(a);
        }
        b.build(handle)
    };
    let label = |id: &str, fallback: &str| text.get(id).map(|t| t.label.clone()).filter(|l| !l.is_empty()).unwrap_or_else(|| fallback.to_string());

    let secure_item = CheckMenuItemBuilder::with_id("secureKeyboardEntry", label("menu.secureKeyboardEntry", "Secure Keyboard Entry")).checked(secure).build(handle)?;
    let app_menu = SubmenuBuilder::new(handle, "KS Forge")
        .item(&PredefinedMenuItem::about(handle, Some(&label("menu.about", "About KS Forge")), Some(AboutMetadata::default()))?)
        .separator()
        .item(&item("openSettings", "Settings…")?)
        .separator()
        .item(&secure_item)
        .separator()
        .item(&PredefinedMenuItem::services(handle, Some(&label("menu.services", "Services")))?)
        .separator()
        .item(&PredefinedMenuItem::hide(handle, Some(&label("menu.hide", "Hide KS Forge")))?)
        .item(&PredefinedMenuItem::hide_others(handle, Some(&label("menu.hideOthers", "Hide Others")))?)
        .item(&PredefinedMenuItem::show_all(handle, Some(&label("menu.showAll", "Show All")))?)
        .separator()
        .item(&item("quit", "Quit KS Forge")?)
        .build()?;
    let shell = SubmenuBuilder::new(handle, label("menu.shell", "Shell"))
        .item(&item("newTab", "New Tab")?)
        .item(&item("newWindow", "New Window")?)
        .item(&item("duplicateTab", "Duplicate Tab")?)
        .separator()
        .item(&item("splitRight", "Split Right")?)
        .item(&item("splitDown", "Split Down")?)
        .separator()
        .item(&item("renameTab", "Rename Tab")?)
        .separator()
        .item(&item("closePane", "Close Pane")?)
        .item(&item("closeTab", "Close Tab")?)
        .build()?;
    // Copy and Paste stay the system's own items, so they also work in text fields.
    let edit = SubmenuBuilder::new(handle, label("menu.edit", "Edit"))
        .item(&PredefinedMenuItem::copy(handle, Some(&label("copy", "Copy")))?)
        .item(&PredefinedMenuItem::paste(handle, Some(&label("paste", "Paste")))?)
        .item(&item("selectAll", "Select All")?)
        .separator()
        .item(&item("find", "Find")?)
        .item(&item("clear", "Clear")?)
        .build()?;
    let view = SubmenuBuilder::new(handle, label("menu.view", "View"))
        .item(&item("fontBigger", "Bigger Text")?)
        .item(&item("fontSmaller", "Smaller Text")?)
        .item(&item("fontReset", "Normal Text Size")?)
        .separator()
        .item(&item("zoomPane", "Zoom Pane")?)
        .item(&item("palette", "Command Palette")?)
        .item(&item("nextTheme", "Next Theme")?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(handle, Some(&label("menu.fullscreen", "Enter Full Screen")))?)
        .build()?;
    let window = SubmenuBuilder::new(handle, label("menu.window", "Window"))
        .item(&PredefinedMenuItem::minimize(handle, Some(&label("menu.minimize", "Minimize")))?)
        .item(&PredefinedMenuItem::maximize(handle, Some(&label("menu.zoom", "Zoom")))?)
        .separator()
        .item(&item("prevTab", "Previous Tab")?)
        .item(&item("nextTab", "Next Tab")?)
        .separator()
        .build()?;
    // The system lists the open windows at the end of this menu.
    window.set_as_windows_menu_for_nsapp()?;
    Menu::with_items(handle, &[&app_menu, &shell, &edit, &view, &window])
}

// ----- Dock menu, Finder services, callbacks -----

/// What the Dock menu or a Finder service asked for, handled by `lib.rs`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Request {
    NewWindow,
    NewTab { profile: Option<String> },
    Folder { path: String, new_window: bool },
}

static CALLBACK: OnceLock<Box<dyn Fn(Request) + Send + Sync>> = OnceLock::new();
static DOCK_PROFILES: Mutex<Vec<(String, String)>> = Mutex::new(Vec::new());
static DOCK_LABELS: Mutex<(String, String)> = Mutex::new((String::new(), String::new()));

thread_local! {
    static TARGET: RefCell<Option<Retained<Target>>> = const { RefCell::new(None) };
    static DOCK_MENU: RefCell<Option<Retained<NSMenu>>> = const { RefCell::new(None) };
}

fn send(r: Request) {
    if let Some(f) = CALLBACK.get() {
        f(r);
    }
}

const TAG_NEW_WINDOW: isize = 1;
const TAG_NEW_TAB: isize = 2;
const TAG_PROFILE: isize = 100;

define_class!(
    // SAFETY: NSObject has no subclassing requirements, and Target has no Drop.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "KSForgeTarget"]
    struct Target;

    impl Target {
        #[unsafe(method(dockItem:))]
        fn dock_item(&self, sender: &NSMenuItem) {
            let tag = sender.tag();
            match tag {
                TAG_NEW_WINDOW => send(Request::NewWindow),
                TAG_NEW_TAB => send(Request::NewTab { profile: None }),
                t if t >= TAG_PROFILE => {
                    let id = DOCK_PROFILES.lock().ok().and_then(|p| p.get((t - TAG_PROFILE) as usize).map(|x| x.0.clone()));
                    send(Request::NewTab { profile: id });
                }
                _ => {}
            }
        }

        /// Finder service "New KS Forge Tab Here" (Info.plist `NSServices`).
        #[unsafe(method(newTabHere:userData:error:))]
        fn new_tab_here(&self, pboard: &NSPasteboard, _data: Option<&NSString>, _error: *mut *mut NSString) {
            for path in pasteboard_paths(pboard) {
                send(Request::Folder { path, new_window: false });
            }
        }

        /// Finder service "New KS Forge Window Here".
        #[unsafe(method(newWindowHere:userData:error:))]
        fn new_window_here(&self, pboard: &NSPasteboard, _data: Option<&NSString>, _error: *mut *mut NSString) {
            for path in pasteboard_paths(pboard) {
                send(Request::Folder { path, new_window: true });
            }
        }
    }
);

impl Target {
    fn new(mtm: MainThreadMarker) -> Retained<Self> {
        // SAFETY: NSObject's init takes no arguments and returns the initialised object.
        unsafe { msg_send![Self::alloc(mtm), init] }
    }
}

/// The file paths on a services pasteboard.
fn pasteboard_paths(pboard: &NSPasteboard) -> Vec<String> {
    let classes = NSArray::from_slice(&[NSURL::class()]);
    // SAFETY: readObjectsForClasses:options: takes an array of classes and an optional
    // dictionary, and returns an array of instances of those classes or nil.
    let objects: Option<Retained<NSArray<AnyObject>>> = unsafe { msg_send![pboard, readObjectsForClasses: &*classes, options: std::ptr::null::<AnyObject>()] };
    let mut out = Vec::new();
    if let Some(list) = objects {
        for obj in list.iter() {
            if let Some(url) = obj.downcast_ref::<NSURL>()
                && let Some(p) = url.path()
            {
                out.push(p.to_string());
            }
        }
    }
    out
}

/// `applicationDockMenu:`, added to the app delegate's class.
extern "C-unwind" fn dock_menu(_this: &AnyObject, _cmd: Sel, _app: &AnyObject) -> *mut NSMenu {
    DOCK_MENU.with(|m| m.borrow().as_ref().map_or(std::ptr::null_mut(), |menu| Retained::as_ptr(menu).cast_mut()))
}

/// Sets up the Dock menu and the Finder services. `callback` runs on the main thread.
pub fn install(callback: impl Fn(Request) + Send + Sync + 'static) {
    let _ = CALLBACK.set(Box::new(callback));
    let Some(mtm) = MainThreadMarker::new() else { return };
    let app = NSApplication::sharedApplication(mtm);
    let target = Target::new(mtm);
    // SAFETY: setServicesProvider: keeps a reference to any object; ours lives in TARGET.
    unsafe { app.setServicesProvider(Some(&target)) };
    TARGET.with(|t| *t.borrow_mut() = Some(target));
    if let Some(delegate) = app.delegate() {
        let obj: &AnyObject = delegate.as_ref();
        let cls: &AnyClass = obj.class();
        let imp: Imp = unsafe { std::mem::transmute::<extern "C-unwind" fn(&AnyObject, Sel, &AnyObject) -> *mut NSMenu, Imp>(dock_menu) };
        // SAFETY: the types string matches dock_menu: returns an object, takes self, _cmd
        // and one object. class_addMethod does nothing if the class already has the method.
        unsafe {
            objc2::ffi::class_addMethod((cls as *const AnyClass).cast_mut(), sel!(applicationDockMenu:), imp, c"@@:@".as_ptr() as *const c_char);
        }
    }
    rebuild_dock_menu(mtm);
}

/// The profiles listed in the Dock menu, and its two first items' labels.
pub fn set_dock_profiles(profiles: Vec<(String, String)>, new_window: String, new_tab: String) {
    if let Ok(mut p) = DOCK_PROFILES.lock() {
        *p = profiles;
    }
    if let Ok(mut l) = DOCK_LABELS.lock() {
        *l = (new_window, new_tab);
    }
    if let Some(mtm) = MainThreadMarker::new() {
        rebuild_dock_menu(mtm);
    }
}

fn rebuild_dock_menu(mtm: MainThreadMarker) {
    let (new_window, new_tab) = DOCK_LABELS.lock().map(|l| l.clone()).unwrap_or_default();
    let profiles = DOCK_PROFILES.lock().map(|p| p.clone()).unwrap_or_default();
    let menu = NSMenu::new(mtm);
    let add = |title: &str, tag: isize| {
        let item = NSMenuItem::new(mtm);
        item.setTitle(&NSString::from_str(title));
        item.setTag(tag);
        // SAFETY: the action selector matches Target's dockItem: method.
        unsafe { item.setAction(Some(sel!(dockItem:))) };
        TARGET.with(|t| {
            if let Some(target) = t.borrow().as_ref() {
                // SAFETY: the target outlives the menu (both live for the app's lifetime).
                unsafe { item.setTarget(Some(target)) };
            }
        });
        menu.addItem(&item);
    };
    add(if new_window.is_empty() { "New Window" } else { &new_window }, TAG_NEW_WINDOW);
    add(if new_tab.is_empty() { "New Tab" } else { &new_tab }, TAG_NEW_TAB);
    if !profiles.is_empty() {
        menu.addItem(&NSMenuItem::separatorItem(mtm));
        for (i, (_, name)) in profiles.iter().enumerate() {
            add(name, TAG_PROFILE + i as isize);
        }
    }
    DOCK_MENU.with(|m| *m.borrow_mut() = Some(menu));
}

/// For the self-test: the Dock menu and the services provider are in place.
pub fn self_check() -> String {
    let Some(mtm) = MainThreadMarker::new() else { return "dock=? (not main thread)".into() };
    let app = NSApplication::sharedApplication(mtm);
    let dock = app.delegate().is_some_and(|d| {
        let obj: &AnyObject = d.as_ref();
        obj.class().responds_to(sel!(applicationDockMenu:))
    });
    let items = DOCK_MENU.with(|m| m.borrow().as_ref().map_or(0, |menu| menu.numberOfItems()));
    format!("dock={dock} dockItems={items}")
}

// ----- Secure Keyboard Entry, VoiceOver -----

#[link(name = "Carbon", kind = "framework")]
unsafe extern "C" {
    fn EnableSecureEventInput() -> i32;
    fn DisableSecureEventInput() -> i32;
}

static SECURE: Mutex<bool> = Mutex::new(false);

/// Secure Keyboard Entry: while on, other apps cannot read what is typed (passwords).
/// Calls are counted by the system, so it is switched only when it changes.
pub fn set_secure_input(on: bool) {
    let Ok(mut s) = SECURE.lock() else { return };
    if *s == on {
        return;
    }
    // SAFETY: plain Carbon calls without arguments.
    unsafe {
        if on {
            EnableSecureEventInput();
        } else {
            DisableSecureEventInput();
        }
    }
    *s = on;
}

/// Whether VoiceOver is running.
pub fn screen_reader_active() -> bool {
    let ws = NSWorkspace::sharedWorkspace();
    // SAFETY: isVoiceOverEnabled is a BOOL property of NSWorkspace (macOS 10.13+).
    unsafe { msg_send![&*ws, isVoiceOverEnabled] }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shortcuts_become_menu_accelerators() {
        assert_eq!(accelerator("shift+cmd+t").as_deref(), Some("Shift+Cmd+T"));
        assert_eq!(accelerator("alt+cmd+left").as_deref(), Some("Alt+Cmd+ArrowLeft"));
        assert_eq!(accelerator("cmd+=").as_deref(), Some("Cmd+Equal"));
        assert_eq!(accelerator("cmd+,").as_deref(), Some("Cmd+Comma"));
        assert_eq!(accelerator("shift+cmd+[").as_deref(), Some("Shift+Cmd+BracketLeft"));
        assert_eq!(accelerator("cmd+1").as_deref(), Some("Cmd+1"));
        assert_eq!(accelerator(""), None);
        assert_eq!(accelerator("cmd+§"), None);
    }
}
