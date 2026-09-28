#!/bin/sh
# angar Edge installer (Linux x86_64 / aarch64 with systemd: Raspberry Pi OS 64-bit, Debian, Ubuntu, any VM).
#
#   curl -fsSL <angar>/api/edge/install.sh | sudo sh -s -- ange_XXXXXXXX
#   or: sudo ANGAR_EDGE_TOKEN=ange_XXXXXXXX sh install.sh
#
# Optional env: ANGAR_SERVER (angar server URL), ANGAR_UPSTREAM (e.g. 1.1.1.1,9.9.9.9),
# ANGAR_EDGE_BASE_URL (download mirror).
set -eu

TOKEN="${1:-${ANGAR_EDGE_TOKEN:-}}"
BASE_URL="${ANGAR_EDGE_BASE_URL:-https://github.com/Riky85/ai-control/releases/download/edge-latest}"
BIN=/usr/local/bin/angar-edge
ENV_FILE=/etc/angar-edge.env
UNIT=/etc/systemd/system/angar-edge.service

say() { printf '%s\n' "$*"; }
die() { printf 'angar-edge install: %s\n' "$*" >&2; exit 1; }

[ -n "$TOKEN" ] || die "missing token. Usage: curl -fsSL <url> | sudo sh -s -- ange_XXXXXXXX"
case "$TOKEN" in
  ange_*) ;;
  *) die "the token must start with ange_ (create a sensor in angar -> Edge -> Sensors)" ;;
esac
[ "$(uname -s)" = "Linux" ] || die "Linux only (use the Docker image elsewhere)"
[ "$(id -u)" -eq 0 ] || die "please run as root (sudo)"
command -v systemctl >/dev/null 2>&1 || die "systemd not found; use the Docker image instead (see README)"

case "$(uname -m)" in
  x86_64|amd64) ARCH=x86_64 ;;
  aarch64|arm64) ARCH=aarch64 ;;
  armv7l|armv6l) die "32-bit ARM is not supported: install a 64-bit OS (e.g. Raspberry Pi OS 64-bit)" ;;
  *) die "unsupported CPU architecture: $(uname -m)" ;;
esac

URL="$BASE_URL/angar-edge-linux-$ARCH"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
say "Downloading angar-edge ($ARCH)..."
if command -v curl >/dev/null 2>&1; then
  curl -fsSL -o "$TMP" "$URL" || die "download failed: $URL"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$TMP" "$URL" || die "download failed: $URL"
else
  die "curl or wget is required"
fi
install -m 0755 "$TMP" "$BIN"
"$BIN" --version >/dev/null 2>&1 || die "the downloaded binary does not run on this machine"

if ! id angar-edge >/dev/null 2>&1; then
  NOLOGIN=/usr/sbin/nologin
  [ -x "$NOLOGIN" ] || NOLOGIN=/sbin/nologin
  if command -v useradd >/dev/null 2>&1; then
    useradd --system --no-create-home --home-dir /var/lib/angar-edge --shell "$NOLOGIN" angar-edge
  else
    adduser -S -D -H -h /var/lib/angar-edge -s "$NOLOGIN" angar-edge
  fi
fi

OLD_UMASK="$(umask)"
umask 077
{
  printf 'ANGAR_EDGE_TOKEN=%s\n' "$TOKEN"
  [ -z "${ANGAR_SERVER:-}" ] || printf 'ANGAR_SERVER=%s\n' "$ANGAR_SERVER"
  [ -z "${ANGAR_UPSTREAM:-}" ] || printf 'ANGAR_UPSTREAM=%s\n' "$ANGAR_UPSTREAM"
} > "$ENV_FILE"
chmod 600 "$ENV_FILE"
umask "$OLD_UMASK"

cat > "$UNIT" <<'UNIT_EOF'
[Unit]
Description=angar Edge network sensor (AI usage from DNS and firewall logs)
Documentation=https://github.com/Riky85/ai-control/tree/main/edge
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/angar-edge.env
ExecStart=/usr/local/bin/angar-edge --state-dir /var/lib/angar-edge
User=angar-edge
Group=angar-edge
StateDirectory=angar-edge
StateDirectoryMode=0750
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=true
LockPersonality=true
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
UNIT_EOF

# Port 53 is often taken by systemd-resolved's stub listener (Ubuntu/Debian).
if command -v ss >/dev/null 2>&1 && ss -lnup 2>/dev/null | grep 'systemd-resolve' | grep -q ':53 '; then
  say ""
  say "Note: systemd-resolved is using port 53. To use this machine as DNS server run:"
  say "  sudo mkdir -p /etc/systemd/resolved.conf.d"
  say "  printf '[Resolve]\\nDNSStubListener=no\\n' | sudo tee /etc/systemd/resolved.conf.d/angar-edge.conf"
  say "  sudo ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf && sudo systemctl restart systemd-resolved angar-edge"
fi

systemctl daemon-reload
systemctl enable angar-edge >/dev/null 2>&1
systemctl restart angar-edge

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -n "$IP" ] || IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')"
[ -n "$IP" ] || IP="<this machine's IP>"

say ""
say "angar Edge is installed and running (systemctl status angar-edge, journalctl -u angar-edge -f)."
say ""
say "Next steps:"
say "  1. DNS: set the DNS server handed out by your DHCP (router/firewall) to $IP"
say "     (keep a second DNS entry only if you accept that some queries bypass the sensor)."
say "  2. and/or firewall logs: send syslog to $IP on UDP 514 (TCP 514 and port 5514 also work)."
say "  3. Open angar -> Edge -> Sensors: this sensor shows up as online within a few minutes."
