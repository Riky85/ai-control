// Native dialogs without a GUI toolkit: PowerShell on Windows, AppleScript on
// macOS, zenity (or the terminal) on Linux. Text goes through environment
// variables, so nothing needs escaping.
use std::process::Command;

#[cfg(windows)]
fn hidden(cmd: &mut Command) -> &mut Command {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000) // CREATE_NO_WINDOW
}
#[cfg(not(windows))]
fn hidden(cmd: &mut Command) -> &mut Command {
    cmd
}

fn output(cmd: &mut Command) -> Option<(bool, String)> {
    let o = hidden(cmd).output().ok()?;
    Some((o.status.success(), String::from_utf8_lossy(&o.stdout).trim().to_string()))
}

#[cfg(windows)]
pub fn message(text: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONINFORMATION, MB_OK, MB_SETFOREGROUND, MB_TOPMOST};
    let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let (t, c) = (wide(text), wide("angar"));
    unsafe {
        MessageBoxW(std::ptr::null_mut(), t.as_ptr(), c.as_ptr(), MB_OK | MB_ICONINFORMATION | MB_SETFOREGROUND | MB_TOPMOST);
    }
}

#[cfg(not(windows))]
pub fn message(text: &str) {
    if cfg!(target_os = "macos") {
        let _ = output(Command::new("osascript").args(["-e", "display dialog (system attribute \"ANGAR_MSG\") buttons {\"OK\"} default button 1 with title \"angar\""]).env("ANGAR_MSG", text));
    } else if output(Command::new("zenity").args(["--info", "--title=angar", "--no-wrap", &format!("--text={text}")])).is_none() {
        println!("{text}");
    }
}

/// None = the person cancelled.
pub fn ask(text: &str, default: &str) -> Option<String> {
    let r = if cfg!(windows) {
        output(Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-Command", "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.Interaction]::InputBox($env:ANGAR_MSG, 'angar', $env:ANGAR_DEFAULT)"]).env("ANGAR_MSG", text).env("ANGAR_DEFAULT", default))
            .map(|(ok, s)| (ok && !s.is_empty(), s))
    } else if cfg!(target_os = "macos") {
        output(Command::new("osascript").args(["-e", "text returned of (display dialog (system attribute \"ANGAR_MSG\") default answer (system attribute \"ANGAR_DEFAULT\") with title \"angar\")"]).env("ANGAR_MSG", text).env("ANGAR_DEFAULT", default))
    } else {
        output(Command::new("zenity").args(["--entry", "--title=angar", &format!("--text={text}"), &format!("--entry-text={default}")])).or_else(|| {
            use std::io::Write;
            print!("{text} ");
            let _ = std::io::stdout().flush();
            let mut s = String::new();
            if std::io::stdin().read_line(&mut s).ok()? == 0 {
                return Some((false, String::new())); // no terminal: cancelled
            }
            Some((true, s.trim().to_string()))
        })
    };
    match r {
        Some((true, s)) => Some(s),
        _ => None,
    }
}

/// Two-button question. Some(true) = first button, Some(false) = second, None = closed.
#[cfg(windows)]
pub fn choose(text: &str, yes: &str, no: &str) -> Option<bool> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, IDNO, IDYES, MB_ICONQUESTION, MB_SETFOREGROUND, MB_TOPMOST, MB_YESNOCANCEL};
    let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let body = format!("{text}\n\nYes = {yes}\nNo = {no}");
    let (t, c) = (wide(&body), wide("angar"));
    let r = unsafe { MessageBoxW(std::ptr::null_mut(), t.as_ptr(), c.as_ptr(), MB_YESNOCANCEL | MB_ICONQUESTION | MB_SETFOREGROUND | MB_TOPMOST) };
    if r == IDYES {
        Some(true)
    } else if r == IDNO {
        Some(false)
    } else {
        None
    }
}

#[cfg(not(windows))]
pub fn choose(text: &str, yes: &str, no: &str) -> Option<bool> {
    if cfg!(target_os = "macos") {
        let (ok, out) = output(
            Command::new("osascript")
                .args(["-e", "button returned of (display dialog (system attribute \"ANGAR_MSG\") buttons {\"Cancel\", (system attribute \"ANGAR_NO\"), (system attribute \"ANGAR_YES\")} default button 3 cancel button 1 with title \"angar\")"])
                .env("ANGAR_MSG", text)
                .env("ANGAR_YES", yes)
                .env("ANGAR_NO", no),
        )?;
        if !ok {
            return None;
        }
        return Some(out == yes);
    }
    match output(Command::new("zenity").args(["--question", "--title=angar", &format!("--text={text}"), &format!("--ok-label={yes}"), &format!("--cancel-label={no}")])) {
        Some((ok, _)) => Some(ok),
        None => {
            // No GUI: keep the current settings.
            println!("{text} [{yes}]");
            Some(true)
        }
    }
}
