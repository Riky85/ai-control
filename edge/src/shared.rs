// Stato condiviso fra i thread.
use crate::config::Runtime;
use crate::names::Names;
use crate::stats::Stats;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use std::time::Instant;

pub struct Shared {
    runtime: RwLock<Arc<Runtime>>,
    pub stats: Mutex<Stats>,
    pub names: Names,
    pub upstreams: Vec<SocketAddr>,
    pub state_dir: PathBuf,
    pub verbose: bool,
    pub started: Instant,
}

impl Shared {
    pub fn new(rt: Runtime, upstreams: Vec<SocketAddr>, state_dir: PathBuf, verbose: bool) -> Shared {
        Shared {
            runtime: RwLock::new(Arc::new(rt)),
            stats: Mutex::new(Stats::default()),
            names: Names::new(),
            upstreams,
            state_dir,
            verbose,
            started: Instant::now(),
        }
    }

    pub fn rt(&self) -> Arc<Runtime> {
        self.runtime.read().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn set_rt(&self, rt: Runtime) {
        *self.runtime.write().unwrap_or_else(|e| e.into_inner()) = Arc::new(rt);
    }

    /// Client label for events: "*" in anonymous mode, else the IP (and queue a PTR lookup).
    pub fn client_label(&self, rt: &Runtime, ip: IpAddr) -> String {
        if rt.cfg.anonymous() {
            return "*".into();
        }
        self.names.want(ip);
        ip.to_string()
    }
}
