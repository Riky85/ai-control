// Stato condiviso fra i thread.
use crate::config::Runtime;
use crate::device::Device;
use crate::names::Names;
use crate::stats::{Counters, Stats};
use crate::util::lock;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::Instant;

/// Lifecycle shown on the status page and written to /run/angar-edge/state (LED hook).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Booting,
    Unclaimed,
    Online,
    Offline,
    Retired,
}

impl Phase {
    pub fn as_str(self) -> &'static str {
        match self {
            Phase::Booting => "booting",
            Phase::Unclaimed => "unclaimed",
            Phase::Online => "online",
            Phase::Offline => "offline",
            Phase::Retired => "retired",
        }
    }
}

/// Non-secret facts for the status page.
#[derive(Default, Clone, Debug)]
pub struct Info {
    pub company: String,
    pub sensor_name: String,
    pub claim_url: String,
    /// Short human note, e.g. "Cannot reach angar" (never a secret).
    pub note: String,
}

/// Totals since start, counted when a report is accepted by the server.
#[derive(Default, Clone, Debug)]
pub struct Totals {
    pub counters: Counters,
    pub events: u64,
    pub reports: u64,
}

pub struct Shared {
    runtime: RwLock<Arc<Runtime>>,
    token: RwLock<String>,
    phase: Mutex<Phase>,
    pub stats: Mutex<Stats>,
    pub names: Names,
    pub upstreams: Vec<SocketAddr>,
    pub state_dir: PathBuf,
    pub verbose: bool,
    pub started: Instant,
    pub device: Option<Device>,
    pub info: Mutex<Info>,
    pub totals: Mutex<Totals>,
    /// Unix seconds of the last accepted report (0 = never).
    pub last_report: AtomicI64,
    /// Device mode: the token was rejected, the main thread must claim again.
    pub reclaim: AtomicBool,
}

impl Shared {
    pub fn new(rt: Runtime, upstreams: Vec<SocketAddr>, state_dir: PathBuf, verbose: bool, device: Option<Device>) -> Shared {
        Shared {
            runtime: RwLock::new(Arc::new(rt)),
            token: RwLock::new(String::new()),
            phase: Mutex::new(Phase::Booting),
            stats: Mutex::new(Stats::default()),
            names: Names::new(),
            upstreams,
            state_dir,
            verbose,
            started: Instant::now(),
            device,
            info: Mutex::new(Info::default()),
            totals: Mutex::new(Totals::default()),
            last_report: AtomicI64::new(0),
            reclaim: AtomicBool::new(false),
        }
    }

    pub fn rt(&self) -> Arc<Runtime> {
        self.runtime.read().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn set_rt(&self, rt: Runtime) {
        {
            let mut info = lock(&self.info);
            if !rt.cfg.company.is_empty() {
                info.company = rt.cfg.company.clone();
            }
            if !rt.cfg.name.is_empty() {
                info.sensor_name = rt.cfg.name.clone();
            }
        }
        *self.runtime.write().unwrap_or_else(|e| e.into_inner()) = Arc::new(rt);
    }

    pub fn token(&self) -> String {
        self.token.read().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn set_token(&self, t: &str) {
        *self.token.write().unwrap_or_else(|e| e.into_inner()) = t.trim().to_string();
    }

    pub fn phase(&self) -> Phase {
        *lock(&self.phase)
    }

    /// Change the phase; the LED/state file is rewritten only on a change.
    pub fn set_phase(&self, p: Phase) {
        let mut cur = lock(&self.phase);
        if *cur != p {
            *cur = p;
            drop(cur);
            crate::sd::write_state(p.as_str());
        }
    }

    pub fn device_mode(&self) -> bool {
        self.device.is_some()
    }

    /// Client label for events: "*" in anonymous mode, else the IP (and queue a PTR lookup).
    pub fn client_label(&self, rt: &Runtime, ip: IpAddr) -> String {
        if rt.cfg.anonymous() {
            return "*".into();
        }
        self.names.want(ip);
        ip.to_string()
    }

    pub fn reclaim_requested(&self) -> bool {
        self.reclaim.load(Ordering::SeqCst)
    }
}
