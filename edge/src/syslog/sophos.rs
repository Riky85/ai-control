// Sophos Firewall (SFOS/XG, key=value) e Sophos UTM httpproxy.
use super::{is_ai_category, is_block_action, LogHit};
use crate::util::{host_of, kv_get, parse_ip, parse_kv};

pub fn parse(line: &str) -> Option<LogHit> {
    let sfos = line.contains("src_ip=") || line.contains("log_component=");
    let utm = line.contains("httpproxy[") && line.contains("srcip=");
    if !sfos && !utm {
        return None;
    }
    let kv = parse_kv(line);
    let client = parse_ip(kv_get(&kv, &["src_ip", "srcip"])?)?;
    let host = kv_get(&kv, &["domain", "fqdn", "host"]).and_then(host_of).or_else(|| kv_get(&kv, &["url"]).and_then(host_of));
    let app = kv_get(&kv, &["application", "app_name"]).map(|s| s.to_string());
    if host.is_none() && app.is_none() {
        return None;
    }
    let bytes_up = kv_get(&kv, &["sent_bytes", "bytes_sent", "sent_bytes_total"]).and_then(|v| v.parse().ok()).unwrap_or(0);
    let blocked = kv_get(&kv, &["log_subtype"]).map_or(false, is_block_action) || kv_get(&kv, &["action"]).map_or(false, is_block_action) || kv_get(&kv, &["status"]).map_or(false, is_block_action);
    let ai_category = ["category", "category_name", "categoryname"].iter().any(|k| kv_get(&kv, &[k]).map_or(false, is_ai_category));
    Some(LogHit { vendor: "sophos", client: Some(client), client_name: None, host, app, bytes_up, blocked, ai_category, dns: false })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sfos_web() {
        let l = r#"<30>device="SFW" date=2026-09-28 time=10:15:02 timezone="CEST" device_name="XG125" device_id=C12345ABCDEF log_id=050901616001 log_type="Content Filtering" log_component="HTTP" log_subtype="Allowed" status="" priority=Information fw_rule_id=5 user_name="mario" user_gp="staff" iap=1 category="Generative AI" category_type="Acceptable" url="https://claude.ai/chat/1a2b" contenttype="text/html" override_token="" httpresponsecode="200" src_ip=192.168.10.23 dst_ip=160.79.104.10 protocol="TCP" src_port=51234 dst_port=443 sent_bytes=2048 recv_bytes=16384 domain=claude.ai exceptions="" activityname="" reason="" user_agent="Mozilla/5.0" status_code="200" transactionid="" referer="" download_file_name="" download_file_type="" upload_file_name="" upload_file_type="" con_id=123 application="" app_is_cloud=0 override_name="" override_authorizer="""#;
        let h = parse(l).unwrap();
        assert_eq!(h.client, Some("192.168.10.23".parse().unwrap()));
        assert_eq!(h.host.as_deref(), Some("claude.ai"));
        assert_eq!(h.bytes_up, 2048);
        assert!(!h.blocked && h.ai_category);
    }

    #[test]
    fn sfos_v19_denied() {
        let l = r#"<30>device_name="SFW" timestamp="2026-09-28T10:20:11+0200" device_model="XGS2100" device_serial_id="X21001ABCD" log_id="050902616002" log_type="Content Filtering" log_component="HTTP" log_subtype="Denied" log_version=1 severity="Warning" user_name="" category="Uncategorized" url="https://chat.deepseek.com/" src_ip="192.168.10.40" dst_ip="1.2.3.4" bytes_sent=0 bytes_received=0 domain="chat.deepseek.com""#;
        let h = parse(l).unwrap();
        assert!(h.blocked);
        assert_eq!(h.host.as_deref(), Some("chat.deepseek.com"));
    }

    #[test]
    fn utm_httpproxy() {
        let l = r#"2026:09:28-10:15:02 utm httpproxy[4321]: id="0001" severity="info" sys="SecureWeb" sub="http" name="http access" action="pass" method="POST" srcip="192.168.2.15" dstip="104.18.32.47" user="" group="" ad_domain="" statuscode="200" cached="0" profile="REF_DefaultHTTPProfile" filteraction="REF_DefaultHTTPCFFAction" size="5120" request="0x7f3a" url="https://api.openai.com/v1/chat/completions" referer="" error="" authtime="0" dnstime="1" cattime="12" avscantime="0" fullreqtime="245" device="0" auth="0" ua="python-requests/2.31" exceptions="" category="178" reputation="neutral" categoryname="Artificial Intelligence""#;
        let h = parse(l).unwrap();
        assert_eq!(h.host.as_deref(), Some("api.openai.com"));
        assert_eq!(h.client, Some("192.168.2.15".parse().unwrap()));
        assert!(!h.blocked && h.ai_category);
    }
}
