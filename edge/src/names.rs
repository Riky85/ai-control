// Nomi host dei client: reverse DNS (PTR) pigro via upstream, in cache; opzionale.
use crate::util::lock;
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::mpsc::{sync_channel, Receiver, SyncSender};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const TTL_OK: Duration = Duration::from_secs(6 * 3600);
const TTL_MISS: Duration = Duration::from_secs(3600);
const MAX: usize = 20_000;

struct Entry {
    name: Option<String>,
    at: Instant,
    from_log: bool,
}

pub struct Names {
    map: Mutex<HashMap<IpAddr, Entry>>,
    tx: SyncSender<IpAddr>,
    rx: Mutex<Option<Receiver<IpAddr>>>,
}

impl Names {
    pub fn new() -> Names {
        let (tx, rx) = sync_channel(1024);
        Names { map: Mutex::new(HashMap::new()), tx, rx: Mutex::new(Some(rx)) }
    }

    /// Queue a lookup if we don't have a fresh answer.
    pub fn want(&self, ip: IpAddr) {
        let mut m = lock(&self.map);
        let fresh = m.get(&ip).map_or(false, |e| e.from_log || e.at.elapsed() < if e.name.is_some() { TTL_OK } else { TTL_MISS });
        if fresh || m.len() >= MAX {
            return;
        }
        // placeholder so we don't queue the same IP again while it resolves
        m.insert(ip, Entry { name: None, at: Instant::now(), from_log: false });
        drop(m);
        let _ = self.tx.try_send(ip);
    }

    /// Name learned from a firewall log (e.g. Fortinet srcname).
    pub fn set(&self, ip: IpAddr, name: &str) {
        let n = clean(name);
        if n.is_empty() {
            return;
        }
        let mut m = lock(&self.map);
        if m.len() < MAX || m.contains_key(&ip) {
            m.insert(ip, Entry { name: Some(n), at: Instant::now(), from_log: true });
        }
    }

    pub fn get(&self, client: &str) -> Option<String> {
        let ip: IpAddr = client.parse().ok()?;
        lock(&self.map).get(&ip).and_then(|e| e.name.clone())
    }

    /// Background resolver thread.
    pub fn run(&self, upstreams: &[SocketAddr]) {
        let Some(rx) = lock(&self.rx).take() else { return };
        while let Ok(ip) = rx.recv() {
            let name = crate::dns::ptr_lookup(upstreams, ip).map(|n| clean(&n)).filter(|n| !n.is_empty());
            let mut m = lock(&self.map);
            if m.get(&ip).map_or(true, |e| !e.from_log) {
                m.insert(ip, Entry { name, at: Instant::now(), from_log: false });
            }
        }
    }
}

/// Keep hostnames short and printable.
fn clean(name: &str) -> String {
    name.trim().trim_end_matches('.').chars().filter(|c| c.is_ascii_alphanumeric() || "-._".contains(*c)).take(80).collect()
}
