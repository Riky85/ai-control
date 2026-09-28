// DNS forwarder: UDP + TCP, parser minimale del formato wire, blocco locale, PTR.
//
// Privacy: i nomi interrogati sono confrontati solo in memoria; si contano
// (e si loggano con -v) soltanto i domini AI. Nessun altro dominio viene salvato.
use crate::config::Runtime;
use crate::detect::ai_candidate_domain;
use crate::shared::Shared;
use crate::stats::Hit;
use crate::util::{lock, rand_u16, today};
use std::io::{ErrorKind, Read, Write};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::sync_channel;
use std::sync::Arc;
use std::time::Duration;

pub const UPSTREAM_TIMEOUT: Duration = Duration::from_secs(2);
const UDP_WORKERS: usize = 64;
const MAX_TCP_CONNS: usize = 256;

pub const T_A: u16 = 1;
pub const T_PTR: u16 = 12;
pub const T_AAAA: u16 = 28;

// ---------------------------------------------------------------- wire format

#[derive(Debug, PartialEq)]
pub struct Query {
    pub id: u16,
    pub name: String,
    pub qtype: u16,
    /// Offset right after the first question (header + question).
    pub qend: usize,
}

fn u16_at(b: &[u8], p: usize) -> Option<u16> {
    Some(u16::from_be_bytes([*b.get(p)?, *b.get(p + 1)?]))
}

/// Read a (possibly compressed) name. Returns (lowercase name without trailing dot, offset after it).
pub fn read_name(b: &[u8], start: usize) -> Option<(String, usize)> {
    let mut name = String::new();
    let mut pos = start;
    let mut end = None;
    let mut jumps = 0;
    loop {
        let len = *b.get(pos)? as usize;
        if len == 0 {
            pos += 1;
            break;
        }
        if len & 0xC0 == 0xC0 {
            let ptr = (u16_at(b, pos)? & 0x3FFF) as usize;
            if end.is_none() {
                end = Some(pos + 2);
            }
            jumps += 1;
            if jumps > 32 || ptr >= b.len() {
                return None;
            }
            pos = ptr;
            continue;
        }
        if len & 0xC0 != 0 {
            return None;
        }
        let label = b.get(pos + 1..pos + 1 + len)?;
        if !name.is_empty() {
            name.push('.');
        }
        for &c in label {
            name.push(if c.is_ascii_graphic() { c.to_ascii_lowercase() as char } else { '?' });
        }
        if name.len() > 255 {
            return None;
        }
        pos += 1 + len;
    }
    Some((name, end.unwrap_or(pos)))
}

/// A standard query (QR=0, opcode 0) with at least one question.
pub fn parse_query(b: &[u8]) -> Option<Query> {
    if b.len() < 12 {
        return None;
    }
    let flags = u16_at(b, 2)?;
    if flags & 0x8000 != 0 || (flags >> 11) & 0xF != 0 || u16_at(b, 4)? == 0 {
        return None;
    }
    let (name, pos) = read_name(b, 12)?;
    let qtype = u16_at(b, pos)?;
    u16_at(b, pos + 2)?;
    Some(Query { id: u16_at(b, 0)?, name, qtype, qend: pos + 4 })
}

/// Local answer for a blocked name: A 0.0.0.0 / AAAA :: (TTL 60), other types: empty NOERROR.
pub fn block_response(query: &[u8], q: &Query) -> Vec<u8> {
    let an: u16 = if q.qtype == T_A || q.qtype == T_AAAA { 1 } else { 0 };
    let mut out = Vec::with_capacity(q.qend + 28);
    out.extend_from_slice(&query[0..2]);
    out.push(0x80 | (query[2] & 0x01)); // QR, opcode 0, RD copied
    out.push(0x80); // RA, rcode 0
    out.extend_from_slice(&[0, 1]);
    out.extend_from_slice(&an.to_be_bytes());
    out.extend_from_slice(&[0, 0, 0, 0]);
    out.extend_from_slice(&query[12..q.qend]);
    if an == 1 {
        out.extend_from_slice(&[0xC0, 0x0C]);
        out.extend_from_slice(&q.qtype.to_be_bytes());
        out.extend_from_slice(&[0, 1]); // IN
        out.extend_from_slice(&60u32.to_be_bytes());
        if q.qtype == T_A {
            out.extend_from_slice(&[0, 4, 0, 0, 0, 0]);
        } else {
            out.extend_from_slice(&[0, 16]);
            out.extend_from_slice(&[0u8; 16]);
        }
    }
    out
}

/// NXDOMAIN with the question echoed.
pub fn nxdomain(query: &[u8], q: &Query) -> Vec<u8> {
    let mut out = servfail(query, Some(q)).unwrap_or_default();
    if out.len() >= 4 {
        out[3] = 0x80 | 3;
    }
    out
}

/// Firefox's canary domain: NXDOMAIN tells it not to enable DNS-over-HTTPS by default,
/// so its lookups keep going through this network's resolver.
pub const DOH_CANARY: &str = "use-application-dns.net";

/// SERVFAIL for when no upstream answers.
pub fn servfail(query: &[u8], q: Option<&Query>) -> Option<Vec<u8>> {
    if query.len() < 12 {
        return None;
    }
    let mut out = Vec::with_capacity(64);
    out.extend_from_slice(&query[0..2]);
    out.push(0x80 | (query[2] & 0x79)); // QR + opcode + RD
    out.push(0x80 | 2);
    match q {
        Some(q) => {
            out.extend_from_slice(&[0, 1, 0, 0, 0, 0, 0, 0]);
            out.extend_from_slice(&query[12..q.qend]);
        }
        None => out.extend_from_slice(&[0, 0, 0, 0, 0, 0, 0, 0]),
    }
    Some(out)
}

pub fn build_query(id: u16, name: &str, qtype: u16) -> Vec<u8> {
    let mut out = Vec::with_capacity(name.len() + 18);
    out.extend_from_slice(&id.to_be_bytes());
    out.extend_from_slice(&[0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0]);
    for label in name.trim_end_matches('.').split('.') {
        out.push(label.len() as u8);
        out.extend_from_slice(label.as_bytes());
    }
    out.push(0);
    out.extend_from_slice(&qtype.to_be_bytes());
    out.extend_from_slice(&[0, 1]);
    out
}

/// First PTR target in a response.
pub fn parse_ptr_answer(b: &[u8]) -> Option<String> {
    if b.len() < 12 || b[3] & 0x0F != 0 {
        return None;
    }
    let qd = u16_at(b, 4)?;
    let an = u16_at(b, 6)?;
    let mut pos = 12;
    for _ in 0..qd {
        pos = read_name(b, pos)?.1 + 4;
    }
    for _ in 0..an {
        let (_, p) = read_name(b, pos)?;
        let t = u16_at(b, p)?;
        let rdlen = u16_at(b, p + 8)? as usize;
        let rd = p + 10;
        if t == T_PTR {
            return read_name(b, rd).map(|(n, _)| n).filter(|n| !n.is_empty());
        }
        pos = rd + rdlen;
    }
    None
}

pub fn ptr_name(ip: IpAddr) -> String {
    match ip {
        IpAddr::V4(v) => {
            let o = v.octets();
            format!("{}.{}.{}.{}.in-addr.arpa", o[3], o[2], o[1], o[0])
        }
        IpAddr::V6(v) => {
            let mut s = String::new();
            for byte in v.octets().iter().rev() {
                s.push_str(&format!("{:x}.{:x}.", byte & 0xF, byte >> 4));
            }
            s + "ip6.arpa"
        }
    }
}

// ---------------------------------------------------------------- upstream

pub fn forward_udp(query: &[u8], upstreams: &[SocketAddr], buf: &mut [u8]) -> Option<usize> {
    if query.len() < 2 {
        return None;
    }
    for up in upstreams {
        let bind: SocketAddr = if up.is_ipv4() { (Ipv4Addr::UNSPECIFIED, 0).into() } else { (Ipv6Addr::UNSPECIFIED, 0).into() };
        let Ok(sock) = UdpSocket::bind(bind) else { continue };
        if sock.connect(up).is_err() || sock.set_read_timeout(Some(UPSTREAM_TIMEOUT)).is_err() || sock.send(query).is_err() {
            continue;
        }
        let deadline = std::time::Instant::now() + UPSTREAM_TIMEOUT;
        while let Ok(n) = sock.recv(buf) {
            if n >= 12 && buf[0..2] == query[0..2] && buf[2] & 0x80 != 0 {
                return Some(n);
            }
            if std::time::Instant::now() >= deadline {
                break;
            }
        }
    }
    None
}

pub fn forward_tcp(query: &[u8], upstreams: &[SocketAddr]) -> Option<Vec<u8>> {
    for up in upstreams {
        let Ok(mut s) = TcpStream::connect_timeout(up, UPSTREAM_TIMEOUT) else { continue };
        let _ = s.set_read_timeout(Some(UPSTREAM_TIMEOUT));
        let _ = s.set_write_timeout(Some(UPSTREAM_TIMEOUT));
        let mut msg = (query.len() as u16).to_be_bytes().to_vec();
        msg.extend_from_slice(query);
        if s.write_all(&msg).is_err() {
            continue;
        }
        let mut len = [0u8; 2];
        if s.read_exact(&mut len).is_err() {
            continue;
        }
        let mut body = vec![0u8; u16::from_be_bytes(len) as usize];
        if s.read_exact(&mut body).is_ok() && body.len() >= 12 {
            return Some(body);
        }
    }
    None
}

pub fn ptr_lookup(upstreams: &[SocketAddr], ip: IpAddr) -> Option<String> {
    let q = build_query(rand_u16(), &ptr_name(ip), T_PTR);
    let mut buf = vec![0u8; 4096];
    let n = forward_udp(&q, upstreams, &mut buf)?;
    parse_ptr_answer(&buf[..n])
}

/// Default upstream: resolv.conf nameservers that aren't loopback / ourselves, else 1.1.1.1 + 9.9.9.9.
pub fn default_upstreams(own_ip: Option<IpAddr>) -> Vec<SocketAddr> {
    let mut out: Vec<SocketAddr> = Vec::new();
    for file in ["/etc/resolv.conf", "/run/systemd/resolve/resolv.conf"] {
        let Ok(text) = std::fs::read_to_string(file) else { continue };
        for line in text.lines() {
            let mut it = line.split_whitespace();
            if it.next() != Some("nameserver") {
                continue;
            }
            let Some(ip) = it.next().and_then(|s| s.split('%').next()).and_then(|s| s.parse::<IpAddr>().ok()) else { continue };
            if ip.is_loopback() || ip.is_unspecified() || Some(ip) == own_ip {
                continue;
            }
            let sa = SocketAddr::new(ip, 53);
            if !out.contains(&sa) {
                out.push(sa);
            }
        }
    }
    if out.is_empty() {
        out = vec!["1.1.1.1:53".parse().unwrap(), "9.9.9.9:53".parse().unwrap()];
    }
    out
}

/// "1.1.1.1,9.9.9.9:5353,[2606:4700::1111]:53"
pub fn parse_upstreams(s: &str) -> Vec<SocketAddr> {
    s.split(|c| c == ',' || c == ' ')
        .filter(|t| !t.is_empty())
        .filter_map(|t| t.parse::<SocketAddr>().ok().or_else(|| t.parse::<IpAddr>().ok().map(|ip| SocketAddr::new(ip, 53))))
        .collect()
}

// ---------------------------------------------------------------- server

/// Match + count one query. Returns a local answer when the name is blocked.
pub fn inspect(shared: &Shared, rt: &Runtime, query: &[u8], client: IpAddr) -> (Option<Query>, Option<Vec<u8>>) {
    let q = parse_query(query);
    let label = shared.client_label(rt, client);
    let mut st = lock(&shared.stats);
    st.dns_query(&client.to_string());
    let Some(q) = q else { return (None, None) };
    if q.qtype == T_PTR || q.name.is_empty() {
        return (Some(q), None);
    }
    if q.name == DOH_CANARY {
        let resp = nxdomain(query, &q);
        return (Some(q), Some(resp));
    }
    let day = today();
    if rt.cfg.block_enabled {
        if let Some(m) = rt.blocked(&q.name) {
            st.hit(Hit { day: &day, service_id: m.service_id, kind: m.kind, client: &label, source: "dns", bytes_up: 0, blocked: true, dedupe: Some(&q.name) });
            drop(st);
            if shared.verbose {
                crate::log!("dns: blocked {} for {}", q.name, label);
            }
            let resp = block_response(query, &q);
            return (Some(q), Some(resp));
        }
    }
    if !rt.cfg.dns_enabled {
        return (Some(q), None);
    }
    if let Some(m) = rt.service(&q.name) {
        st.hit(Hit { day: &day, service_id: m.service_id, kind: m.kind, client: &label, source: "dns", bytes_up: 0, blocked: false, dedupe: Some(&q.name) });
        if shared.verbose {
            crate::log!("dns: {} → {} ({})", label, m.service_id, q.name);
        }
    } else if let Some(domain) = ai_candidate_domain(&q.name) {
        st.candidate(&day, &domain, &label, "dns", true);
        if shared.verbose {
            crate::log!("dns: {} → candidate {}", label, domain);
        }
    }
    (Some(q), None)
}

fn handle(shared: &Shared, query: &[u8], client: IpAddr, tcp: bool, buf: &mut [u8]) -> Option<Vec<u8>> {
    let rt = shared.rt();
    let (q, local) = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| inspect(shared, &rt, query, client))).unwrap_or((None, None));
    if local.is_some() {
        return local;
    }
    // UDP upstream first (fast, and TCP/53 is often filtered); TCP clients get the full answer
    // over TCP upstream only when the UDP one was truncated or no UDP upstream answered.
    let udp = forward_udp(query, &shared.upstreams, buf).map(|n| buf[..n].to_vec());
    let answer = match udp {
        Some(a) if tcp && a[2] & 0x02 != 0 => forward_tcp(query, &shared.upstreams).or(Some(a)),
        None if tcp => forward_tcp(query, &shared.upstreams),
        other => other,
    };
    answer.or_else(|| servfail(query, q.as_ref()))
}

pub fn bind_udp(port: u16) -> std::io::Result<UdpSocket> {
    UdpSocket::bind((Ipv6Addr::UNSPECIFIED, port)).or_else(|_| UdpSocket::bind((Ipv4Addr::UNSPECIFIED, port)))
}

pub fn bind_tcp(port: u16) -> std::io::Result<TcpListener> {
    TcpListener::bind((Ipv6Addr::UNSPECIFIED, port)).or_else(|_| TcpListener::bind((Ipv4Addr::UNSPECIFIED, port)))
}

pub fn bind_hint(e: &std::io::Error, port: u16) -> String {
    match e.kind() {
        ErrorKind::AddrInUse => format!("port {port} is already in use"),
        ErrorKind::PermissionDenied => format!("no permission to bind port {port} (run as root or grant CAP_NET_BIND_SERVICE)"),
        _ => format!("cannot bind port {port}: {e}"),
    }
}

/// Start UDP + TCP DNS. Keeps retrying (every 5 min) if the port is busy.
pub fn start(shared: Arc<Shared>, port: u16) {
    std::thread::Builder::new()
        .name("dns".into())
        .spawn(move || {
            let mut warned = false;
            let sock = loop {
                match bind_udp(port) {
                    Ok(s) => break s,
                    Err(e) => {
                        if !warned {
                            crate::log!(
                                "DNS: {}. DNS forwarder disabled for now; syslog keeps working. {}Retrying every 5 minutes.",
                                bind_hint(&e, port),
                                if e.kind() == ErrorKind::AddrInUse { "On Ubuntu/Debian free it with DNSStubListener=no in /etc/systemd/resolved.conf, or use --dns-port. " } else { "" }
                            );
                            warned = true;
                        }
                        std::thread::sleep(Duration::from_secs(300));
                    }
                }
            };
            let ups: Vec<String> = shared.upstreams.iter().map(|u| u.to_string()).collect();
            crate::log!("DNS: listening on UDP/TCP {port}, upstream {}", ups.join(", "));
            match bind_tcp(port) {
                Ok(l) => {
                    let sh = shared.clone();
                    std::thread::Builder::new().name("dns-tcp".into()).spawn(move || serve_tcp(sh, l)).ok();
                }
                Err(e) => crate::log!("DNS: TCP {}; UDP only", bind_hint(&e, port)),
            }
            serve_udp(shared, sock);
        })
        .ok();
}

fn serve_udp(shared: Arc<Shared>, sock: UdpSocket) {
    let (tx, rx) = sync_channel::<(Vec<u8>, SocketAddr)>(2048);
    let rx = Arc::new(std::sync::Mutex::new(rx));
    for i in 0..UDP_WORKERS {
        let (rx, shared) = (rx.clone(), shared.clone());
        let Ok(out) = sock.try_clone() else { break };
        std::thread::Builder::new()
            .name(format!("dns-w{i}"))
            .stack_size(256 * 1024)
            .spawn(move || {
                let mut buf = vec![0u8; 65535];
                loop {
                    let job = lock(&rx).recv();
                    let Ok((q, from)) = job else { return };
                    if let Some(resp) = handle(&shared, &q, from.ip().to_canonical(), false, &mut buf) {
                        let _ = out.send_to(&resp, from);
                    }
                }
            })
            .ok();
    }
    let mut buf = vec![0u8; 65535];
    loop {
        match sock.recv_from(&mut buf) {
            Ok((n, from)) if n >= 12 => {
                // queue full → drop; the client retries
                let _ = tx.try_send((buf[..n].to_vec(), from));
            }
            Ok(_) => {}
            Err(e) if e.kind() == ErrorKind::Interrupted || e.kind() == ErrorKind::ConnectionReset => {}
            Err(e) => {
                crate::log!("DNS: UDP receive error: {e}");
                std::thread::sleep(Duration::from_millis(200));
            }
        }
    }
}

fn serve_tcp(shared: Arc<Shared>, l: TcpListener) {
    let active = Arc::new(AtomicUsize::new(0));
    for conn in l.incoming() {
        let Ok(mut s) = conn else { continue };
        if active.load(Ordering::Relaxed) >= MAX_TCP_CONNS {
            continue; // dropped
        }
        active.fetch_add(1, Ordering::Relaxed);
        let (shared, act) = (shared.clone(), active.clone());
        let spawned = std::thread::Builder::new().stack_size(256 * 1024).spawn(move || {
            let client = s.peer_addr().map(|a| a.ip().to_canonical()).unwrap_or(IpAddr::V4(Ipv4Addr::UNSPECIFIED));
            let _ = s.set_read_timeout(Some(Duration::from_secs(10)));
            let _ = s.set_write_timeout(Some(Duration::from_secs(10)));
            let mut buf = vec![0u8; 65535];
            loop {
                let mut len = [0u8; 2];
                if s.read_exact(&mut len).is_err() {
                    break;
                }
                let mut q = vec![0u8; u16::from_be_bytes(len) as usize];
                if q.len() < 12 || s.read_exact(&mut q).is_err() {
                    break;
                }
                let Some(resp) = handle(&shared, &q, client, true, &mut buf) else { break };
                let mut msg = (resp.len() as u16).to_be_bytes().to_vec();
                msg.extend_from_slice(&resp);
                if s.write_all(&msg).is_err() {
                    break;
                }
            }
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
    fn query_roundtrip() {
        let q = build_query(0x1234, "Chat.OpenAI.com", T_A);
        let p = parse_query(&q).unwrap();
        assert_eq!(p, Query { id: 0x1234, name: "chat.openai.com".into(), qtype: T_A, qend: q.len() });
        let mut resp = q.clone();
        resp[2] |= 0x80;
        assert!(parse_query(&resp).is_none());
        assert!(parse_query(&q[..10]).is_none());
    }

    #[test]
    fn blocked_answers() {
        let q = build_query(7, "deepseek.com", T_A);
        let p = parse_query(&q).unwrap();
        let r = block_response(&q, &p);
        assert_eq!(&r[0..2], &[0, 7]);
        assert_eq!(r[2] & 0x80, 0x80);
        assert_eq!(r[3] & 0x0F, 0);
        assert_eq!(u16_at(&r, 6), Some(1));
        assert_eq!(&r[r.len() - 4..], &[0, 0, 0, 0]);
        assert_eq!(u32::from_be_bytes(r[r.len() - 10..r.len() - 6].try_into().unwrap()), 60);
        let q6 = build_query(8, "deepseek.com", T_AAAA);
        let r6 = block_response(&q6, &parse_query(&q6).unwrap());
        assert_eq!(r6.len(), q6.len() + 12 + 16);
        let qm = build_query(9, "deepseek.com", 15);
        let rm = block_response(&qm, &parse_query(&qm).unwrap());
        assert_eq!(u16_at(&rm, 6), Some(0));
        assert_eq!(rm.len(), qm.len());
    }

    #[test]
    fn ptr() {
        assert_eq!(ptr_name("192.168.1.34".parse().unwrap()), "34.1.168.192.in-addr.arpa");
        // response: question + one PTR answer using compression
        let mut r = build_query(1, "34.1.168.192.in-addr.arpa", T_PTR);
        r[2] = 0x81;
        r[3] = 0x80;
        r[7] = 1;
        r.extend_from_slice(&[0xC0, 0x0C, 0, 12, 0, 1, 0, 0, 0, 60]);
        let target = [8u8, b'p', b'c', b'-', b'm', b'a', b'r', b'i', b'o', 3, b'l', b'a', b'n', 0];
        r.extend_from_slice(&(target.len() as u16).to_be_bytes());
        r.extend_from_slice(&target);
        assert_eq!(parse_ptr_answer(&r).as_deref(), Some("pc-mario.lan"));
    }

    #[test]
    fn upstream_parse() {
        let u = parse_upstreams("1.1.1.1, 9.9.9.9:5353,[2606:4700::1111]:53");
        assert_eq!(u.len(), 3);
        assert_eq!(u[1].port(), 5353);
        assert!(!default_upstreams(None).iter().any(|s| s.ip().is_loopback()));
    }

    #[test]
    fn canary_nxdomain() {
        let q = build_query(5, DOH_CANARY, T_A);
        let r = nxdomain(&q, &parse_query(&q).unwrap());
        assert_eq!(r[3] & 0x0F, 3);
        assert_eq!(&r[0..2], &[0, 5]);
    }

    #[test]
    fn servfail_keeps_question() {
        let q = build_query(3, "x.example", T_A);
        let r = servfail(&q, parse_query(&q).as_ref()).unwrap();
        assert_eq!(r[3] & 0x0F, 2);
        assert_eq!(r.len(), q.len());
    }
}
