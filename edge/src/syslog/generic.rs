// Fallback: primo IPv4 privato + tutti i token che sembrano nomi host.
// I nomi vengono solo confrontati col catalogo (in syslog::process_line), mai salvati.
use crate::util::{first_private_ipv4, looks_like_hostname};
use std::net::IpAddr;

pub fn parse(line: &str) -> Option<(IpAddr, Vec<String>)> {
    let ip = first_private_ipv4(line)?;
    let hosts: Vec<String> = line
        .split(|c: char| !(c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_'))
        .map(|t| t.trim_matches('.').to_ascii_lowercase())
        .filter(|t| looks_like_hostname(t))
        .take(32)
        .collect();
    (!hosts.is_empty()).then_some((IpAddr::V4(ip), hosts))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generic_lines() {
        let (ip, hosts) = parse("<13>Sep 28 10:15:02 fw01.acme.local proxy: client 192.168.3.44 CONNECT claude.ai:443 bytes=1234").unwrap();
        assert_eq!(ip.to_string(), "192.168.3.44");
        assert!(hosts.contains(&"claude.ai".to_string()));
        assert!(hosts.contains(&"fw01.acme.local".to_string()));
        let (_, hosts) = parse("squid: 10.0.0.8 TCP_TUNNEL/200 3452 CONNECT https://gemini.google.com/app 443").unwrap();
        assert!(hosts.contains(&"gemini.google.com".to_string()));
        assert!(parse("no ip here chatgpt.com").is_none());
        assert!(parse("from 8.8.8.8 chatgpt.com").is_none());
    }
}
