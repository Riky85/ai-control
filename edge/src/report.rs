// POST /api/edge/report: delta dall'ultimo invio riuscito; in caso di errore i dati tornano nell'aggregatore.
use crate::shared::Shared;
use crate::stats::{Batch, CandKey, EvKey, EvVal};
use std::collections::HashMap;
use crate::util::lock;
use serde_json::{json, Value};

pub const MAX_EVENTS: usize = 5000;
pub const MAX_CANDIDATES: usize = 500;
const MAX_BODY: usize = 1_000_000;

pub enum Outcome {
    Sent { events: usize, candidates: usize, more: bool },
    Unauthorized,
    Failed(String),
}

pub fn body(shared: &Shared, b: &Batch, host_ip: &str, anonymous: bool) -> Value {
    let events: Vec<Value> = b
        .events
        .iter()
        .map(|(k, v)| {
            let mut e = json!({
                "day": k.day, "serviceId": k.service_id, "kind": k.kind, "client": k.client,
                "hits": v.hits, "bytesUp": v.bytes_up, "blocked": v.blocked, "source": k.source,
            });
            if !anonymous && k.client != "*" {
                if let Some(n) = shared.names.get(&k.client) {
                    e["clientName"] = json!(n);
                }
            }
            e
        })
        .collect();
    let candidates: Vec<Value> = b.candidates.iter().map(|(k, n)| json!({ "day": k.day, "domain": k.domain, "client": k.client, "hits": n, "source": k.source })).collect();
    let mut body = json!({
        "version": crate::VERSION,
        "os": format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH),
        "hostIp": host_ip,
        "stats": {
            "dnsQueries": b.counters.dns_queries,
            "aiQueries": b.counters.ai_queries,
            "clients": b.clients.len(),
            "blocked": b.counters.blocked,
            "logLines": b.counters.log_lines,
            "uptimeSec": shared.started.elapsed().as_secs(),
        },
        "events": events,
        "candidates": candidates,
    });
    if let Some(m) = &b.local_models {
        body["localModels"] = json!(m);
    }
    body
}

/// Anonymous mode: data collected earlier (e.g. restored from disk) loses its client too.
pub fn anonymize(b: &mut Batch) {
    let mut ev: HashMap<EvKey, EvVal> = HashMap::new();
    for (mut k, v) in b.events.drain(..) {
        k.client = "*".into();
        let e = ev.entry(k).or_default();
        e.hits += v.hits;
        e.bytes_up += v.bytes_up;
        e.blocked += v.blocked;
    }
    b.events = ev.into_iter().collect();
    let mut cands: HashMap<CandKey, u64> = HashMap::new();
    for (mut k, n) in b.candidates.drain(..) {
        k.client = "*".into();
        *cands.entry(k).or_default() += n;
    }
    b.candidates = cands.into_iter().collect();
}

/// Take one chunk, send it, give it back on failure.
pub fn send(shared: &Shared, agent: &ureq::Agent, server: &str, token: &str, host_ip: &str) -> Outcome {
    let anonymous = shared.rt().cfg.anonymous();
    let (mut max_e, mut max_c) = (MAX_EVENTS, MAX_CANDIDATES);
    loop {
        let mut batch = lock(&shared.stats).take(max_e, max_c);
        if anonymous {
            anonymize(&mut batch);
        }
        let payload = serde_json::to_vec(&body(shared, &batch, host_ip, anonymous)).unwrap_or_default();
        if payload.len() > MAX_BODY && max_e > 50 {
            lock(&shared.stats).merge(batch);
            max_e /= 2;
            max_c = (max_c / 2).max(50);
            continue;
        }
        let url = format!("{}/api/edge/report", server.trim_end_matches('/'));
        let res = agent.post(&url).set("Authorization", &format!("Bearer {token}")).set("Content-Type", "application/json").send_bytes(&payload);
        let (ne, nc) = (batch.events.len(), batch.candidates.len());
        match res {
            Ok(_) => {
                let more = lock(&shared.stats).has_backlog();
                return Outcome::Sent { events: ne, candidates: nc, more };
            }
            Err(e) => {
                lock(&shared.stats).merge(batch);
                return match e {
                    ureq::Error::Status(401, _) | ureq::Error::Status(403, _) => Outcome::Unauthorized,
                    ureq::Error::Status(413, _) if max_e > 50 => {
                        max_e /= 4;
                        max_c = (max_c / 4).max(50);
                        continue;
                    }
                    ureq::Error::Status(code, r) => Outcome::Failed(format!("HTTP {code} {}", r.into_string().unwrap_or_default().chars().take(200).collect::<String>())),
                    other => Outcome::Failed(other.to_string()),
                };
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anonymize_merges_clients() {
        let k = |c: &str| EvKey { day: "2026-09-28".into(), service_id: "chatgpt".into(), kind: "web".into(), client: c.into(), source: "dns".into() };
        let v = EvVal { hits: 2, bytes_up: 10, blocked: 1 };
        let mut b = Batch { events: vec![(k("10.0.0.1"), v.clone()), (k("10.0.0.2"), v)], ..Default::default() };
        anonymize(&mut b);
        assert_eq!(b.events.len(), 1);
        assert_eq!(b.events[0].0.client, "*");
        assert_eq!(b.events[0].1, EvVal { hits: 4, bytes_up: 20, blocked: 2 });
    }
}
