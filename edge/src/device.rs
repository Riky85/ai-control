// angar device (hardware): /etc/angar-edge/device.json, zero-touch claim (POST /api/edge/claim)
// and the sensor token saved in the state dir. See docs/edge-protocol.md "Hardware devices".
use serde::Deserialize;
use std::io::Write;
use std::path::{Path, PathBuf};

pub const DEFAULT_DEVICE_FILE: &str = "/etc/angar-edge/device.json";
const TOKEN_FILE: &str = "token";

#[derive(Deserialize, Clone, Default)]
#[serde(default)]
pub struct Device {
    pub serial: String,
    pub secret: String,
    pub model: String,
}

// Never print the secret (logs, panics, {:?}).
impl std::fmt::Debug for Device {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Device").field("serial", &self.serial).field("model", &self.model).finish_non_exhaustive()
    }
}

pub fn parse(text: &str) -> Result<Device, String> {
    let mut d: Device = serde_json::from_str(text).map_err(|e| format!("invalid JSON: {e}"))?;
    d.serial = d.serial.trim().to_string();
    d.model = d.model.trim().to_string();
    if d.serial.is_empty() || d.serial.len() > 64 || !d.serial.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-') {
        return Err("\"serial\" is missing or invalid (expected AE-XXXX-XXXX)".into());
    }
    if d.secret.trim().len() < 16 {
        return Err("\"secret\" is missing or too short".into());
    }
    Ok(d)
}

pub fn load(path: &Path) -> Result<Device, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("cannot read {}: {e}", path.display()))?;
    parse(&text).map_err(|e| format!("{}: {e}", path.display()))
}

/// Default device file: systemd credential (LoadCredential=device.json:…) if present, else /etc/angar-edge/device.json.
pub fn default_path() -> PathBuf {
    if let Some(dir) = std::env::var_os("CREDENTIALS_DIRECTORY") {
        let p = Path::new(&dir).join("device.json");
        if p.exists() {
            return p;
        }
    }
    PathBuf::from(DEFAULT_DEVICE_FILE)
}

#[derive(Debug, PartialEq)]
pub enum Reply {
    /// 202: nobody claimed it yet.
    Waiting { claim_url: String },
    /// 200: claimed, fresh token (the previous one is rotated).
    Claimed { token: String, sensor_id: String, company: String },
    /// 410: replaced / returned.
    Retired,
    /// 404: serial not in the factory registry.
    UnknownSerial,
    /// 403: wrong secret.
    BadSecret,
    /// Server answered something unexpected (5xx, malformed body…).
    Server(String),
    /// Could not reach the server.
    Network(String),
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct Body {
    status: String,
    claim_url: String,
    token: String,
    sensor_id: String,
    company: String,
}

/// Map an HTTP status + body to a claim reply (pure, unit-tested).
pub fn interpret(status: u16, body: &str) -> Reply {
    let b: Body = serde_json::from_str(body).unwrap_or_default();
    match status {
        200 => {
            let token = b.token.trim().to_string();
            if token.starts_with("ange_") && token.len() > 8 && token.bytes().all(|c| c.is_ascii_graphic()) {
                Reply::Claimed { token, sensor_id: b.sensor_id, company: b.company }
            } else {
                Reply::Server("200 without a valid token".into())
            }
        }
        202 => Reply::Waiting { claim_url: b.claim_url },
        410 => Reply::Retired,
        404 => Reply::UnknownSerial,
        403 => Reply::BadSecret,
        code => Reply::Server(format!("HTTP {code}")),
    }
}

pub fn claim(agent: &ureq::Agent, server: &str, dev: &Device) -> Reply {
    let url = format!("{}/api/edge/claim", server.trim_end_matches('/'));
    let body = serde_json::json!({ "serial": dev.serial, "secret": dev.secret, "version": crate::VERSION });
    match agent.post(&url).set("Content-Type", "application/json").send_json(body) {
        Ok(r) => {
            let status = r.status();
            interpret(status, &r.into_string().unwrap_or_default())
        }
        Err(ureq::Error::Status(code, r)) => interpret(code, &r.into_string().unwrap_or_default()),
        Err(e) => Reply::Network(e.to_string()),
    }
}

pub fn load_token(state_dir: &Path) -> Option<String> {
    let t = std::fs::read_to_string(state_dir.join(TOKEN_FILE)).ok()?;
    let t = t.trim();
    (!t.is_empty()).then(|| t.to_string())
}

/// Save the token with mode 0600 (atomic replace).
pub fn save_token(state_dir: &Path, token: &str) -> std::io::Result<()> {
    let tmp = state_dir.join("token.tmp");
    let _ = std::fs::remove_file(&tmp);
    let mut o = std::fs::OpenOptions::new();
    o.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        o.mode(0o600);
    }
    let mut f = o.open(&tmp)?;
    f.write_all(format!("{}\n", token.trim()).as_bytes())?;
    f.sync_all()?;
    drop(f);
    std::fs::rename(&tmp, state_dir.join(TOKEN_FILE))
}

pub fn forget_token(state_dir: &Path) {
    let _ = std::fs::remove_file(state_dir.join(TOKEN_FILE));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_json() {
        let d = parse(r#"{ "serial": " AE-7K3M-Q9TZ ", "secret": "0123456789abcdef0123456789abcdef", "model": "n100" }"#).unwrap();
        assert_eq!(d.serial, "AE-7K3M-Q9TZ");
        assert_eq!(d.model, "n100");
        assert!(!format!("{d:?}").contains("0123456789abcdef"));
        let d = parse(r#"{ "serial": "AE-1", "secret": "0123456789abcdef0123" }"#).unwrap();
        assert_eq!(d.model, "");
        assert!(parse(r#"{ "serial": "", "secret": "0123456789abcdef0123" }"#).is_err());
        assert!(parse(r#"{ "serial": "AE-1 <x>", "secret": "0123456789abcdef0123" }"#).is_err());
        assert!(parse(r#"{ "serial": "AE-1", "secret": "short" }"#).is_err());
        assert!(parse("not json").is_err());
    }

    #[test]
    fn claim_replies() {
        assert_eq!(
            interpret(202, r#"{"status":"unclaimed","claimUrl":"https://x/edge/claim?serial=AE-1"}"#),
            Reply::Waiting { claim_url: "https://x/edge/claim?serial=AE-1".into() }
        );
        assert_eq!(
            interpret(200, r#"{"status":"claimed","token":"ange_abc123","sensorId":"s1","company":"Acme"}"#),
            Reply::Claimed { token: "ange_abc123".into(), sensor_id: "s1".into(), company: "Acme".into() }
        );
        assert!(matches!(interpret(200, r#"{"status":"claimed"}"#), Reply::Server(_)));
        assert!(matches!(interpret(200, r#"{"token":"nope"}"#), Reply::Server(_)));
        assert_eq!(interpret(410, r#"{"status":"retired"}"#), Reply::Retired);
        assert_eq!(interpret(410, ""), Reply::Retired);
        assert_eq!(interpret(404, "{}"), Reply::UnknownSerial);
        assert_eq!(interpret(403, "{}"), Reply::BadSecret);
        assert_eq!(interpret(502, "<html>"), Reply::Server("HTTP 502".into()));
    }

    #[test]
    fn token_file() {
        let dir = std::env::temp_dir().join(format!("angar-tok-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(load_token(&dir), None);
        save_token(&dir, "ange_xyz\n").unwrap();
        assert_eq!(load_token(&dir).as_deref(), Some("ange_xyz"));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(dir.join("token")).unwrap().permissions().mode() & 0o777, 0o600);
        }
        forget_token(&dir);
        assert_eq!(load_token(&dir), None);
        let _ = std::fs::remove_dir_all(dir);
    }
}
