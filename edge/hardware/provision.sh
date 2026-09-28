#!/bin/sh
# angar device: per-unit provisioning (factory step 3). Writes the device identity into an
# image built by build-image.sh (mounted root) or into a running device, enables the sensor
# in device mode and produces the QR label.
#
#   sudo edge/hardware/provision.sh --root /mnt/angar --serial AE-7K3M-Q9TZ --secret-file s.txt --model n100
#   sudo edge/hardware/provision.sh --serial AE-7K3M-Q9TZ --secret - --model pi5 < secret.txt   # on the device
#
# The secret comes from the platform's batch CSV (/system) or POST /api/edge/devices. Pass it
# with --secret-file or on stdin (--secret -) so it doesn't show up in `ps` or shell history.
# QR label: needs `qrencode` (apt install qrencode / brew install qrencode); without it the
# claim URL is printed so any label tool can encode it.
set -eu

ROOT=/
SERIAL=""
SECRET=""
SECRET_FILE=""
MODEL=""
APP_URL="${ANGAR_APP_URL:-https://ai-control-production.up.railway.app}"
SERVER=""
LABEL_DIR="."
WIPE_STATE=1
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: provision.sh --serial AE-XXXX-XXXX (--secret-file FILE | --secret -) --model n100|pi5 [options]

  --root DIR          target root filesystem (mounted image or /), default /
  --serial S          device serial (AE-XXXX-XXXX)
  --secret-file FILE  file holding the per-device claim secret
  --secret -          read the secret from stdin
  --model M           n100 | pi5
  --app-url URL       angar web app for the QR label (default $ANGAR_APP_URL or production)
  --server URL        angar server the sensor talks to, if not the default (writes /etc/angar-edge.env)
  --label-dir DIR     where to write <serial>.png (default .)
  --keep-state        don't wipe /var/lib/angar-edge (default: wiped, for refurbished units)
  --dry-run           print what would be done
  -h, --help          this help
EOF
}

die() { printf 'provision: %s\n' "$*" >&2; exit 1; }
say() { printf '%s\n' "$*"; }
run() {
  if [ "$DRY_RUN" = 1 ]; then printf '+ %s\n' "$*"; else "$@"; fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="${2:?}"; shift 2 ;;
    --serial) SERIAL="${2:?}"; shift 2 ;;
    --secret-file) SECRET_FILE="${2:?}"; shift 2 ;;
    --secret)
      [ "${2:-}" = "-" ] || die "--secret only accepts '-' (stdin); use --secret-file for a file"
      SECRET_FILE="-"; shift 2 ;;
    --model) MODEL="${2:?}"; shift 2 ;;
    --app-url) APP_URL="${2:?}"; shift 2 ;;
    --server) SERVER="${2:?}"; shift 2 ;;
    --label-dir) LABEL_DIR="${2:?}"; shift 2 ;;
    --keep-state) WIPE_STATE=0; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown option: $1" ;;
  esac
done

[ -n "$SERIAL" ] || { usage >&2; die "--serial is required"; }
printf '%s' "$SERIAL" | grep -Eq '^[A-Za-z0-9-]{3,64}$' || die "invalid serial: $SERIAL"
case "$MODEL" in
  n100|pi5) ;;
  *) die "--model must be n100 or pi5" ;;
esac
if [ "$SECRET_FILE" = "-" ]; then
  SECRET="$(head -n 1)"
elif [ -n "$SECRET_FILE" ]; then
  [ -r "$SECRET_FILE" ] || die "cannot read $SECRET_FILE"
  SECRET="$(head -n 1 "$SECRET_FILE")"
else
  die "the claim secret is required (--secret-file FILE or --secret - on stdin)"
fi
SECRET="$(printf '%s' "$SECRET" | tr -d '\r\n')"
[ "${#SECRET}" -ge 16 ] || die "the claim secret is too short"
printf '%s' "$SECRET" | grep -q '["\\]' && die "the claim secret must not contain quotes or backslashes"

ROOT="${ROOT%/}"
[ -d "$ROOT/etc" ] || die "$ROOT/ does not look like a root filesystem (no etc/)"
if [ "$DRY_RUN" = 0 ] && [ "$(id -u)" -ne 0 ]; then die "run as root (sudo)"; fi
[ -x "$ROOT/opt/angar-edge/bin/angar-edge" ] || [ -x "$ROOT/usr/local/bin/angar-edge" ] \
  || die "angar-edge is not installed in $ROOT (build the image with build-image.sh first)"

LIVE=0
[ "$ROOT" = "" ] && LIVE=1

say "Provisioning $SERIAL ($MODEL) in ${ROOT:-/}"

# 1. Identity: /etc/angar-edge/device.json, 0600 root. The service reads it through
#    LoadCredential= (systemd copies it for the unprivileged angar-edge user).
run install -d -m 0700 -o root -g root "$ROOT/etc/angar-edge"
if [ "$DRY_RUN" = 1 ]; then
  say "+ write $ROOT/etc/angar-edge/device.json (serial $SERIAL, model $MODEL, secret hidden)"
else
  OLD_UMASK="$(umask)"
  umask 077
  printf '{ "serial": "%s", "secret": "%s", "model": "%s" }\n' "$SERIAL" "$SECRET" "$MODEL" > "$ROOT/etc/angar-edge/device.json.tmp"
  umask "$OLD_UMASK"
  chown root:root "$ROOT/etc/angar-edge/device.json.tmp"
  chmod 0600 "$ROOT/etc/angar-edge/device.json.tmp"
  mv -f "$ROOT/etc/angar-edge/device.json.tmp" "$ROOT/etc/angar-edge/device.json"
fi
SECRET=""

if [ -n "$SERVER" ]; then
  if [ "$DRY_RUN" = 1 ]; then say "+ write $ROOT/etc/angar-edge.env (ANGAR_SERVER=$SERVER)"; else
    printf 'ANGAR_SERVER=%s\n' "$SERVER" > "$ROOT/etc/angar-edge.env"
    chmod 0600 "$ROOT/etc/angar-edge.env"
  fi
fi

# 2. Hostname: reachable as http://angar-edge.local (avahi). Several devices on one LAN
#    get angar-edge-2.local etc. from avahi automatically.
if [ "$DRY_RUN" = 1 ]; then say "+ set hostname angar-edge in $ROOT/etc/hostname and /etc/hosts"; else
  printf 'angar-edge\n' > "$ROOT/etc/hostname"
  if [ -f "$ROOT/etc/hosts" ] && grep -q '^127\.0\.1\.1' "$ROOT/etc/hosts"; then
    sed -i 's/^127\.0\.1\.1.*/127.0.1.1\tangar-edge/' "$ROOT/etc/hosts"
  else
    printf '127.0.1.1\tangar-edge\n' >> "$ROOT/etc/hosts"
  fi
fi
[ "$LIVE" = 1 ] && command -v hostnamectl >/dev/null 2>&1 && run hostnamectl set-hostname angar-edge

# 3. Updatable layout: the binary lives in /opt/angar-edge/bin (writable by the service for
#    signed self-updates), /usr/local/bin/angar-edge is a symlink to it.
if [ ! -L "$ROOT/usr/local/bin/angar-edge" ] && [ -f "$ROOT/usr/local/bin/angar-edge" ]; then
  run install -d -m 0755 "$ROOT/opt/angar-edge/bin"
  run mv -f "$ROOT/usr/local/bin/angar-edge" "$ROOT/opt/angar-edge/bin/angar-edge"
  run ln -sfn /opt/angar-edge/bin/angar-edge "$ROOT/usr/local/bin/angar-edge"
fi

# 4. Device drop-in for the standard unit.
run install -d -m 0755 "$ROOT/etc/systemd/system/angar-edge.service.d"
if [ "$DRY_RUN" = 1 ]; then say "+ write $ROOT/etc/systemd/system/angar-edge.service.d/device.conf"; else
  cat > "$ROOT/etc/systemd/system/angar-edge.service.d/device.conf" <<'EOF'
# angar device mode (written by edge/hardware/provision.sh)
[Service]
# device.json stays 0600 root; systemd hands a private copy to the service.
LoadCredential=device.json:/etc/angar-edge/device.json
Environment=ANGAR_EDGE_DEVICE_FILE=%d/device.json
Environment=ANGAR_EDGE_AUTO_UPDATE=1
# signed self-update replaces /opt/angar-edge/bin/angar-edge (keeps .prev for rollback)
ReadWritePaths=/opt/angar-edge/bin
EOF
fi
if grep -q '^angar-edge:' "$ROOT/etc/passwd" 2>/dev/null; then
  if [ "$DRY_RUN" = 1 ]; then say "+ chown angar-edge /opt/angar-edge/bin"; else
    AE_UID="$(awk -F: '$1=="angar-edge"{print $3}' "$ROOT/etc/passwd")"
    AE_GID="$(awk -F: '$1=="angar-edge"{print $4}' "$ROOT/etc/passwd")"
    chown -R "$AE_UID:$AE_GID" "$ROOT/opt/angar-edge/bin"
  fi
else
  die "user angar-edge missing in $ROOT (build the image with build-image.sh)"
fi

# 5. Fresh state (refurbished units must not keep the previous customer's token or data).
if [ "$WIPE_STATE" = 1 ] && [ -d "$ROOT/var/lib/angar-edge" ]; then
  run find "$ROOT/var/lib/angar-edge" -mindepth 1 -delete
fi

# 6. Enable the service.
if [ "$LIVE" = 1 ]; then
  run systemctl daemon-reload
  run systemctl enable angar-edge.service
  run systemctl restart angar-edge.service
else
  run systemctl --root="$ROOT" enable angar-edge.service
  [ -f "$ROOT/etc/systemd/system/angar-edge-led.service" ] && run systemctl --root="$ROOT" enable angar-edge-led.service
fi

# 7. QR label: <app>/edge/claim?serial=<serial>
CLAIM_URL="${APP_URL%/}/edge/claim?serial=$SERIAL"
say ""
say "Claim URL: $CLAIM_URL"
if command -v qrencode >/dev/null 2>&1; then
  run mkdir -p "$LABEL_DIR"
  run qrencode -l M -s 10 -m 2 -o "$LABEL_DIR/$SERIAL.png" "$CLAIM_URL"
  say "QR label:  $LABEL_DIR/$SERIAL.png"
  [ "$DRY_RUN" = 1 ] || qrencode -l M -t ANSIUTF8 "$CLAIM_URL"
else
  say "qrencode not found: install it (apt install qrencode) to get $SERIAL.png, or encode the URL above."
fi
say ""
say "Done. Burn-in: boot the unit and run 'sudo angar-edge --once' (expects status \"unclaimed\")."
