// Local read-only status page (http://angar-edge.local): what the device is, whether it is
// claimed, and the one line to set on the router. GET / (HTML) and GET /status.json only.
// No forms, no inputs, nothing secret: the view is built from non-secret fields only.
use crate::shared::Shared;
use crate::util::lock;
use serde::Serialize;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::time::Duration;

const LOGO_VIEWBOX: &str = "35 8 424 370";
const LOGO_PATHS: [&str; 3] = [
    "M152,28 L212,28 L212,92 L188,92 L128.6,193 L188,294 L212,294 L212,358 L152,358 L55,193 Z",
    "M212,92 L282,92 L282,294 L212,294 Z",
    "M342,28 L282,28 L282,92 L306,92 L365.4,193 L306,294 L282,294 L282,358 L342,358 L439,193 Z",
];

#[derive(Serialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub dns_queries: u64,
    pub ai_queries: u64,
    pub blocked: u64,
    pub log_lines: u64,
    pub events: u64,
    pub reports: u64,
}

/// Everything the page may show. Deliberately has no token/secret field.
#[derive(Serialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub serial: String,
    pub model: String,
    pub state: String,
    pub claimed: String,
    pub company: String,
    pub sensor_name: String,
    pub sensor_ip: String,
    pub dns_server: String,
    pub syslog_target: String,
    pub last_report: Option<String>,
    pub claim_url: String,
    pub note: String,
    pub counts: Counts,
    pub version: String,
    pub uptime_sec: u64,
}

pub fn view(sh: &Shared) -> View {
    let ip = crate::scan::primary_ip().map(|i| i.to_string()).unwrap_or_default();
    let info = lock(&sh.info).clone();
    let t = lock(&sh.totals).clone();
    let phase = sh.phase();
    let last = sh.last_report.load(std::sync::atomic::Ordering::Relaxed);
    let (serial, model) = sh.device.as_ref().map(|d| (d.serial.clone(), d.model.clone())).unwrap_or_default();
    use crate::shared::Phase::*;
    View {
        serial,
        model,
        state: phase.as_str().into(),
        claimed: match phase {
            Unclaimed => "unclaimed",
            Retired => "retired",
            Booting if sh.token().is_empty() => "unclaimed",
            _ => "claimed",
        }
        .into(),
        company: info.company,
        sensor_name: info.sensor_name,
        dns_server: if ip.is_empty() { String::new() } else { ip.clone() },
        syslog_target: if ip.is_empty() { String::new() } else { format!("{ip}:514") },
        sensor_ip: ip,
        last_report: (last > 0).then(|| crate::util::iso(last)),
        claim_url: if phase == Unclaimed { info.claim_url } else { String::new() },
        note: info.note,
        counts: Counts {
            dns_queries: t.counters.dns_queries,
            ai_queries: t.counters.ai_queries,
            blocked: t.counters.blocked,
            log_lines: t.counters.log_lines,
            events: t.events,
            reports: t.reports,
        },
        version: crate::VERSION.into(),
        uptime_sec: sh.started.elapsed().as_secs(),
    }
}

pub fn esc(s: &str) -> String {
    let mut o = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => o.push_str("&amp;"),
            '<' => o.push_str("&lt;"),
            '>' => o.push_str("&gt;"),
            '"' => o.push_str("&quot;"),
            '\'' => o.push_str("&#39;"),
            c if c.is_control() => {}
            c => o.push(c),
        }
    }
    o
}

fn or_dash(s: &str) -> String {
    if s.is_empty() { "—".into() } else { esc(s) }
}

pub fn render(v: &View) -> String {
    let logo: String = LOGO_PATHS.iter().map(|d| format!("<path d=\"{d}\"/>")).collect();
    let (badge, headline) = match v.state.as_str() {
        "online" => ("ok", "Online — sending data to angar"),
        "offline" => ("warn", "Offline — cannot reach angar, data is kept"),
        "unclaimed" => ("wait", "Waiting to be claimed"),
        "retired" => ("off", "Retired — this device no longer sends data"),
        _ => ("wait", "Starting…"),
    };
    let ip = if v.sensor_ip.is_empty() { "this device's IP".to_string() } else { esc(&v.sensor_ip) };
    let router = if v.state == "retired" {
        "<p class=muted>This device was replaced or returned. If your router still uses it as DNS server, set the DNS back to your previous server.</p>".to_string()
    } else {
        format!(
            "<ol class=steps><li>Set DNS server to <code>{ip}</code><span class=muted> — in your router's DHCP settings (no secondary DNS)</span></li>\
             <li>Send firewall syslog to <code>{ip}:514</code><span class=muted> — UDP, optional</span></li></ol>"
        )
    };
    let claim = if !v.claim_url.is_empty() {
        format!("<p class=muted>Claim it from your angar workspace: scan the QR label or open <code>{}</code></p>", esc(&v.claim_url))
    } else if v.state == "unclaimed" {
        "<p class=muted>Scan the QR label on the underside while logged in to angar to claim it.</p>".to_string()
    } else {
        String::new()
    };
    let note = if v.note.is_empty() { String::new() } else { format!("<p class=note>{}</p>", esc(&v.note)) };
    let row = |k: &str, val: String| format!("<tr><th>{k}</th><td>{val}</td></tr>");
    let rows = [
        row("Serial", or_dash(&v.serial)),
        row("Model", or_dash(&v.model)),
        row("Status", esc(&v.claimed)),
        row("Company", or_dash(&v.company)),
        row("Site", or_dash(&v.sensor_name)),
        row("Sensor IP", or_dash(&v.sensor_ip)),
        row("Last report", v.last_report.as_deref().map(esc).unwrap_or_else(|| "never".into())),
        row("DNS queries", v.counts.dns_queries.to_string()),
        row("AI queries", v.counts.ai_queries.to_string()),
        row("Blocked", v.counts.blocked.to_string()),
        row("Firewall log lines", v.counts.log_lines.to_string()),
        row("Version", esc(&v.version)),
    ]
    .concat();
    format!(
        r##"<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><meta http-equiv=refresh content=30><title>angar Edge</title><style>
:root{{color-scheme:dark}}*{{box-sizing:border-box}}body{{margin:0;background:#1A1C1D;color:#EDEDED;font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}}
main{{max-width:640px;margin:0 auto;padding:28px 16px}}header{{display:flex;align-items:center;gap:12px;margin-bottom:24px}}
header svg{{height:34px;width:auto;fill:#FF7323;display:block}}header span{{font-size:31px;font-weight:600;letter-spacing:-.02em;line-height:1}}header small{{margin-left:auto;color:#9A9FA3;font-size:13px}}
.card{{background:#232628;border:1px solid #2F3336;border-radius:12px;padding:18px 20px;margin-bottom:16px}}h1{{font-size:19px;margin:0 0 6px;display:flex;align-items:center;gap:10px}}
.dot{{width:10px;height:10px;border-radius:50%;background:#FF7323;flex:none}}.ok .dot{{background:#FF7323}}.warn .dot{{background:#E5484D}}.wait .dot{{background:#FF7323;opacity:.5}}.off .dot{{background:#6B7075}}
code{{background:#1A1C1D;border:1px solid #3A3F43;border-radius:6px;padding:1px 7px;color:#FF7323;font:600 14px ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}}
.steps{{margin:8px 0 0;padding-left:20px}}.steps li{{margin:6px 0}}.muted{{color:#9A9FA3;font-size:13px}}.note{{color:#FFB38A;font-size:13px}}
table{{width:100%;border-collapse:collapse}}th,td{{text-align:left;padding:6px 0;border-bottom:1px solid #2F3336;font-weight:400}}th{{color:#9A9FA3;width:45%}}tr:last-child th,tr:last-child td{{border-bottom:0}}
</style></head><body><main><header><svg viewBox="{LOGO_VIEWBOX}" aria-hidden=true>{logo}</svg><span>angar</span><small>Edge</small></header>
<section class="card {badge}"><h1><span class=dot></span>{headline}</h1>{claim}{note}</section>
<section class=card><h1>On your router</h1>{router}</section>
<section class=card><table>{rows}</table></section>
<p class=muted>Read-only page. Counts are since the last restart. <a href="/status.json" style="color:#9A9FA3">status.json</a></p>
</main></body></html>"##
    )
}

fn respond(stream: &mut TcpStream, code: &str, ctype: &str, body: &str, head: bool) {
    let hdr = format!(
        "HTTP/1.1 {code}\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nX-Frame-Options: DENY\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'\r\nConnection: close\r\n\r\n",
        body.len()
    );
    let _ = stream.write_all(hdr.as_bytes());
    if !head {
        let _ = stream.write_all(body.as_bytes());
    }
    let _ = stream.flush();
}

/// Parse the request line: (method, path without query).
pub fn request_line(req: &str) -> Option<(&str, &str)> {
    let line = req.lines().next()?;
    let mut it = line.split(' ');
    let (m, target) = (it.next()?, it.next()?);
    Some((m, target.split(['?', '#']).next().unwrap_or("/")))
}

fn handle(sh: &Shared, mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(3)));
    let mut buf = [0u8; 4096];
    let mut n = 0;
    while n < buf.len() {
        match stream.read(&mut buf[n..]) {
            Ok(0) | Err(_) => break,
            Ok(k) => {
                n += k;
                if buf[..n].windows(4).any(|w| w == b"\r\n\r\n") || buf[..n].windows(2).any(|w| w == b"\n\n") {
                    break;
                }
            }
        }
    }
    let req = String::from_utf8_lossy(&buf[..n]);
    let Some((method, path)) = request_line(&req) else { return };
    let head = method == "HEAD";
    if method != "GET" && !head {
        return respond(&mut stream, "405 Method Not Allowed", "text/plain", "read-only\n", false);
    }
    match path {
        "/" | "/index.html" => respond(&mut stream, "200 OK", "text/html; charset=utf-8", &render(&view(sh)), head),
        "/status.json" => respond(&mut stream, "200 OK", "application/json", &serde_json::to_string_pretty(&view(sh)).unwrap_or_default(), head),
        _ => respond(&mut stream, "404 Not Found", "text/plain", "not found\n", head),
    }
}

/// Bind `port` (device default 80, falling back to 8080) and serve in a background thread.
pub fn start(sh: Arc<Shared>, port: u16, fallback: Option<u16>) {
    let listener = match TcpListener::bind(("0.0.0.0", port)) {
        Ok(l) => l,
        Err(e) => match fallback {
            Some(f) => match TcpListener::bind(("0.0.0.0", f)) {
                Ok(l) => {
                    crate::log!("Status page: port {port} unavailable ({e}); using {f}");
                    l
                }
                Err(e2) => {
                    crate::log!("Status page disabled: cannot bind port {port} ({e}) or {f} ({e2})");
                    return;
                }
            },
            None => {
                crate::log!("Status page disabled: cannot bind port {port} ({e})");
                return;
            }
        },
    };
    let bound = listener.local_addr().map(|a| a.port()).unwrap_or(port);
    crate::log!("Status page on http://0.0.0.0:{bound}/ (read-only)");
    std::thread::Builder::new()
        .name("status".into())
        .spawn(move || {
            for s in listener.incoming().flatten() {
                handle(&sh, s); // one at a time: tiny page, 3 s timeouts
            }
        })
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{EdgeConfig, Runtime};
    use crate::device::Device;
    use crate::shared::Phase;

    fn shared() -> Shared {
        let dev = Device { serial: "AE-7K3M-Q9TZ".into(), secret: "SUPERSECRETclaimSECRET0123456789".into(), model: "n100".into() };
        let sh = Shared::new(Runtime::new(EdgeConfig::default()), vec![], std::env::temp_dir(), false, Some(dev));
        sh.set_token("ange_TOPSECRETTOKEN42");
        sh
    }

    #[test]
    fn render_has_no_secrets() {
        let sh = shared();
        {
            let mut i = lock(&sh.info);
            i.company = "Acme <script>alert(1)</script> & Co".into();
            i.claim_url = "https://app/edge/claim?serial=AE-7K3M-Q9TZ".into();
        }
        for phase in [Phase::Booting, Phase::Unclaimed, Phase::Online, Phase::Offline, Phase::Retired] {
            lock(&sh.info).note = "Cannot reach angar".into();
            // set phase without touching the real /run file
            let v = View { state: phase.as_str().into(), ..view(&sh) };
            let html = render(&v);
            let json = serde_json::to_string(&v).unwrap();
            for out in [&html, &json] {
                assert!(!out.contains("SUPERSECRET"), "secret leaked");
                assert!(!out.contains("TOPSECRETTOKEN"), "token leaked");
                assert!(!out.contains("ange_"), "token leaked");
            }
            assert!(!html.contains("<script>"));
            assert!(!html.contains("<form") && !html.contains("<input"));
            assert!(html.contains("AE-7K3M-Q9TZ") && html.contains("n100"));
            assert!(html.contains("Acme &lt;script&gt;"));
        }
    }

    #[test]
    fn router_lines() {
        let v = View { state: "online".into(), sensor_ip: "192.168.1.20".into(), version: "0.2.0".into(), ..Default::default() };
        let html = render(&v);
        assert!(html.contains("Set DNS server to <code>192.168.1.20</code>"));
        assert!(html.contains("Send firewall syslog to <code>192.168.1.20:514</code>"));
        assert!(html.contains(LOGO_PATHS[1]) && html.contains("<span>angar</span>"));
        let r = render(&View { state: "retired".into(), ..Default::default() });
        assert!(r.contains("Retired") && !r.contains("Set DNS server to"));
    }

    #[test]
    fn requests() {
        assert_eq!(request_line("GET /status.json?x=1 HTTP/1.1\r\nHost: a\r\n\r\n"), Some(("GET", "/status.json")));
        assert_eq!(request_line("HEAD / HTTP/1.0\r\n\r\n"), Some(("HEAD", "/")));
        assert_eq!(request_line(""), None);
        assert_eq!(esc("a<b>&\"'\u{7}"), "a&lt;b&gt;&amp;&quot;&#39;");
    }
}
