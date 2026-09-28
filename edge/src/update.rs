// Signed self-update from the edge-latest release (docs/edge-protocol.md "Signed updates").
//
// angar-edge-version.txt → if newer: angar-edge-linux-<arch> + .sig (base64 ed25519 over the
// binary bytes), verified with the public key built in here. Unsigned or badly signed binaries
// are refused. The executable is swapped atomically (<exe>.new → <exe>, previous kept as
// <exe>.prev) and the process exits with EXIT_UPDATED so systemd starts the new one. If the new
// version does not reach the server within 10 minutes, it restores <exe>.prev and exits.
use std::cmp::Ordering;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering as AtOrd};
use std::time::Duration;

/// Raw 32-byte ed25519 public key (base64). The private seed is the EDGE_SIGNING_KEY CI secret.
pub const EDGE_UPDATE_PUBKEY: &str = "T6vTxDdHRBSWI52KNuPmzd+P/w5v1yXHBDhDSM14VVg=";
pub const DEFAULT_BASE: &str = "https://github.com/Riky85/ai-control/releases/download/edge-latest";
pub const MAX_BINARY: u64 = 50 * 1024 * 1024;
/// Exit codes (Restart=always restarts on both).
pub const EXIT_UPDATED: i32 = 75;
pub const EXIT_ROLLED_BACK: i32 = 76;
pub const CONFIRM_WITHIN: Duration = Duration::from_secs(600);
const MARKER: &str = "update.json";
const SKIP: &str = "update-skip";

/// Set once the server accepted a report (or answered a claim): the running binary works.
pub static HEALTHY: AtomicBool = AtomicBool::new(false);

pub fn mark_healthy() {
    HEALTHY.store(true, AtOrd::SeqCst);
}

// ---------- semver ----------

struct Ver<'a> {
    core: [u64; 3],
    pre: Vec<&'a str>,
}

fn parse(v: &str) -> Option<Ver<'_>> {
    let v = v.trim();
    let v = v.strip_prefix('v').unwrap_or(v);
    let v = v.split('+').next()?; // build metadata is ignored
    let (core, pre) = match v.split_once('-') {
        Some((c, p)) => (c, p.split('.').collect::<Vec<_>>()),
        None => (v, vec![]),
    };
    if pre.iter().any(|p| p.is_empty()) {
        return None;
    }
    let mut n = core.split('.');
    let mut c = [0u64; 3];
    for slot in c.iter_mut() {
        let p = n.next()?;
        if p.is_empty() || !p.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        *slot = p.parse().ok()?;
    }
    n.next().is_none().then_some(Ver { core: c, pre })
}

/// Semantic version order (1.2.3 < 1.10.0, 1.0.0-rc.1 < 1.0.0). None if either is not semver.
pub fn compare(a: &str, b: &str) -> Option<Ordering> {
    let (a, b) = (parse(a)?, parse(b)?);
    let o = a.core.cmp(&b.core);
    if o != Ordering::Equal {
        return Some(o);
    }
    Some(match (a.pre.is_empty(), b.pre.is_empty()) {
        (true, true) => Ordering::Equal,
        (true, false) => Ordering::Greater,
        (false, true) => Ordering::Less,
        (false, false) => {
            for (x, y) in a.pre.iter().zip(b.pre.iter()) {
                let o = match (x.parse::<u64>(), y.parse::<u64>()) {
                    (Ok(i), Ok(j)) => i.cmp(&j),
                    (Ok(_), Err(_)) => Ordering::Less,
                    (Err(_), Ok(_)) => Ordering::Greater,
                    (Err(_), Err(_)) => x.cmp(y),
                };
                if o != Ordering::Equal {
                    return Some(o);
                }
            }
            a.pre.len().cmp(&b.pre.len())
        }
    })
}

pub fn is_newer(candidate: &str, current: &str) -> bool {
    compare(candidate, current) == Some(Ordering::Greater)
}

// ---------- signatures ----------

/// Standard base64 (padding optional, whitespace ignored).
pub fn b64decode(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let (mut acc, mut bits) = (0u32, 0u32);
    let mut pad = false;
    for c in s.bytes().filter(|c| !c.is_ascii_whitespace()) {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' => {
                pad = true;
                continue;
            }
            _ => return None,
        };
        if pad {
            return None; // data after padding
        }
        acc = (acc << 6) | v as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Some(out)
}

pub fn verify_with(pubkey: &[u8], data: &[u8], sig_b64: &str) -> Result<(), String> {
    let pk = ed25519_compact::PublicKey::from_slice(pubkey).map_err(|_| "invalid public key".to_string())?;
    let raw = b64decode(sig_b64).ok_or("signature is not base64")?;
    let sig = ed25519_compact::Signature::from_slice(&raw).map_err(|_| format!("signature must be 64 bytes, got {}", raw.len()))?;
    pk.verify(data, &sig).map_err(|_| "bad signature".to_string())
}

/// Verify with the key built into this binary.
pub fn verify(data: &[u8], sig_b64: &str) -> Result<(), String> {
    let pk = b64decode(EDGE_UPDATE_PUBKEY).ok_or("bad built-in key")?;
    verify_with(&pk, data, sig_b64)
}

// ---------- files ----------

fn sibling(exe: &Path, suffix: &str) -> PathBuf {
    let mut name = exe.file_name().map(|n| n.to_os_string()).unwrap_or_default();
    name.push(suffix);
    exe.with_file_name(name)
}

fn sync_dir(dir: &Path) {
    if let Ok(d) = std::fs::File::open(dir) {
        let _ = d.sync_all();
    }
}

fn write_exec(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let _ = std::fs::remove_file(path);
    let mut o = std::fs::OpenOptions::new();
    o.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        o.mode(0o755);
    }
    let mut f = o.open(path)?;
    f.write_all(bytes)?;
    f.sync_all()
}

/// Can we write next to the executable? (read-only /usr/local/bin → auto-update is off)
pub fn can_replace(exe: &Path) -> Result<(), String> {
    let probe = sibling(exe, ".new");
    write_exec(&probe, b"").map_err(|e| format!("cannot write {}: {e}", probe.display()))?;
    let _ = std::fs::remove_file(probe);
    Ok(())
}

/// Atomic swap: <exe>.new (fsync) → keep <exe> as <exe>.prev → rename .new over <exe> → fsync dir.
pub fn install(exe: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let new = sibling(exe, ".new");
    write_exec(&new, bytes)?;
    let prev = sibling(exe, ".prev");
    let prev_tmp = sibling(exe, ".prev.tmp");
    let _ = std::fs::remove_file(&prev_tmp);
    if let Err(e) = std::fs::copy(exe, &prev_tmp).and_then(|_| std::fs::File::open(&prev_tmp)?.sync_all()).and_then(|_| std::fs::rename(&prev_tmp, &prev)) {
        let _ = std::fs::remove_file(&new);
        return Err(e);
    }
    std::fs::rename(&new, exe)?;
    if let Some(dir) = exe.parent() {
        sync_dir(dir);
    }
    Ok(())
}

/// Put <exe>.prev back in place.
pub fn rollback(exe: &Path) -> std::io::Result<()> {
    let prev = sibling(exe, ".prev");
    if !prev.exists() {
        return Err(std::io::Error::new(std::io::ErrorKind::NotFound, format!("{} not found", prev.display())));
    }
    std::fs::rename(&prev, exe)?;
    if let Some(dir) = exe.parent() {
        sync_dir(dir);
    }
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Default, Debug, PartialEq)]
#[serde(default)]
pub struct Marker {
    pub from: String,
    pub to: String,
    pub at: i64,
    /// Starts of the new version so far (a crash loop rolls back too).
    pub starts: u32,
}

pub fn read_marker(state_dir: &Path) -> Option<Marker> {
    serde_json::from_str(&std::fs::read_to_string(state_dir.join(MARKER)).ok()?).ok()
}

pub fn write_marker(state_dir: &Path, m: &Marker) -> std::io::Result<()> {
    let tmp = state_dir.join("update.json.tmp");
    std::fs::write(&tmp, serde_json::to_vec(m).unwrap_or_default())?;
    std::fs::rename(tmp, state_dir.join(MARKER))
}

pub fn clear_marker(state_dir: &Path) {
    let _ = std::fs::remove_file(state_dir.join(MARKER));
}

/// A version that failed after an update is not installed again.
pub fn skipped(state_dir: &Path) -> Option<String> {
    std::fs::read_to_string(state_dir.join(SKIP)).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

pub fn skip(state_dir: &Path, version: &str) {
    let _ = std::fs::write(state_dir.join(SKIP), format!("{version}\n"));
}

// ---------- download ----------

pub struct Updater {
    pub agent: ureq::Agent,
    pub base: String,
    pub exe: PathBuf,
    pub state_dir: PathBuf,
}

fn fetch(agent: &ureq::Agent, url: &str, max: u64) -> Result<Vec<u8>, String> {
    let r = agent.get(url).call().map_err(|e| match e {
        ureq::Error::Status(code, _) => format!("{url}: HTTP {code}"),
        other => format!("{url}: {other}"),
    })?;
    if let Some(len) = r.header("Content-Length").and_then(|v| v.parse::<u64>().ok()) {
        if len > max {
            return Err(format!("{url}: too large ({len} bytes)"));
        }
    }
    let mut buf = Vec::new();
    r.into_reader().take(max + 1).read_to_end(&mut buf).map_err(|e| format!("{url}: {e}"))?;
    if buf.len() as u64 > max {
        return Err(format!("{url}: larger than {max} bytes"));
    }
    Ok(buf)
}

pub fn asset_name() -> String {
    format!("angar-edge-linux-{}", std::env::consts::ARCH)
}

impl Updater {
    pub fn new(base: &str, exe: PathBuf, state_dir: PathBuf) -> Updater {
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(Duration::from_secs(15))
            .timeout(Duration::from_secs(600))
            .redirects(5) // github.com → objects.githubusercontent.com
            .user_agent(&format!("angar-edge/{}", crate::VERSION))
            .try_proxy_from_env(true)
            .build();
        Updater { agent, base: base.trim_end_matches('/').to_string(), exe, state_dir }
    }

    /// Ok(Some(version)) when a new binary was installed (caller exits with EXIT_UPDATED).
    pub fn check(&self) -> Result<Option<String>, String> {
        let latest = String::from_utf8_lossy(&fetch(&self.agent, &format!("{}/angar-edge-version.txt", self.base), 64)?).trim().to_string();
        if compare(&latest, crate::VERSION).is_none() {
            return Err(format!("angar-edge-version.txt is not a version: {latest:?}"));
        }
        if !is_newer(&latest, crate::VERSION) || skipped(&self.state_dir).as_deref() == Some(latest.as_str()) {
            return Ok(None);
        }
        let asset = asset_name();
        let sig = fetch(&self.agent, &format!("{}/{asset}.sig", self.base), 1024).map_err(|e| format!("no signature, update refused ({e})"))?;
        let bin = fetch(&self.agent, &format!("{}/{asset}", self.base), MAX_BINARY)?;
        verify(&bin, &String::from_utf8_lossy(&sig)).map_err(|e| format!("{asset} {latest}: {e}, update refused"))?;
        if !bin.starts_with(b"\x7fELF") {
            return Err(format!("{asset} is not an ELF executable"));
        }
        // Sanity check: the new binary runs here and reports the advertised version.
        let probe = sibling(&self.exe, ".new");
        write_exec(&probe, &bin).map_err(|e| format!("cannot write {}: {e}", probe.display()))?;
        let out = std::process::Command::new(&probe).arg("--version").output();
        let _ = std::fs::remove_file(&probe);
        let out = out.map_err(|e| format!("the new binary does not run: {e}"))?;
        let printed = String::from_utf8_lossy(&out.stdout);
        if !out.status.success() || !printed.split_whitespace().any(|w| w == latest) {
            return Err(format!("the new binary reports {:?}, expected {latest}", printed.trim()));
        }
        write_marker(&self.state_dir, &Marker { from: crate::VERSION.into(), to: latest.clone(), at: crate::util::now_secs(), starts: 0 }).map_err(|e| format!("cannot write the update marker: {e}"))?;
        if let Err(e) = install(&self.exe, &bin) {
            clear_marker(&self.state_dir);
            return Err(format!("cannot replace {}: {e}", self.exe.display()));
        }
        Ok(Some(latest))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semver() {
        assert!(is_newer("0.2.1", "0.2.0"));
        assert!(is_newer("0.10.0", "0.9.9"));
        assert!(is_newer("1.0.0", "0.99.99"));
        assert!(is_newer("v0.3.0", "0.2.0"));
        assert!(!is_newer("0.2.0", "0.2.0"));
        assert!(!is_newer("0.1.9", "0.2.0"));
        assert!(is_newer("1.0.0", "1.0.0-rc.1"));
        assert!(!is_newer("1.0.0-rc.1", "1.0.0"));
        assert!(is_newer("1.0.0-rc.2", "1.0.0-rc.1"));
        assert!(is_newer("1.0.0-rc.10", "1.0.0-rc.9"));
        assert!(is_newer("1.0.0-beta", "1.0.0-alpha"));
        assert!(is_newer("1.0.0-alpha.1", "1.0.0-alpha"));
        assert!(is_newer("1.0.0-alpha", "1.0.0-1"));
        assert_eq!(compare("1.2.3+build.5", "1.2.3"), Some(Ordering::Equal));
        assert_eq!(compare("1.2", "1.2.0"), None);
        assert_eq!(compare("1.2.x", "1.2.0"), None);
        assert_eq!(compare("", "1.2.0"), None);
        assert!(!is_newer("<html>", "0.2.0"));
        assert!(compare(crate::VERSION, "0.0.0").is_some());
    }

    #[test]
    fn base64() {
        assert_eq!(b64decode("aGVsbG8=").unwrap(), b"hello");
        assert_eq!(b64decode("aGVsbG8").unwrap(), b"hello");
        assert_eq!(b64decode("aGVs\nbG8h").unwrap(), b"hello!");
        assert!(b64decode("aGV*").is_none());
        assert!(b64decode("aG=Vs").is_none());
        assert_eq!(b64decode(EDGE_UPDATE_PUBKEY).unwrap().len(), 32);
    }

    fn b64encode(b: &[u8]) -> String {
        const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut s = String::new();
        for c in b.chunks(3) {
            let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
            for i in 0..4 {
                s.push(if i <= c.len() { T[(n >> (18 - 6 * i) & 63) as usize] as char } else { '=' });
            }
        }
        s
    }

    #[test]
    fn signatures() {
        // Test keypair generated from a seed derived from the clock (not the release key).
        let mut seed = [0u8; 32];
        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos().to_le_bytes();
        for (i, b) in seed.iter_mut().enumerate() {
            *b = t[i % t.len()] ^ (i as u8).wrapping_mul(37);
        }
        let kp = ed25519_compact::KeyPair::from_seed(ed25519_compact::Seed::new(seed));
        let bin = b"\x7fELF fake angar-edge binary".to_vec();
        let sig = b64encode(kp.sk.sign(&bin, None).as_ref());
        assert!(verify_with(kp.pk.as_ref(), &bin, &sig).is_ok());
        assert!(verify_with(kp.pk.as_ref(), &bin, &format!("{sig}\n")).is_ok());
        let mut tampered = bin.clone();
        tampered[5] ^= 1;
        assert_eq!(verify_with(kp.pk.as_ref(), &tampered, &sig), Err("bad signature".into()));
        assert!(verify_with(kp.pk.as_ref(), &bin, "").is_err());
        assert!(verify_with(kp.pk.as_ref(), &bin, "not base64!").is_err());
        assert!(verify_with(kp.pk.as_ref(), &bin, &b64encode(&[0u8; 64])).is_err());
        // Signed by another key: refused by the built-in release key.
        assert!(verify(&bin, &sig).is_err());
    }

    #[test]
    fn swap_and_rollback() {
        let dir = std::env::temp_dir().join(format!("angar-upd-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let exe = dir.join("angar-edge");
        std::fs::write(&exe, b"old").unwrap();
        assert!(can_replace(&exe).is_ok());
        install(&exe, b"new").unwrap();
        assert_eq!(std::fs::read(&exe).unwrap(), b"new");
        assert_eq!(std::fs::read(dir.join("angar-edge.prev")).unwrap(), b"old");
        assert!(!dir.join("angar-edge.new").exists());
        rollback(&exe).unwrap();
        assert_eq!(std::fs::read(&exe).unwrap(), b"old");
        assert!(rollback(&exe).is_err());
        let m = Marker { from: "0.2.0".into(), to: "0.2.1".into(), at: 1, starts: 2 };
        write_marker(&dir, &m).unwrap();
        assert_eq!(read_marker(&dir), Some(m));
        clear_marker(&dir);
        assert_eq!(read_marker(&dir), None);
        skip(&dir, "0.2.1");
        assert_eq!(skipped(&dir).as_deref(), Some("0.2.1"));
        let _ = std::fs::remove_dir_all(dir);
    }
}
