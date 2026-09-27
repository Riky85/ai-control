use crate::config::{home, Config};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Service {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub domains: Vec<String>,
    #[serde(default)]
    pub apps: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Catalog {
    pub services: Vec<Service>,
}

impl Catalog {
    /// Public list of AI services (no customer data). Cached for offline starts.
    pub fn fetch_or_cached(cfg: &Config) -> Catalog {
        let cache = home().join("catalog.json");
        let url = format!("{}/api/discovery/catalog", cfg.server);
        if let Ok(r) = ureq::get(&url).timeout(std::time::Duration::from_secs(20)).call() {
            if let Ok(text) = r.into_string() {
                if let Ok(c) = serde_json::from_str::<Catalog>(&text) {
                    if !c.services.is_empty() {
                        let _ = std::fs::write(&cache, text);
                        return c;
                    }
                }
            }
        }
        std::fs::read_to_string(cache).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
    }

    /// Same rules as the server: suffix match on the host, host+path for patterns with a path.
    pub fn match_url_host(&self, host: &str, path: &str) -> Option<String> {
        let host = host.trim_end_matches('.');
        for s in &self.services {
            for pat in &s.domains {
                let pat = pat.to_lowercase();
                if let Some((ph, pp)) = pat.split_once('/') {
                    if (host == ph || host.ends_with(&format!(".{ph}"))) && path.trim_start_matches('/').starts_with(pp) {
                        return Some(pat.clone());
                    }
                    continue;
                }
                if host == pat || host.ends_with(&format!(".{pat}")) || (pat.starts_with("bedrock") && host.contains(&pat)) {
                    return Some(host.to_string());
                }
            }
        }
        None
    }

    /// Process / folder / extension name → the catalog app name it stands for.
    pub fn match_app(&self, name: &str) -> Option<String> {
        let n = name.to_lowercase();
        let n = n.trim_end_matches(".exe").trim_end_matches(".app").trim();
        for s in &self.services {
            for app in &s.apps {
                let a = app.to_lowercase();
                if n == a || n.starts_with(&format!("{a} ")) || n.starts_with(&format!("{a}-")) || n.starts_with(&format!("{a}.")) {
                    return Some(app.clone());
                }
            }
        }
        None
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct Finding {
    pub kind: &'static str, // "domain" | "app"
    pub value: String,
    pub hits: u64,
    pub minutes: u64,
    #[serde(rename = "lastSeen", skip_serializing_if = "Option::is_none")]
    pub last_seen: Option<String>,
    pub via: String,
}

/// Minutes each AI desktop app has been running (sampled once a minute).
#[derive(Default)]
pub struct Usage {
    minutes: HashMap<String, u64>,
    /// Running apps that look like AI but aren't in the catalog.
    candidate_minutes: HashMap<String, u64>,
    last: HashMap<String, i64>,
}

impl Usage {
    pub fn sample(&mut self, catalog: &Catalog) {
        let mut sys = sysinfo::System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        let mut seen: Vec<String> = Vec::new();
        let mut maybe: Vec<String> = Vec::new();
        for p in sys.processes().values() {
            let name = p.name().to_string_lossy();
            if let Some(app) = catalog.match_app(&name) {
                if !seen.contains(&app) {
                    seen.push(app);
                }
            } else if let Some(app) = ai_candidate_app(&name) {
                if !maybe.contains(&app) {
                    maybe.push(app);
                }
            }
        }
        let now = crate::now_ms();
        for app in seen {
            *self.minutes.entry(app.clone()).or_default() += 1;
            self.last.insert(app, now);
        }
        for app in maybe {
            *self.candidate_minutes.entry(app.clone()).or_default() += 1;
            self.last.insert(app, now);
        }
    }
}

fn iso(ms: i64) -> String {
    // yyyy-mm-ddThh:mm:ssZ without a date crate (civil-from-days).
    let secs = ms.div_euclid(1000);
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

#[derive(Default)]
struct Agg {
    hits: u64,
    minutes: f64,
    last: i64,
    via: Vec<String>,
}

pub fn scan(catalog: &Catalog, since_ms: i64, usage: &Usage) -> Vec<Finding> {
    // One entry per AI and per day, so the dashboard knows on how many days it was used.
    let mut domains: HashMap<(String, String), Agg> = HashMap::new();
    // AI not in the catalog: domains that look like AI, reported for review.
    let mut candidates: HashMap<String, Agg> = HashMap::new();
    for (browser, file, kind) in history_files() {
        let visits = match read_history(&file, kind, since_ms) {
            Ok(v) => v,
            Err(_) => continue,
        };
        for (url, at_ms, dur_ms) in visits {
            let Some((host, path)) = split_url(&url) else { continue };
            let Some(value) = catalog.match_url_host(&host, &path) else {
                if let Some(domain) = ai_candidate_domain(&host) {
                    let a = candidates.entry(domain).or_default();
                    a.hits += 1;
                    a.minutes += if dur_ms > 0 { (dur_ms as f64 / 60000.0).min(30.0) } else { 1.0 };
                    a.last = a.last.max(at_ms);
                    if !a.via.contains(&browser) {
                        a.via.push(browser.clone());
                    }
                }
                continue;
            };
            let day = iso(at_ms)[..10].to_string();
            let a = domains.entry((value, day)).or_default();
            a.hits += 1;
            // Chromium records how long the page stayed open; cap idle tabs at 30 min.
            a.minutes += if dur_ms > 0 { (dur_ms as f64 / 60000.0).min(30.0) } else { 1.0 };
            a.last = a.last.max(at_ms);
            if !a.via.contains(&browser) {
                a.via.push(browser.clone());
            }
        }
    }
    let mut out: Vec<Finding> = domains
        .into_iter()
        .map(|((value, _day), a)| Finding {
            kind: "domain",
            value,
            hits: a.hits,
            minutes: a.minutes.round().max(1.0) as u64,
            last_seen: if a.last > 0 { Some(iso(a.last)) } else { None },
            via: format!("desktop app · {}", a.via.join(", ")),
        })
        .collect();
    // Only candidates seen at least twice: a single visit is often just a link someone clicked.
    let mut cands: Vec<(String, Agg)> = candidates.into_iter().filter(|(_, a)| a.hits >= 2).collect();
    cands.sort_by(|a, b| b.1.hits.cmp(&a.1.hits));
    for (value, a) in cands.into_iter().take(40) {
        out.push(Finding {
            kind: "candidate",
            value,
            hits: a.hits,
            minutes: a.minutes.round().max(1.0) as u64,
            last_seen: if a.last > 0 { Some(iso(a.last)) } else { None },
            via: format!("desktop app · possible AI · {}", a.via.join(", ")),
        });
    }
    for (app, minutes) in &usage.candidate_minutes {
        out.push(Finding { kind: "candidate_app", value: app.clone(), hits: *minutes, minutes: *minutes, last_seen: usage.last.get(app).map(|t| iso(*t)), via: "desktop app · possible AI app".into() });
    }
    for (app, minutes) in &usage.minutes {
        out.push(Finding { kind: "app", value: app.clone(), hits: *minutes, minutes: *minutes, last_seen: usage.last.get(app).map(|t| iso(*t)), via: "desktop app · running app".into() });
    }
    for (name, via) in installed(catalog) {
        if out.iter().any(|f| f.kind == "app" && f.value == name) {
            continue;
        }
        out.push(Finding { kind: "app", value: name, hits: 1, minutes: 0, last_seen: None, via });
    }
    out
}

/// Words that almost only appear in AI product names/domains.
const AI_WORDS: &[&str] = &["gpt", "llm", "copilot", "chatbot", "genai", "aichat", "openai", "anthropic", "ollama", "huggingface", "diffusion", "deepseek", "mistral", "gemini", "claude", "perplexity", "neural", "agentic"];

/// Registrable domain ("chat.foo.co.uk" → "foo.co.uk").
fn registrable(host: &str) -> String {
    let labels: Vec<&str> = host.trim_end_matches('.').split('.').collect();
    let n = labels.len();
    if n <= 2 {
        return host.to_string();
    }
    let second = labels[n - 2];
    let take = if labels[n - 1].len() == 2 && ["co", "com", "org", "net", "ac", "gov", "edu"].contains(&second) { 3 } else { 2 };
    labels[n.saturating_sub(take)..].join(".")
}

/// A domain that looks like an AI service but isn't in the catalog. Returns
/// the registrable domain only (never the full host or the page).
pub fn ai_candidate_domain(host: &str) -> Option<String> {
    let host = host.trim_end_matches('.');
    if host.parse::<std::net::IpAddr>().is_ok() || !host.contains('.') || host.ends_with(".local") || host == "localhost" {
        return None;
    }
    let reg = registrable(host);
    let labels: Vec<&str> = host.split('.').collect();
    let tld = labels.last().copied().unwrap_or("");
    let is_ai = |l: &&str| *l == "ai" || l.starts_with("ai-") || l.ends_with("-ai") || AI_WORDS.iter().any(|w| l.contains(w));
    // The signal is in the registrable domain itself (genspark.ai, supergpt.io): report that.
    let reg_labels: Vec<&str> = reg.split('.').collect();
    if tld == "ai" || reg_labels[..reg_labels.len() - 1].iter().any(is_ai) {
        return Some(reg);
    }
    // Only in a subdomain (ai.acme.com): report the host, so it isn't mistaken for the whole company site.
    labels[..labels.len() - 1].iter().any(is_ai).then(|| host.to_string())
}

/// A running app whose name suggests AI ("SuperGPT", "Local LLM Studio"…).
pub fn ai_candidate_app(name: &str) -> Option<String> {
    let n = name.trim_end_matches(".exe").trim_end_matches(".app");
    let l = n.to_lowercase();
    // Skip helpers/system noise and very short names.
    if l.len() < 3 || l.contains("helper") || l.contains("crashpad") || l.contains("update") {
        return None;
    }
    let tokens: Vec<&str> = l.split(|c: char| !c.is_ascii_alphanumeric()).filter(|t| !t.is_empty()).collect();
    let hit = AI_WORDS.iter().any(|w| l.contains(w)) || tokens.iter().any(|t| *t == "ai");
    hit.then(|| n.to_string())
}

/// "https://user@chat.openai.com:443/c/123?x" → ("chat.openai.com", "/c/123")
pub fn split_url(url: &str) -> Option<(String, String)> {
    let rest = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://"))?;
    let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..end];
    let host = authority.rsplit('@').next()?.split(':').next()?.to_lowercase();
    if host.is_empty() {
        return None;
    }
    let path = rest[end..].split(['?', '#']).next().unwrap_or("").to_string();
    Some((host, path))
}

#[derive(Clone, Copy)]
enum Kind {
    Chromium,
    Firefox,
    Safari,
}

fn history_files() -> Vec<(String, PathBuf, Kind)> {
    let mut out = Vec::new();
    let local = dirs::data_local_dir();
    let roaming = dirs::data_dir(); // Windows: Roaming; macOS: Application Support
    let config = dirs::config_dir(); // Linux: ~/.config
    let home = dirs::home_dir();

    let mut chromium: Vec<(&str, Option<PathBuf>)> = Vec::new();
    if cfg!(windows) {
        let l = |p: &str| local.as_ref().map(|b| b.join(p));
        let r = |p: &str| roaming.as_ref().map(|b| b.join(p));
        chromium.extend([
            ("Chrome", l("Google\\Chrome\\User Data")),
            ("Edge", l("Microsoft\\Edge\\User Data")),
            ("Brave", l("BraveSoftware\\Brave-Browser\\User Data")),
            ("Vivaldi", l("Vivaldi\\User Data")),
            ("Chromium", l("Chromium\\User Data")),
            ("Opera", r("Opera Software\\Opera Stable")),
            ("Opera GX", r("Opera Software\\Opera GX Stable")),
        ]);
        // Arc for Windows lives in a Store package folder.
        if let Some(pk) = local.as_ref().map(|b| b.join("Packages")) {
            if let Ok(rd) = std::fs::read_dir(pk) {
                for e in rd.flatten() {
                    if e.file_name().to_string_lossy().starts_with("TheBrowserCompany.Arc") {
                        chromium.push(("Arc", Some(e.path().join("LocalCache\\Local\\Arc\\User Data"))));
                    }
                }
            }
        }
    } else if cfg!(target_os = "macos") {
        let a = |p: &str| roaming.as_ref().map(|b| b.join(p));
        chromium.extend([
            ("Chrome", a("Google/Chrome")),
            ("Edge", a("Microsoft Edge")),
            ("Brave", a("BraveSoftware/Brave-Browser")),
            ("Arc", a("Arc/User Data")),
            ("Vivaldi", a("Vivaldi")),
            ("Chromium", a("Chromium")),
            ("Opera", a("com.operasoftware.Opera")),
            ("Dia", a("Dia/User Data")),
        ]);
    } else {
        let c = |p: &str| config.as_ref().map(|b| b.join(p));
        chromium.extend([
            ("Chrome", c("google-chrome")),
            ("Edge", c("microsoft-edge")),
            ("Brave", c("BraveSoftware/Brave-Browser")),
            ("Vivaldi", c("vivaldi")),
            ("Chromium", c("chromium")),
            ("Opera", c("opera")),
        ]);
    }
    for (name, base) in chromium {
        let Some(base) = base else { continue };
        if base.join("History").is_file() {
            out.push((name.to_string(), base.join("History"), Kind::Chromium));
        }
        if let Ok(rd) = std::fs::read_dir(&base) {
            for e in rd.flatten() {
                let n = e.file_name().to_string_lossy().to_string();
                if (n == "Default" || n.starts_with("Profile ")) && e.path().join("History").is_file() {
                    out.push((name.to_string(), e.path().join("History"), Kind::Chromium));
                }
            }
        }
    }

    let firefox = if cfg!(windows) {
        roaming.as_ref().map(|b| b.join("Mozilla\\Firefox\\Profiles"))
    } else if cfg!(target_os = "macos") {
        roaming.as_ref().map(|b| b.join("Firefox/Profiles"))
    } else {
        home.as_ref().map(|h| h.join(".mozilla/firefox"))
    };
    if let Some(dir) = firefox {
        if let Ok(rd) = std::fs::read_dir(dir) {
            for e in rd.flatten() {
                let f = e.path().join("places.sqlite");
                if f.is_file() {
                    out.push(("Firefox".into(), f, Kind::Firefox));
                }
            }
        }
    }
    if cfg!(target_os = "macos") {
        // Needs Full Disk Access (granted by IT with a PPPC profile); skipped silently otherwise.
        if let Some(f) = home.as_ref().map(|h| h.join("Library/Safari/History.db")) {
            out.push(("Safari".into(), f, Kind::Safari));
        }
    }
    out
}

/// Browsers keep their history open: read a private copy (with its WAL).
fn read_history(file: &Path, kind: Kind, since_ms: i64) -> Result<Vec<(String, i64, i64)>, String> {
    let tmp = std::env::temp_dir().join(format!("angar-h-{}-{}", std::process::id(), crate::now_ms()));
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let db = tmp.join("h.sqlite");
    let res = (|| {
        std::fs::copy(file, &db).map_err(|e| e.to_string())?;
        for ext in ["-wal", "-shm"] {
            let side = PathBuf::from(format!("{}{ext}", file.display()));
            if side.is_file() {
                let _ = std::fs::copy(&side, PathBuf::from(format!("{}{ext}", db.display())));
            }
        }
        let conn = rusqlite::Connection::open(&db).map_err(|e| e.to_string())?;
        let (sql, since): (&str, i64) = match kind {
            // microseconds since 1601-01-01
            Kind::Chromium => ("SELECT u.url, v.visit_time / 1000 - 11644473600000, v.visit_duration / 1000 FROM visits v JOIN urls u ON u.id = v.url WHERE v.visit_time > ?1", (since_ms + 11644473600000) * 1000),
            // microseconds since 1970
            Kind::Firefox => ("SELECT p.url, v.visit_date / 1000, 0 FROM moz_historyvisits v JOIN moz_places p ON p.id = v.place_id WHERE v.visit_date > ?1", since_ms * 1000),
            // seconds since 2001-01-01, stored as REAL
            Kind::Safari => ("SELECT i.url, CAST((v.visit_time + 978307200) * 1000 AS INTEGER), 0 FROM history_visits v JOIN history_items i ON i.id = v.history_item WHERE v.visit_time > ?1", since_ms / 1000 - 978307200),
        };
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([since], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?)))
            .map_err(|e| e.to_string())?;
        Ok(rows.flatten().collect::<Vec<_>>())
    })();
    let _ = std::fs::remove_dir_all(&tmp);
    res
}

/// AI desktop apps installed (even if not open) and AI extensions in code editors.
fn installed(catalog: &Catalog) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    let mut push = |name: String, via: &str| {
        if !out.iter().any(|(n, _)| *n == name) {
            out.push((name, via.to_string()));
        }
    };
    let home = dirs::home_dir();
    let mut app_dirs: Vec<PathBuf> = Vec::new();
    if cfg!(target_os = "macos") {
        app_dirs.push(PathBuf::from("/Applications"));
        if let Some(h) = &home {
            app_dirs.push(h.join("Applications"));
        }
    } else if cfg!(windows) {
        if let Some(l) = dirs::data_local_dir() {
            app_dirs.push(l.join("Programs"));
            app_dirs.push(l.clone());
        }
        for v in ["ProgramFiles", "ProgramFiles(x86)"] {
            if let Ok(p) = std::env::var(v) {
                app_dirs.push(PathBuf::from(p));
            }
        }
    }
    for dir in app_dirs {
        if let Ok(rd) = std::fs::read_dir(dir) {
            for e in rd.flatten() {
                let n = e.file_name().to_string_lossy().to_string();
                let n = match n.as_str() {
                    "AnthropicClaude" => "Claude".to_string(),
                    "cursor" => "Cursor".to_string(),
                    _ => n,
                };
                if let Some(app) = catalog.match_app(&n) {
                    push(app, "desktop app · installed");
                }
            }
        }
    }
    if let Some(h) = &home {
        for ed in [".vscode", ".vscode-insiders", ".cursor", ".windsurf", ".vscodium"] {
            if let Ok(rd) = std::fs::read_dir(h.join(ed).join("extensions")) {
                for e in rd.flatten() {
                    let n = e.file_name().to_string_lossy().to_lowercase();
                    // "github.copilot-chat-0.24.1" → "github.copilot-chat"
                    let id = match n.rfind('-') {
                        Some(i) if n[i + 1..].starts_with(|c: char| c.is_ascii_digit()) => n[..i].to_string(),
                        _ => n.clone(),
                    };
                    if let Some(app) = catalog.match_app(&id) {
                        push(app, "desktop app · editor extension");
                    }
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cat() -> Catalog {
        Catalog {
            services: vec![
                Service { id: "chatgpt".into(), name: "ChatGPT".into(), domains: vec!["chatgpt.com".into()], apps: vec!["ChatGPT".into()] },
                Service { id: "notion-ai".into(), name: "Notion AI".into(), domains: vec!["notion.so/ai".into()], apps: vec![] },
                Service { id: "github-copilot".into(), name: "GitHub Copilot".into(), domains: vec![], apps: vec!["github.copilot".into(), "github.copilot-chat".into()] },
                Service { id: "lm-studio".into(), name: "LM Studio".into(), domains: vec![], apps: vec!["LM Studio".into()] },
            ],
        }
    }

    #[test]
    fn urls() {
        assert_eq!(split_url("https://a@Chat.OpenAI.com:443/c/1?x=1"), Some(("chat.openai.com".into(), "/c/1".into())));
        assert_eq!(split_url("file:///x"), None);
        let c = cat();
        assert_eq!(c.match_url_host("chatgpt.com", "/"), Some("chatgpt.com".into()));
        assert_eq!(c.match_url_host("notchatgpt.com", "/"), None);
        assert_eq!(c.match_url_host("www.notion.so", "/ai/x"), Some("notion.so/ai".into()));
        assert_eq!(c.match_url_host("www.notion.so", "/page"), None);
    }

    #[test]
    fn apps() {
        let c = cat();
        assert_eq!(c.match_app("ChatGPT.exe"), Some("ChatGPT".into()));
        assert_eq!(c.match_app("LM Studio Helper"), Some("LM Studio".into()));
        assert!(c.match_app("github.copilot-chat").is_some());
        assert_eq!(c.match_app("chrome"), None);
    }

    #[test]
    fn candidates() {
        assert_eq!(ai_candidate_domain("app.genspark.ai").as_deref(), Some("genspark.ai"));
        assert_eq!(ai_candidate_domain("www.supergpt.io").as_deref(), Some("supergpt.io"));
        assert_eq!(ai_candidate_domain("ai.acme.co.uk").as_deref(), Some("ai.acme.co.uk"));
        assert_eq!(ai_candidate_domain("docs-ai.example.com").as_deref(), Some("docs-ai.example.com"));
        assert_eq!(ai_candidate_domain("www.google.com"), None);
        assert_eq!(ai_candidate_domain("mail.airbnb.com"), None);
        assert_eq!(ai_candidate_domain("192.168.1.10"), None);
        assert_eq!(ai_candidate_app("SuperGPT.exe").as_deref(), Some("SuperGPT"));
        assert_eq!(ai_candidate_app("Notes AI").as_deref(), Some("Notes AI"));
        assert_eq!(ai_candidate_app("chrome"), None);
        assert_eq!(ai_candidate_app("Airtable"), None);
    }

    #[test]
    fn dates() {
        assert_eq!(iso(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso(1790496516000), "2026-09-27T08:08:36Z");
    }
}
