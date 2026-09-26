// Sorgente dello scanner angar (Python 3, solo libreria standard). Servito da
// /api/discovery/scanner.py con l'indirizzo del server già inserito.
export const SCANNER_PY = String.raw`#!/usr/bin/env python3
"""
angar scanner - finds the AI in use on this computer (and, optionally, on the network).

What it looks at (read-only, nothing is changed):
  * browser history of the last 30 days (Chrome, Edge, Brave, Arc, Vivaldi, Opera, Firefox, Safari) - hostnames only
  * the DNS cache (Windows)
  * installed AI apps, editor extensions (VS Code, Cursor, Windsurf) and CLI tools
  * the NAMES of AI-related environment variables (never their values)
  * local AI model servers (Ollama, LM Studio)
  * optionally: a DNS / firewall / proxy log (--log FILE) or live DNS traffic (--sniff SECONDS, needs admin)

Privacy: everything is matched HERE against angar's list of AI services. Only matches are sent;
the rest of the browsing history never leaves this computer. Use --dry-run to see exactly what would be sent.
"""
import argparse, glob, json, os, platform, re, shutil, socket, sqlite3, subprocess, sys, tempfile, time, urllib.request

SERVER = "__ANGAR_SERVER__"
DAYS = 30
ENV_HINTS = {
    "OPENAI_API_KEY": "openai-api", "ANTHROPIC_API_KEY": "anthropic-api", "CLAUDE_API_KEY": "anthropic-api",
    "GEMINI_API_KEY": "gemini-api", "GOOGLE_API_KEY": "gemini-api", "MISTRAL_API_KEY": "mistral-api",
    "GROQ_API_KEY": "groq", "COHERE_API_KEY": "cohere", "CO_API_KEY": "cohere", "HF_TOKEN": "huggingface",
    "HUGGINGFACE_API_KEY": "huggingface", "OPENROUTER_API_KEY": "openrouter", "AZURE_OPENAI_API_KEY": "azure-openai",
    "DEEPSEEK_API_KEY": "deepseek", "XAI_API_KEY": "grok", "TOGETHER_API_KEY": "together", "REPLICATE_API_TOKEN": "replicate",
}
PORTS = {11434: "ollama", 1234: "lm-studio"}
HOME = os.path.expanduser("~")
SYSTEM = platform.system()


def http(method, url, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json", "User-Agent": "angar-scanner/1"}
    if token:
        headers["Authorization"] = "Bearer " + token
    try:
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise SystemExit("angar answered %s: %s" % (e.code, e.read().decode()[:300]))
    except Exception as e:
        # Python di python.org su macOS a volte non ha i certificati: si prova con curl.
        if shutil.which("curl"):
            args = ["curl", "-fsS", "-X", method, url, "-H", "Content-Type: application/json"]
            if token:
                args += ["-H", "Authorization: Bearer " + token]
            if data:
                args += ["--data-binary", "@-"]
            out = subprocess.run(args, input=data, capture_output=True, timeout=60)
            if out.returncode == 0:
                return json.loads(out.stdout.decode())
            raise SystemExit("Could not reach angar: " + out.stderr.decode()[:300])
        raise SystemExit("Could not reach angar: %s" % e)


class Matcher:
    def __init__(self, catalog):
        self.services = catalog
        self.domains = []
        for s in catalog:
            for d in s.get("domains", []):
                self.domains.append((d.lower(), s))

    def url(self, url):
        m = re.match(r"^[a-z]+://([^/:?#]+)(/[^?#]*)?", url.lower())
        if not m:
            return None
        host, path = m.group(1), m.group(2) or "/"
        for pat, s in self.domains:
            if "/" in pat:
                h, p = pat.split("/", 1)
                if (host == h or host.endswith("." + h)) and path.startswith("/" + p):
                    return (host + "/" + p, s)
            elif host == pat or host.endswith("." + pat) or (pat.startswith("bedrock") and pat in host):
                return (host, s)
        return None

    def host(self, host):
        return self.url("https://" + host.strip().rstrip(".") + "/")


def copy_db(path):
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
    tmp.close()
    shutil.copy2(path, tmp.name)
    return tmp.name


def chromium_profiles():
    if SYSTEM == "Darwin":
        base = os.path.join(HOME, "Library", "Application Support")
        roots = ["Google/Chrome", "Microsoft Edge", "BraveSoftware/Brave-Browser", "Arc/User Data", "Vivaldi", "com.operasoftware.Opera", "Chromium"]
    elif SYSTEM == "Windows":
        base = os.environ.get("LOCALAPPDATA", "")
        roots = ["Google/Chrome/User Data", "Microsoft/Edge/User Data", "BraveSoftware/Brave-Browser/User Data", "Vivaldi/User Data", "Chromium/User Data"]
        roaming = os.environ.get("APPDATA", "")
        roots_abs = [os.path.join(roaming, "Opera Software", "Opera Stable")]
    else:
        base = os.path.join(HOME, ".config")
        roots = ["google-chrome", "microsoft-edge", "BraveSoftware/Brave-Browser", "vivaldi", "opera", "chromium"]
    found = []
    for r in roots:
        root = os.path.join(base, *r.split("/"))
        found += glob.glob(os.path.join(root, "*", "History")) + glob.glob(os.path.join(root, "History"))
    if SYSTEM == "Windows":
        for root in roots_abs:
            found += glob.glob(os.path.join(root, "History"))
    return found


def scan_browsers(m, out):
    since_webkit = int((time.time() - DAYS * 86400 + 11644473600) * 1_000_000)
    for path in chromium_profiles():
        browser = path.split(os.sep)[-4] if "User Data" in path else path.split(os.sep)[-3]
        try:
            tmp = copy_db(path)
            con = sqlite3.connect(tmp)
            for url, visits, last in con.execute("SELECT url, visit_count, last_visit_time FROM urls WHERE last_visit_time > ?", (since_webkit,)):
                hit = m.url(url)
                if hit:
                    out.append({"kind": "domain", "value": hit[0], "_svc": hit[1]["name"], "hits": visits or 1, "lastSeen": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(last / 1_000_000 - 11644473600)), "via": "browser history (%s)" % browser})
            con.close(); os.unlink(tmp)
        except Exception as e:
            print("  - skipped %s: %s" % (path, e), file=sys.stderr)
    # Firefox
    ff = {"Darwin": os.path.join(HOME, "Library", "Application Support", "Firefox", "Profiles"), "Windows": os.path.join(os.environ.get("APPDATA", ""), "Mozilla", "Firefox", "Profiles")}.get(SYSTEM, os.path.join(HOME, ".mozilla", "firefox"))
    since_us = int((time.time() - DAYS * 86400) * 1_000_000)
    for path in glob.glob(os.path.join(ff, "*", "places.sqlite")):
        try:
            tmp = copy_db(path)
            con = sqlite3.connect(tmp)
            for url, visits, last in con.execute("SELECT url, visit_count, last_visit_date FROM moz_places WHERE last_visit_date > ?", (since_us,)):
                hit = m.url(url)
                if hit:
                    out.append({"kind": "domain", "value": hit[0], "_svc": hit[1]["name"], "hits": visits or 1, "lastSeen": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(last / 1_000_000)), "via": "browser history (Firefox)"})
            con.close(); os.unlink(tmp)
        except Exception as e:
            print("  - skipped Firefox: %s" % e, file=sys.stderr)
    # Safari (serve "Accesso completo al disco" per il Terminale)
    if SYSTEM == "Darwin":
        path = os.path.join(HOME, "Library", "Safari", "History.db")
        if os.path.exists(path):
            try:
                tmp = copy_db(path)
                con = sqlite3.connect(tmp)
                since_mac = time.time() - DAYS * 86400 - 978307200
                q = "SELECT i.url, COUNT(v.id), MAX(v.visit_time) FROM history_items i JOIN history_visits v ON v.history_item = i.id WHERE v.visit_time > ? GROUP BY i.url"
                for url, visits, last in con.execute(q, (since_mac,)):
                    hit = m.url(url)
                    if hit:
                        out.append({"kind": "domain", "value": hit[0], "_svc": hit[1]["name"], "hits": visits or 1, "lastSeen": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(last + 978307200)), "via": "browser history (Safari)"})
                con.close(); os.unlink(tmp)
            except Exception:
                print("  - Safari skipped (give Terminal 'Full Disk Access' in System Settings to include it)", file=sys.stderr)


def scan_dns_cache(m, out):
    if SYSTEM != "Windows":
        return
    try:
        text = subprocess.run(["ipconfig", "/displaydns"], capture_output=True, text=True, timeout=30).stdout
        for name in set(re.findall(r"Record Name[ .]*: (\S+)", text)):
            hit = m.host(name)
            if hit:
                out.append({"kind": "domain", "value": hit[0], "_svc": hit[1]["name"], "via": "DNS cache"})
    except Exception:
        pass


def scan_apps(out):
    names = set()
    if SYSTEM == "Darwin":
        for d in ["/Applications", os.path.join(HOME, "Applications")]:
            names |= {os.path.basename(p)[:-4] for p in glob.glob(os.path.join(d, "*.app"))}
    elif SYSTEM == "Windows":
        for d in [os.environ.get("ProgramFiles", ""), os.environ.get("ProgramFiles(x86)", ""), os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs")]:
            if d and os.path.isdir(d):
                names |= set(os.listdir(d))
    else:
        for d in ["/usr/share/applications", os.path.join(HOME, ".local", "share", "applications")]:
            names |= {os.path.basename(p)[:-8] for p in glob.glob(os.path.join(d, "*.desktop"))}
    for n in names:
        out.append({"kind": "app", "value": n, "via": "installed app"})
    for editor in [".vscode", ".cursor", ".windsurf", ".vscode-insiders"]:
        for p in glob.glob(os.path.join(HOME, editor, "extensions", "*")):
            out.append({"kind": "app", "value": os.path.basename(p), "via": "editor extension (%s)" % editor.strip(".")})
    if shutil.which("claude") or os.path.isdir(os.path.join(HOME, ".claude")):
        out.append({"kind": "app", "value": "claude-code", "via": "command-line tool"})
    if shutil.which("ollama"):
        out.append({"kind": "app", "value": "Ollama", "via": "command-line tool"})


def scan_env(out):
    for k, svc in ENV_HINTS.items():
        if os.environ.get(k):
            out.append({"kind": "env", "value": svc, "via": "environment variable %s (value not read)" % k})


def scan_ports(out):
    for port, svc in PORTS.items():
        s = socket.socket(); s.settimeout(0.3)
        try:
            if s.connect_ex(("127.0.0.1", port)) == 0:
                out.append({"kind": "port", "value": svc, "via": "local model server on port %d" % port})
        finally:
            s.close()


def scan_log(m, path, out):
    counts = {}
    with open(path, "r", errors="ignore") as f:
        for line in f:
            for d in re.findall(r"\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})\b", line.lower()):
                hit = m.host(d)
                if hit:
                    counts[hit[0]] = (counts.get(hit[0], (0, hit[1]))[0] + 1, hit[1])
    for d, (n, svc) in counts.items():
        out.append({"kind": "domain", "value": d, "_svc": svc["name"], "hits": n, "via": "network log"})


def sniff_dns(m, seconds, out):
    if not shutil.which("tcpdump"):
        print("  - tcpdump not found: --sniff needs it (and admin rights)", file=sys.stderr)
        return
    print("  listening to DNS traffic for %ds..." % seconds, file=sys.stderr)
    try:
        p = subprocess.run(["tcpdump", "-l", "-n", "-i", "any", "udp", "port", "53"], capture_output=True, text=True, timeout=seconds)
        text = p.stdout
    except subprocess.TimeoutExpired as e:
        text = (e.stdout or b"").decode(errors="ignore") if isinstance(e.stdout, bytes) else (e.stdout or "")
    counts = {}
    for name in re.findall(r"\sA{1,4}\? (\S+?)\.? ", text):
        hit = m.host(name)
        if hit:
            counts[hit[0]] = (counts.get(hit[0], (0, hit[1]))[0] + 1, hit[1])
    for d, (n, svc) in counts.items():
        out.append({"kind": "domain", "value": d, "_svc": svc["name"], "hits": n, "via": "live DNS traffic"})


def main():
    ap = argparse.ArgumentParser(description="Find the AI in use and send it to angar.")
    ap.add_argument("--token", default=os.environ.get("ANGAR_TOKEN"), help="discovery token from angar (Sources > Scan computers & network)")
    ap.add_argument("--server", default=os.environ.get("ANGAR_SERVER", SERVER))
    ap.add_argument("--log", action="append", default=[], help="DNS / firewall / proxy log to read (can repeat)")
    ap.add_argument("--sniff", type=int, default=0, help="also listen to DNS traffic for N seconds (admin)")
    ap.add_argument("--dry-run", action="store_true", help="only show what would be sent")
    ap.add_argument("--yes", "-y", action="store_true", help="send without asking")
    a = ap.parse_args()

    print("angar scanner - looking for AI on %s" % socket.gethostname())
    catalog = http("GET", a.server.rstrip("/") + "/api/discovery/catalog")["services"]
    m = Matcher(catalog)
    findings = []
    scan_browsers(m, findings)
    scan_dns_cache(m, findings)
    scan_apps(findings)
    scan_env(findings)
    scan_ports(findings)
    for path in a.log:
        scan_log(m, path, findings)
    if a.sniff:
        sniff_dns(m, a.sniff, findings)

    # Solo ciò che corrisponde al catalogo (le app non-AI vengono scartate qui).
    by_id = {s["id"]: s for s in catalog}
    def app_service(v):
        v = v.lower()
        for exact in (True, False):
            for s in catalog:
                for x in s.get("apps", []):
                    x = x.lower()
                    if v == x or (not exact and (v.startswith(x + "-") or v.startswith(x + "."))):
                        return s
        return None
    kept = []
    for f in findings:
        if f["kind"] == "domain":
            kept.append(f)
            continue
        svc = by_id.get(f["value"]) if f["kind"] in ("env", "port") else app_service(f["value"])
        if svc:
            f["_svc"] = svc["name"]
            kept.append(f)
    merged = {}
    for f in kept:
        key = (f["kind"], f["value"], f.get("via"))
        if key in merged:
            g = merged[key]
            g["hits"] = g.get("hits", 1) + f.get("hits", 1)
            if f.get("lastSeen", "") > g.get("lastSeen", ""):
                g["lastSeen"] = f["lastSeen"]
        else:
            merged[key] = dict(f)
    kept = list(merged.values())
    names = sorted({f["_svc"] for f in kept})
    if not kept:
        print("No AI found on this computer.")
        return
    print("\nFound %d AI service%s:" % (len(names), "" if len(names) == 1 else "s"))
    for n in names:
        print("  - " + n)
    device = "%s (%s)" % (socket.gethostname(), os.environ.get("USER") or os.environ.get("USERNAME") or "user")
    payload = {"device": device, "os": SYSTEM, "findings": [{k: v for k, v in f.items() if k != "_svc"} for f in kept]}
    if a.dry_run:
        print("\nWould send:\n" + json.dumps(payload, indent=2))
        return
    if not a.token:
        raise SystemExit("\nAdd --token (from angar: Sources > Scan computers & network) to send the results.")
    if not a.yes:
        try:
            if input("\nSend these to angar? [Y/n] ").strip().lower() in ("n", "no"):
                return
        except EOFError:
            pass
    res = http("POST", a.server.rstrip("/") + "/api/discovery/ingest", payload, a.token)
    print("Sent. %d AI system%s updated in angar - open Review to confirm them." % (len(res.get("systems", [])), "" if len(res.get("systems", [])) == 1 else "s"))


if __name__ == "__main__":
    main()
`;
