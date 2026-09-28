#!/bin/bash
# angar device: build a flashable image (factory step 2).
#
# Customizes an official base image — no custom distro to maintain:
#   pi5   Raspberry Pi OS Lite 64-bit (latest)             → angar-edge-pi5-<version>.img
#   n100  Debian 12 "nocloud" amd64 cloud image (latest)   → angar-edge-n100-<version>.img
#
# It downloads and verifies the base (checksum published next to it), loop-mounts it, and in a
# chroot (qemu-user-static for arm64 on an x86 host) installs: angar-edge + its systemd unit,
# avahi-daemon (angar-edge.local), unattended security upgrades, the systemd hardware watchdog,
# the state dir, the LED hook (pi5); SSH is disabled and accounts locked. Nothing per-device is
# in the image: run provision.sh on each unit (or on the mounted image) afterwards.
#
# Needs root, network, and on the build host (Debian/Ubuntu):
#   apt install curl xz-utils util-linux e2fsprogs cloud-guest-utils openssl dosfstools
#   apt install qemu-user-static binfmt-support    # pi5 image on an x86_64 host
#
# Usage:
#   sudo edge/hardware/build-image.sh --model pi5 --release            # binary from edge-latest (signature checked)
#   sudo edge/hardware/build-image.sh --model n100 --binary edge/target/x86_64-unknown-linux-musl/release/angar-edge
#   edge/hardware/build-image.sh --model pi5 --release --dry-run        # print the plan, change nothing
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
EDGE_DIR="$(cd "$HERE/.." && pwd)"
RELEASE_URL="${ANGAR_EDGE_BASE_URL:-https://github.com/Riky85/ai-control/releases/download/edge-latest}"
# Must match EDGE_UPDATE_PUBKEY in edge/src/update.rs (raw ed25519, base64).
EDGE_UPDATE_PUBKEY="T6vTxDdHRBSWI52KNuPmzd+P/w5v1yXHBDhDSM14VVg="

MODEL=""
BINARY=""
FROM_RELEASE=0
OUT_DIR="$PWD/out"
BASE_URL=""
BASE_SUM=""
EXTRA_MB=1536
COMPRESS=0
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: sudo build-image.sh --model pi5|n100 (--binary PATH | --release) [options]

  --model M          pi5 (Raspberry Pi OS Lite arm64) or n100 (Debian 12 nocloud amd64)
  --binary PATH      angar-edge binary for the model's CPU (aarch64 for pi5, x86_64 for n100)
  --release          download angar-edge from the edge-latest release and verify its signature
  --out DIR          output directory (default ./out)
  --base-url URL     base image URL (default: latest official image for the model)
  --base-sum HEX     expected sha256 (64 hex) or sha512 (128 hex) of the base download
                     (default: the checksum published next to the image)
  --extra-mb N       grow the root filesystem by N MB before customizing (default 1536)
  --xz               also write <image>.xz
  --dry-run          print the steps instead of running them
  -h, --help         this help
EOF
}

die() { printf 'build-image: %s\n' "$*" >&2; exit 1; }
say() { printf '==> %s\n' "$*"; }
run() {
  if [ "$DRY_RUN" = 1 ]; then printf '+ %s\n' "$*"; else "$@"; fi
}

while [ $# -gt 0 ]; do
  case "$1" in
    --model) MODEL="${2:?}"; shift 2 ;;
    --binary) BINARY="${2:?}"; shift 2 ;;
    --release) FROM_RELEASE=1; shift ;;
    --out) OUT_DIR="${2:?}"; shift 2 ;;
    --base-url) BASE_URL="${2:?}"; shift 2 ;;
    --base-sum) BASE_SUM="${2:?}"; shift 2 ;;
    --extra-mb) EXTRA_MB="${2:?}"; shift 2 ;;
    --xz) COMPRESS=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; die "unknown option: $1" ;;
  esac
done

case "$MODEL" in
  pi5) ARCH=aarch64; DEFAULT_BASE="https://downloads.raspberrypi.com/raspios_lite_arm64_latest" ;;
  n100) ARCH=x86_64; DEFAULT_BASE="https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-nocloud-amd64.tar.xz" ;;
  *) usage >&2; die "--model must be pi5 or n100" ;;
esac
BASE_URL="${BASE_URL:-$DEFAULT_BASE}"
if [ -n "$BINARY" ] && [ "$FROM_RELEASE" = 1 ]; then die "use either --binary or --release"; fi
if [ -z "$BINARY" ] && [ "$FROM_RELEASE" = 0 ]; then die "pass --binary PATH or --release"; fi
if [ -n "$BINARY" ] && [ ! -f "$BINARY" ]; then die "binary not found: $BINARY"; fi
case "$EXTRA_MB" in ''|*[!0-9]*) die "--extra-mb must be a number" ;; esac
if [ -n "$BASE_SUM" ]; then
  case "${#BASE_SUM}" in 64|128) ;; *) die "--base-sum must be a sha256 or sha512 hex digest" ;; esac
fi

if [ "$DRY_RUN" = 0 ]; then
  [ "$(id -u)" -eq 0 ] || die "run as root (loop devices, mounts and chroot need it)"
  for t in curl xz losetup mount umount chroot blkid lsblk growpart e2fsck resize2fs sha256sum sha512sum tar truncate; do
    command -v "$t" >/dev/null 2>&1 || die "missing tool: $t (see the header of this script)"
  done
  [ "$FROM_RELEASE" = 0 ] || command -v openssl >/dev/null 2>&1 || die "missing tool: openssl (signature check)"
fi

QEMU=""
if [ "$ARCH" = aarch64 ] && [ "$(uname -m)" != aarch64 ]; then
  QEMU="$(command -v qemu-aarch64-static || true)"
  [ -n "$QEMU" ] || [ "$DRY_RUN" = 1 ] || die "qemu-aarch64-static not found (apt install qemu-user-static binfmt-support)"
  QEMU="${QEMU:-/usr/bin/qemu-aarch64-static}"
fi

WORK="$OUT_DIR/work-$MODEL"
MNT="$WORK/root"
LOOP=""
MOUNTS=()

cleanup() {
  set +e
  if [ -n "$LOOP" ]; then
    [ -e "$MNT/usr/sbin/policy-rc.d.angar" ] && rm -f "$MNT/usr/sbin/policy-rc.d" "$MNT/usr/sbin/policy-rc.d.angar"
    if [ -e "$MNT/etc/resolv.conf.angar-orig" ] || [ -L "$MNT/etc/resolv.conf.angar-orig" ]; then
      rm -f "$MNT/etc/resolv.conf"
      mv -f "$MNT/etc/resolv.conf.angar-orig" "$MNT/etc/resolv.conf"
    fi
    [ -n "$QEMU" ] && rm -f "$MNT/usr/bin/qemu-aarch64-static"
    for (( i=${#MOUNTS[@]}-1; i>=0; i-- )); do
      umount -l "${MOUNTS[$i]}" 2>/dev/null
    done
    losetup -d "$LOOP" 2>/dev/null
  fi
}
trap cleanup EXIT

mnt() { # mount args... target (last)
  run mount "$@"
  MOUNTS+=("${*: -1}")
}

run mkdir -p "$WORK" "$OUT_DIR"

# ---------------------------------------------------------------- 1. angar-edge binary
BIN="$WORK/angar-edge"
if [ "$FROM_RELEASE" = 1 ]; then
  say "Downloading angar-edge-linux-$ARCH from $RELEASE_URL"
  run curl -fsSL -o "$BIN" "$RELEASE_URL/angar-edge-linux-$ARCH"
  run curl -fsSL -o "$BIN.sig" "$RELEASE_URL/angar-edge-linux-$ARCH.sig"
  run curl -fsSL -o "$WORK/version.txt" "$RELEASE_URL/angar-edge-version.txt"
  say "Verifying the ed25519 signature"
  if [ "$DRY_RUN" = 0 ]; then
    # SubjectPublicKeyInfo DER for ed25519 = 30 2a 30 05 06 03 2b 65 70 03 21 00 || raw 32-byte key
    { printf '\x30\x2a\x30\x05\x06\x03\x2b\x65\x70\x03\x21\x00'; printf '%s' "$EDGE_UPDATE_PUBKEY" | base64 -d; } > "$WORK/update-pub.der"
    base64 -d < "$BIN.sig" > "$WORK/angar-edge.sig.bin"
    openssl pkeyutl -verify -pubin -keyform DER -inkey "$WORK/update-pub.der" -rawin -in "$BIN" -sigfile "$WORK/angar-edge.sig.bin" >/dev/null \
      || die "bad signature on angar-edge-linux-$ARCH: refusing to build"
  fi
  VERSION="$( [ "$DRY_RUN" = 1 ] && echo "latest" || tr -d ' \r\n' < "$WORK/version.txt")"
else
  run install -m 0755 "$BINARY" "$BIN"
  VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' "$EDGE_DIR/Cargo.toml" | head -n 1)"
fi
if [ "$DRY_RUN" = 0 ]; then
  head -c 4 "$BIN" | od -An -c | grep -q 'E   L   F' || die "$BIN is not an ELF executable"
fi
IMG="$OUT_DIR/angar-edge-$MODEL-$VERSION.img"

# ---------------------------------------------------------------- 2. base image
BASE_FILE="$WORK/base.download"
say "Base image: $BASE_URL"
if [ "$DRY_RUN" = 1 ]; then
  EFFECTIVE="$BASE_URL"
else
  EFFECTIVE="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$BASE_URL")"
fi
BASE_NAME="$(basename "$EFFECTIVE")"
run curl -fSL --retry 3 -o "$BASE_FILE" "$EFFECTIVE"

say "Verifying the base image checksum"
if [ "$DRY_RUN" = 0 ]; then
  if [ -n "$BASE_SUM" ]; then
    EXPECTED="$BASE_SUM"
  elif [ "$MODEL" = pi5 ]; then
    EXPECTED="$(curl -fsSL "$EFFECTIVE.sha256" | awk '{print $1}')"
  else
    EXPECTED="$(curl -fsSL "$(dirname "$EFFECTIVE")/SHA512SUMS" | awk -v f="$BASE_NAME" '$2==f || $2=="*"f {print $1}')"
  fi
  [ -n "$EXPECTED" ] || die "no published checksum found for $BASE_NAME (pass --base-sum)"
  if [ "${#EXPECTED}" = 64 ]; then ACTUAL="$(sha256sum "$BASE_FILE" | awk '{print $1}')"; else ACTUAL="$(sha512sum "$BASE_FILE" | awk '{print $1}')"; fi
  [ "$ACTUAL" = "$EXPECTED" ] || die "checksum mismatch for $BASE_NAME (expected $EXPECTED, got $ACTUAL)"
fi

say "Unpacking to $IMG"
case "$BASE_NAME" in
  *.img.xz) run sh -c "xz -dc '$BASE_FILE' > '$IMG'" ;;
  *.tar.xz) run tar -xJf "$BASE_FILE" -C "$WORK" disk.raw; run mv -f "$WORK/disk.raw" "$IMG" ;;
  *.raw|*.img) run cp --sparse=always "$BASE_FILE" "$IMG" ;;
  *) die "don't know how to unpack $BASE_NAME" ;;
esac
run truncate -s "+${EXTRA_MB}M" "$IMG"

# ---------------------------------------------------------------- 3. loop-mount
say "Attaching and mounting"
if [ "$DRY_RUN" = 1 ]; then
  LOOP=""
  ROOT_PART="/dev/loopXpN"; ROOT_NUM="N"; BOOT_PART="/dev/loopXpM"
  printf '+ losetup -Pf --show %s\n' "$IMG"
else
  LOOP="$(losetup -Pf --show "$IMG")"
  command -v partprobe >/dev/null 2>&1 && partprobe "$LOOP" || true
  sleep 1
  ROOT_PART=""; ROOT_SIZE=0; BOOT_PART=""
  for p in "$LOOP"p*; do
    [ -b "$p" ] || continue
    t="$(blkid -o value -s TYPE "$p" || true)"
    s="$(lsblk -bno SIZE "$p" | head -n 1)"
    if [ "$t" = ext4 ] && [ "$s" -gt "$ROOT_SIZE" ]; then ROOT_PART="$p"; ROOT_SIZE="$s"; fi
    if [ "$t" = vfat ] && [ -z "$BOOT_PART" ]; then BOOT_PART="$p"; fi
  done
  [ -n "$ROOT_PART" ] || die "no ext4 root partition found in $IMG"
  ROOT_NUM="${ROOT_PART##*p}"
fi
say "Growing root partition $ROOT_PART by ${EXTRA_MB} MB"
if [ "$DRY_RUN" = 1 ]; then
  printf '+ growpart /dev/loopX %s && e2fsck -pf %s && resize2fs %s\n' "$ROOT_NUM" "$ROOT_PART" "$ROOT_PART"
else
  growpart "$LOOP" "$ROOT_NUM" || [ $? -eq 1 ]   # 1 = NOCHANGE
  e2fsck -pf "$ROOT_PART" || [ $? -le 1 ]
  resize2fs "$ROOT_PART"
fi

run mkdir -p "$MNT"
mnt "$ROOT_PART" "$MNT"
if [ -n "$BOOT_PART" ]; then
  if [ "$MODEL" = pi5 ]; then
    run mkdir -p "$MNT/boot/firmware"
    mnt "$BOOT_PART" "$MNT/boot/firmware"
  else
    run mkdir -p "$MNT/boot/efi"
    mnt "$BOOT_PART" "$MNT/boot/efi"
  fi
fi
mnt --bind /dev "$MNT/dev"
mnt --bind /dev/pts "$MNT/dev/pts"
mnt -t proc proc "$MNT/proc"
mnt -t sysfs sysfs "$MNT/sys"

if [ "$DRY_RUN" = 0 ]; then
  # network inside the chroot, restored in cleanup
  if [ -e "$MNT/etc/resolv.conf" ] || [ -L "$MNT/etc/resolv.conf" ]; then mv -f "$MNT/etc/resolv.conf" "$MNT/etc/resolv.conf.angar-orig"; fi
  cp -L /etc/resolv.conf "$MNT/etc/resolv.conf"
  # don't start services inside the chroot
  printf '#!/bin/sh\nexit 101\n' > "$MNT/usr/sbin/policy-rc.d"; chmod 0755 "$MNT/usr/sbin/policy-rc.d"
  : > "$MNT/usr/sbin/policy-rc.d.angar"
  [ -z "$QEMU" ] || install -m 0755 "$QEMU" "$MNT/usr/bin/qemu-aarch64-static"
fi

# ---------------------------------------------------------------- 4. files
say "Installing angar-edge $VERSION"
run install -d -m 0755 "$MNT/opt/angar-edge/bin" "$MNT/usr/local/bin" "$MNT/usr/local/lib/angar-edge"
run install -m 0755 "$BIN" "$MNT/opt/angar-edge/bin/angar-edge"
run ln -sfn /opt/angar-edge/bin/angar-edge "$MNT/usr/local/bin/angar-edge"
run install -m 0644 "$EDGE_DIR/angar-edge.service" "$MNT/etc/systemd/system/angar-edge.service"
run install -d -m 0700 "$MNT/etc/angar-edge"
if [ "$MODEL" = pi5 ]; then
  run install -m 0755 "$HERE/led-pi5.sh" "$MNT/usr/local/lib/angar-edge/led.sh"
  run install -m 0644 "$HERE/angar-edge-led.service" "$MNT/etc/systemd/system/angar-edge-led.service"
fi
run install -d -m 0755 "$MNT/etc/systemd/system.conf.d"
if [ "$DRY_RUN" = 1 ]; then say "+ write system.conf.d/angar-watchdog.conf (RuntimeWatchdogSec=15)"; else
  # Hardware watchdog: systemd pets /dev/watchdog; a hung kernel/userspace reboots the box.
  # 15 s is the maximum of the Pi's bcm2835-wdt; the N100's iTCO_wdt accepts it too.
  printf '[Manager]\nRuntimeWatchdogSec=15\nRebootWatchdogSec=2min\n' > "$MNT/etc/systemd/system.conf.d/angar-watchdog.conf"
fi

# ---------------------------------------------------------------- 5. chroot customization
SETUP="$WORK/setup.sh"
cat > "$SETUP" <<'SETUP_EOF'
#!/bin/sh
# runs inside the image (chroot); $1 = model
set -eu
MODEL="$1"
export DEBIAN_FRONTEND=noninteractive LC_ALL=C
APT="apt-get -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold"

apt-get update
$APT full-upgrade
PKGS="avahi-daemon libnss-mdns unattended-upgrades ca-certificates systemd-timesyncd"
if [ "$MODEL" = n100 ]; then PKGS="$PKGS linux-image-amd64 cloud-guest-utils"; fi
if [ "$MODEL" = pi5 ]; then PKGS="$PKGS gpiod"; fi
# shellcheck disable=SC2086
$APT install --no-install-recommends $PKGS

# service user and state dir
if ! id angar-edge >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir /var/lib/angar-edge --shell /usr/sbin/nologin angar-edge
fi
chown -R angar-edge:angar-edge /opt/angar-edge/bin
install -d -m 0750 -o angar-edge -g angar-edge /var/lib/angar-edge

# unattended security upgrades (+ reboot at 03:30 when a kernel update needs it)
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/52angar-edge <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "03:30";
EOF

# mDNS: http://angar-edge.local
systemctl enable avahi-daemon.service
systemctl enable systemd-timesyncd.service || true

# port 53 must be free for the DNS forwarder
if [ -e /lib/systemd/system/systemd-resolved.service ]; then
  mkdir -p /etc/systemd/resolved.conf.d
  printf '[Resolve]\nDNSStubListener=no\nMulticastDNS=no\nLLMNR=no\n' > /etc/systemd/resolved.conf.d/angar-edge.conf
  ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf.angar-final
fi

# SSH off by default (support enables it on request); fresh host keys when it is turned on
for u in ssh.service ssh.socket sshd.service; do systemctl disable "$u" >/dev/null 2>&1 || true; done
rm -f /etc/ssh/ssh_host_*
if [ -e /lib/systemd/system/ssh.service ]; then
  mkdir -p /etc/systemd/system/ssh.service.d
  printf '[Service]\nExecStartPre=\nExecStartPre=/usr/bin/ssh-keygen -A\nExecStartPre=/usr/sbin/sshd -t\n' > /etc/systemd/system/ssh.service.d/angar-keys.conf
fi

# no interactive logins
passwd -l root >/dev/null
if id pi >/dev/null 2>&1; then usermod -L pi; fi
systemctl mask userconfig.service >/dev/null 2>&1 || true   # Raspberry Pi OS first-boot user wizard

if [ "$MODEL" = n100 ]; then
  # DHCP on every wired port with systemd-networkd (both i226-V ports; names vary per board)
  mkdir -p /etc/systemd/network
  printf '[Match]\nName=en* eth*\n\n[Network]\nDHCP=yes\nLinkLocalAddressing=no\n\n[DHCPv4]\nUseDomains=yes\n' > /etc/systemd/network/20-angar-wired.network
  systemctl disable networking.service >/dev/null 2>&1 || true
  rm -f /etc/netplan/*.yaml 2>/dev/null || true
  systemctl enable systemd-networkd.service
  if [ -e /lib/systemd/system/systemd-resolved.service ]; then systemctl enable systemd-resolved.service; fi
  # grow the root filesystem to the NVMe size on first boot
  cat > /etc/systemd/system/angar-growfs.service <<'EOF'
[Unit]
Description=Grow the root filesystem to the disk size (first boot)
ConditionPathExists=!/var/lib/angar-growfs.done
Before=angar-edge.service

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'dev=$(findmnt -no SOURCE /); disk=/dev/$(lsblk -no PKNAME "$dev"); part=$(cat /sys/class/block/$(basename "$dev")/partition); growpart "$disk" "$part" || true; resize2fs "$dev"; touch /var/lib/angar-growfs.done'

[Install]
WantedBy=multi-user.target
EOF
  systemctl enable angar-growfs.service
fi

printf 'angar-edge\n' > /etc/hostname
# unique machine-id per unit (generated on first boot)
: > /etc/machine-id
rm -f /var/lib/dbus/machine-id
apt-get clean
rm -rf /var/lib/apt/lists/*
SETUP_EOF

if [ "$DRY_RUN" = 1 ]; then
  say "+ chroot $MNT /bin/sh /tmp/angar-setup.sh $MODEL   (script below)"
  sed 's/^/    /' "$SETUP"
else
  install -m 0755 "$SETUP" "$MNT/tmp/angar-setup.sh"
  say "Customizing inside the image (apt, users, services)"
  chroot "$MNT" /bin/sh /tmp/angar-setup.sh "$MODEL"
  rm -f "$MNT/tmp/angar-setup.sh"
  # resolv.conf for the running device: resolved's upstream file (stub listener is off)
  if [ -L "$MNT/etc/resolv.conf.angar-final" ]; then
    rm -f "$MNT/etc/resolv.conf.angar-orig"
    mv -f "$MNT/etc/resolv.conf.angar-final" "$MNT/etc/resolv.conf.angar-orig"
  fi
fi

if [ "$MODEL" = pi5 ]; then
  CFG="$MNT/boot/firmware/config.txt"
  if [ "$DRY_RUN" = 1 ]; then say "+ append dtparam=watchdog=on, dtoverlay=disable-wifi, dtoverlay=disable-bt to $CFG"; else
    # watchdog on; radios off (keeps the device out of the RED 2014/53/EU scope, see docs/edge-hardware.md §7)
    for line in "dtparam=watchdog=on" "dtoverlay=disable-wifi" "dtoverlay=disable-bt"; do
      grep -qx "$line" "$CFG" || printf '%s\n' "$line" >> "$CFG"
    done
  fi
fi

# ---------------------------------------------------------------- 6. finish
say "Unmounting"
if [ "$DRY_RUN" = 0 ]; then
  sync
  cleanup
  LOOP=""
  trap - EXIT
fi
if [ "$COMPRESS" = 1 ]; then
  say "Compressing"
  run xz -T0 -k -f "$IMG"
  run sh -c "cd '$OUT_DIR' && sha256sum '$(basename "$IMG").xz' > '$(basename "$IMG").xz.sha256'"
fi
run sh -c "cd '$OUT_DIR' && sha256sum '$(basename "$IMG")' > '$(basename "$IMG").sha256'"
say "Image ready: $IMG"
say "Next: flash it, then provision each unit (edge/hardware/provision.sh) — see edge/hardware/README.md"
