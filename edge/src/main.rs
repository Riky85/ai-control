// angar Edge — network sensor for angar.
//
// Sees which AI services are used on the company network without installing
// anything on the PCs: a DNS forwarder (point DHCP DNS at it) and/or a syslog
// receiver for firewall logs (Fortinet, Sophos, Palo Alto, Meraki, UniFi,
// pfSense, generic). Names are matched locally against the angar catalog:
// only AI service ids, client IP/hostname, counts and bytes sent leave the
// network — never URLs, paths or any non-AI domain.

mod config;
mod detect;
mod dns;
mod names;
mod report;
mod scan;
mod shared;
mod stats;
mod syslog;
mod util;

use config::{EdgeConfig, FetchError, Runtime};
use shared::Shared;
use std::net::{IpAddr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use util::lock;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const DEFAULT_SERVER: &str = "https://ai-control-production.up.railway.app";
const CONFIG_EVERY: Duration = Duration::from_secs(600);
const SAVE_EVERY: Duration = Duration::from_secs(60);
const SCAN_EVERY: Duration = Duration::from_secs(6 * 3600);
const ALT_SYSLOG_PORT: u16 = 5514;

#[macro_export]
macro_rules! log {
    ($($t:tt)*) => {{
        if std::env::var_os("JOURNAL_STREAM").is_some() {
            eprintln!("{}", format_args!($($t)*));
        } else {
            eprintln!("{} {}", $crate::util::iso($crate::util::now_secs()), format_args!($($t)*));
        }
    }};
}

static STOP: AtomicBool = AtomicBool::new(false);

#[cfg(unix)]
fn install_signals() {
    extern "C" fn on_signal(_: i32) {
        STOP.store(true, Ordering::SeqCst);
    }
    extern "C" {
        fn signal(sig: i32, handler: extern "C" fn(i32)) -> usize;
    }
    // SIGINT = 2, SIGTERM = 15 (same on x86_64 and aarch64 Linux)
    unsafe {
        signal(2, on_signal);
        signal(15, on_signal);
    }
}
#[cfg(not(unix))]
fn install_signals() {}

fn stopping() -> bool {
    STOP.load(Ordering::SeqCst)
}

/// Sleep in small steps so SIGTERM is handled promptly.
fn nap(d: Duration) {
    let end = Instant::now() + d;
    while !stopping() && Instant::now() < end {
        std::thread::sleep(Duration::from_millis(250).min(end.saturating_duration_since(Instant::now())));
    }
}

const HELP: &str = "angar-edge — angar network sensor (DNS forwarder + firewall syslog receiver)

Usage: angar-edge --token ange_… [options]

Options (each also as environment variable):
  --token <ange_…>        sensor token (ANGAR_EDGE_TOKEN, required)
  --server <url>          angar server (ANGAR_SERVER, default https://ai-control-production.up.railway.app)
  --upstream <ip,ip>      upstream DNS resolvers (ANGAR_UPSTREAM, default: /etc/resolv.conf, else 1.1.1.1,9.9.9.9)
  --dns-port <n>          DNS listen port, UDP+TCP (ANGAR_DNS_PORT, default 53)
  --syslog-port <n>       syslog listen port, UDP+TCP (ANGAR_SYSLOG_PORT, default 514; 5514 is always open too)
  --state-dir <dir>       where config cache and unsent data live (ANGAR_STATE_DIR,
                          default /var/lib/angar-edge, else ./state)
  -v, --verbose           log every AI match (AI domains only; ANGAR_EDGE_VERBOSE=1)
  --once                  fetch the configuration, print it and exit
  --version               print the version
  -h, --help              this help

Point your DHCP server's DNS at this machine and/or send firewall syslog to UDP 514.
Only AI services from the angar catalog are counted; other domains are never stored or sent.";

struct Args {
    token: String,
    server: String,
    upstream: Option<String>,
    dns_port: u16,
    syslog_port: u16,
    state_dir: Option<PathBuf>,
    once: bool,
    verbose: bool,
}

fn parse_args() -> Result<Args, String> {
    let env = |k: &str| std::env::var(k).ok().filter(|v| !v.trim().is_empty());
    let mut a = Args {
        token: env("ANGAR_EDGE_TOKEN").unwrap_or_default(),
        server: env("ANGAR_SERVER").unwrap_or_else(|| DEFAULT_SERVER.into()),
        upstream: env("ANGAR_UPSTREAM"),
        dns_port: env("ANGAR_DNS_PORT").and_then(|v| v.parse().ok()).unwrap_or(53),
        syslog_port: env("ANGAR_SYSLOG_PORT").and_then(|v| v.parse().ok()).unwrap_or(514),
        state_dir: env("ANGAR_STATE_DIR").map(PathBuf::from),
        once: false,
        verbose: env("ANGAR_EDGE_VERBOSE").map_or(false, |v| v != "0"),
    };
    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        let (key, inline) = match arg.split_once('=') {
            Some((k, v)) if k.starts_with("--") => (k.to_string(), Some(v.to_string())),
            _ => (arg.clone(), None),
        };
        let mut val = || inline.clone().or_else(|| it.next()).ok_or(format!("{key} needs a value"));
        let port = |v: String| v.parse::<u16>().map_err(|_| format!("{key}: invalid port {v}"));
        match key.as_str() {
            "--token" => a.token = val()?,
            "--server" => a.server = val()?,
            "--upstream" => a.upstream = Some(val()?),
            "--dns-port" => a.dns_port = port(val()?)?,
            "--syslog-port" => a.syslog_port = port(val()?)?,
            "--state-dir" => a.state_dir = Some(PathBuf::from(val()?)),
            "--once" => a.once = true,
            "-v" | "--verbose" => a.verbose = true,
            "--version" | "-V" => {
                println!("angar-edge {VERSION}");
                std::process::exit(0);
            }
            "-h" | "--help" => {
                println!("{HELP}");
                std::process::exit(0);
            }
            other => return Err(format!("unknown option {other} (see --help)")),
        }
    }
    a.token = a.token.trim().to_string();
    a.server = a.server.trim().trim_end_matches('/').to_string();
    if a.token.is_empty() {
        return Err("missing token: pass --token ange_… or set ANGAR_EDGE_TOKEN (create a sensor in angar → Edge → Sensors)".into());
    }
    Ok(a)
}

fn writable(dir: &Path) -> bool {
    if std::fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".write-test");
    let ok = std::fs::write(&probe, b"ok").is_ok();
    let _ = std::fs::remove_file(probe);
    ok
}

fn state_dir(explicit: Option<PathBuf>) -> PathBuf {
    if let Some(d) = explicit {
        if !writable(&d) {
            log!("Warning: state dir {} is not writable; unsent data won't survive restarts", d.display());
        }
        return d;
    }
    let sys = PathBuf::from("/var/lib/angar-edge");
    if writable(&sys) {
        return sys;
    }
    let local = PathBuf::from("state");
    let _ = writable(&local);
    local
}

fn http_agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .user_agent(&format!("angar-edge/{VERSION}"))
        .try_proxy_from_env(true)
        .build()
}

fn describe(cfg: &EdgeConfig) -> String {
    format!(
        "\"{}\" ({}) — dns {}, syslog {}, block {}, scan {}, privacy {}, {} services, {} blocked, report every {}s",
        cfg.name,
        cfg.company,
        on(cfg.dns_enabled),
        on(cfg.syslog_enabled),
        on(cfg.block_enabled),
        on(cfg.scan_lan),
        cfg.privacy_mode,
        cfg.services.len(),
        cfg.blocked.len(),
        cfg.report_every()
    )
}

fn on(b: bool) -> &'static str {
    if b { "on" } else { "off" }
}

const UNAUTHORIZED: &str = "The server rejected the sensor token (HTTP 401). Check ANGAR_EDGE_TOKEN — the sensor may have been deleted or its token rotated in angar → Edge → Sensors.";

/// Initial configuration: server, else the cached copy, else wait for the server.
fn initial_config(agent: &ureq::Agent, a: &Args, dir: &Path) -> Option<EdgeConfig> {
    let mut first = true;
    loop {
        match config::fetch(agent, &a.server, &a.token) {
            Ok((cfg, text)) => {
                config::save_cached(dir, &text);
                return Some(cfg);
            }
            Err(e) => {
                let (msg, wait) = match e {
                    FetchError::Unauthorized => (UNAUTHORIZED.to_string(), Duration::from_secs(300)),
                    FetchError::Other(m) => (format!("Cannot fetch configuration from {}: {m}", a.server), Duration::from_secs(30)),
                };
                if let Some(c) = config::load_cached(dir) {
                    log!("{msg} — starting with the cached configuration");
                    return Some(c);
                }
                if first {
                    log!("{msg} — no cached configuration yet; retrying");
                    first = false;
                }
                nap(wait);
                if stopping() {
                    return None;
                }
            }
        }
    }
}

fn main() {
    let a = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("angar-edge: {e}");
            std::process::exit(2);
        }
    };
    install_signals();
    let agent = http_agent();

    if a.once {
        match config::fetch(&agent, &a.server, &a.token) {
            Ok((cfg, _)) => {
                println!("{}", serde_json::to_string_pretty(&cfg).unwrap_or_default());
                return;
            }
            Err(FetchError::Unauthorized) => {
                eprintln!("{UNAUTHORIZED}");
                std::process::exit(1);
            }
            Err(FetchError::Other(m)) => {
                eprintln!("Cannot fetch configuration from {}: {m}", a.server);
                std::process::exit(1);
            }
        }
    }

    if !a.token.starts_with("ange_") {
        log!("Warning: the token doesn't look like an angar Edge token (ange_…)");
    }
    let dir = state_dir(a.state_dir.clone());
    let host_ip = scan::primary_ip();
    let upstreams: Vec<SocketAddr> = match &a.upstream {
        Some(u) => {
            let v = dns::parse_upstreams(u);
            if v.is_empty() {
                log!("Invalid --upstream \"{u}\"; using defaults");
                dns::default_upstreams(host_ip)
            } else {
                v
            }
        }
        None => dns::default_upstreams(host_ip),
    };
    log!(
        "angar-edge {VERSION} starting — server {}, host IP {}, state {}",
        a.server,
        host_ip.map(|i| i.to_string()).unwrap_or_else(|| "unknown".into()),
        dir.display()
    );

    let Some(cfg) = initial_config(&agent, &a, &dir) else { return };
    log!("Configuration: {}", describe(&cfg));
    let shared = Arc::new(Shared::new(Runtime::new(cfg), upstreams, dir.clone(), a.verbose));

    if let Some(b) = stats::Stats::load(&dir) {
        let n = b.events.len() + b.candidates.len();
        lock(&shared.stats).merge(b);
        if n > 0 {
            log!("Restored {n} unsent entries from the previous run");
        }
    }

    // reverse-DNS resolver for client names
    {
        let sh = shared.clone();
        std::thread::Builder::new().name("names".into()).spawn(move || sh.names.run(&sh.upstreams)).ok();
    }
    spawn_config_refresh(shared.clone(), agent.clone(), a.server.clone(), a.token.clone());
    spawn_reporter(shared.clone(), agent, a.server.clone(), a.token.clone());

    let (mut dns_on, mut syslog_on, mut scan_on) = (false, false, false);
    let mut last_save = Instant::now();
    while !stopping() {
        let rt = shared.rt();
        if !dns_on && (rt.cfg.dns_enabled || rt.cfg.block_enabled) {
            dns::start(shared.clone(), a.dns_port);
            dns_on = true;
        }
        if !syslog_on && rt.cfg.syslog_enabled {
            let mut ports = vec![a.syslog_port];
            if a.syslog_port != ALT_SYSLOG_PORT {
                ports.push(ALT_SYSLOG_PORT);
            }
            syslog::start(shared.clone(), ports);
            syslog_on = true;
        }
        if !scan_on && rt.cfg.scan_lan {
            spawn_scanner(shared.clone());
            scan_on = true;
        }
        drop(rt);
        if last_save.elapsed() >= SAVE_EVERY {
            save_pending(&shared);
            last_save = Instant::now();
        }
        nap(Duration::from_secs(1));
    }
    save_pending(&shared);
    log!("Stopped; unsent data saved to {}", dir.join("pending.json").display());
}

fn save_pending(shared: &Shared) {
    let mut st = lock(&shared.stats);
    if st.dirty {
        if let Err(e) = st.save(&shared.state_dir) {
            log!("Cannot save unsent data in {}: {e}", shared.state_dir.display());
            st.dirty = false; // don't spam every minute
        }
    }
}

fn spawn_config_refresh(shared: Arc<Shared>, agent: ureq::Agent, server: String, token: String) {
    std::thread::Builder::new()
        .name("config".into())
        .spawn(move || {
            let mut warned_401 = false;
            loop {
                nap(CONFIG_EVERY);
                if stopping() {
                    return;
                }
                match config::fetch(&agent, &server, &token) {
                    Ok((cfg, text)) => {
                        warned_401 = false;
                        let old = describe(&shared.rt().cfg);
                        let new = describe(&cfg);
                        if old != new {
                            log!("Configuration updated: {new}");
                        }
                        config::save_cached(&shared.state_dir, &text);
                        shared.set_rt(Runtime::new(cfg));
                    }
                    Err(FetchError::Unauthorized) => {
                        if !warned_401 {
                            log!("{UNAUTHORIZED}");
                            warned_401 = true;
                        }
                    }
                    Err(FetchError::Other(m)) => log!("Configuration refresh failed ({m}); keeping the current one"),
                }
            }
        })
        .ok();
}

fn spawn_reporter(shared: Arc<Shared>, agent: ureq::Agent, server: String, token: String) {
    std::thread::Builder::new()
        .name("report".into())
        .spawn(move || {
            let mut wait = Duration::from_secs(20); // first report soon: shows the sensor online
            let mut failures = 0u32;
            loop {
                nap(wait);
                if stopping() {
                    return;
                }
                let every = Duration::from_secs(shared.rt().cfg.report_every());
                let host_ip = scan::primary_ip().map(|i: IpAddr| i.to_string()).unwrap_or_default();
                match report::send(&shared, &agent, &server, &token, &host_ip) {
                    report::Outcome::Sent { events, candidates, more } => {
                        if failures > 0 {
                            log!("Report delivered again after {failures} failed attempt(s)");
                        }
                        failures = 0;
                        if events + candidates > 0 {
                            log!("Report sent: {events} events, {candidates} candidates");
                        }
                        let dropped = std::mem::take(&mut lock(&shared.stats).dropped);
                        if dropped > 0 {
                            log!("Warning: {dropped} entries were dropped (more than {} unsent keys)", stats::MAX_KEYS);
                        }
                        wait = if more { Duration::from_secs(5) } else { every };
                    }
                    report::Outcome::Unauthorized => {
                        if failures == 0 {
                            log!("{UNAUTHORIZED} Data is kept and retried every 15 minutes.");
                        }
                        failures += 1;
                        wait = Duration::from_secs(900);
                    }
                    report::Outcome::Failed(m) => {
                        if failures < 3 || failures % 12 == 0 {
                            log!("Report failed ({m}); data kept for the next attempt");
                        }
                        failures += 1;
                        wait = every.min(Duration::from_secs(60) * (failures.min(10)));
                    }
                }
            }
        })
        .ok();
}

fn spawn_scanner(shared: Arc<Shared>) {
    std::thread::Builder::new()
        .name("scan".into())
        .spawn(move || {
            nap(Duration::from_secs(60));
            while !stopping() {
                if shared.rt().cfg.scan_lan {
                    match scan::primary_ip() {
                        Some(IpAddr::V4(ip)) => {
                            log!("LAN scan: probing {}.0/24 for Ollama (11434) and LM Studio (1234)", ip.octets()[..3].iter().map(|o| o.to_string()).collect::<Vec<_>>().join("."));
                            let found = scan::scan(ip);
                            log!("LAN scan: {} local model server(s) found", found.len());
                            lock(&shared.stats).set_local_models(found);
                        }
                        _ => log!("LAN scan: no IPv4 address on the primary interface; skipped"),
                    }
                }
                nap(SCAN_EVERY);
            }
        })
        .ok();
}

#[cfg(test)]
mod tests {
    #[test]
    fn installer_embeds_the_systemd_unit() {
        let script = include_str!("../install.sh");
        let unit = include_str!("../angar-edge.service");
        assert!(script.contains(&format!("<<'UNIT_EOF'\n{unit}UNIT_EOF\n")), "install.sh must embed angar-edge.service verbatim");
    }
}
