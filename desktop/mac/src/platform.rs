//! macOS-only code (specs/plan-per-platform.md, 2.1), compiled into the app's crate from
//! `shared/src-tauri/src/lib.rs`. Code both systems share stays in `shared/`.

use tauri::{LogicalPosition, TitleBarStyle, WebviewWindowBuilder, Wry};

/// The window's macOS look: the traffic lights sit in our tab bar, with no title text.
pub fn window_builder<'a, M: tauri::Manager<Wry>>(b: WebviewWindowBuilder<'a, Wry, M>) -> WebviewWindowBuilder<'a, Wry, M> {
    b.title_bar_style(TitleBarStyle::Overlay).hidden_title(true).traffic_light_position(LogicalPosition::new(14.0, 19.0))
}
