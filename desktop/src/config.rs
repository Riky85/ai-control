use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const DEFAULT_SERVER: &str = "https://ai-control-production.up.railway.app";

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct Config {
    #[serde(default)]
    pub server: String,
    pub token: Option<String>,
    pub company: Option<String>,
    pub email: Option<String>,
    /// Browser history up to this moment (unix ms) has already been sent.
    pub last_sync_ms: Option<i64>,
    /// Company notices already shown to the person (e.g. "X isn't approved"), newest last.
    #[serde(default)]
    pub shown_notices: Vec<String>,
}

/// Per-user folder: config, catalog cache and the installed copy.
pub fn home() -> PathBuf {
    let base = if cfg!(windows) { dirs::data_local_dir() } else { dirs::data_dir() };
    let dir = base.unwrap_or_else(std::env::temp_dir).join("angar");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

impl Config {
    fn path() -> PathBuf {
        home().join("config.json")
    }
    pub fn load() -> Config {
        std::fs::read_to_string(Self::path()).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
    }
    pub fn save(&self) {
        if let Ok(s) = serde_json::to_string_pretty(self) {
            let tmp = Self::path().with_extension("tmp");
            if std::fs::write(&tmp, s).is_ok() {
                let _ = std::fs::rename(&tmp, Self::path());
            }
        }
    }
}
