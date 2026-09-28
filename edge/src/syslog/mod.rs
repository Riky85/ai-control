// Ricevitore syslog (UDP + TCP, framing newline e octet-counting) e dispatch ai parser per vendor.
//
// I parser estraggono solo: IP client, nome host (mai path/URL), byte inviati,
// azione bloccata. L'host viene confrontato col catalogo in memoria e scartato
// se non è AI.
pub mod fortinet;
pub mod generic;
pub mod meraki;
pub mod paloalto;
pub mod pfsense;
pub mod sophos;
pub mod unifi;

use crate::detect::{ai_candidate_domain, registrable};
use crate::shared::Shared;
use crate::stats::Hit;
use crate::util::{lock, today};
use std::io::{BufRead, BufReader};
use std::net::{IpAddr, TcpListener};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

const MAX_LINE: usize = 64 * 1024;
const MAX_TCP_CONNS: usize = 64;

#[derive(Debug, Default, PartialEq)]
pub struct LogHit {
    pub vendor: &'static str,
    pub client: Option<IpAddr>,
    pub client_name: Option<String>,
    /// Host name only (never a path).
    pub host: Option<String>,
    /// Firewall application id (Palo Alto App-ID) when there's no host.
    pub app: Option<String>,
    pub bytes_up: u64,
    pub blocked: bool,
    /// The firewall itself classified the destination as AI.
    pub ai_category: bool,
    /// A DNS query log (dedupe like the DNS forwarder).
    pub dns: bool,
}

pub fn is_block_action(a: &str) -> bool {
    let a = a.trim().trim_matches('"').to_ascii_lowercase();
    a.starts_with("block") || a.starts_with("deny") || a.starts_with("drop") || a.starts_with("reset") || a == "denied" || a == "blocked" || a == "reject" || a == "prohibited"
}

pub fn is_ai_category(c: &str) -> bool {
    let c = c.to_ascii_lowercase();
    c.contains("artificial") || c.contains("generative ai") || c.contains("generative-ai") || c.contains("ai chatbot")
}

/// Vendor parsers, most specific first.
pub fn parse(line: &str) -> Option<LogHit> {
    paloalto::parse(line)
        .or_else(|| fortinet::parse(line))
        .or_else(|| sophos::parse(line))
        .or_else(|| meraki::parse(line))
        .or_else(|| unifi::parse(line))
        .or_else(|| pfsense::parse(line))
}

pub fn process_line(shared: &Shared, line: &str) {
    let line = line.trim_matches(|c: char| c == '\r' || c == '\n' || c == '\0' || c == ' ');
    if line.is_empty() {
        return;
    }
    lock(&shared.stats).log_line();
    let rt = shared.rt();
    if !rt.cfg.syslog_enabled {
        return;
    }
    let day = today();
    if let Some(h) = parse(line) {
        let Some(ip) = h.client else { return };
        let source = format!("syslog:{}", h.vendor);
        let label = shared.client_label(&rt, ip);
        if let (Some(n), false) = (&h.client_name, rt.cfg.anonymous()) {
            shared.names.set(ip, n);
        }
        let host = h.host.as_deref();
        let m = host.and_then(|x| rt.service(x)).or_else(|| host.and_then(|x| rt.blocked(x))).or_else(|| h.app.as_deref().and_then(|a| rt.service_by_app(a)));
        let mut st = lock(&shared.stats);
        st.client(&ip.to_string());
        if let Some(m) = m {
            st.hit(Hit { day: &day, service_id: m.service_id, kind: m.kind, client: &label, source: &source, bytes_up: h.bytes_up, blocked: h.blocked, dedupe: if h.dns { host } else { None } });
            if shared.verbose {
                crate::log!("{source}: {label} → {}", m.service_id);
            }
        } else if let Some(host) = host {
            let cand = ai_candidate_domain(host).or_else(|| h.ai_category.then(|| registrable(host)));
            if let Some(d) = cand {
                st.candidate(&day, &d, &label, &source, h.dns);
                if shared.verbose {
                    crate::log!("{source}: {label} → candidate {d}");
                }
            }
        }
        return;
    }
    if let Some((ip, hosts)) = generic::parse(line) {
        for host in hosts {
            if let Some(m) = rt.service(&host) {
                let label = shared.client_label(&rt, ip);
                let mut st = lock(&shared.stats);
                st.client(&ip.to_string());
                st.hit(Hit { day: &day, service_id: m.service_id, kind: m.kind, client: &label, source: "syslog:generic", bytes_up: 0, blocked: false, dedupe: Some(&host) });
                if shared.verbose {
                    crate::log!("syslog:generic: {label} → {}", m.service_id);
                }
                return;
            }
        }
    }
}

fn safe_process(shared: &Shared, line: &str) {
    let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| process_line(shared, line)));
}

/// Split a TCP syslog stream into messages: octet-counting ("123 <34>…") or newline/NUL delimited.
pub fn read_frames<R: BufRead>(r: &mut R, mut on_msg: impl FnMut(&str)) -> std::io::Result<()> {
    loop {
        let first = match r.fill_buf()? {
            [] => return Ok(()),
            b => b[0],
        };
        let mut prefix = Vec::new();
        if first.is_ascii_digit() {
            // read up to 7 digits
            let mut one = [0u8; 1];
            while prefix.len() < 7 {
                let b = r.fill_buf()?;
                if b.is_empty() || !b[0].is_ascii_digit() {
                    break;
                }
                one[0] = b[0];
                r.consume(1);
                prefix.push(one[0]);
            }
            let next = r.fill_buf()?.first().copied();
            if next == Some(b' ') {
                let len: usize = std::str::from_utf8(&prefix).ok().and_then(|s| s.parse().ok()).unwrap_or(0);
                if len > 0 && len <= MAX_LINE {
                    r.consume(1);
                    let mut msg = vec![0u8; len];
                    r.read_exact(&mut msg)?;
                    on_msg(&String::from_utf8_lossy(&msg));
                    continue;
                }
            }
        }
        // newline (or NUL) delimited
        let mut line = prefix;
        loop {
            let b = r.fill_buf()?;
            if b.is_empty() {
                break;
            }
            if let Some(p) = b.iter().position(|&c| c == b'\n' || c == 0) {
                line.extend_from_slice(&b[..p]);
                r.consume(p + 1);
                break;
            }
            let n = b.len();
            if line.len() < MAX_LINE {
                line.extend_from_slice(&b[..n.min(MAX_LINE - line.len())]);
            }
            r.consume(n);
        }
        if !line.is_empty() {
            on_msg(&String::from_utf8_lossy(&line));
        }
    }
}

/// Start UDP + TCP listeners on each port (e.g. 514 and 5514).
pub fn start(shared: Arc<Shared>, ports: Vec<u16>) {
    for port in ports {
        match crate::dns::bind_udp(port) {
            Ok(sock) => {
                crate::log!("Syslog: listening on UDP {port}");
                let sh = shared.clone();
                std::thread::Builder::new()
                    .name(format!("syslog-udp-{port}"))
                    .spawn(move || {
                        let mut buf = vec![0u8; 65535];
                        loop {
                            match sock.recv_from(&mut buf) {
                                Ok((n, _)) => {
                                    let text = String::from_utf8_lossy(&buf[..n]);
                                    for line in text.split(['\n', '\0']) {
                                        safe_process(&sh, line);
                                    }
                                }
                                Err(_) => std::thread::sleep(Duration::from_millis(50)),
                            }
                        }
                    })
                    .ok();
            }
            Err(e) => crate::log!("Syslog: UDP {}; skipping it", crate::dns::bind_hint(&e, port)),
        }
        match crate::dns::bind_tcp(port) {
            Ok(l) => {
                crate::log!("Syslog: listening on TCP {port}");
                let sh = shared.clone();
                std::thread::Builder::new().name(format!("syslog-tcp-{port}")).spawn(move || serve_tcp(sh, l)).ok();
            }
            Err(e) => crate::log!("Syslog: TCP {}; skipping it", crate::dns::bind_hint(&e, port)),
        }
    }
}

fn serve_tcp(shared: Arc<Shared>, l: TcpListener) {
    let active = Arc::new(AtomicUsize::new(0));
    for conn in l.incoming() {
        let Ok(s) = conn else { continue };
        if active.load(Ordering::Relaxed) >= MAX_TCP_CONNS {
            continue;
        }
        active.fetch_add(1, Ordering::Relaxed);
        let (sh, act) = (shared.clone(), active.clone());
        let spawned = std::thread::Builder::new().stack_size(256 * 1024).spawn(move || {
            let _ = s.set_read_timeout(Some(Duration::from_secs(600)));
            let mut r = BufReader::with_capacity(64 * 1024, s);
            let _ = read_frames(&mut r, |m| {
                for line in m.split('\n') {
                    safe_process(&sh, line);
                }
            });
            act.fetch_sub(1, Ordering::Relaxed);
        });
        if spawned.is_err() {
            active.fetch_sub(1, Ordering::Relaxed);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn framing() {
        let data = b"11 <14>hello A\n<14>line two\n1,2026/09/28,x\x0035 <14>third one with space\nno-newline";
        let mut msgs = Vec::new();
        read_frames(&mut &data[..], |m| msgs.push(m.to_string())).unwrap();
        assert_eq!(msgs, vec!["<14>hello A", "<14>line two", "1,2026/09/28,x", "<14>third one with space\nno-newline"]);
    }

    #[test]
    fn framing_newline() {
        let data = b"<13>a b c\r\n<13>d e f\n";
        let mut msgs = Vec::new();
        read_frames(&mut &data[..], |m| msgs.push(m.to_string())).unwrap();
        assert_eq!(msgs, vec!["<13>a b c\r", "<13>d e f"]);
    }

    #[test]
    fn dispatch() {
        assert_eq!(parse(r#"<30>Sep 28 10:15:02 UDM dnsmasq[1234]: query[A] chatgpt.com from 192.168.1.34"#).unwrap().vendor, "unifi");
        assert_eq!(parse(r#"<189>date=2026-09-28 time=10:15:02 devname="FGT60F" devid="FGT60FTK2209" logid="0317013312" type="utm" subtype="webfilter" srcip=192.168.1.34 hostname="chatgpt.com" action="passthrough""#).unwrap().vendor, "fortinet");
        assert!(parse("<13>Sep 28 10:15:02 host kernel: something unrelated").is_none());
        assert!(is_block_action("block-url") && is_block_action("deny") && !is_block_action("passthrough"));
    }
}
