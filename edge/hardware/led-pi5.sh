#!/bin/sh
# angar device status strip — example LED hook for the Raspberry Pi 5.
#
# angar-edge writes its state to /run/angar-edge/state:
#   booting | unclaimed | online | offline | retired
# This script maps it to the patterns of docs/edge-hardware.md §4:
#   booting, unclaimed  → pulsing (slow blink, 1 s on / 1 s off)
#   online              → solid
#   offline             → fast blink (100 ms)
#   retired             → short flash every 3 s
#   sensor not running  → off
#
# Two outputs:
#   LED_MODE=sysfs (default)  /sys/class/leds/$LED_NAME (ACT = the green on-board LED; wire the
#                             front light pipe to it or pick another led class device)
#   LED_MODE=gpio             an LED (with resistor) or a MOSFET driving the strip on a GPIO line,
#                             through libgpiod's `gpioset` (apt install gpiod; v1 and v2 syntax).
#                             LED_GPIO_CHIP (default gpiochip0 — on the Pi 5 kernel ≥ 6.6 the
#                             header is gpiochip0; older kernels: gpiochip4), LED_GPIO_LINE (default 17)
#
# Installed as angar-edge-led.service (runs as root: sysfs/gpio need it). Settings go in
# /etc/default/angar-edge-led. The N100 SKU uses the same state file with its own driver.
set -eu

STATE_FILE="${ANGAR_EDGE_STATE_FILE:-/run/angar-edge/state}"
LED_MODE="${LED_MODE:-sysfs}"
LED_NAME="${LED_NAME:-ACT}"
LED_GPIO_CHIP="${LED_GPIO_CHIP:-gpiochip0}"
LED_GPIO_LINE="${LED_GPIO_LINE:-17}"
LED="/sys/class/leds/$LED_NAME"

read_state() {
  s=""
  [ -r "$STATE_FILE" ] && s="$(head -n 1 "$STATE_FILE" 2>/dev/null || true)"
  # a stale file from a stopped sensor means "off"
  if [ -n "$s" ] && command -v systemctl >/dev/null 2>&1 && ! systemctl is-active --quiet angar-edge.service; then
    s="stopped"
  fi
  printf '%s' "${s:-stopped}"
}

# ---- sysfs: the kernel blinks the LED (timer trigger), we only change settings on a state change
sysfs_set() { # on_ms off_ms  (0 0 = off, 1 0 = solid)
  [ -d "$LED" ] || { echo "led-pi5: $LED not found (set LED_NAME, see ls /sys/class/leds)" >&2; exit 1; }
  max="$(cat "$LED/max_brightness" 2>/dev/null || echo 1)"
  if [ "$1" = 0 ]; then
    echo none > "$LED/trigger"; echo 0 > "$LED/brightness"
  elif [ "$2" = 0 ]; then
    echo none > "$LED/trigger"; echo "$max" > "$LED/brightness"
  else
    echo timer > "$LED/trigger"
    echo "$1" > "$LED/delay_on"
    echo "$2" > "$LED/delay_off"
  fi
}

run_sysfs() {
  last=""
  orig_trigger="$(sed -n 's/.*\[\(.*\)\].*/\1/p' "$LED/trigger" 2>/dev/null || echo mmc0)"
  trap 'echo "$orig_trigger" > "$LED/trigger" 2>/dev/null; exit 0' INT TERM
  while :; do
    s="$(read_state)"
    if [ "$s" != "$last" ]; then
      case "$s" in
        booting|unclaimed) sysfs_set 1000 1000 ;;
        online) sysfs_set 1 0 ;;
        offline) sysfs_set 100 100 ;;
        retired) sysfs_set 150 2850 ;;
        *) sysfs_set 0 0 ;;
      esac
      last="$s"
    fi
    sleep 2
  done
}

# ---- gpio: we toggle the line ourselves; each step holds a value for N ms
if gpioset --version 2>/dev/null | grep -q 'v2'; then GPIOD=2; else GPIOD=1; fi
gpio_hold() { # value ms
  if [ "$GPIOD" = 2 ]; then
    gpioset -c "$LED_GPIO_CHIP" -p "${2}ms" -t 0 "$LED_GPIO_LINE=$1"
  else
    gpioset --mode=time --usec="$(( $2 * 1000 ))" "$LED_GPIO_CHIP" "$LED_GPIO_LINE=$1"
  fi
}

run_gpio() {
  command -v gpioset >/dev/null 2>&1 || { echo "led-pi5: gpioset not found (apt install gpiod)" >&2; exit 1; }
  trap 'gpio_hold 0 1; exit 0' INT TERM
  while :; do
    case "$(read_state)" in
      booting|unclaimed) gpio_hold 1 1000; gpio_hold 0 1000 ;;
      online) gpio_hold 1 2000 ;;
      offline) i=0; while [ $i -lt 10 ]; do gpio_hold 1 100; gpio_hold 0 100; i=$((i + 1)); done ;;
      retired) gpio_hold 1 150; gpio_hold 0 2850 ;;
      *) gpio_hold 0 2000 ;;
    esac
  done
}

case "$LED_MODE" in
  sysfs) run_sysfs ;;
  gpio) run_gpio ;;
  *) echo "led-pi5: LED_MODE must be sysfs or gpio" >&2; exit 2 ;;
esac
