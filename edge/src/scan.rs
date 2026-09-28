// Scansione LAN (opt-in): /24 del sensore, porte 11434 (Ollama) e 1234 (LM Studio / OpenAI-compatibile).
use crate::stats::LocalModel;
use crate::util::lock;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream, UdpSocket};
use std::sync::{Arc, Mutex};
use std::time::Duration;

const PORTS: &[u16] = &[11434, 1234];
const PARALLEL: usize = 64;
const TIMEOUT: Duration = Duration::from_secs(2);
const MAX_RESULTS: usize = 200;

/// Primary interface IP: "connect" a UDP socket (no packet is sent) and read the local address.
pub fn primary_ip() -> Option<IpAddr> {
    let s = UdpSocket::bind("0.0.0.0:0").ok()?;
    s.connect("1.1.1.1:53").ok()?;
    let ip = s.local_addr().ok()?.ip();
    (!ip.is_unspecified()).then_some(ip)
}

/// Every host of the /24 around `ip` (1..=254).
pub fn subnet_hosts(ip: Ipv4Addr) -> Vec<Ipv4Addr> {
    let o = ip.octets();
    (1..=254u8).map(|h| Ipv4Addr::new(o[0], o[1], o[2], h)).collect()
}

fn models_from(runtime: &str, body: &serde_json::Value) -> Vec<String> {
    let list = if runtime == "ollama" { body.get("models") } else { body.get("data") };
    let key = if runtime == "ollama" { "name" } else { "id" };
    list.and_then(|l| l.as_array())
        .map(|a| a.iter().filter_map(|m| m.get(key).and_then(|v| v.as_str())).map(|s| s.chars().take(120).collect()).take(100).collect())
        .unwrap_or_default()
}

fn probe(agent: &ureq::Agent, ip: Ipv4Addr, port: u16) -> Option<LocalModel> {
    let addr = SocketAddr::from((ip, port));
    TcpStream::connect_timeout(&addr, TIMEOUT).ok()?;
    let (runtime, path) = if port == 11434 { ("ollama", "/api/tags") } else { ("lmstudio", "/v1/models") };
    let body: serde_json::Value = agent.get(&format!("http://{addr}{path}")).call().ok()?.into_json().ok()?;
    let valid = if runtime == "ollama" { body.get("models").map_or(false, |m| m.is_array()) } else { body.get("data").map_or(false, |m| m.is_array()) };
    valid.then(|| LocalModel { ip: ip.to_string(), port, runtime: runtime.into(), models: models_from(runtime, &body) })
}

pub fn scan(own: Ipv4Addr) -> Vec<LocalModel> {
    // direct connections only (no proxy for LAN hosts)
    let agent = ureq::AgentBuilder::new().timeout_connect(TIMEOUT).timeout(Duration::from_secs(5)).user_agent(&format!("angar-edge/{}", crate::VERSION)).build();
    let jobs: Vec<(Ipv4Addr, u16)> = subnet_hosts(own).into_iter().flat_map(|ip| PORTS.iter().map(move |p| (ip, *p))).collect();
    let jobs = Arc::new(Mutex::new(jobs));
    let found = Arc::new(Mutex::new(Vec::new()));
    let mut handles = Vec::new();
    for _ in 0..PARALLEL {
        let (jobs, found, agent) = (jobs.clone(), found.clone(), agent.clone());
        if let Ok(h) = std::thread::Builder::new().stack_size(256 * 1024).spawn(move || loop {
            let Some((ip, port)) = lock(&jobs).pop() else { return };
            if let Some(m) = probe(&agent, ip, port) {
                lock(&found).push(m);
            }
        }) {
            handles.push(h);
        }
    }
    for h in handles {
        let _ = h.join();
    }
    let mut out = std::mem::take(&mut *lock(&found));
    out.sort_by(|a, b| (a.ip.parse::<Ipv4Addr>().ok(), a.port).cmp(&(b.ip.parse::<Ipv4Addr>().ok(), b.port)));
    out.truncate(MAX_RESULTS);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subnet() {
        let h = subnet_hosts("192.168.1.20".parse().unwrap());
        assert_eq!(h.len(), 254);
        assert_eq!(h[0].to_string(), "192.168.1.1");
        assert_eq!(h[253].to_string(), "192.168.1.254");
    }

    #[test]
    fn model_lists() {
        let o: serde_json::Value = serde_json::from_str(r#"{"models":[{"name":"llama3.1:8b","size":1},{"name":"qwen2.5:7b"}]}"#).unwrap();
        assert_eq!(models_from("ollama", &o), vec!["llama3.1:8b", "qwen2.5:7b"]);
        let l: serde_json::Value = serde_json::from_str(r#"{"object":"list","data":[{"id":"mistral-7b-instruct","object":"model"}]}"#).unwrap();
        assert_eq!(models_from("lmstudio", &l), vec!["mistral-7b-instruct"]);
    }
}
