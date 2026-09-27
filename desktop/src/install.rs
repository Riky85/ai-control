// Per-user install (no admin rights): copy into the user's app-data folder
// and start at login — Run key on Windows, LaunchAgent on macOS, XDG
// autostart on Linux.
use crate::config::home;
use std::path::PathBuf;
use std::process::Command;

const EXE: &str = if cfg!(windows) { "angar.exe" } else { "angar" };
const LAUNCH_AGENT: &str = "ai.angar.agent";

pub fn installed_path() -> PathBuf {
    home().join(EXE)
}

/// The download is named after the company link: "angar-<code>.exe",
/// "angar-<code> (1).exe" on Windows, "angar-<code>.app/Contents/MacOS/angar"
/// on macOS, "angar-<code>" on Linux.
pub fn join_code_from_file_name() -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    exe.ancestors().take(4).find_map(|p| code_in(&p.file_name()?.to_string_lossy()))
}

fn code_in(name: &str) -> Option<String> {
    let rest = name.strip_prefix("angar-").or_else(|| name.strip_prefix("angar_"))?;
    let code: String = rest.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-').collect();
    let code = code.trim_end_matches('-').to_string();
    (8..=40).contains(&code.len()).then_some(code)
}

#[cfg(test)]
mod tests {
    #[test]
    fn codes() {
        assert_eq!(super::code_in("angar-P3zTkkuJy9Gw.exe").as_deref(), Some("P3zTkkuJy9Gw"));
        assert_eq!(super::code_in("angar-P3zTkkuJy9Gw (1).exe").as_deref(), Some("P3zTkkuJy9Gw"));
        assert_eq!(super::code_in("angar-P3zTkkuJy9Gw.app").as_deref(), Some("P3zTkkuJy9Gw"));
        assert_eq!(super::code_in("angar.exe"), None);
        assert_eq!(super::code_in("angar"), None);
    }
}

/// Work email without asking, when the computer knows it.
pub fn os_email(domain: Option<&str>) -> Option<String> {
    #[cfg(windows)]
    {
        // Entra ID / Active Directory joined PCs: the sign-in name (UPN) is the work email.
        use windows_sys::Win32::Security::Authentication::Identity::{GetUserNameExW, NameUserPrincipal};
        let mut buf = [0u16; 512];
        let mut len = buf.len() as u32;
        if unsafe { GetUserNameExW(NameUserPrincipal, buf.as_mut_ptr(), &mut len) } != 0 {
            let s = String::from_utf16_lossy(&buf[..len as usize]).trim().to_lowercase();
            if s.contains('@') && s.contains('.') {
                return Some(s);
            }
        }
    }
    let domain = domain.map(str::to_string).or_else(|| std::env::var("ANGAR_EMAIL_DOMAIN").ok())?;
    let user = std::env::var(if cfg!(windows) { "USERNAME" } else { "USER" }).ok()?;
    Some(format!("{}@{}", user.to_lowercase(), domain.trim_start_matches('@').to_lowercase()))
}

pub fn install_and_start() -> Result<(), String> {
    let me = std::env::current_exe().map_err(|e| e.to_string())?;
    let target = installed_path();
    // Stop an older copy first so the file can be replaced.
    stop_running();
    if me != target {
        // Replace atomically, even if an old copy is still running
        // (Windows can rename a running .exe but not overwrite it).
        let fresh = target.with_extension("new");
        std::fs::copy(&me, &fresh).map_err(|e| format!("copy: {e}"))?;
        if cfg!(windows) && target.exists() {
            let old = target.with_extension("old");
            let _ = std::fs::remove_file(&old);
            let _ = std::fs::rename(&target, &old);
        }
        std::fs::rename(&fresh, &target).map_err(|e| format!("replace: {e}"))?;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o755));
    }
    let t = target.display().to_string();
    if cfg!(windows) {
        set_run_key(Some(&format!("\"{t}\" --run")))?;
        spawn_background(&target)?;
    } else if cfg!(target_os = "macos") {
        let _ = Command::new("xattr").args(["-d", "com.apple.quarantine", &t]).output();
        let plist = dirs::home_dir().ok_or("no home")?.join("Library/LaunchAgents").join(format!("{LAUNCH_AGENT}.plist"));
        let _ = std::fs::create_dir_all(plist.parent().unwrap());
        let log = home().join("angar.log").display().to_string();
        std::fs::write(&plist, format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>{LAUNCH_AGENT}</string>
  <key>ProgramArguments</key><array><string>{t}</string><string>--run</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ProcessType</key><string>Background</string>
  <key>StandardErrorPath</key><string>{log}</string>
</dict></plist>
"#)).map_err(|e| e.to_string())?;
        let p = plist.display().to_string();
        let _ = Command::new("launchctl").args(["unload", &p]).output();
        run(Command::new("launchctl").args(["load", "-w", &p]))?;
    } else {
        let dir = dirs::config_dir().ok_or("no config dir")?.join("autostart");
        let _ = std::fs::create_dir_all(&dir);
        std::fs::write(dir.join("angar.desktop"), format!("[Desktop Entry]\nType=Application\nName=angar\nExec=\"{t}\" --run\nX-GNOME-Autostart-enabled=true\nNoDisplay=true\n")).map_err(|e| e.to_string())?;
        spawn_background(&target)?;
    }
    Ok(())
}

/// Start at sign-in: HKCU\\...\\Run (per user, no admin rights).
#[cfg(windows)]
fn set_run_key(value: Option<&str>) -> Result<(), String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let (key, _) = RegKey::predef(HKEY_CURRENT_USER).create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run").map_err(|e| e.to_string())?;
    match value {
        Some(v) => key.set_value("angar", &v.to_string()).map_err(|e| e.to_string()),
        None => key.delete_value("angar").map_err(|e| e.to_string()),
    }
}
#[cfg(not(windows))]
fn set_run_key(_value: Option<&str>) -> Result<(), String> {
    Ok(())
}

#[allow(dead_code)]
fn run(cmd: &mut Command) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let o = cmd.output().map_err(|e| e.to_string())?;
    if o.status.success() { Ok(()) } else { Err(String::from_utf8_lossy(&o.stderr).trim().to_string()) }
}

fn spawn_background(target: &PathBuf) -> Result<(), String> {
    let mut cmd = Command::new(target);
    cmd.arg("--run").stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000 | 0x0000_0008); // CREATE_NO_WINDOW | DETACHED_PROCESS
    }
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

fn pid_file() -> PathBuf {
    home().join("angar.pid")
}

fn running_pid() -> Option<sysinfo::Pid> {
    let pid: usize = std::fs::read_to_string(pid_file()).ok()?.trim().parse().ok()?;
    let pid = sysinfo::Pid::from(pid);
    if pid.as_u32() == std::process::id() {
        return None;
    }
    let mut sys = sysinfo::System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);
    let p = sys.process(pid)?;
    if matches!(p.status(), sysinfo::ProcessStatus::Zombie | sysinfo::ProcessStatus::Dead) {
        return None;
    }
    p.name().to_string_lossy().to_lowercase().starts_with("angar").then_some(pid)
}

fn stop_running() {
    if let Some(pid) = running_pid() {
        let mut sys = sysinfo::System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[pid]), true);
        if let Some(p) = sys.process(pid) {
            p.kill();
        }
        let _ = std::fs::remove_file(pid_file());
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
}

/// Only one background copy per user.
pub fn single_instance() -> bool {
    if running_pid().is_some() {
        return false;
    }
    let _ = std::fs::write(pid_file(), std::process::id().to_string());
    true
}

pub fn uninstall() {
    if cfg!(windows) {
        let _ = set_run_key(None);
    } else if cfg!(target_os = "macos") {
        if let Some(h) = dirs::home_dir() {
            let p = h.join("Library/LaunchAgents").join(format!("{LAUNCH_AGENT}.plist"));
            let _ = Command::new("launchctl").args(["unload", &p.display().to_string()]).output();
            let _ = std::fs::remove_file(p);
        }
    } else if let Some(c) = dirs::config_dir() {
        let _ = std::fs::remove_file(c.join("autostart/angar.desktop"));
    }
    stop_running();
    let dir = home();
    for f in ["config.json", "catalog.json", "angar.pid", "angar.log", "angar.old", "angar.new"] {
        let _ = std::fs::remove_file(dir.join(f));
    }
    // The running binary can't delete itself on Windows; it goes with the folder next time.
    let _ = std::fs::remove_file(installed_path());
}
