// UniFi (UDM/USG) e qualunque dnsmasq/Pi-hole: "dnsmasq[123]: query[A] host from ip".
use super::LogHit;
use crate::util::{host_of, parse_ip};

pub fn parse(line: &str) -> Option<LogHit> {
    let p = line.find("query[")?;
    let rest = &line[p..];
    let close = rest.find("] ")?;
    let mut it = rest[close + 2..].split_whitespace();
    let name = it.next()?;
    if it.next()? != "from" {
        return None;
    }
    let client = parse_ip(it.next()?)?;
    let host = host_of(name)?;
    Some(LogHit { vendor: "unifi", client: Some(client), host: Some(host), dns: true, ..Default::default() })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dnsmasq() {
        let h = parse("<30>Sep 28 10:15:02 UDM-Pro dnsmasq[21456]: query[A] chatgpt.com from 192.168.1.34").unwrap();
        assert_eq!(h.client, Some("192.168.1.34".parse().unwrap()));
        assert_eq!(h.host.as_deref(), Some("chatgpt.com"));
        assert!(h.dns);
        let h = parse("Sep 28 10:15:03 pihole dnsmasq[811]: query[AAAA] api.openai.com from 10.0.0.12").unwrap();
        assert_eq!(h.host.as_deref(), Some("api.openai.com"));
        assert!(parse("Sep 28 10:15:03 UDM dnsmasq[21456]: reply chatgpt.com is 104.18.32.47").is_none());
        assert!(parse("Sep 28 10:15:03 UDM dnsmasq[21456]: forwarded chatgpt.com to 1.1.1.1").is_none());
    }
}
