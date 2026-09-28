// Piccole utilità condivise: tempo, lock, parsing key=value, host da URL, IP.
use std::net::{IpAddr, Ipv4Addr};
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn now_secs() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// Civil date from days since epoch (no date crate).
fn civil(days: i64) -> (i64, i64, i64) {
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// "YYYY-MM-DDThh:mm:ssZ"
pub fn iso(secs: i64) -> String {
    let (y, m, d) = civil(secs.div_euclid(86400));
    let rem = secs.rem_euclid(86400);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

/// UTC day "YYYY-MM-DD".
pub fn day(secs: i64) -> String {
    let (y, m, d) = civil(secs.div_euclid(86400));
    format!("{y:04}-{m:02}-{d:02}")
}

pub fn today() -> String {
    day(now_secs())
}

/// Lock that survives a poisoned mutex (a panic in one thread must not stop the sensor).
pub fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// `key=value key2="value with spaces"` → pairs (keys lowercased). Used by Fortinet and Sophos.
pub fn parse_kv(line: &str) -> Vec<(String, String)> {
    let b = line.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        // key: [A-Za-z0-9_.-]+ followed by '='
        while i < b.len() && !(b[i].is_ascii_alphanumeric() || b[i] == b'_') {
            i += 1;
        }
        let ks = i;
        while i < b.len() && (b[i].is_ascii_alphanumeric() || b[i] == b'_' || b[i] == b'-' || b[i] == b'.') {
            i += 1;
        }
        if i >= b.len() || b[i] != b'=' || i == ks {
            // not a key: skip the token
            while i < b.len() && b[i] != b' ' {
                i += 1;
            }
            continue;
        }
        let key = line[ks..i].to_ascii_lowercase();
        i += 1;
        let val;
        if i < b.len() && (b[i] == b'"' || b[i] == b'\'') {
            let q = b[i];
            i += 1;
            let vs = i;
            while i < b.len() && b[i] != q {
                if b[i] == b'\\' {
                    i += 1;
                }
                i += 1;
            }
            let ve = i.min(b.len());
            val = line.get(vs..ve).unwrap_or("").to_string();
            i = ve + 1;
        } else {
            let vs = i;
            while i < b.len() && b[i] != b' ' {
                i += 1;
            }
            val = line[vs..i].to_string();
        }
        out.push((key, val));
    }
    out
}

pub fn kv_get<'a>(kv: &'a [(String, String)], keys: &[&str]) -> Option<&'a str> {
    for k in keys {
        if let Some((_, v)) = kv.iter().find(|(kk, v)| kk == k && !v.is_empty() && v != "N/A") {
            return Some(v.as_str());
        }
    }
    None
}

/// Host only, from a URL or "host/path" or plain host. Never returns the path.
pub fn host_of(value: &str) -> Option<String> {
    let v = value.trim().trim_matches('"');
    let rest = match v.find("://") {
        Some(p) => &v[p + 3..],
        None => v,
    };
    let end = rest.find(['/', '?', '#', ' ']).unwrap_or(rest.len());
    let auth = &rest[..end];
    let auth = auth.rsplit('@').next().unwrap_or(auth);
    let host = if auth.starts_with('[') {
        return None; // IPv6 literal: nothing to match
    } else {
        auth.split(':').next().unwrap_or("")
    };
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    looks_like_hostname(&host).then_some(host)
}

/// "chatgpt.com", "api.openai.com": letters/digits/-/. with at least one dot and a letter TLD.
pub fn looks_like_hostname(h: &str) -> bool {
    if h.len() < 4 || h.len() > 253 || !h.contains('.') || h.starts_with('.') || h.contains("..") {
        return false;
    }
    if !h.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'.' || c == b'_') {
        return false;
    }
    let tld = h.rsplit('.').next().unwrap_or("");
    tld.len() >= 2 && tld.bytes().all(|c| c.is_ascii_alphabetic())
}

pub fn is_private_v4(ip: Ipv4Addr) -> bool {
    ip.is_private() || ip.is_link_local() || (ip.octets()[0] == 100 && (ip.octets()[1] & 0xC0) == 64) // CGNAT 100.64/10
}

/// First private IPv4 in the text (for generic logs).
pub fn first_private_ipv4(text: &str) -> Option<Ipv4Addr> {
    text.split(|c: char| !(c.is_ascii_digit() || c == '.'))
        .filter_map(|t| t.trim_matches('.').parse::<Ipv4Addr>().ok())
        .find(|ip| is_private_v4(*ip))
}

/// "192.168.1.34:52344" / "192.168.1.34" → IP.
pub fn parse_ip(s: &str) -> Option<IpAddr> {
    let s = s.trim().trim_matches('"');
    if let Ok(ip) = s.parse::<IpAddr>() {
        return Some(ip.to_canonical());
    }
    if let Ok(sa) = s.parse::<std::net::SocketAddr>() {
        return Some(sa.ip().to_canonical());
    }
    let (h, _) = s.rsplit_once(':')?;
    h.parse::<Ipv4Addr>().ok().map(IpAddr::V4)
}

/// Cheap non-crypto random (DNS ids).
pub fn rand_u16() -> u16 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static C: AtomicU64 = AtomicU64::new(0x9E3779B97F4A7C15);
    let n = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(1);
    let mut x = n ^ C.fetch_add(0x9E3779B97F4A7C15, Ordering::Relaxed);
    x ^= x >> 33;
    x = x.wrapping_mul(0xff51afd7ed558ccd);
    x ^= x >> 33;
    x as u16
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates() {
        assert_eq!(iso(0), "1970-01-01T00:00:00Z");
        assert_eq!(day(1790496516), "2026-09-27");
    }

    #[test]
    fn kv() {
        let kv = parse_kv(r#"date=2026-09-28 devname="FGT 60F" srcip=192.168.1.34 hostname="chatgpt.com" msg="a b=c""#);
        assert_eq!(kv_get(&kv, &["devname"]), Some("FGT 60F"));
        assert_eq!(kv_get(&kv, &["srcip"]), Some("192.168.1.34"));
        assert_eq!(kv_get(&kv, &["hostname"]), Some("chatgpt.com"));
        assert_eq!(kv_get(&kv, &["msg"]), Some("a b=c"));
        assert_eq!(kv_get(&kv, &["nope", "date"]), Some("2026-09-28"));
    }

    #[test]
    fn hosts() {
        assert_eq!(host_of("https://user@Chat.OpenAI.com:443/c/1?x=1").as_deref(), Some("chat.openai.com"));
        assert_eq!(host_of("chatgpt.com/backend-api/conversation").as_deref(), Some("chatgpt.com"));
        assert_eq!(host_of("claude.ai").as_deref(), Some("claude.ai"));
        assert_eq!(host_of("192.168.1.1"), None);
        assert_eq!(host_of("/just/a/path"), None);
        assert_eq!(first_private_ipv4("from 8.8.8.8 to 10.1.2.3."), Some("10.1.2.3".parse().unwrap()));
        assert_eq!(parse_ip("192.168.1.34:52344"), Some("192.168.1.34".parse().unwrap()));
        assert_eq!(parse_ip("::ffff:192.168.1.34"), Some("192.168.1.34".parse().unwrap()));
    }
}
