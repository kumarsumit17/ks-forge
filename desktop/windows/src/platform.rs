//! Windows-only code (specs/plan-per-platform.md, 2.2), compiled into the app's crate from
//! `shared/src-tauri/src/lib.rs`. Code both systems share stays in `shared/`.

use tauri::{WebviewWindowBuilder, Wry};

/// The window's Windows look: no system title bar; the interface draws the tabs and the
/// minimise, maximise and close buttons in one bar. The shadow keeps the resize borders.
pub fn window_builder<'a, M: tauri::Manager<Wry>>(b: WebviewWindowBuilder<'a, Wry, M>) -> WebviewWindowBuilder<'a, Wry, M> {
    b.decorations(false).shadow(true)
}
