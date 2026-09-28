// Aggregazione in memoria dei delta da inviare (limitata), con merge in caso di invio fallito
// e persistenza su disco (pending.json).
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::{Duration, Instant};

/// Max unique event+candidate keys kept in memory while offline.
pub const MAX_KEYS: usize = 20_000;
const MAX_CLIENTS: usize = 10_000;
/// Same client asking the same name within this window counts once (A + AAAA + HTTPS…).
const DEDUPE: Duration = Duration::from_secs(2);

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Hash)]
pub struct EvKey {
    pub day: String,
    #[serde(rename = "serviceId")]
    pub service_id: String,
    pub kind: String,
    pub client: String,
    pub source: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct EvVal {
    pub hits: u64,
    #[serde(rename = "bytesUp")]
    pub bytes_up: u64,
    pub blocked: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Hash)]
pub struct CandKey {
    pub day: String,
    pub domain: String,
    pub client: String,
    pub source: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct LocalModel {
    pub ip: String,
    pub port: u16,
    pub runtime: String,
    pub models: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Counters {
    pub dns_queries: u64,
    pub ai_queries: u64,
    pub blocked: u64,
    pub log_lines: u64,
}

/// A chunk taken out of the aggregator for one report (given back on failure).
#[derive(Serialize, Deserialize, Default, Debug)]
#[serde(default)]
pub struct Batch {
    pub events: Vec<(EvKey, EvVal)>,
    pub candidates: Vec<(CandKey, u64)>,
    pub local_models: Option<Vec<LocalModel>>,
    pub counters: Counters,
    pub clients: Vec<String>,
}

pub struct Hit<'a> {
    pub day: &'a str,
    pub service_id: &'a str,
    pub kind: &'a str,
    pub client: &'a str,
    pub source: &'a str,
    pub bytes_up: u64,
    pub blocked: bool,
    /// Name used for the short dedupe window (DNS-like sources only).
    pub dedupe: Option<&'a str>,
}

#[derive(Default)]
pub struct Stats {
    events: HashMap<EvKey, EvVal>,
    candidates: HashMap<CandKey, u64>,
    local_models: Option<Vec<LocalModel>>,
    counters: Counters,
    clients: HashSet<String>,
    recent: HashMap<(String, String), Instant>,
    last_prune: Option<Instant>,
    pub dropped: u64,
    pub dirty: bool,
}

impl Stats {
    fn keys(&self) -> usize {
        self.events.len() + self.candidates.len()
    }

    /// true if the same (client, name) was seen within the dedupe window.
    fn seen_recently(&mut self, client: &str, name: &str) -> bool {
        let now = Instant::now();
        if self.last_prune.map_or(true, |t| now.duration_since(t) > Duration::from_secs(30)) || self.recent.len() > 50_000 {
            self.recent.retain(|_, t| now.duration_since(*t) < DEDUPE);
            self.last_prune = Some(now);
        }
        let k = (client.to_string(), name.to_string());
        match self.recent.get(&k) {
            Some(t) if now.duration_since(*t) < DEDUPE => true,
            _ => {
                self.recent.insert(k, now);
                false
            }
        }
    }

    pub fn dns_query(&mut self, client: &str) {
        self.counters.dns_queries += 1;
        self.client(client);
    }

    pub fn log_line(&mut self) {
        self.counters.log_lines += 1;
        self.dirty = true;
    }

    /// Distinct client IPs (a count only; the set never leaves this machine).
    pub fn client(&mut self, client: &str) {
        if self.clients.len() < MAX_CLIENTS && !self.clients.contains(client) {
            self.clients.insert(client.to_string());
        }
    }

    pub fn hit(&mut self, h: Hit) {
        let dup = match h.dedupe {
            Some(name) => self.seen_recently(h.client, name),
            None => false,
        };
        if dup && h.bytes_up == 0 {
            return;
        }
        let key = EvKey { day: h.day.into(), service_id: h.service_id.into(), kind: h.kind.into(), client: h.client.into(), source: h.source.into() };
        if !self.events.contains_key(&key) && self.keys() >= MAX_KEYS {
            self.dropped += 1;
            return;
        }
        let v = self.events.entry(key).or_default();
        if !dup {
            v.hits += 1;
            self.counters.ai_queries += 1;
            if h.blocked {
                v.blocked += 1;
                self.counters.blocked += 1;
            }
        }
        v.bytes_up += h.bytes_up;
        self.dirty = true;
    }

    pub fn candidate(&mut self, day: &str, domain: &str, client: &str, source: &str, dedupe: bool) {
        if dedupe && self.seen_recently(client, domain) {
            return;
        }
        let key = CandKey { day: day.into(), domain: domain.into(), client: client.into(), source: source.into() };
        if !self.candidates.contains_key(&key) && self.keys() >= MAX_KEYS {
            self.dropped += 1;
            return;
        }
        *self.candidates.entry(key).or_default() += 1;
        self.dirty = true;
    }

    pub fn set_local_models(&mut self, models: Vec<LocalModel>) {
        self.local_models = Some(models);
        self.dirty = true;
    }

    /// Take up to `max_events` / `max_cands` for one report.
    pub fn take(&mut self, max_events: usize, max_cands: usize) -> Batch {
        let mut b = Batch { counters: std::mem::take(&mut self.counters), local_models: self.local_models.take(), ..Default::default() };
        b.clients = self.clients.drain().collect();
        if self.events.len() <= max_events {
            b.events = self.events.drain().collect();
        } else {
            let keys: Vec<EvKey> = self.events.keys().take(max_events).cloned().collect();
            for k in keys {
                if let Some(v) = self.events.remove(&k) {
                    b.events.push((k, v));
                }
            }
        }
        if self.candidates.len() <= max_cands {
            b.candidates = self.candidates.drain().collect();
        } else {
            let keys: Vec<CandKey> = self.candidates.keys().take(max_cands).cloned().collect();
            for k in keys {
                if let Some(v) = self.candidates.remove(&k) {
                    b.candidates.push((k, v));
                }
            }
        }
        b
    }

    pub fn has_backlog(&self) -> bool {
        !self.events.is_empty() || !self.candidates.is_empty()
    }

    /// Give a batch back (failed report / loaded from disk). Keeps the cap.
    pub fn merge(&mut self, b: Batch) {
        for (k, v) in b.events {
            if !self.events.contains_key(&k) && self.keys() >= MAX_KEYS {
                self.dropped += 1;
                continue;
            }
            let e = self.events.entry(k).or_default();
            e.hits += v.hits;
            e.bytes_up += v.bytes_up;
            e.blocked += v.blocked;
        }
        for (k, n) in b.candidates {
            if !self.candidates.contains_key(&k) && self.keys() >= MAX_KEYS {
                self.dropped += 1;
                continue;
            }
            *self.candidates.entry(k).or_default() += n;
        }
        if self.local_models.is_none() {
            self.local_models = b.local_models;
        }
        self.counters.dns_queries += b.counters.dns_queries;
        self.counters.ai_queries += b.counters.ai_queries;
        self.counters.blocked += b.counters.blocked;
        self.counters.log_lines += b.counters.log_lines;
        for c in b.clients {
            self.client(&c);
        }
        self.dirty = true;
    }

    /// Snapshot to disk (does not drain).
    pub fn save(&mut self, dir: &Path) -> std::io::Result<()> {
        let b = Batch {
            events: self.events.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
            candidates: self.candidates.iter().map(|(k, v)| (k.clone(), *v)).collect(),
            local_models: self.local_models.clone(),
            counters: self.counters.clone(),
            clients: self.clients.iter().cloned().collect(),
        };
        let tmp = dir.join("pending.json.tmp");
        std::fs::write(&tmp, serde_json::to_vec(&b)?)?;
        std::fs::rename(tmp, dir.join("pending.json"))?;
        self.dirty = false;
        Ok(())
    }

    pub fn load(dir: &Path) -> Option<Batch> {
        let s = std::fs::read(dir.join("pending.json")).ok()?;
        serde_json::from_slice(&s).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hit<'a>(client: &'a str, dedupe: Option<&'a str>) -> Hit<'a> {
        Hit { day: "2026-09-28", service_id: "chatgpt", kind: "web", client, source: "dns", bytes_up: 0, blocked: false, dedupe }
    }

    #[test]
    fn aggregate_dedupe_merge() {
        let mut s = Stats::default();
        s.hit(hit("10.0.0.1", Some("chatgpt.com")));
        s.hit(hit("10.0.0.1", Some("chatgpt.com"))); // AAAA right after A: same lookup
        s.hit(hit("10.0.0.2", Some("chatgpt.com")));
        s.hit(hit("10.0.0.1", None));
        s.candidate("2026-09-28", "genspark.ai", "10.0.0.1", "dns", false);
        let b = s.take(5000, 500);
        assert_eq!(b.events.len(), 2);
        let v = &b.events.iter().find(|(k, _)| k.client == "10.0.0.1").unwrap().1;
        assert_eq!(v.hits, 2);
        assert_eq!(b.counters.ai_queries, 3);
        assert_eq!(b.candidates.len(), 1);
        assert!(!s.has_backlog());
        s.hit(hit("10.0.0.1", None));
        s.merge(b);
        let b = s.take(1, 500);
        assert_eq!(b.events.len(), 1);
        assert!(s.has_backlog());
    }

    #[test]
    fn cap() {
        let mut s = Stats::default();
        for i in 0..(MAX_KEYS + 10) {
            let c = format!("c{i}");
            s.hit(hit(&c, None));
        }
        assert_eq!(s.dropped, 10);
        assert_eq!(s.take(usize::MAX, 500).events.len(), MAX_KEYS);
    }

    #[test]
    fn persist() {
        let dir = std::env::temp_dir().join(format!("angar-edge-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let mut s = Stats::default();
        s.hit(hit("10.0.0.9", None));
        s.save(&dir).unwrap();
        let b = Stats::load(&dir).unwrap();
        assert_eq!(b.events[0].1.hits, 1);
        let _ = std::fs::remove_dir_all(dir);
    }
}
