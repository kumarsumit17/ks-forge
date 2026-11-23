//! Errors for the interface as message codes with parameters: Rust never builds a sentence,
//! the interface looks the code up in its language files (ks-utility `specs/languages.md`).

use std::collections::BTreeMap;

use serde::Serialize;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Msg {
    pub code: String,
    pub params: BTreeMap<String, String>,
}

impl Msg {
    pub fn new(code: &str) -> Self {
        Self { code: code.to_string(), params: BTreeMap::new() }
    }

    pub fn with(mut self, name: &str, value: impl ToString) -> Self {
        self.params.insert(name.to_string(), value.to_string());
        self
    }
}

/// `msg!("code")` or `msg!("code", name = value, ...)`.
#[macro_export]
macro_rules! msg {
    ($code:expr) => { $crate::msg::Msg::new($code) };
    ($code:expr, $($name:ident = $value:expr),+ $(,)?) => {
        $crate::msg::Msg::new($code)$(.with(stringify!($name), $value))+
    };
}
