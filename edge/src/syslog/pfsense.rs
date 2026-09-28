// pfSense / OPNsense Unbound (log-queries / log-replies): "info: 192.168.1.5 chatgpt.com. A IN".
use super::LogHit;
use crate::util::{host_of, parse_ip};

pub fn parse(line: &str) -> Option<LogHit> {
    if !line.contains("unbound") {
        return None;
    }
    let p = line.find("info: ")?;
    let mut it = line[p + 6..].split_whitespace();
    let client = parse_ip(it.next()?)?;
    let name = it.next()?;
    if !name.ends_with('.') {
        return None;
    }
    let _qtype = it.next()?;
    if it.next()? != "IN" {
        return None;
    }
    let host = host_of(name)?;
    Some(LogHit { vendor: "pfsense", client: Some(client), host: Some(host), dns: true, ..Default::default() })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unbound() {
        let h = parse("<30>Sep 28 10:15:02 pfSense unbound[12345]: [12345:0] info: 192.168.1.5 chatgpt.com. A IN").unwrap();
        assert_eq!(h.client, Some("192.168.1.5".parse().unwrap()));
        assert_eq!(h.host.as_deref(), Some("chatgpt.com"));
        let r = parse("<30>1 2026-09-28T10:15:02+02:00 opnsense.lan unbound 4411 - [meta sequenceId=\"12\"] [4411:1] info: 10.1.1.9 claude.ai. AAAA IN NOERROR 0.012 0 120").unwrap();
        assert_eq!(r.host.as_deref(), Some("claude.ai"));
        assert!(parse("Sep 28 10:15:02 pfSense unbound[1]: [1:0] info: start of service (unbound 1.19.0).").is_none());
    }
}
