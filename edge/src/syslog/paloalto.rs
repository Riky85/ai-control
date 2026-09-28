// Palo Alto Networks PAN-OS: syslog CSV, THREAT (subtype url) e TRAFFIC.
use super::{is_ai_category, is_block_action, LogHit};
use crate::util::{host_of, parse_ip};

/// CSV split honouring double quotes ("a,b" stays one field; "" is an escaped quote).
fn split_csv(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut q = false;
    let mut it = line.chars().peekable();
    while let Some(c) = it.next() {
        match c {
            '"' if q && it.peek() == Some(&'"') => {
                cur.push('"');
                it.next();
            }
            '"' => q = !q,
            ',' if !q => out.push(std::mem::take(&mut cur)),
            _ => cur.push(c),
        }
    }
    out.push(cur);
    out
}

pub fn parse(line: &str) -> Option<LogHit> {
    if !(line.contains(",THREAT,") || line.contains(",TRAFFIC,")) {
        return None;
    }
    let f = split_csv(line);
    // field 3 is the log type; field 0 carries the syslog header ("<14>Sep 28 … PA-VM 1")
    let t = f.iter().position(|x| x == "THREAT" || x == "TRAFFIC").filter(|&i| i >= 3)?;
    let base = t - 3;
    let get = |k: usize| f.get(base + k).map(|s| s.as_str()).unwrap_or("");
    let client = parse_ip(get(7))?;
    let app = Some(get(14).to_string()).filter(|s| !s.is_empty() && s != "incomplete" && s != "not-applicable");
    let action = get(30);
    if f[t] == "THREAT" {
        if get(4) != "url" {
            return None;
        }
        let host = host_of(get(31))?;
        return Some(LogHit {
            vendor: "paloalto",
            client: Some(client),
            host: Some(host),
            app,
            blocked: is_block_action(action),
            ai_category: is_ai_category(get(33)),
            ..Default::default()
        });
    }
    // TRAFFIC: no URL; the App-ID (e.g. "openai-chatgpt") and bytes sent
    let bytes_up = get(32).parse().unwrap_or(0);
    let host = f.iter().skip(base + 8).find_map(|x| if x.contains('.') && !x.contains(' ') { host_of(x).filter(|h| h.parse::<std::net::IpAddr>().is_err() && !h.contains('/')) } else { None });
    if app.is_none() && host.is_none() {
        return None;
    }
    Some(LogHit { vendor: "paloalto", client: Some(client), host, app, bytes_up, blocked: is_block_action(action), ai_category: is_ai_category(get(37)), ..Default::default() })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn threat_url() {
        let l = r#"<14>Sep 28 10:15:02 PA-VM 1,2026/09/28 10:15:02,012801012345,THREAT,url,2561,2026/09/28 10:15:02,192.168.1.34,104.18.32.47,203.0.113.10,104.18.32.47,allow-web,acme\mario,,openai-chatgpt,vsys1,trust,untrust,ethernet1/2,ethernet1/1,default,2026/09/28 10:15:02,34567,1,52344,443,40001,443,0x40b000,tcp,alert,"chatgpt.com/backend-api/conversation",(9999),artificial-intelligence,informational,client-to-server,7300000000000000001,0x0,192.168.0.0-192.168.255.255,United States,0,text/html,0,,,1,,,,,,,,0,0,0,0,0,,PA-VM,,,,,0,,0,,N/A,N/A,AppThreat-0-0,0x0,0,4294967295,,"artificial-intelligence,low-risk",4a3b2c1d-0000-0000-0000-000000000000,0"#;
        let h = parse(l).unwrap();
        assert_eq!(h.client, Some("192.168.1.34".parse().unwrap()));
        assert_eq!(h.host.as_deref(), Some("chatgpt.com"));
        assert!(!h.blocked && h.ai_category);
        let b = l.replace(",alert,", ",block-url,");
        assert!(parse(&b).unwrap().blocked);
    }

    #[test]
    fn traffic() {
        let l = r#"<14>Sep 28 10:16:00 PA-3220 1,2026/09/28 10:16:00,012801054321,TRAFFIC,end,2561,2026/09/28 10:16:00,10.10.4.21,160.79.104.10,203.0.113.10,160.79.104.10,allow-web,,,claude-ai,vsys1,trust,untrust,ethernet1/2,ethernet1/1,default,2026/09/28 10:16:00,45678,1,53012,443,40002,443,0x400053,tcp,allow,18532,6532,12000,40,2026/09/28 10:15:30,28,artificial-intelligence,0,7300000000000000002,0x0,10.0.0.0-10.255.255.255,United States,0,22,18,aged-out,0,0,0,0,,PA-3220,from-policy,,,0,,0,,N/A,0,0,0,0"#;
        let h = parse(l).unwrap();
        assert_eq!(h.client, Some("10.10.4.21".parse().unwrap()));
        assert_eq!(h.app.as_deref(), Some("claude-ai"));
        assert_eq!(h.bytes_up, 6532);
        assert!(h.host.is_none() && h.ai_category && !h.blocked);
    }

    #[test]
    fn other_threats_ignored() {
        let l = "1,2026/09/28 10:15:02,0128,THREAT,virus,2561,2026/09/28 10:15:02,192.168.1.34,1.2.3.4,,,r,,,web-browsing,vsys1,t,u,e1,e2,d,,1,1,1,80,0,0,0x0,tcp,alert,\"evil.exe\",(1),any,high";
        assert!(parse(l).is_none());
    }
}
