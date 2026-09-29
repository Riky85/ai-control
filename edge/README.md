# angar Edge — network sensor

`angar-edge` shows which AI services are used on a company network **without installing
anything on the PCs**. It runs on any small Linux box (Raspberry Pi 4/5, a VM, Docker) and
feeds angar in two ways. You can use either one or both:

- **DNS forwarder.** Point the DNS server that DHCP hands out at the sensor. It forwards every
  query unchanged to the upstream resolvers and counts the ones that go to AI services in the
  angar catalog. It can also **block** AI services the company doesn't allow: the answer is
  `0.0.0.0` / `::`.
- **Syslog receiver.** Point the firewall's syslog at the sensor. It includes parsers for
  Fortinet, Sophos, Palo Alto, Cisco Meraki, UniFi/dnsmasq and pfSense/OPNsense Unbound, plus a
  generic fallback.

It can also look for local model servers on the LAN (Ollama, LM Studio). This is opt-in.

**Privacy.** Names are matched against the catalog on the sensor itself. Only the AI service id,
the client IP (or hostname) and counts leave the network, plus bytes sent when the firewall
logs them. URLs, paths and non-AI domains are never stored, logged or sent. When privacy mode is
*anonymous*, every client is sent as `*`.

The server protocol is in [`docs/edge-protocol.md`](../docs/edge-protocol.md).

## 1. Create a sensor

In angar go to **Edge → Sensors → New sensor** and copy the token (`ange_…`). It is shown only once.

## 2. Install

### Linux with systemd (Raspberry Pi OS 64-bit, Debian, Ubuntu, any VM)

```sh
curl -fsSL https://<your-angar>/api/edge/install.sh | sudo sh -s -- ange_XXXXXXXX
```

The installer does the following:

- Detects the CPU (x86_64 or aarch64).
- Downloads `angar-edge-linux-<arch>` from the `edge-latest` release into `/usr/local/bin`.
- Creates the system user `angar-edge`.
- Writes the token to `/etc/angar-edge.env` (mode 600).
- Installs `angar-edge.service` and starts it.

Optional variables: `ANGAR_SERVER=…` and `ANGAR_UPSTREAM=1.1.1.1,9.9.9.9`, both in front of `sh`.

**Raspberry Pi:** use a **64-bit** OS (Raspberry Pi OS 64-bit or Ubuntu Server arm64). A Pi 4
with 1 GB of RAM is plenty. Give it a static IP or a DHCP reservation.

To install by hand instead:

```sh
sudo install -m 755 angar-edge-linux-aarch64 /usr/local/bin/angar-edge
sudo useradd --system --no-create-home --shell /usr/sbin/nologin angar-edge
echo 'ANGAR_EDGE_TOKEN=ange_XXXXXXXX' | sudo tee /etc/angar-edge.env && sudo chmod 600 /etc/angar-edge.env
sudo cp angar-edge.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now angar-edge
journalctl -u angar-edge -f
```

The unit runs as the unprivileged `angar-edge` user. It gets only `CAP_NET_BIND_SERVICE`, which
it needs for ports 53 and 514. State lives in `/var/lib/angar-edge`, which systemd creates
through `StateDirectory`.

### Docker

The sensor needs to see the real client IPs, so run it with **host networking**:

```sh
docker run -d --name angar-edge --restart unless-stopped --network host \
  -e ANGAR_EDGE_TOKEN=ange_XXXXXXXX \
  -v angar-edge:/var/lib/angar-edge \
  ghcr.io/riky85/angar-edge:latest
```

`docker compose`:

```yaml
services:
  angar-edge:
    image: ghcr.io/riky85/angar-edge:latest
    network_mode: host
    restart: unless-stopped
    environment:
      ANGAR_EDGE_TOKEN: ange_XXXXXXXX
      # ANGAR_UPSTREAM: 1.1.1.1,9.9.9.9
    volumes:
      - angar-edge:/var/lib/angar-edge
volumes:
  angar-edge:
```

The image is multi-arch (amd64 and arm64) and runs on a Raspberry Pi as well. With port
publishing (`-p 53:53/udp …`) instead of host networking, Docker's NAT can hide client IPs, so
use it only for syslog. To build the image locally, run `docker build -t angar-edge edge/`.

## 3. Send it traffic

**DNS.** On the router or firewall DHCP server, set the DNS server to the sensor's IP. Don't
also hand out a public DNS server as secondary, or part of the traffic bypasses the sensor. The
sensor forwards to:

1. the upstream you set with `--upstream`, otherwise
2. the resolvers in `/etc/resolv.conf` that aren't loopback or the sensor itself, otherwise
3. `1.1.1.1` and `9.9.9.9`.

If your internal names (AD, printers) are resolved by the router or a domain controller, set
`ANGAR_UPSTREAM` to that server.

On Ubuntu and Debian, systemd-resolved already listens on port 53. Free the port like this:

```sh
sudo mkdir -p /etc/systemd/resolved.conf.d
printf '[Resolve]\nDNSStubListener=no\n' | sudo tee /etc/systemd/resolved.conf.d/angar-edge.conf
sudo ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf
sudo systemctl restart systemd-resolved angar-edge
```

If port 53 is still busy, the sensor logs it, keeps receiving syslog, and tries to bind
port 53 again every 5 minutes.

**Firewall syslog.** Send logs to the sensor's IP on **UDP 514**. TCP 514 and port 5514 also
work; TCP accepts both newline and octet-counted framing. Each vendor needs these logs:

| Vendor | What to send |
|---|---|
| Fortinet FortiGate | `config log syslogd setting` → server = sensor, format default. Enable web filter / DNS filter / application control logging on the policies. |
| Sophos Firewall (SFOS/XG) / UTM | System services → Log settings → add syslog server; tick *Web filter* / *Content filtering*. UTM: Remote syslog with *Web Filtering*. |
| Palo Alto | Device → Server profiles → Syslog (BSD/IETF, default format); forward *URL* (THREAT) and *Traffic* logs in the log forwarding profile. |
| Cisco Meraki MX | Network-wide → General → Reporting → Syslog server, roles *URLs* (and *Flows*). |
| UniFi (UDM/USG) | Settings → CyberSecure/System → *Activity logging (SIEM server)*, or any dnsmasq / Pi-hole with `log-queries`. |
| pfSense / OPNsense | Services → DNS Resolver → *Log level 1 + log queries*; Status → System logs → Settings → remote syslog. |
| Anything else | The generic parser takes the first private IPv4 in the line and any host name that matches the catalog. |

## Options

| Flag | Env | Default |
|---|---|---|
| `--token` | `ANGAR_EDGE_TOKEN` | required |
| `--server` | `ANGAR_SERVER` | `https://ai-control-production.up.railway.app` |
| `--upstream 1.1.1.1,9.9.9.9` | `ANGAR_UPSTREAM` | resolv.conf, else 1.1.1.1 + 9.9.9.9 |
| `--dns-port` | `ANGAR_DNS_PORT` | 53 |
| `--syslog-port` | `ANGAR_SYSLOG_PORT` | 514 (5514 is always open too) |
| `--state-dir` | `ANGAR_STATE_DIR` | `/var/lib/angar-edge`, else `./state` |
| `-v`, `--verbose` | `ANGAR_EDGE_VERBOSE=1` | logs each AI match (AI domains only) |
| `--once` | | fetch and print the configuration, then exit |
| `--version`, `--help` | | |

Outbound HTTPS honours `HTTPS_PROXY` / `ALL_PROXY`.

## How it behaves

- **Configuration.** Fetched from `GET /api/edge/config` at start and every 10 minutes, and
  cached in `state/config.json` so the sensor can start while the server is unreachable. The
  toggles for DNS, syslog, blocking, LAN scan and privacy mode all come from angar.
- **Reports.** Sent to `POST /api/edge/report` every `reportEverySec` (default 300 s). The first
  one goes out about 20 s after start, and reports double as a heartbeat. Unsent data is kept
  in memory, capped at about 20,000 keys, and merged into the next report. It is also saved to
  `state/pending.json` every minute and on shutdown. A large backlog goes out in chunks of
  5,000 events, 500 candidates and less than 1 MB.
- **Counting.** A lookup by the same client for the same name within 2 s counts once, because
  A, AAAA and HTTPS queries for one page load would otherwise triple the count.
- **Candidates.** Unknown domains that look like AI (`*.ai`, `gpt`, `llm`, `copilot`, …) are
  reported as candidates, as registrable domains only. Firewalls that label a destination as an
  AI category also produce candidates.
- **Client names.** Resolved lazily through reverse DNS (PTR) via the upstream and cached. Only
  a router or domain controller can answer PTR queries for LAN addresses. Fortinet `srcname` is
  used too.
- **LAN scan.** Every 6 h the sensor probes its own /24 on port 11434 (Ollama `/api/tags`) and
  port 1234 (LM Studio `/v1/models`), with a 2 s timeout and at most 64 probes at a time.
- **Bad token.** A 401 is logged clearly. Data is kept and the sensor retries every 15 minutes.

## Development

```sh
cd edge
cargo test --release
cargo run --release -- --token ange_… --server http://localhost:3000 --dns-port 5353 --syslog-port 5514 -v
```

### Keeping install.sh in sync

The web app serves the installer from `src/lib/edge/install-script.ts`, and that file must hold
exactly the same text as `edge/install.sh`. CI checks this. `install.sh` must also embed
`angar-edge.service` verbatim, which `cargo test` checks. After you edit either file, regenerate
the TypeScript copy:

```sh
python3 - <<'EOF'
s = open('edge/install.sh').read()
esc = s.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
open('src/lib/edge/install-script.ts', 'w').write(
    '// Generated from edge/install.sh — keep identical (the web app serves it as the one-line installer).\n'
    '// Regenerate: see edge/README.md ("Keeping install.sh in sync").\n'
    'export const EDGE_IMAGE = "ghcr.io/riky85/angar-edge:latest";\n\n'
    'export const EDGE_INSTALL_SCRIPT = `' + esc + '`;\n')
EOF
```

CI (`.github/workflows/edge.yml`) runs the tests and builds static musl binaries for x86_64 and
aarch64 on native runners. It publishes them to the `edge-latest` release and pushes the
multi-arch image `ghcr.io/riky85/angar-edge:latest`, built from the prebuilt binaries with
`Dockerfile.release`.

## Known limits

- It only sees DNS queries that reach it. Browsers with DNS-over-HTTPS (DoH) bypass it. The
  sensor answers Firefox's canary domain `use-application-dns.net` with NXDOMAIN, which turns
  off Firefox's default DoH. For other browsers, block DoH on the firewall or disable it by
  policy (Chrome/Edge `DnsOverHttpsMode=off`).
- It can't see bytes from DNS. `bytesUp` comes only from firewall logs.
- Blocking works at the DNS level only. Clients that cached the answer or use another resolver
  still get through.
- 32-bit ARM isn't built. Use a 64-bit OS.

## Windows (to try it on your own PC)

`angar-edge-windows-x64.exe` is published next to the Linux binaries. Run it in PowerShell with
`--token ange_…`, then set the PC's IPv4 DNS to `127.0.0.1` (or point other devices / the router
at the PC's IP while it stays on). Self-update is Linux-only; download a new .exe to update.
If port 53 is taken (Internet Connection Sharing), use `--dns-port 5353` or stop "SharedAccess".
