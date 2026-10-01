#!/bin/sh
# angar on-premises — the whole of angar on your own server, data never leaves it.
#
#   curl -fsSL https://<angar>/api/onprem/install.sh | sudo sh
#
# Run it again at any time to update (settings and data are kept).
# Add the network sensor on the same machine later with:
#   curl -fsSL https://<angar>/api/onprem/install.sh | sudo sh -s -- edge ange_...
#
# Optional env: ANGAR_DIR (default /opt/angar), ANGAR_PORT (default 8080),
# ANGAR_URL (address people use, default http://<this machine's IP>:<port>),
# ANGAR_IMAGE, ANGAR_EDGE_IMAGE, ANGAR_INSTALL_DOCKER=0 (never install Docker).
# Email and EU-only mode: add SMTP_URL, EMAIL_FROM and ANGAR_EU_ONLY=1 to .env, then run again.
set -eu

DIR="${ANGAR_DIR:-/opt/angar}"
IMAGE="${ANGAR_IMAGE:-ghcr.io/riky85/angar:latest}"
EDGE_IMAGE="${ANGAR_EDGE_IMAGE:-ghcr.io/riky85/angar-edge:latest}"

say() { printf '%s\n' "$*"; }
die() { printf 'angar: %s\n' "$*" >&2; exit 1; }
secret() { od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; }

[ "$(id -u)" = 0 ] || die "please run as root (… | sudo sh)"
[ "$(uname -s)" = Linux ] || die "this installer is for Linux servers. On Windows or macOS install Docker Desktop and use the compose file described in the angar documentation."

# ——— Docker ———
if ! command -v docker >/dev/null 2>&1; then
  [ "${ANGAR_INSTALL_DOCKER:-1}" = 0 ] && die "Docker is not installed."
  say "Installing Docker…"
  command -v curl >/dev/null 2>&1 || die "curl is needed to install Docker."
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is missing (package docker-compose-plugin)."

mkdir -p "$DIR"
cd "$DIR"
umask 077

# ——— Settings (created once, then kept) ———
if [ ! -f .env ]; then
  PORT="${ANGAR_PORT:-8080}"
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$IP" ] || IP="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')"
  [ -n "$IP" ] || IP=localhost
  URL="${ANGAR_URL:-http://$IP:$PORT}"
  cat > .env <<EOF
# angar on-premises settings. Keep this file private: it holds the keys.
APP_URL=$URL
ANGAR_PORT=$PORT
ANGAR_IMAGE=$IMAGE
ANGAR_EDGE_IMAGE=$EDGE_IMAGE
POSTGRES_PASSWORD=$(secret)
SESSION_SECRET=$(secret)
CREDENTIALS_SECRET=$(secret)
ANGAR_EDGE_TOKEN=
# Email (optional): your own SMTP server, e.g. an EU provider such as Brevo or Mailjet (France).
# SMTP_URL=smtps://user:password@smtp-relay.brevo.com:465
# EMAIL_FROM=angar <noreply@yourcompany.com>
# EU-only mode (optional): never use Resend or AI answers.
# ANGAR_EU_ONLY=1
EOF
  say "Settings saved in $DIR/.env"
fi

# ——— Network sensor on this machine: "edge <token>" ———
if [ "${1:-}" = edge ]; then
  TOKEN="${2:-}"
  case "$TOKEN" in ange_*) ;; *) die "usage: … | sudo sh -s -- edge ange_… (the token from Connect → angar Edge)";; esac
  sed -i "s|^ANGAR_EDGE_TOKEN=.*|ANGAR_EDGE_TOKEN=$TOKEN|" .env
fi

cat > compose.yml <<'EOF'
# angar on-premises. Managed by install.sh: edit .env, not this file.
name: angar
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: angar
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: angar
    volumes:
      - db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U angar -d angar"]
      interval: 5s
      timeout: 5s
      retries: 20
  app:
    image: ${ANGAR_IMAGE}
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "${ANGAR_PORT}:3000"
    environment:
      DATABASE_URL: postgresql://angar:${POSTGRES_PASSWORD}@db:5432/angar
      APP_URL: ${APP_URL}
      SESSION_SECRET: ${SESSION_SECRET}
      CREDENTIALS_SECRET: ${CREDENTIALS_SECRET}
      ANGAR_ONPREM: "1"
      SMTP_URL: ${SMTP_URL:-}
      EMAIL_FROM: ${EMAIL_FROM:-}
      ANGAR_EU_ONLY: ${ANGAR_EU_ONLY:-}
  edge:
    image: ${ANGAR_EDGE_IMAGE}
    profiles: ["edge"]
    restart: unless-stopped
    network_mode: host
    environment:
      ANGAR_EDGE_TOKEN: ${ANGAR_EDGE_TOKEN}
      ANGAR_SERVER: ${APP_URL}
    volumes:
      - edge:/var/lib/angar-edge
volumes:
  db:
  edge:
EOF

# shellcheck disable=SC1091
. ./.env
PROFILE=""
[ -n "${ANGAR_EDGE_TOKEN:-}" ] && PROFILE="--profile edge"

say "Downloading angar…"
# shellcheck disable=SC2086
docker compose $PROFILE pull -q
# shellcheck disable=SC2086
docker compose $PROFILE up -d --remove-orphans

say "Starting…"
i=0
until docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -gt 90 ] && die "angar did not start. See: cd $DIR && docker compose logs app"
  sleep 2
done

say ""
say "angar is running: $APP_URL"
say "Open it, create your account, then Connect → Desktop app to add computers."
if [ -n "$PROFILE" ]; then
  say "The network sensor runs on this machine too (angar Edge)."
  if command -v ss >/dev/null 2>&1 && ss -lun 2>/dev/null | grep -q '127.0.0.53:53'; then
    say "Note: systemd-resolved holds port 53. To use this machine as DNS server run:"
    say "  sudo mkdir -p /etc/systemd/resolved.conf.d"
    say "  printf '[Resolve]\\nDNSStubListener=no\\n' | sudo tee /etc/systemd/resolved.conf.d/angar-edge.conf"
    say "  sudo ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf && sudo systemctl restart systemd-resolved && cd $DIR && docker compose --profile edge restart edge"
  fi
fi
say ""
say "Data:    $DIR (database in the Docker volume angar_db)"
say "Update:  run the same command again"
say "Backup:  cd $DIR && docker compose exec -T db pg_dump -U angar angar > angar-backup.sql"
