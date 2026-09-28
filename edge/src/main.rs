// angar Edge — network sensor for angar.
//
// Sees which AI services are used on the company network without installing
// anything on the PCs: a DNS forwarder (point DHCP DNS at it) and/or a syslog
// receiver for firewall logs (Fortinet, Sophos, Palo Alto, Meraki, UniFi,
// pfSense, generic). Names are matched locally against the angar catalog:
// only AI service ids, client IP/hostname, counts and bytes sent leave the
// network — never URLs, paths or any non-AI domain.
//
// The same binary runs on the angar hardware device (N100 / Raspberry Pi 5):
// with /etc/angar-edge/device.json and no token it claims itself
// (POST /api/edge/claim), serves a read-only status page and updates itself
// from signed releases.

mod config;
mod detect;
mod device;
mod dns;
mod names;
mod report;
mod scan;
mod sd;
mod shared;
mod stats;
mod status;
mod syslog;
mod update;
mod util;

use config::{EdgeConfig, FetchError, Runtime};
use device::Device;
use shared::{Phase, Shared};
use std::net::{IpAddr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use util::lock;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const DEFAULT_SERVER: &str = "https://ai-control-production.up.railway.app";
const CONFIG_EVERY: Duration = Duration::from_secs(600);
const SAVE_EVERY: Duration = Duration::from_secs(60);
const SCAN_EVERY: Duration = Duration::from_secs(6 * 3600);
const ALT_SYSLOG_PORT: u16 = 5514;
const CLAIM_EVERY: Duration = Duration::from_secs(30);
const CLAIM_MAX_BACKOFF: Duration = Duration::from_secs(300);
const CLAIM_SLOW: Duration = Duration::from_secs(600);
const RETIRED_RECHECK: Duration = Duration::from_secs(6 * 3600);
const OFFLINE_AFTER: i64 = 15 * 60;
const UPDATE_FIRST: Duration = Duration::from_secs(600);
const UPDATE_EVERY: Duration = Duration::from_secs(24 * 3600);
const MAX_UPDATED_STARTS: u32 = 5;

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
static EXIT_CODE: AtomicI32 = AtomicI32::new(0);

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

/// Stop the main loop and exit with `code` (self-update / rollback; systemd restarts us).
fn request_exit(code: i32) {
    EXIT_CODE.store(code, Ordering::SeqCst);
    STOP.store(true, Ordering::SeqCst);
}

/// Sleep in small steps so SIGTERM is handled promptly. On the main thread it also
/// feeds the systemd watchdog heartbeat.
fn nap(d: Duration) {
    let main = std::thread::current().name() == Some("main");
    let end = Instant::now() + d;
    loop {
        if main {
            sd::beat();
        }
        if stopping() || Instant::now() >= end {
            return;
        }
        std::thread::sleep(Duration::from_millis(250).min(end.saturating_duration_since(Instant::now())));
    }
}

const HELP: &str = "angar-edge — angar network sensor (DNS forwarder + firewall syslog receiver)

Usage: angar-edge --token ange_… [options]
       angar-edge                  (angar device: claims itself with /etc/angar-edge/device.json)

Options (each also as environment variable):
  --token <ange_…>        sensor token (ANGAR_EDGE_TOKEN; else the token saved in the state dir
                          by a device claim; required unless a device file exists)
  --server <url>          angar server (ANGAR_SERVER, default https://ai-control-production.up.railway.app)
  --upstream <ip,ip>      upstream DNS resolvers (ANGAR_UPSTREAM, default: /etc/resolv.conf, else 1.1.1.1,9.9.9.9)
  --dns-port <n>          DNS listen port, UDP+TCP (ANGAR_DNS_PORT, default 53)
  --syslog-port <n>       syslog listen port, UDP+TCP (ANGAR_SYSLOG_PORT, default 514; 5514 is always open too)
  --state-dir <dir>       where config cache, token and unsent data live (ANGAR_STATE_DIR,
                          default /var/lib/angar-edge, else ./state)
  --device-file <path>    angar device identity (ANGAR_EDGE_DEVICE_FILE, default /etc/angar-edge/device.json
                          or the systemd credential device.json); enables device mode
  --status-port <n>       read-only status page on this port (ANGAR_EDGE_STATUS_PORT;
                          device mode default 80, falling back to 8080; 0 = off)
  --auto-update           install signed updates from the edge-latest release (ANGAR_EDGE_AUTO_UPDATE=1;
  --no-auto-update        on by default in device mode, off otherwise)
  -v, --verbose           log every AI match (AI domains only; ANGAR_EDGE_VERBOSE=1)
  --once                  fetch the configuration, print it and exit; on an unclaimed device,
                          check the claim once (factory burn-in) and exit
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
    device_file: Option<PathBuf>,
    status_port: Option<u16>,
    auto_update: Option<bool>,
    update_url: String,
    once: bool,
    verbose: bool,
}

fn parse_args() -> Result<Args, String> {
    let env = |k: &str| std::env::var(k).ok().filter(|v| !v.trim().is_empty());
    let flag = |v: String| !matches!(v.trim(), "0" | "false" | "no" | "off");
    let mut a = Args {
        token: env("ANGAR_EDGE_TOKEN").unwrap_or_default(),
        server: env("ANGAR_SERVER").unwrap_or_else(|| DEFAULT_SERVER.into()),
        upstream: env("ANGAR_UPSTREAM"),
        dns_port: env("ANGAR_DNS_PORT").and_then(|v| v.parse().ok()).unwrap_or(53),
        syslog_port: env("ANGAR_SYSLOG_PORT").and_then(|v| v.parse().ok()).unwrap_or(514),
        state_dir: env("ANGAR_STATE_DIR").map(PathBuf::from),
        device_file: env("ANGAR_EDGE_DEVICE_FILE").map(PathBuf::from),
        status_port: env("ANGAR_EDGE_STATUS_PORT").and_then(|v| v.parse().ok()),
        auto_update: env("ANGAR_EDGE_AUTO_UPDATE").map(flag),
        update_url: env("ANGAR_EDGE_UPDATE_URL").unwrap_or_else(|| update::DEFAULT_BASE.into()),
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
            "--device-file" => a.device_file = Some(PathBuf::from(val()?)),
            "--status-port" => a.status_port = Some(port(val()?)?),
            "--auto-update" => a.auto_update = Some(true),
            "--no-auto-update" => a.auto_update = Some(false),
            "--update-url" => a.update_url = val()?,
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
    Ok(a)
}

const MISSING_TOKEN: &str = "missing token: pass --token ange_… or set ANGAR_EDGE_TOKEN (create a sensor in angar → Edge → Sensors); an angar device claims itself with /etc/angar-edge/device.json";

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
const DEVICE_UNAUTHORIZED: &str = "The server rejected the device token (HTTP 401): claiming the device again";

/// Device file: explicit flag/env (must load), else the default path when it exists.
fn load_device(a: &Args) -> Result<Option<Device>, String> {
    match &a.device_file {
        Some(p) => device::load(p).map(Some),
        None => {
            let p = device::default_path();
            if p.exists() { device::load(&p).map(Some) } else { Ok(None) }
        }
    }
}

enum Init {
    Config(EdgeConfig),
    Reclaim,
    Stopped,
}

/// Initial configuration: server, else the cached copy, else wait for the server.
/// On a device, a rejected token means "claim again" (the server rotates tokens on each claim).
fn initial_config(agent: &ureq::Agent, server: &str, shared: &Shared) -> Init {
    let dir = &shared.state_dir;
    let mut first = true;
    loop {
        match config::fetch(agent, server, &shared.token()) {
            Ok((cfg, text)) => {
                config::save_cached(dir, &text);
                return Init::Config(cfg);
            }
            Err(e) => {
                let (msg, wait) = match e {
                    FetchError::Unauthorized if shared.device_mode() => {
                        log!("{DEVICE_UNAUTHORIZED}");
                        return Init::Reclaim;
                    }
                    FetchError::Unauthorized => (UNAUTHORIZED.to_string(), Duration::from_secs(300)),
                    FetchError::Other(m) => (format!("Cannot fetch configuration from {server}: {m}"), Duration::from_secs(30)),
                };
                if let Some(c) = config::load_cached(dir) {
                    log!("{msg} — starting with the cached configuration");
                    return Init::Config(c);
                }
                if first {
                    log!("{msg} — no cached configuration yet; retrying");
                    first = false;
                }
                nap(wait);
                if stopping() {
                    return Init::Stopped;
                }
            }
        }
    }
}

/// 410: stop sensing. DNS keeps forwarding (with nothing matched, blocked or sent) so a site
/// that still points its DHCP DNS at this box doesn't lose name resolution.
fn retire(shared: &Shared) {
    shared.set_phase(Phase::Retired);
    shared.set_rt(Runtime::new(EdgeConfig { services: vec![], blocked: vec![], block_enabled: false, scan_lan: false, ..EdgeConfig::default() }));
    *lock(&shared.stats) = stats::Stats::default();
    shared.set_token("");
    device::forget_token(&shared.state_dir);
    for f in ["pending.json", "config.json"] {
        let _ = std::fs::remove_file(shared.state_dir.join(f));
    }
    let mut info = lock(&shared.info);
    info.company.clear();
    info.sensor_name.clear();
    info.claim_url.clear();
}

/// Claim mode: POST /api/edge/claim until the device gets a token. false = stopping.
fn claim_until_token(shared: &Shared, agent: &ureq::Agent, server: &str) -> bool {
    let Some(dev) = shared.device.as_ref() else { return false };
    if shared.phase() != Phase::Retired {
        shared.set_phase(Phase::Unclaimed);
    }
    log!("Device {} ({}) is not claimed yet: asking {server}", dev.serial, if dev.model.is_empty() { "unknown model" } else { &dev.model });
    let mut backoff = CLAIM_EVERY;
    let mut url_logged = false;
    let mut last_problem = String::new();
    let mut failures = 0u32;
    loop {
        if stopping() {
            return false;
        }
        let reply = device::claim(agent, server, dev);
        let wait = match reply {
            device::Reply::Claimed { token, sensor_id, company } => {
                update::mark_healthy();
                if let Err(e) = device::save_token(&shared.state_dir, &token) {
                    log!("Warning: cannot save the token in {} ({e}); the device will claim again after a restart", shared.state_dir.display());
                }
                shared.set_token(&token);
                {
                    let mut info = lock(&shared.info);
                    info.company = company.clone();
                    info.claim_url.clear();
                    info.note.clear();
                }
                shared.reclaim.store(false, Ordering::SeqCst);
                shared.set_phase(Phase::Booting);
                log!("Device {} claimed{}{}", dev.serial, if company.is_empty() { String::new() } else { format!(" by {company}") }, if sensor_id.is_empty() { String::new() } else { format!(" (sensor {sensor_id})") });
                return true;
            }
            device::Reply::Waiting { claim_url } => {
                update::mark_healthy();
                if shared.phase() == Phase::Retired {
                    log!("Device {} is back in stock: waiting to be claimed again", dev.serial);
                }
                shared.set_phase(Phase::Unclaimed);
                if !url_logged {
                    log!("Waiting to be claimed: scan the QR label or open {} while logged in to angar (checking every 30 s)", if claim_url.is_empty() { "angar → Edge → Sensors → Add a device" } else { &claim_url });
                    url_logged = true;
                }
                let mut info = lock(&shared.info);
                info.claim_url = claim_url;
                info.note.clear();
                backoff = CLAIM_EVERY;
                last_problem.clear();
                CLAIM_EVERY
            }
            device::Reply::Retired => {
                update::mark_healthy();
                if shared.phase() != Phase::Retired {
                    log!("Device {} is retired on the server (HTTP 410): no longer sensing or sending; the status page stays up", dev.serial);
                    retire(shared);
                }
                lock(&shared.info).note.clear();
                RETIRED_RECHECK
            }
            device::Reply::UnknownSerial | device::Reply::BadSecret => {
                update::mark_healthy();
                let msg = if reply == device::Reply::UnknownSerial {
                    format!("Serial {} is not registered on {server} (HTTP 404): check the server URL and the factory registry; retrying every 10 minutes", dev.serial)
                } else {
                    format!("The claim secret for {} was rejected (HTTP 403): device.json does not match the factory registry; retrying every 10 minutes", dev.serial)
                };
                if msg != last_problem {
                    log!("{msg}");
                    last_problem = msg;
                }
                lock(&shared.info).note = if reply == device::Reply::UnknownSerial { "This serial is not registered in angar yet".into() } else { "Device identity rejected by angar: contact support".into() };
                CLAIM_SLOW
            }
            device::Reply::Server(m) | device::Reply::Network(m) => {
                failures += 1;
                if failures <= 3 || failures % 20 == 0 {
                    log!("Claim request failed ({m}); retrying in {}s", backoff.as_secs());
                }
                lock(&shared.info).note = "Cannot reach angar: check the network cable and internet access".into();
                let w = backoff;
                backoff = (backoff * 2).min(CLAIM_MAX_BACKOFF);
                w
            }
        };
        nap(wait);
    }
}

/// `--once`: print the configuration, or on an unclaimed device do one claim check.
fn run_once(a: &Args, agent: &ureq::Agent) -> i32 {
    let mut token = a.token.clone();
    let device = match load_device(a) {
        Ok(d) => d,
        Err(e) if token.is_empty() => {
            eprintln!("angar-edge: {e}");
            return 2;
        }
        Err(_) => None,
    };
    if token.is_empty() {
        token = device::load_token(&state_dir(a.state_dir.clone())).unwrap_or_default();
    }
    if token.is_empty() {
        let Some(dev) = device else {
            eprintln!("angar-edge: {MISSING_TOKEN}");
            return 2;
        };
        let reply = device::claim(agent, &a.server, &dev);
        let mut out = serde_json::json!({ "serial": dev.serial, "model": dev.model, "server": a.server, "version": VERSION });
        let code = match reply {
            device::Reply::Waiting { claim_url } => {
                out["status"] = "unclaimed".into();
                out["claimUrl"] = claim_url.into();
                0
            }
            device::Reply::Claimed { company, .. } => {
                // The token is not saved here (--once often runs as root at the factory); the
                // service's next exchange gets a 401 and claims again, which rotates it anyway.
                out["status"] = "claimed".into();
                out["company"] = company.into();
                0
            }
            device::Reply::Retired => {
                out["status"] = "retired".into();
                1
            }
            device::Reply::UnknownSerial => {
                out["status"] = "unknown-serial".into();
                1
            }
            device::Reply::BadSecret => {
                out["status"] = "bad-secret".into();
                1
            }
            device::Reply::Server(m) | device::Reply::Network(m) => {
                out["status"] = "error".into();
                out["error"] = m.into();
                1
            }
        };
        println!("{}", serde_json::to_string_pretty(&out).unwrap_or_default());
        return code;
    }
    match config::fetch(agent, &a.server, &token) {
        Ok((cfg, _)) => {
            println!("{}", serde_json::to_string_pretty(&cfg).unwrap_or_default());
            0
        }
        Err(FetchError::Unauthorized) => {
            eprintln!("{UNAUTHORIZED}");
            1
        }
        Err(FetchError::Other(m)) => {
            eprintln!("Cannot fetch configuration from {}: {m}", a.server);
            1
        }
    }
}

/// After a self-update: the new version must reach the server within 10 minutes (and must
/// not crash-loop), otherwise the previous binary is restored.
fn arm_rollback(exe: Option<PathBuf>, dir: &Path) {
    let Some(mut m) = update::read_marker(dir) else { return };
    if m.to != VERSION {
        log!("The update to {} did not take effect; running {VERSION}", m.to);
        update::clear_marker(dir);
        return;
    }
    let Some(exe) = exe else {
        update::clear_marker(dir);
        return;
    };
    m.starts += 1;
    let _ = update::write_marker(dir, &m);
    let fail = |why: &str| {
        log!("Update to {VERSION} failed ({why}): restoring {}", m.from);
        update::skip(dir, VERSION);
        match update::rollback(&exe) {
            Ok(()) => {
                update::clear_marker(dir);
                request_exit(update::EXIT_ROLLED_BACK);
            }
            Err(e) => {
                log!("Rollback failed: {e}; staying on {VERSION}");
                update::clear_marker(dir);
            }
        }
    };
    if m.starts > MAX_UPDATED_STARTS {
        fail("restarted too many times");
        return;
    }
    log!("Updated from {} to {VERSION}: confirming within 10 minutes, otherwise {} is restored", m.from, m.from);
    let dir = dir.to_path_buf();
    std::thread::Builder::new()
        .name("rollback".into())
        .spawn(move || {
            let start = Instant::now();
            loop {
                if update::HEALTHY.load(Ordering::SeqCst) {
                    update::clear_marker(&dir);
                    log!("Update to {VERSION} confirmed");
                    return;
                }
                if stopping() {
                    return;
                }
                if start.elapsed() >= update::CONFIRM_WITHIN {
                    log!("Update to {VERSION} failed (no successful exchange with the server in 10 minutes): restoring {}", m.from);
                    update::skip(&dir, VERSION);
                    match update::rollback(&exe) {
                        Ok(()) => {
                            update::clear_marker(&dir);
                            request_exit(update::EXIT_ROLLED_BACK);
                        }
                        Err(e) => {
                            log!("Rollback failed: {e}; staying on {VERSION}");
                            update::clear_marker(&dir);
                        }
                    }
                    return;
                }
                std::thread::sleep(Duration::from_secs(1));
            }
        })
        .ok();
}

fn spawn_updater(exe: PathBuf, dir: PathBuf, base: String) {
    std::thread::Builder::new()
        .name("update".into())
        .spawn(move || {
            if let Err(e) = update::can_replace(&exe) {
                log!("Auto-update off: {e}");
                return;
            }
            log!("Auto-update on: signed releases from {base}, checked daily");
            let up = update::Updater::new(&base, exe, dir);
            nap(UPDATE_FIRST);
            while !stopping() {
                match up.check() {
                    Ok(Some(v)) => {
                        log!("Installed angar-edge {v} (signature verified); restarting");
                        request_exit(update::EXIT_UPDATED);
                        return;
                    }
                    Ok(None) => {}
                    Err(e) => log!("Update check: {e}"),
                }
                nap(UPDATE_EVERY);
            }
        })
        .ok();
}

fn finish(shared: &Shared) -> ! {
    sd::notify("STOPPING=1");
    if shared.phase() != Phase::Retired {
        save_pending(shared);
        log!("Stopped; unsent data saved to {}", shared.state_dir.join("pending.json").display());
    } else {
        log!("Stopped");
    }
    std::process::exit(EXIT_CODE.load(Ordering::SeqCst));
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
        std::process::exit(run_once(&a, &agent));
    }

    let device = match load_device(&a) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("angar-edge: device file: {e}");
            if a.token.is_empty() {
                std::process::exit(2);
            }
            None
        }
    };
    let dir = state_dir(a.state_dir.clone());
    let token = if a.token.is_empty() { device::load_token(&dir).unwrap_or_default() } else { a.token.clone() };
    if token.is_empty() && device.is_none() {
        eprintln!("angar-edge: {MISSING_TOKEN}");
        std::process::exit(2);
    }
    if !token.is_empty() && !token.starts_with("ange_") {
        log!("Warning: the token doesn't look like an angar Edge token (ange_…)");
    }
    let exe = std::env::current_exe().ok();
    arm_rollback(exe.clone(), &dir);

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
    let device_mode = device.is_some();
    log!(
        "angar-edge {VERSION} starting — server {}, host IP {}, state {}{}",
        a.server,
        host_ip.map(|i| i.to_string()).unwrap_or_else(|| "unknown".into()),
        dir.display(),
        device.as_ref().map(|d| format!(", device {}", d.serial)).unwrap_or_default()
    );
    let shared = Arc::new(Shared::new(Runtime::new(EdgeConfig::default()), upstreams, dir.clone(), a.verbose, device));
    shared.set_token(&token);
    sd::write_state(Phase::Booting.as_str());

    match (a.status_port, device_mode) {
        (Some(0), _) | (None, false) => {}
        (Some(p), _) => status::start(shared.clone(), p, None),
        (None, true) => status::start(shared.clone(), 80, Some(8080)),
    }
    sd::spawn_watchdog();
    sd::notify("READY=1");
    if a.auto_update.unwrap_or(device_mode) {
        match exe.clone() {
            Some(exe) => spawn_updater(exe, dir.clone(), a.update_url.clone()),
            None => log!("Auto-update off: cannot locate the running executable"),
        }
    }

    // Token (claim on a device) and first configuration.
    let cfg = loop {
        if stopping() {
            finish(&shared);
        }
        if shared.token().is_empty() && !claim_until_token(&shared, &agent, &a.server) {
            finish(&shared);
        }
        match initial_config(&agent, &a.server, &shared) {
            Init::Config(cfg) => break cfg,
            Init::Reclaim => {
                shared.set_token("");
                device::forget_token(&dir);
            }
            Init::Stopped => finish(&shared),
        }
    };
    log!("Configuration: {}", describe(&cfg));
    shared.set_rt(Runtime::new(cfg));

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
    spawn_config_refresh(shared.clone(), agent.clone(), a.server.clone());
    spawn_reporter(shared.clone(), agent.clone(), a.server.clone());

    let (mut dns_on, mut syslog_on, mut scan_on) = (false, false, false);
    let mut last_save = Instant::now();
    while !stopping() {
        sd::beat();
        if shared.device_mode() && shared.reclaim_requested() {
            log!("{DEVICE_UNAUTHORIZED}");
            shared.set_token("");
            device::forget_token(&dir);
            if !claim_until_token(&shared, &agent, &a.server) {
                break;
            }
            refresh_config_now(&shared, &agent, &a.server);
        }
        if shared.phase() == Phase::Retired && shared.token().is_empty() {
            // wait for the server to put the device back in stock (checked every 6 h)
            if !claim_until_token(&shared, &agent, &a.server) {
                break;
            }
            refresh_config_now(&shared, &agent, &a.server);
        }
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
    finish(&shared);
}

/// Right after a (re)claim: load the configuration for the new token.
fn refresh_config_now(shared: &Shared, agent: &ureq::Agent, server: &str) {
    match config::fetch(agent, server, &shared.token()) {
        Ok((cfg, text)) => {
            log!("Configuration: {}", describe(&cfg));
            config::save_cached(&shared.state_dir, &text);
            shared.set_rt(Runtime::new(cfg));
        }
        Err(FetchError::Unauthorized) => shared.reclaim.store(true, Ordering::SeqCst),
        Err(FetchError::Other(m)) => log!("Cannot fetch configuration ({m}); retrying in 10 minutes"),
    }
}

fn save_pending(shared: &Shared) {
    if shared.phase() == Phase::Retired {
        return;
    }
    let mut st = lock(&shared.stats);
    if st.dirty {
        if let Err(e) = st.save(&shared.state_dir) {
            log!("Cannot save unsent data in {}: {e}", shared.state_dir.display());
            st.dirty = false; // don't spam every minute
        }
    }
}

/// Not sending right now: no token yet, retired, or waiting for a re-claim.
fn paused(shared: &Shared) -> bool {
    shared.token().is_empty() || shared.phase() == Phase::Retired || shared.reclaim_requested()
}

fn spawn_config_refresh(shared: Arc<Shared>, agent: ureq::Agent, server: String) {
    std::thread::Builder::new()
        .name("config".into())
        .spawn(move || {
            let mut warned_401 = false;
            loop {
                nap(CONFIG_EVERY);
                if stopping() {
                    return;
                }
                if paused(&shared) {
                    continue;
                }
                match config::fetch(&agent, &server, &shared.token()) {
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
                    Err(FetchError::Unauthorized) if shared.device_mode() => shared.reclaim.store(true, Ordering::SeqCst),
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

/// online / offline (no accepted report for 15 minutes) for the status page and LED.
fn update_online(shared: &Shared, ok: bool) {
    if shared.phase() == Phase::Retired || shared.phase() == Phase::Unclaimed {
        return;
    }
    if ok {
        shared.set_phase(Phase::Online);
        return;
    }
    let last = shared.last_report.load(Ordering::Relaxed);
    let since = if last > 0 { util::now_secs() - last } else { shared.started.elapsed().as_secs() as i64 };
    if since >= OFFLINE_AFTER {
        shared.set_phase(Phase::Offline);
    }
}

fn spawn_reporter(shared: Arc<Shared>, agent: ureq::Agent, server: String) {
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
                if paused(&shared) {
                    wait = Duration::from_secs(5);
                    continue;
                }
                let every = Duration::from_secs(shared.rt().cfg.report_every());
                let host_ip = scan::primary_ip().map(|i: IpAddr| i.to_string()).unwrap_or_default();
                match report::send(&shared, &agent, &server, &shared.token(), &host_ip) {
                    report::Outcome::Sent { events, candidates, more, counters } => {
                        update::mark_healthy();
                        shared.last_report.store(util::now_secs(), Ordering::Relaxed);
                        {
                            let mut t = lock(&shared.totals);
                            t.counters.dns_queries += counters.dns_queries;
                            t.counters.ai_queries += counters.ai_queries;
                            t.counters.blocked += counters.blocked;
                            t.counters.log_lines += counters.log_lines;
                            t.events += events as u64;
                            t.reports += 1;
                        }
                        update_online(&shared, true);
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
                    report::Outcome::Unauthorized if shared.device_mode() => {
                        shared.reclaim.store(true, Ordering::SeqCst);
                        wait = Duration::from_secs(5);
                    }
                    report::Outcome::Unauthorized => {
                        if failures == 0 {
                            log!("{UNAUTHORIZED} Data is kept and retried every 15 minutes.");
                        }
                        failures += 1;
                        update_online(&shared, false);
                        wait = Duration::from_secs(900);
                    }
                    report::Outcome::Failed(m) => {
                        if failures < 3 || failures % 12 == 0 {
                            log!("Report failed ({m}); data kept for the next attempt");
                        }
                        failures += 1;
                        update_online(&shared, false);
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

    #[test]
    fn unit_is_notify_with_watchdog() {
        let unit = include_str!("../angar-edge.service");
        for line in ["Type=notify", "WatchdogSec=60", "Restart=always", "RuntimeDirectory=angar-edge", "AmbientCapabilities=CAP_NET_BIND_SERVICE", "EnvironmentFile=-/etc/angar-edge.env"] {
            assert!(unit.lines().any(|l| l == line), "angar-edge.service must contain {line}");
        }
    }
}

