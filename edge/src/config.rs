// Configurazione remota (GET /api/edge/config), cache su disco e matching dei domini.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct EdgeConfig {
    pub sensor_id: String,
    pub name: String,
    pub company: String,
    pub privacy_mode: String,
    pub dns_enabled: bool,
    pub syslog_enabled: bool,
    pub block_enabled: bool,
    pub scan_lan: bool,
    pub report_every_sec: u64,
    pub services: Vec<Service>,
    pub blocked: Vec<Blocked>,
}

impl Default for EdgeConfig {
    fn default() -> Self {
        EdgeConfig {
            sensor_id: String::new(),
            name: String::new(),
            company: String::new(),
            privacy_mode: "individual".into(),
            dns_enabled: true,
            syslog_enabled: true,
            block_enabled: false,
            scan_lan: false,
            report_every_sec: 300,
            services: vec![],
            blocked: vec![],
        }
    }
}

impl EdgeConfig {
    pub fn anonymous(&self) -> bool {
        self.privacy_mode == "anonymous"
    }
    pub fn report_every(&self) -> u64 {
        if self.report_every_sec == 0 { 300 } else { self.report_every_sec.clamp(30, 86400) }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct Service {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub domains: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Blocked {
    pub service_id: String,
    pub name: String,
    pub domains: Vec<String>,
    pub instead: Option<String>,
}

/// Index for fast suffix matching (same rules as catalog.ts#matchDomain, host only).
#[derive(Default)]
struct Index {
    exact: HashMap<String, usize>,
    contains: Vec<(String, usize)>, // "bedrock…" patterns match anywhere in the host
}

impl Index {
    fn add(&mut self, pat: &str, idx: usize) {
        let p = pat.trim().to_ascii_lowercase();
        let p = p.trim_start_matches("*.").trim_end_matches('.');
        if p.is_empty() || p.contains('/') {
            return; // host+path patterns come only from browser scanners
        }
        if p.starts_with("bedrock") {
            self.contains.push((p.to_string(), idx));
        }
        self.exact.entry(p.to_string()).or_insert(idx);
    }
    fn find(&self, host: &str) -> Option<usize> {
        let mut h = host;
        loop {
            if let Some(i) = self.exact.get(h) {
                return Some(*i);
            }
            match h.find('.') {
                Some(p) => h = &h[p + 1..],
                None => break,
            }
        }
        self.contains.iter().find(|(p, _)| host.contains(p.as_str())).map(|(_, i)| *i)
    }
}

pub struct Runtime {
    pub cfg: EdgeConfig,
    services: Index,
    blocked: Index,
}

pub struct Match<'a> {
    pub service_id: &'a str,
    pub kind: &'a str,
}

impl Runtime {
    pub fn new(cfg: EdgeConfig) -> Runtime {
        let mut services = Index::default();
        for (i, s) in cfg.services.iter().enumerate() {
            for d in &s.domains {
                services.add(d, i);
            }
        }
        let mut blocked = Index::default();
        for (i, b) in cfg.blocked.iter().enumerate() {
            for d in &b.domains {
                blocked.add(d, i);
            }
        }
        Runtime { cfg, services, blocked }
    }

    fn norm(host: &str) -> String {
        host.trim_end_matches('.').to_ascii_lowercase()
    }

    pub fn service(&self, host: &str) -> Option<Match<'_>> {
        let h = Self::norm(host);
        let s = &self.cfg.services[self.services.find(&h)?];
        Some(Match { service_id: &s.id, kind: if s.kind.is_empty() { "web" } else { &s.kind } })
    }

    /// Service whose id or name appears in a firewall App-ID ("openai-chatgpt" → chatgpt).
    pub fn service_by_app(&self, app: &str) -> Option<Match<'_>> {
        // "-openai-chatgpt-" contains "-chatgpt-": id bounded by separators, never a bare substring
        let a = format!("-{}-", app.to_ascii_lowercase().replace(|c: char| !c.is_ascii_alphanumeric(), "-"));
        let s = self.cfg.services.iter().find(|s| {
            let id = s.id.to_ascii_lowercase();
            let name = s.name.to_ascii_lowercase().replace(|c: char| !c.is_ascii_alphanumeric(), "-");
            (id.len() >= 4 && a.contains(&format!("-{id}-"))) || (name.len() >= 4 && a == format!("-{name}-"))
        })?;
        Some(Match { service_id: &s.id, kind: if s.kind.is_empty() { "web" } else { &s.kind } })
    }

    /// Blocked-list match → (serviceId, kind).
    pub fn blocked(&self, host: &str) -> Option<Match<'_>> {
        let h = Self::norm(host);
        let b = &self.cfg.blocked[self.blocked.find(&h)?];
        let kind = self.cfg.services.iter().find(|s| s.id == b.service_id).map(|s| s.kind.as_str()).filter(|k| !k.is_empty()).unwrap_or("web");
        Some(Match { service_id: &b.service_id, kind })
    }
}

pub enum FetchError {
    Unauthorized,
    Other(String),
}

pub fn fetch(agent: &ureq::Agent, server: &str, token: &str) -> Result<(EdgeConfig, String), FetchError> {
    let url = format!("{}/api/edge/config", server.trim_end_matches('/'));
    match agent.get(&url).set("Authorization", &format!("Bearer {token}")).call() {
        Ok(r) => {
            let text = r.into_string().map_err(|e| FetchError::Other(e.to_string()))?;
            let cfg: EdgeConfig = serde_json::from_str(&text).map_err(|e| FetchError::Other(format!("bad config JSON: {e}")))?;
            Ok((cfg, text))
        }
        Err(ureq::Error::Status(401, _)) | Err(ureq::Error::Status(403, _)) => Err(FetchError::Unauthorized),
        Err(ureq::Error::Status(code, _)) => Err(FetchError::Other(format!("HTTP {code}"))),
        Err(e) => Err(FetchError::Other(e.to_string())),
    }
}

pub fn load_cached(dir: &Path) -> Option<EdgeConfig> {
    std::fs::read_to_string(dir.join("config.json")).ok().and_then(|s| serde_json::from_str(&s).ok())
}

pub fn save_cached(dir: &Path, text: &str) {
    let tmp = dir.join("config.json.tmp");
    if std::fs::write(&tmp, text).is_ok() {
        let _ = std::fs::rename(tmp, dir.join("config.json"));
    }
}

#[cfg(test)]
pub fn sample() -> EdgeConfig {
    serde_json::from_str(
        r#"{"sensorId":"s1","name":"Milan office","company":"Acme","privacyMode":"individual",
        "dnsEnabled":true,"syslogEnabled":true,"blockEnabled":true,"scanLan":false,"reportEverySec":300,
        "services":[{"id":"chatgpt","name":"ChatGPT","kind":"web","domains":["chatgpt.com","chat.openai.com"]},
                    {"id":"openai-api","name":"OpenAI API","kind":"api","domains":["api.openai.com"]},
                    {"id":"claude","name":"Claude","kind":"web","domains":["claude.ai"]},
                    {"id":"bedrock","name":"AWS Bedrock","kind":"api","domains":["bedrock-runtime"]},
                    {"id":"notion-ai","name":"Notion AI","kind":"web","domains":["notion.so/ai"]}],
        "blocked":[{"serviceId":"deepseek","name":"DeepSeek","domains":["deepseek.com"],"instead":"Microsoft Copilot"}]}"#,
    )
    .unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matching() {
        let rt = Runtime::new(sample());
        assert_eq!(rt.service("chatgpt.com").unwrap().service_id, "chatgpt");
        assert_eq!(rt.service("ab.chatgpt.com.").unwrap().service_id, "chatgpt");
        assert_eq!(rt.service("API.OpenAI.com").unwrap().kind, "api");
        assert!(rt.service("openai.com").is_none());
        assert!(rt.service("notchatgpt.com").is_none());
        assert!(rt.service("notion.so").is_none());
        assert_eq!(rt.service("bedrock-runtime.eu-west-1.amazonaws.com").unwrap().service_id, "bedrock");
        assert_eq!(rt.blocked("chat.deepseek.com").unwrap().service_id, "deepseek");
        assert!(rt.blocked("chatgpt.com").is_none());
        assert_eq!(rt.service_by_app("openai-chatgpt").unwrap().service_id, "chatgpt");
        assert!(rt.service_by_app("ssl").is_none());
        assert!(rt.service_by_app("web-browsing").is_none());
        assert_eq!(rt.service_by_app("ChatGPT").unwrap().service_id, "chatgpt");
    }

    #[test]
    fn defaults() {
        let c: EdgeConfig = serde_json::from_str("{}").unwrap();
        assert!(c.dns_enabled && c.syslog_enabled && !c.block_enabled);
        assert_eq!(c.report_every(), 300);
    }
}
