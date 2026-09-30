// angar desktop agent.
//
// Tells the company which AI tools are used at work, without a browser
// extension: it reads (locally) the browser history of Chrome, Edge, Brave,
// Arc, Vivaldi, Opera, Firefox and Safari, the running AI desktop apps and the
// AI extensions installed in code editors. Everything is matched on this
// computer against the public angar catalog: only AI service names, visits
// and minutes leave the machine — never URLs, pages, prompts or other browsing.
#![cfg_attr(windows, windows_subsystem = "windows")]

mod config;
mod detect;
mod gui;
mod install;
mod ui;

use config::{Config, DEFAULT_SERVER};
use detect::{Catalog, Usage};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
const SYNC_EVERY: Duration = Duration::from_secs(30 * 60);
const SAMPLE_EVERY: Duration = Duration::from_secs(60);
/// On the first sync, look back this far so the dashboard fills up at once.
const FIRST_LOOKBACK_MS: i64 = 30 * 24 * 3600 * 1000;

pub fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

#[derive(Default)]
struct Args {
    join: Option<String>,
    email: Option<String>,
    email_domain: Option<String>,
    server: Option<String>,
    silent: bool,
    run: bool,
    once: bool,
    uninstall: bool,
    status: bool,
    no_install: bool,
    notice: bool,
}

fn parse_args() -> Args {
    let mut a = Args::default();
    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        let (key, inline) = match arg.split_once('=') {
            Some((k, v)) => (k.to_string(), Some(v.to_string())),
            None => (arg.clone(), None),
        };
        let val = |it: &mut std::iter::Skip<std::env::Args>| inline.clone().or_else(|| it.next());
        match key.trim_start_matches('-').replace('_', "-").as_str() {
            "join" | "code" => a.join = val(&mut it),
            "email" => a.email = val(&mut it),
            "email-domain" => a.email_domain = val(&mut it),
            "server" => a.server = val(&mut it),
            "silent" | "quiet" => a.silent = true,
            "run" => a.run = true,
            "once" => a.once = true,
            "uninstall" => a.uninstall = true,
            "status" => a.status = true,
            "no-install" => a.no_install = true,
            "notice" => a.notice = true,
            "version" => {
                println!("angar {VERSION}");
                std::process::exit(0);
            }
            "help" | "h" => {
                println!("{}", HELP);
                std::process::exit(0);
            }
            _ => {}
        }
    }
    a
}

const HELP: &str = "angar desktop agent

  angar                      set up (company from the file name) and start
  angar --join CODE          set up for the company with this join code
        --email you@co.com   work email (otherwise asked, or taken from Windows)
        --email-domain co.com  email = <login name>@co.com (for IT roll-outs)
        --silent             no windows (for Intune / Jamf / scripts)
        --server URL         angar server (default: the angar cloud)
  angar --once               scan now, send, print what was sent
  angar --status             show the configuration
  angar --uninstall          stop and remove angar from this computer";

fn main() {
    let args = parse_args();
    // The background copy never opens windows.
    let silent = args.silent || args.run;
    let mut cfg = Config::load();
    // --server / ANGAR_SERVER, else the server in the downloaded file's name (on-premises).
    if let Some(s) = args.server.clone().or_else(|| std::env::var("ANGAR_SERVER").ok()).or_else(install::server_from_file_name) {
        cfg.server = s.trim_end_matches('/').to_string();
    }
    if cfg.server.is_empty() {
        cfg.server = DEFAULT_SERVER.to_string();
    }

    if args.notice {
        // Company notice, opened by the background copy in its own process.
        let title = std::env::var("ANGAR_NOTICE_TITLE").unwrap_or_else(|_| "angar".into());
        let body = std::env::var("ANGAR_NOTICE_BODY").unwrap_or_default();
        if gui::message(&title, &body, gui::Tone::Warning).is_err() {
            ui::message(&format!("{title}\n\n{body}"));
        }
        return;
    }
    if args.uninstall {
        install::uninstall();
        if !silent && gui::message("angar was removed", "It no longer runs on this computer. You can install it again at any time from your company's angar link.", gui::Tone::Success).is_err() {
            ui::message("angar was removed from this computer.");
        }
        return;
    }
    if args.status {
        println!("server:  {}\ncompany: {}\nemail:   {}\ntoken:   {}\nlast sync: {}", cfg.server, cfg.company.as_deref().unwrap_or("-"), cfg.email.as_deref().unwrap_or("-"), if cfg.token.is_some() { "set" } else { "missing" }, cfg.last_sync_ms.map(|t| t.to_string()).unwrap_or("-".into()));
        return;
    }

    // Setup: company (join code) and work email.
    let code = args.join.clone().or_else(install::join_code_from_file_name);
    if !silent && !args.once {
        let input = gui::SetupInput {
            cfg: cfg.clone(),
            code: code.clone(),
            join_explicit: args.join.is_some(),
            email_arg: args.email.clone(),
            email_domain: args.email_domain.clone(),
            no_install: args.no_install,
        };
        match gui::setup(input) {
            Ok(gui::Outcome::Exit) => return,
            Ok(gui::Outcome::RunForeground(c)) => return run_loop(c),
            // No window possible here (e.g. no OpenGL): plain system dialogs below.
            Err(e) => eprintln!("window unavailable ({e}); using system dialogs"),
        }
    }
    // Already set up and the person opened a new download: update (keep the
    // link) or set it up again with another email / company.
    let mut updating = false;
    if !silent && !args.run && !args.once && args.join.is_none() && cfg.token.is_some() && cfg.email.is_some() {
        let company = cfg.company.clone().unwrap_or_else(|| "your company".into());
        let email = cfg.email.clone().unwrap_or_default();
        match ui::choose(
            &format!("angar is already set up on this computer.\n\nCompany: {company}\nEmail: {email}\n\nUpdate to version {VERSION} and keep these settings?"),
            "Update",
            "Set up again",
        ) {
            None => return,
            Some(true) => updating = true,
            Some(false) => {
                // Start over: forget company and email, keep the history already sent.
                cfg.token = None;
                cfg.company = None;
                cfg.email = None;
                cfg.last_sync_ms = None;
                cfg.save();
            }
        }
    }
    if cfg.token.is_none() || code.is_some() && args.join.is_some() {
        let Some(code) = code else {
            if !silent {
                ui::message("This copy of angar is not linked to a company.\n\nDownload it again from your company's angar link, or ask IT.");
            }
            eprintln!("No join code: pass --join CODE");
            std::process::exit(2);
        };
        match join(&cfg.server, &code) {
            Ok((token, company)) => {
                cfg.token = Some(token);
                cfg.company = Some(company);
            }
            Err(e) => {
                if !silent {
                    ui::message(&format!("angar could not reach your company's workspace.\n\n{e}\n\nCheck the internet connection and try again."));
                }
                eprintln!("join failed: {e}");
                std::process::exit(3);
            }
        }
    }
    if let Some(e) = args.email.clone() {
        cfg.email = valid_email(&e);
    }
    if cfg.email.is_none() {
        cfg.email = install::os_email(args.email_domain.as_deref());
    }
    if cfg.email.is_none() && !silent {
        let company = cfg.company.clone().unwrap_or_else(|| "your company".into());
        let mut prompt = format!("Welcome to angar 👋\n\n{company} uses angar to see which AI tools are used at work — only the AI names and the time spent, never what you type.\n\nEnter your work email to finish:");
        loop {
            match ui::ask(&prompt, "") {
                None => std::process::exit(0),
                Some(e) => match valid_email(&e) {
                    Some(v) => {
                        cfg.email = Some(v);
                        break;
                    }
                    None => prompt = "That doesn't look like an email. Your work email:".into(),
                },
            }
        }
    }
    cfg.save();

    if args.once {
        let catalog = Catalog::fetch_or_cached(&cfg);
        let usage = Usage::default();
        let since = cfg.last_sync_ms.unwrap_or(now_ms() - FIRST_LOOKBACK_MS);
        let findings = detect::scan(&catalog, since, &usage);
        println!("{}", serde_json::to_string_pretty(&findings).unwrap_or_default());
        match send(&cfg, &findings) {
            Ok(r) => {
                println!("sent: {r}");
                cfg.last_sync_ms = Some(now_ms());
                cfg.save();
            }
            Err(e) => eprintln!("send failed: {e}"),
        }
        return;
    }

    if !args.run && !args.no_install {
        // First launch from the download: install, start in the background, say so.
        match install::install_and_start() {
            Ok(()) => {
                if !silent && updating {
                    let company = cfg.company.clone().unwrap_or_else(|| "your company".into());
                    let email = cfg.email.clone().unwrap_or_default();
                    ui::message(&format!("angar updated to version {VERSION} ✓\n\nStill linked to {company} as {email}. It keeps running in the background.\n\nYou can close this window."));
                } else if !silent {
                    let company = cfg.company.clone().unwrap_or_else(|| "your company".into());
                    let who = cfg.email.as_deref().map(|e| format!("\n\nSigned in as {e}.")).unwrap_or_default();
                    ui::message(&format!("Welcome to angar 👋 (version {VERSION})\n\nYou're all set — angar is now on and runs quietly in the background. It tells {company} which AI tools are used at work and for how long, so nobody pays for seats they don't need.\n\nIt only ever shares the names of AI tools and the time spent — never the pages you open, what you type, or anything else you do.{who}\n\nYou can close this window."));
                }
                return;
            }
            Err(e) => {
                eprintln!("install failed ({e}); running in the foreground");
            }
        }
    }
    run_loop(cfg);
}

/// Messages from the company (e.g. an AI that isn't approved), shown once each
/// in their own window so the app keeps running.
fn show_notices(cfg: &mut Config, body: &str) {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(body) else { return };
    let Some(list) = v["notices"].as_array() else { return };
    for n in list {
        let key = n["key"].as_str().unwrap_or_default().to_string();
        let msg = n["message"].as_str().unwrap_or_default().to_string();
        if key.is_empty() || msg.is_empty() || cfg.shown_notices.contains(&key) {
            continue;
        }
        cfg.shown_notices.push(key);
        let title = n["title"].as_str().unwrap_or("angar").to_string();
        // Own process: the window needs the main thread, this one keeps scanning.
        let spawned = std::env::current_exe().and_then(|exe| {
            std::process::Command::new(exe).arg("--notice").env("ANGAR_NOTICE_TITLE", &title).env("ANGAR_NOTICE_BODY", &msg).spawn()
        });
        if spawned.is_err() {
            std::thread::spawn(move || ui::message(&format!("{title}\n\n{msg}")));
        }
    }
    let len = cfg.shown_notices.len();
    if len > 200 {
        cfg.shown_notices.drain(..len - 200);
    }
    cfg.save();
}

/// Il server chiede di rimandare la cronologia (dati azzerati dopo l'ultimo invio).
fn wants_resync(body: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(body).map(|v| v["resync"] == serde_json::Value::Bool(true)).unwrap_or(false)
}

fn valid_email(e: &str) -> Option<String> {
    let e = e.trim().to_lowercase();
    let (user, domain) = e.split_once('@')?;
    if user.is_empty() || !domain.contains('.') || domain.starts_with('.') || domain.ends_with('.') || e.contains(char::is_whitespace) || e.len() > 200 {
        return None;
    }
    Some(e)
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new().timeout(Duration::from_secs(30)).user_agent(&format!("angar-desktop/{VERSION}")).build()
}

fn join(server: &str, code: &str) -> Result<(String, String), String> {
    let url = format!("{server}/api/discovery/desktop/join/{code}");
    let r: serde_json::Value = agent().get(&url).call().map_err(|e| match e {
        ureq::Error::Status(404, _) => "This company link is not valid any more.".to_string(),
        other => other.to_string(),
    })?.into_json().map_err(|e| e.to_string())?;
    let token = r["token"].as_str().ok_or("no token")?.to_string();
    let company = r["company"].as_str().unwrap_or("your company").to_string();
    Ok((token, company))
}

fn device_name() -> String {
    let host = sysinfo::System::host_name().unwrap_or_else(|| "computer".into());
    format!("Desktop app · {host}")
}

fn send(cfg: &Config, findings: &[detect::Finding]) -> Result<String, String> {
    let token = cfg.token.as_deref().ok_or("not linked to a company")?;
    let body = serde_json::json!({
        "user": cfg.email,
        "device": device_name(),
        "source": "desktop",
        "version": VERSION,
        "os": std::env::consts::OS,
        "ips": local_ips(),
        "findings": findings,
        // Da quando manda i dati: se l'azienda ha azzerato angar dopo, il server chiede di rimandarli.
        "since": cfg.last_sync_ms,
    });
    let r = agent()
        .post(&format!("{}/api/discovery/usage", cfg.server))
        .set("Authorization", &format!("Bearer {token}"))
        .send_json(body)
        .map_err(|e| e.to_string())?;
    Ok(r.into_string().unwrap_or_default())
}

/// Local IPs of this computer (primary IPv4/IPv6 via the UDP-connect trick: no packet is sent).
/// angar Edge uses them to tell whose computer a network address belongs to.
fn local_ips() -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for (bind, target) in [("0.0.0.0:0", "8.8.8.8:80"), ("[::]:0", "[2001:4860:4860::8888]:80")] {
        let ip = std::net::UdpSocket::bind(bind).and_then(|s| s.connect(target).and_then(|_| s.local_addr()));
        if let Ok(addr) = ip {
            let ip = addr.ip();
            if !ip.is_unspecified() && !ip.is_loopback() && !out.contains(&ip.to_string()) {
                out.push(ip.to_string());
            }
        }
    }
    out
}

fn run_loop(mut cfg: Config) {
    if !install::single_instance() {
        return;
    }
    let mut catalog = Catalog::fetch_or_cached(&cfg);
    let mut catalog_at = Instant::now();
    let mut usage = Usage::default();
    // First sync two minutes after start (not during login rush), then every 30 minutes.
    let mut next_sync = Instant::now() + Duration::from_secs(120);
    loop {
        usage.sample(&catalog);
        if Instant::now() >= next_sync {
            if catalog_at.elapsed() > Duration::from_secs(24 * 3600) {
                catalog = Catalog::fetch_or_cached(&cfg);
                catalog_at = Instant::now();
            }
            let started = now_ms();
            let since = cfg.last_sync_ms.unwrap_or(started - FIRST_LOOKBACK_MS);
            let findings = detect::scan(&catalog, since, &usage);
            // Always send (also empty): it tells the company the computer is still connected.
            let reply = send(&cfg, &findings);
            let ok = reply.is_ok();
            let mut resync = false;
            if let Ok(body) = &reply {
                show_notices(&mut cfg, body);
                resync = wants_resync(body);
            }
            if ok && resync {
                // L'azienda ha azzerato i dati: al prossimo giro si rimandano gli ultimi 30 giorni.
                cfg.last_sync_ms = None;
                cfg.save();
                next_sync = Instant::now();
            } else if ok {
                cfg.last_sync_ms = Some(started);
                cfg.save();
                usage = Usage::default();
                next_sync = Instant::now() + SYNC_EVERY;
            } else {
                // Offline: keep what was collected and retry sooner.
                next_sync = Instant::now() + Duration::from_secs(5 * 60);
            }
        }
        std::thread::sleep(SAMPLE_EVERY);
    }
}

#[cfg(test)]
mod ip_tests {
    #[test]
    fn local_ips_are_valid() {
        let ips = super::local_ips();
        assert!(ips.len() <= 2);
        for ip in ips {
            let p: std::net::IpAddr = ip.parse().unwrap();
            assert!(!p.is_loopback() && !p.is_unspecified());
        }
    }
}
