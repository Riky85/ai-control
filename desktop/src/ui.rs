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

pub fn message(text: &str) {
    if cfg!(windows) {
        let _ = output(Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-Command", "Add-Type -AssemblyName System.Windows.Forms; [void][System.Windows.Forms.MessageBox]::Show($env:ANGAR_MSG, 'angar')"]).env("ANGAR_MSG", text));
    } else if cfg!(target_os = "macos") {
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
