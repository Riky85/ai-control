// Cisco Meraki MX: "urls" (request: GET https://host/…) e "flows"/"firewall" (nessun host → ignorati).
use super::LogHit;
use crate::util::{host_of, parse_ip};

fn field<'a>(line: &'a str, key: &str) -> Option<&'a str> {
    line.split_whitespace().find_map(|t| t.strip_prefix(key))
}

pub fn parse(line: &str) -> Option<LogHit> {
    if !line.contains(" urls ") || !line.contains("request: ") {
        return None;
    }
    let client = parse_ip(field(line, "src=")?)?;
    // "request: GET https://host/path" → host only
    let req = line.split("request: ").nth(1)?;
    let url = req.split_whitespace().find(|t| t.contains("://")).or_else(|| req.split_whitespace().nth(1))?;
    let host = host_of(url)?;
    Some(LogHit { vendor: "meraki", client: Some(client), host: Some(host), ..Default::default() })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls() {
        let l = "<134>1 1790590502.123456789 MX84_Milano urls src=192.168.128.34:52344 dst=104.18.32.47:443 mac=AA:BB:CC:DD:EE:01 agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64)' request: GET https://chatgpt.com/backend-api/conversation?model=x";
        let h = parse(l).unwrap();
        assert_eq!(h.client, Some("192.168.128.34".parse().unwrap()));
        assert_eq!(h.host.as_deref(), Some("chatgpt.com"));
        let u = "<134>1 1790590502.1 MX67 urls src=10.0.1.20:60000 dst=1.2.3.4:443 mac=AA:BB:CC:DD:EE:02 request: UNKNOWN https://api.anthropic.com/...";
        assert_eq!(parse(u).unwrap().host.as_deref(), Some("api.anthropic.com"));
    }

    #[test]
    fn flows_ignored() {
        assert!(parse("<134>1 1790590502.1 MX84 flows src=192.168.128.34 dst=104.18.32.47 mac=AA:BB:CC:DD:EE:01 protocol=tcp sport=52344 dport=443 pattern: allow all").is_none());
    }
}
