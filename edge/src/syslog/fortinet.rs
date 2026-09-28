// Fortinet FortiGate (key=value): traffic, webfilter, dns, app-ctrl logs.
use super::{is_ai_category, is_block_action, LogHit};
use crate::util::{host_of, kv_get, parse_ip, parse_kv};

pub fn parse(line: &str) -> Option<LogHit> {
    if !(line.contains("logid=") || line.contains("devid=")) || !line.contains("srcip=") {
        return None;
    }
    let kv = parse_kv(line);
    let client = parse_ip(kv_get(&kv, &["srcip"])?)?;
    // host: DNS qname, webfilter/app hostname, else host part of url
    let host = kv_get(&kv, &["qname", "hostname"]).and_then(host_of).or_else(|| kv_get(&kv, &["url"]).and_then(host_of));
    let app = kv_get(&kv, &["app"]).map(|s| s.to_string());
    if host.is_none() && app.is_none() {
        return None;
    }
    let bytes_up = kv_get(&kv, &["sentbyte"]).and_then(|v| v.parse().ok()).unwrap_or(0);
    let blocked = kv_get(&kv, &["action"]).map_or(false, is_block_action) || kv_get(&kv, &["utmaction"]).map_or(false, is_block_action);
    let ai_category = kv_get(&kv, &["catdesc", "appcat"]).map_or(false, is_ai_category);
    let dns = kv_get(&kv, &["subtype"]) == Some("dns") || kv_get(&kv, &["qname"]).is_some();
    Some(LogHit {
        vendor: "fortinet",
        client: Some(client),
        client_name: kv_get(&kv, &["srcname"]).map(|s| s.to_string()),
        host,
        app,
        bytes_up,
        blocked,
        ai_category,
        dns,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn webfilter() {
        let l = r#"<189>date=2026-09-28 time=10:15:02 devname="FGT60F" devid="FGT60FTK2209A1B2" eventtime=1790590502000000000 tz="+0200" logid="0317013312" type="utm" subtype="webfilter" eventtype="ftgd_allow" level="notice" vd="root" policyid=1 sessionid=123456 srcip=192.168.1.34 srcport=52344 srcintf="internal" srcintfrole="lan" dstip=104.18.32.47 dstport=443 dstintf="wan1" proto=6 service="HTTPS" hostname="chatgpt.com" profile="default" action="passthrough" reqtype="direct" url="https://chatgpt.com/backend-api/conversation" sentbyte=1532 rcvdbyte=8211 direction="outgoing" msg="URL belongs to an allowed category in policy" cat=106 catdesc="Artificial Intelligence Technology""#;
        let h = parse(l).unwrap();
        assert_eq!(h.client, Some("192.168.1.34".parse().unwrap()));
        assert_eq!(h.host.as_deref(), Some("chatgpt.com"));
        assert_eq!(h.bytes_up, 1532);
        assert!(!h.blocked && h.ai_category && !h.dns);
    }

    #[test]
    fn blocked_and_dns() {
        let l = r#"date=2026-09-28 time=10:16:40 devname="FGT60F" devid="FGT60FTK2209A1B2" logid="0317013312" type="utm" subtype="webfilter" eventtype="ftgd_blk" level="warning" srcip=10.0.5.21 srcname="PC-MARIO" dstip=1.2.3.4 hostname="chat.deepseek.com" action="blocked" url="https://chat.deepseek.com/a/chat" sentbyte=0"#;
        let h = parse(l).unwrap();
        assert!(h.blocked);
        assert_eq!(h.client_name.as_deref(), Some("PC-MARIO"));
        assert_eq!(h.host.as_deref(), Some("chat.deepseek.com"));
        let d = r#"date=2026-09-28 time=10:17:00 devname="FGT60F" devid="FGT60F" logid="1501054802" type="utm" subtype="dns" eventtype="dns-response" srcip=192.168.1.40 srcport=5353 dstip=192.168.1.1 dstport=53 qname="api.openai.com" qtype="A" qclass="IN" action="pass""#;
        let h = parse(d).unwrap();
        assert!(h.dns && !h.blocked);
        assert_eq!(h.host.as_deref(), Some("api.openai.com"));
    }

    #[test]
    fn traffic_with_app() {
        let l = r#"date=2026-09-28 time=10:18:00 devname="FGT" devid="FG100F" logid="0000000013" type="traffic" subtype="forward" level="notice" srcip=192.168.1.50 dstip=13.107.42.14 action="deny" service="HTTPS" app="ChatGPT" appcat="Generative.AI" sentbyte=420 rcvdbyte=0"#;
        let h = parse(l).unwrap();
        assert_eq!(h.app.as_deref(), Some("ChatGPT"));
        assert!(h.blocked && h.host.is_none());
        assert_eq!(h.bytes_up, 420);
        assert!(parse(r#"date=2026-09-28 logid="0000000013" type="traffic" srcip=192.168.1.50 dstip=1.1.1.1 action="accept""#).is_none());
    }
}
