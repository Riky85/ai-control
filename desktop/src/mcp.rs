// Server MCP configurati sul computer (Claude Desktop, Cursor, VS Code,
// Windsurf, Claude Code, Zed): gli agenti AI e i dati che possono raggiungere.
//
// Privacy: dai file di configurazione si legge SOLO il nome del server, il
// trasporto, il nome del comando (senza percorso) e, per npx/uvx/docker, il
// nome del pacchetto. Mai altri argomenti, variabili d'ambiente, token,
// header o percorsi completi; per i server remoti solo l'host dell'URL.
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

/// Al massimo tanti server per invio (difesa contro file enormi).
const MAX_SERVERS: usize = 200;
/// File di configurazione più grandi di così si saltano.
const MAX_FILE_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct McpServer {
    pub client: &'static str,
    pub name: String,
    pub transport: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host: Option<String>,
}

/// Dove sta l'elenco dei server dentro il file.
#[derive(Clone, Copy, Debug)]
enum Format {
    /// `{"mcpServers": {...}}` — Claude Desktop, Cursor, Windsurf, Claude Code.
    McpServers,
    /// settings.json di VS Code: `"mcp": {"servers": {...}}` oppure `"mcp.servers": {...}`.
    VsCodeSettings,
    /// mcp.json di VS Code: `{"servers": {...}}`.
    VsCodeMcp,
    /// settings.json di Zed: `"context_servers": {...}`.
    Zed,
}

fn sources(home: Option<&Path>, config: Option<&Path>) -> Vec<(&'static str, PathBuf, Format)> {
    let mut out = Vec::new();
    // Cartella di configurazione della piattaforma: Linux ~/.config,
    // macOS ~/Library/Application Support, Windows %APPDATA%.
    if let Some(c) = config {
        out.push(("claude_desktop", c.join("Claude").join("claude_desktop_config.json"), Format::McpServers));
        for code in ["Code", "Code - Insiders"] {
            out.push(("vscode", c.join(code).join("User").join("settings.json"), Format::VsCodeSettings));
            out.push(("vscode", c.join(code).join("User").join("mcp.json"), Format::VsCodeMcp));
        }
        if cfg!(windows) {
            out.push(("zed", c.join("Zed").join("settings.json"), Format::Zed));
        }
    }
    if let Some(h) = home {
        // I file di progetto (.cursor/mcp.json nelle cartelle di lavoro) si ignorano.
        out.push(("cursor", h.join(".cursor").join("mcp.json"), Format::McpServers));
        out.push(("vscode", h.join(".vscode").join("mcp.json"), Format::VsCodeMcp));
        out.push(("windsurf", h.join(".codeium").join("windsurf").join("mcp_config.json"), Format::McpServers));
        out.push(("claude_code", h.join(".claude.json"), Format::McpServers));
        out.push(("claude_code", h.join(".claude").join("settings.json"), Format::McpServers));
        out.push(("zed", h.join(".config").join("zed").join("settings.json"), Format::Zed));
    }
    out
}

/// Legge tutti i file noti e restituisce i server MCP, già ripuliti.
pub fn scan() -> Vec<McpServer> {
    let home = dirs::home_dir();
    let config = dirs::config_dir();
    let mut out: Vec<McpServer> = Vec::new();
    let mut seen_files: Vec<PathBuf> = Vec::new();
    for (client, path, format) in sources(home.as_deref(), config.as_deref()) {
        // Su Linux ~/.config/zed compare due volte: un file si legge una volta sola.
        if seen_files.contains(&path) {
            continue;
        }
        seen_files.push(path.clone());
        let Ok(meta) = std::fs::metadata(&path) else { continue };
        if !meta.is_file() || meta.len() > MAX_FILE_BYTES {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&path) else { continue };
        for s in parse(client, format, &text) {
            if out.len() >= MAX_SERVERS {
                return out;
            }
            if !out.iter().any(|o| o.client == s.client && o.name == s.name) {
                out.push(s);
            }
        }
    }
    out
}

fn parse(client: &'static str, format: Format, text: &str) -> Vec<McpServer> {
    let Ok(root) = serde_json::from_str::<Value>(&strip_jsonc(text)) else { return Vec::new() };
    let list = match format {
        Format::McpServers => root.get("mcpServers"),
        Format::VsCodeMcp => root.get("servers"),
        Format::VsCodeSettings => root.get("mcp").and_then(|m| m.get("servers")).or_else(|| root.get("mcp.servers")),
        Format::Zed => root.get("context_servers"),
    };
    let Some(Value::Object(map)) = list else { return Vec::new() };
    let mut out = Vec::new();
    for (key, entry) in map {
        if entry.get("disabled").and_then(Value::as_bool) == Some(true) || entry.get("enabled").and_then(Value::as_bool) == Some(false) {
            continue;
        }
        if let Some(s) = server(client, key, entry) {
            out.push(s);
        }
    }
    out
}

fn server(client: &'static str, key: &str, entry: &Value) -> Option<McpServer> {
    let name = clean_name(key)?;
    let kind = entry.get("type").or_else(|| entry.get("transport")).and_then(Value::as_str).unwrap_or("").to_ascii_lowercase();
    let url = ["url", "serverUrl", "httpUrl", "uri"].iter().find_map(|k| entry.get(*k).and_then(Value::as_str));
    if let Some(url) = url {
        let host = url_host(url);
        let sse = kind == "sse" || url.split(['?', '#']).next().unwrap_or("").trim_end_matches('/').ends_with("/sse");
        return Some(McpServer { client, name, transport: if sse { "sse" } else { "http" }, command: None, package: None, host });
    }
    // Zed: "command": {"path": "...", "args": [...]}; gli altri: "command": "...", "args": [...].
    let (cmd, args) = match entry.get("command") {
        Some(Value::Object(c)) => (c.get("path").and_then(Value::as_str), c.get("args")),
        Some(Value::String(c)) => (Some(c.as_str()), entry.get("args")),
        _ => (None, entry.get("args")),
    };
    let args: Vec<&str> = args.and_then(Value::as_array).map(|a| a.iter().filter_map(Value::as_str).collect()).unwrap_or_default();
    let (command, package) = match cmd {
        Some(c) => {
            // "npx -y pkg" scritto tutto nel comando: si separa sugli spazi.
            let mut parts: Vec<&str> = c.split_whitespace().collect();
            if parts.is_empty() {
                (None, None)
            } else {
                let first = parts.remove(0);
                parts.extend(args.iter().copied());
                let base = command_base(first);
                let pkg = base.as_deref().and_then(|b| package_of(b, &parts));
                (base, pkg)
            }
        }
        None => (None, None),
    };
    Some(McpServer { client, name, transport: "stdio", command, package, host: None })
}

/// Nome del server (la chiave): breve e senza caratteri di controllo.
fn clean_name(key: &str) -> Option<String> {
    let n: String = key.chars().filter(|c| !c.is_control()).collect::<String>().trim().chars().take(80).collect();
    if n.is_empty() {
        None
    } else {
        Some(n)
    }
}

/// Solo il nome del programma, mai il percorso: "/usr/local/bin/npx" → "npx", "C:\\x\\uvx.exe" → "uvx".
fn command_base(cmd: &str) -> Option<String> {
    let base = cmd.rsplit(['/', '\\']).next().unwrap_or("").trim();
    let lower = base.to_ascii_lowercase();
    let base = [".exe", ".cmd", ".bat", ".ps1"].iter().find_map(|e| lower.strip_suffix(e)).unwrap_or(&lower).to_string();
    if base.is_empty() || base.len() > 40 || !base.chars().all(|c| c.is_ascii_alphanumeric() || "._-+".contains(c)) {
        return None;
    }
    Some(base)
}

/// Il pacchetto avviato da npx / uvx / docker (e simili). Mai gli altri argomenti.
fn package_of(cmd: &str, args: &[&str]) -> Option<String> {
    match cmd {
        "npx" | "bunx" | "pnpx" => first_positional(args, &["-p", "--package"], &["-p", "--package"]).and_then(|p| clean_package(p, Eco::Npm)),
        "pnpm" | "npm" | "bun" | "yarn" => {
            // pnpm dlx pkg / npm exec pkg / bun x pkg / yarn dlx pkg
            let i = args.iter().position(|a| matches!(*a, "dlx" | "exec" | "x"))?;
            first_positional(&args[i + 1..], &["-p", "--package"], &["-p", "--package"]).and_then(|p| clean_package(p, Eco::Npm))
        }
        "uvx" => first_positional(args, &["--from"], &["--from", "--with", "--python", "-p", "--index-url", "--index", "--extra-index-url"]).and_then(|p| clean_package(p, Eco::Py)),
        "uv" => {
            // uv tool run pkg / uv run --with pkg ...
            let i = args.iter().position(|a| *a == "run")?;
            first_positional(&args[i + 1..], &["--from", "--with"], &["--from", "--with", "--python", "-p", "--directory", "--project"]).and_then(|p| clean_package(p, Eco::Py))
        }
        "pipx" => {
            let i = args.iter().position(|a| *a == "run")?;
            first_positional(&args[i + 1..], &["--spec"], &["--spec", "--python"]).and_then(|p| clean_package(p, Eco::Py))
        }
        "docker" | "podman" => {
            let i = args.iter().position(|a| *a == "run")?;
            const VALUE_FLAGS: &[&str] = &[
                "-e", "--env", "--env-file", "-v", "--volume", "--name", "-p", "--publish", "--network", "--net", "-w", "--workdir", "--entrypoint", "-u", "--user", "--mount", "-l", "--label", "--platform", "-m", "--memory", "--cpus", "-h", "--hostname", "--add-host", "--pull", "--restart", "--cap-add", "--cap-drop", "--security-opt", "--device", "--tmpfs", "--ulimit",
            ];
            first_positional(&args[i + 1..], &[], VALUE_FLAGS).and_then(docker_image)
        }
        _ => None,
    }
}

/// Primo argomento che non è un'opzione. `pick` sono le opzioni il cui valore È il pacchetto
/// (npx -p pkg); `skip` quelle che hanno un valore da saltare.
fn first_positional<'a>(args: &[&'a str], pick: &[&str], skip: &[&str]) -> Option<&'a str> {
    let mut i = 0;
    while i < args.len() {
        let a = args[i];
        if let Some((flag, val)) = a.split_once('=').filter(|(f, _)| f.starts_with('-')) {
            if pick.contains(&flag) {
                return Some(val);
            }
            i += 1;
            continue;
        }
        if pick.contains(&a) {
            return args.get(i + 1).copied();
        }
        if skip.contains(&a) {
            i += 2;
            continue;
        }
        if a.starts_with('-') {
            i += 1;
            continue;
        }
        return Some(a);
    }
    None
}

#[derive(Clone, Copy)]
enum Eco {
    Npm,
    Py,
}

/// Nome del pacchetto senza versione; niente percorsi, URL o valori strani.
fn clean_package(p: &str, eco: Eco) -> Option<String> {
    let p = p.trim();
    if p.contains("://") || p.contains('\\') || p.starts_with(['.', '/', '~']) || p.contains(':') || p.contains("..") {
        return None;
    }
    let name = match eco {
        // "@scope/pkg@1.2.3" → "@scope/pkg"; "pkg@latest" → "pkg".
        Eco::Npm => match p.rfind('@') {
            Some(i) if i > 0 => &p[..i],
            _ => p,
        },
        // "mcp-server-fetch==1.0", "pkg[extra]>=2" → "mcp-server-fetch", "pkg".
        Eco::Py => p.split(['=', '<', '>', '!', '~', '[', ';', '@', ' ']).next().unwrap_or(""),
    };
    let name = name.to_ascii_lowercase();
    let slashes = name.matches('/').count();
    let ok = !name.is_empty()
        && name.len() <= 100
        && name.chars().all(|c| c.is_ascii_alphanumeric() || "@/._-".contains(c))
        && match eco {
            Eco::Npm => slashes == 0 || (slashes == 1 && name.starts_with('@')),
            Eco::Py => slashes == 0,
        };
    if ok {
        Some(name)
    } else {
        None
    }
}

/// Immagine docker senza tag, digest né registro privato: "ghcr.io/github/github-mcp-server:v1" → "github/github-mcp-server".
fn docker_image(img: &str) -> Option<String> {
    let img = img.trim().split('@').next().unwrap_or("");
    let mut parts: Vec<&str> = img.split('/').collect();
    if parts.len() > 1 && (parts[0].contains('.') || parts[0].contains(':') || parts[0] == "localhost") {
        parts.remove(0);
    }
    let mut name = parts.join("/");
    if let Some(i) = name.rfind(':') {
        if !name[i..].contains('/') {
            name.truncate(i);
        }
    }
    let name = name.to_ascii_lowercase();
    if name.is_empty() || name.len() > 100 || name.starts_with(['.', '/', '-']) || !name.chars().all(|c| c.is_ascii_alphanumeric() || "/._-".contains(c)) {
        return None;
    }
    Some(name)
}

/// Solo l'host dell'URL: niente schema, utente, password, porta, percorso o query.
fn url_host(url: &str) -> Option<String> {
    let rest = url.trim().split_once("://").map(|(_, r)| r).unwrap_or(url.trim());
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    let hostport = authority.rsplit('@').next().unwrap_or("");
    let host = if let Some(stripped) = hostport.strip_prefix('[') {
        stripped.split(']').next().unwrap_or("")
    } else {
        hostport.split(':').next().unwrap_or("")
    };
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    if host.is_empty() || host.len() > 253 || !host.chars().all(|c| c.is_ascii_alphanumeric() || ".-:".contains(c)) {
        return None;
    }
    Some(host)
}

/// JSON con commenti (// e /* */) e virgole finali, come i settings di VS Code e Zed.
fn strip_jsonc(s: &str) -> String {
    let b: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    let mut in_str = false;
    while i < b.len() {
        let c = b[i];
        if in_str {
            out.push(c);
            if c == '\\' && i + 1 < b.len() {
                out.push(b[i + 1]);
                i += 2;
                continue;
            }
            if c == '"' {
                in_str = false;
            }
            i += 1;
            continue;
        }
        match c {
            '"' => {
                in_str = true;
                out.push(c);
                i += 1;
            }
            '/' if b.get(i + 1) == Some(&'/') => {
                while i < b.len() && b[i] != '\n' {
                    i += 1;
                }
            }
            '/' if b.get(i + 1) == Some(&'*') => {
                i += 2;
                while i < b.len() && !(b[i] == '*' && b.get(i + 1) == Some(&'/')) {
                    i += 1;
                }
                i += 2;
                out.push(' ');
            }
            ',' => {
                // Virgola finale: la si salta se il prossimo carattere utile chiude.
                let mut j = i + 1;
                loop {
                    while j < b.len() && b[j].is_whitespace() {
                        j += 1;
                    }
                    if b.get(j) == Some(&'/') && b.get(j + 1) == Some(&'/') {
                        while j < b.len() && b[j] != '\n' {
                            j += 1;
                        }
                    } else if b.get(j) == Some(&'/') && b.get(j + 1) == Some(&'*') {
                        j += 2;
                        while j < b.len() && !(b[j] == '*' && b.get(j + 1) == Some(&'/')) {
                            j += 1;
                        }
                        j += 2;
                    } else {
                        break;
                    }
                }
                if !matches!(b.get(j), Some('}') | Some(']')) {
                    out.push(',');
                }
                i += 1;
            }
            _ => {
                out.push(c);
                i += 1;
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "ghp_SUPERSECRET123";

    #[test]
    fn claude_desktop_only_safe_fields() {
        let text = format!(
            r#"{{
  "mcpServers": {{
    "github": {{ "command": "/usr/local/bin/npx", "args": ["-y", "@modelcontextprotocol/server-github@latest", "--token", "{SECRET}"], "env": {{ "GITHUB_PERSONAL_ACCESS_TOKEN": "{SECRET}" }} }},
    "files": {{ "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/mario/Documents/secret-project"] }},
    "local": {{ "command": "C:\\Users\\mario\\tools\\python.exe", "args": ["C:\\Users\\mario\\my_server.py"] }},
    "fetch": {{ "command": "uvx", "args": ["mcp-server-fetch==2025.1.1"] }},
    "gh-docker": {{ "command": "docker", "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN={SECRET}", "ghcr.io/github/github-mcp-server:v1.2"] }},
    "remote": {{ "url": "https://user:{SECRET}@mcp.linear.app:443/sse?key={SECRET}", "headers": {{ "Authorization": "Bearer {SECRET}" }} }},
    "off": {{ "command": "npx", "args": ["x"], "disabled": true }}
  }}
}}"#
        );
        let list = parse("claude_desktop", Format::McpServers, &text);
        let json = serde_json::to_string(&list).unwrap();
        assert!(!json.contains("SUPERSECRET"), "{json}");
        assert!(!json.contains("/Users") && !json.contains("mario") && !json.contains("secret-project"), "{json}");
        let get = |n: &str| list.iter().find(|s| s.name == n).cloned().unwrap();
        assert_eq!(list.len(), 6);
        let gh = get("github");
        assert_eq!((gh.transport, gh.command.as_deref(), gh.package.as_deref()), ("stdio", Some("npx"), Some("@modelcontextprotocol/server-github")));
        assert_eq!(get("files").package.as_deref(), Some("@modelcontextprotocol/server-filesystem"));
        let local = get("local");
        assert_eq!((local.command.as_deref(), local.package.as_deref()), (Some("python"), None));
        assert_eq!(get("fetch").package.as_deref(), Some("mcp-server-fetch"));
        assert_eq!(get("gh-docker").package.as_deref(), Some("github/github-mcp-server"));
        let r = get("remote");
        assert_eq!((r.transport, r.host.as_deref(), r.command.as_deref()), ("sse", Some("mcp.linear.app"), None));
    }

    #[test]
    fn vscode_settings_jsonc() {
        let text = r#"{
  // editor
  "editor.fontSize": 14, /* block */
  "mcp": {
    "servers": {
      "playwright": { "type": "stdio", "command": "npx", "args": ["@playwright/mcp@latest",], },
      "gh": { "type": "http", "url": "https://api.githubcopilot.com/mcp/", },
    },
  },
  "url": "https://example.com/a,b // not a comment",
}"#;
        let list = parse("vscode", Format::VsCodeSettings, text);
        assert_eq!(list.len(), 2, "{list:?}");
        let pw = list.iter().find(|s| s.name == "playwright").unwrap();
        assert_eq!(pw.package.as_deref(), Some("@playwright/mcp"));
        let gh = list.iter().find(|s| s.name == "gh").unwrap();
        assert_eq!((gh.transport, gh.host.as_deref()), ("http", Some("api.githubcopilot.com")));
        // Chiave piatta "mcp.servers".
        let flat = parse("vscode", Format::VsCodeSettings, r#"{"mcp.servers": {"x": {"command": "uvx", "args": ["--from", "mcp-server-git", "mcp-server-git", "--repository", "/home/me/repo"]}}}"#);
        assert_eq!(flat[0].package.as_deref(), Some("mcp-server-git"));
        // mcp.json
        let m = parse("vscode", Format::VsCodeMcp, r#"{"inputs": [], "servers": {"pg": {"command": "npx -y @modelcontextprotocol/server-postgres postgresql://u:pw@db/x"}}}"#);
        assert_eq!(m[0].package.as_deref(), Some("@modelcontextprotocol/server-postgres"));
        assert!(!serde_json::to_string(&m).unwrap().contains("pw@db"));
    }

    #[test]
    fn zed_context_servers() {
        let text = r#"{
  "theme": "One Dark",
  "context_servers": {
    "sentry": { "command": { "path": "/opt/homebrew/bin/npx", "args": ["-y", "@sentry/mcp-server"], "env": { "SENTRY_TOKEN": "abc" } } },
    "notion": { "url": "https://mcp.notion.com/mcp" },
    "ext": { "source": "extension", "settings": {} },
  },
}"#;
        let list = parse("zed", Format::Zed, text);
        assert_eq!(list.len(), 3);
        assert_eq!(list.iter().find(|s| s.name == "sentry").unwrap().package.as_deref(), Some("@sentry/mcp-server"));
        assert_eq!(list.iter().find(|s| s.name == "notion").unwrap().host.as_deref(), Some("mcp.notion.com"));
        assert!(!serde_json::to_string(&list).unwrap().contains("abc"));
    }

    #[test]
    fn windsurf_and_bad_input() {
        let list = parse("windsurf", Format::McpServers, r#"{"mcpServers": {"stripe": {"serverUrl": "https://mcp.stripe.com"}}}"#);
        assert_eq!((list[0].transport, list[0].host.as_deref()), ("http", Some("mcp.stripe.com")));
        assert!(parse("cursor", Format::McpServers, "not json").is_empty());
        assert!(parse("cursor", Format::McpServers, r#"{"mcpServers": []}"#).is_empty());
    }

    #[test]
    fn sanitising() {
        assert_eq!(command_base("/usr/bin/NPX.cmd").as_deref(), Some("npx"));
        assert_eq!(command_base("C:\\Program Files\\nodejs\\node.exe").as_deref(), Some("node"));
        assert_eq!(clean_package("./server.js", Eco::Npm), None);
        assert_eq!(clean_package("github:me/repo", Eco::Npm), None);
        assert_eq!(clean_package("/abs/path", Eco::Npm), None);
        assert_eq!(clean_package("some/path/deep", Eco::Npm), None);
        assert_eq!(clean_package("@scope/pkg@1.0.0", Eco::Npm).as_deref(), Some("@scope/pkg"));
        assert_eq!(clean_package("pkg[cli]>=1", Eco::Py).as_deref(), Some("pkg"));
        assert_eq!(docker_image("mcp/github").as_deref(), Some("mcp/github"));
        assert_eq!(docker_image("registry.corp.local:5000/team/x:1@sha256:abc").as_deref(), Some("team/x"));
        assert_eq!(url_host("http://[::1]:3000/mcp").as_deref(), Some("::1"));
        assert_eq!(url_host("https://a:b@Example.COM./x").as_deref(), Some("example.com"));
        assert_eq!(package_of("npx", &["-y", "--package=@a/b@2", "b-cli"]).as_deref(), Some("@a/b"));
        assert_eq!(package_of("pnpm", &["dlx", "@x/y"]).as_deref(), Some("@x/y"));
        assert_eq!(package_of("node", &["/x/server.js"]), None);
        assert_eq!(strip_jsonc(r#"{"a": "x//y", /* c */ "b": [1,2,],}"#).replace(' ', ""), r#"{"a":"x//y","b":[1,2]}"#);
    }

    #[test]
    fn source_paths() {
        let s = sources(Some(Path::new("/h")), Some(Path::new("/c")));
        let has = |p: &str| s.iter().any(|(_, x, _)| x == Path::new(p));
        assert!(has("/c/Claude/claude_desktop_config.json"));
        assert!(has("/c/Code/User/settings.json") && has("/c/Code - Insiders/User/settings.json"));
        assert!(has("/h/.cursor/mcp.json") && has("/h/.codeium/windsurf/mcp_config.json") && has("/h/.claude.json") && has("/h/.config/zed/settings.json"));
    }
}
