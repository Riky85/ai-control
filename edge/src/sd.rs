// systemd integration without crates: sd_notify (READY/WATCHDOG/STOPPING/STATUS) over
// $NOTIFY_SOCKET and the state file read by the LED hook (/run/angar-edge/state).
use std::path::PathBuf;
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::Duration;

/// Send one sd_notify message. No-op when not started by systemd (Type=notify).
#[cfg(target_os = "linux")]
pub fn notify(msg: &str) -> bool {
    match std::env::var_os("NOTIFY_SOCKET") {
        Some(path) => notify_to(&path, msg),
        None => false,
    }
}

#[cfg(target_os = "linux")]
fn notify_to(path: &std::ffi::OsStr, msg: &str) -> bool {
    use std::os::unix::net::UnixDatagram;
    let Ok(sock) = UnixDatagram::unbound() else { return false };
    let bytes = path.as_encoded_bytes();
    if let Some(name) = bytes.strip_prefix(b"@") {
        use std::os::linux::net::SocketAddrExt;
        match std::os::unix::net::SocketAddr::from_abstract_name(name) {
            Ok(addr) => sock.send_to_addr(msg.as_bytes(), &addr).is_ok(),
            Err(_) => false,
        }
    } else {
        sock.send_to(msg.as_bytes(), PathBuf::from(path)).is_ok()
    }
}
#[cfg(not(target_os = "linux"))]
pub fn notify(_msg: &str) -> bool {
    false
}

/// WatchdogSec from $WATCHDOG_USEC (only if meant for this process, per $WATCHDOG_PID).
pub fn watchdog_interval() -> Option<Duration> {
    let usec: u64 = std::env::var("WATCHDOG_USEC").ok()?.parse().ok()?;
    if let Ok(pid) = std::env::var("WATCHDOG_PID") {
        if pid.parse::<u32>().ok()? != std::process::id() {
            return None;
        }
    }
    (usec > 0).then(|| Duration::from_micros(usec))
}

static BEAT: AtomicI64 = AtomicI64::new(0);

fn mono_secs() -> i64 {
    use std::sync::OnceLock;
    use std::time::Instant;
    static T0: OnceLock<Instant> = OnceLock::new();
    T0.get_or_init(Instant::now).elapsed().as_secs() as i64
}

/// Heartbeat of the main thread: the watchdog ping stops if the main loop hangs.
pub fn beat() {
    BEAT.store(mono_secs(), Ordering::Relaxed);
}

/// Ping WATCHDOG=1 every WatchdogSec/2 while the main thread keeps beating.
/// A stuck main thread (no beat for 3/4 of WatchdogSec) stops the pings and systemd restarts us.
pub fn spawn_watchdog() {
    let Some(every) = watchdog_interval() else { return };
    beat();
    std::thread::Builder::new()
        .name("watchdog".into())
        .spawn(move || {
            let half = (every / 2).max(Duration::from_secs(1));
            let stale = (every.as_secs() as i64 * 3 / 4).max(2);
            loop {
                if mono_secs() - BEAT.load(Ordering::Relaxed) < stale {
                    notify("WATCHDOG=1");
                }
                std::thread::sleep(half);
            }
        })
        .ok();
}

fn state_path() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("ANGAR_EDGE_STATE_FILE") {
        return Some(PathBuf::from(p));
    }
    // systemd RuntimeDirectory=angar-edge sets $RUNTIME_DIRECTORY
    let dir = std::env::var_os("RUNTIME_DIRECTORY").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/run/angar-edge"));
    dir.is_dir().then(|| dir.join("state"))
}

/// booting | unclaimed | online | offline | retired → /run/angar-edge/state (atomic replace).
pub fn write_state(state: &str) {
    let Some(p) = state_path() else { return };
    let tmp = p.with_extension("tmp");
    if std::fs::write(&tmp, format!("{state}\n")).is_ok() {
        let _ = std::fs::rename(&tmp, &p);
    }
    notify(&format!("STATUS={state}"));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn notify_datagram() {
        let dir = std::env::temp_dir().join(format!("angar-sd-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let sock = dir.join("notify");
        let _ = std::fs::remove_file(&sock);
        let rx = std::os::unix::net::UnixDatagram::bind(&sock).unwrap();
        assert!(notify_to(sock.as_os_str(), "READY=1"));
        let mut buf = [0u8; 64];
        let n = rx.recv(&mut buf).unwrap();
        assert_eq!(&buf[..n], b"READY=1");
        let _ = std::fs::remove_dir_all(dir);
    }
}
