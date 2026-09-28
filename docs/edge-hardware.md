# angar Edge device: hardware plan

The sensor is software first: a static Linux binary and the multi-arch image `ghcr.io/riky85/angar-edge`.
The **angar device** is that same software on a box we ship, for sites that have no server and no IT
person. It costs €29 per device per month, with a 12-month minimum. Hardware, shipping and
replacement are included.

## 1. Reference boards

| | A. Raspberry Pi 5 / CM5 + PoE | B. Fanless x86 mini-PC (Intel N100) |
|---|---|---|
| CPU / RAM | Cortex-A76 ×4, 4 GB | N100 ×4, 8 GB |
| Network | 1× GbE (PoE+ via HAT) | 2× 2.5GbE (i226-V) |
| Storage | 32 GB industrial microSD or 64 GB NVMe (HAT) | 128 GB NVMe |
| Power | PoE+ (one cable), or USB-C 27 W | 12 V DC barrel, 10–15 W |
| Pros | Cheap and small, a single cable with PoE, huge community | Second port for mirror/SPAN, TPM 2.0, more headroom, AES-NI |
| Cons | microSD wear (use NVMe or industrial SD), 1 port | Bigger, costs more, more SKUs to qualify |
| Use for | Small offices (< 100 devices), DNS and syslog | Plants, multi-VLAN, 100–1,000 devices |

Our choice: **B** is the default SKU, because the second port and the TPM make it the safer
product. **A** is the "Edge Mini" for small offices. The binary already builds for both
`x86_64` and `aarch64`.

## 2. Indicative BOM (EUR, ex VAT, at 100 units)

| Item | A. Pi 5 | B. N100 |
|---|---:|---:|
| Board / barebone | 60 | 115 |
| RAM / storage | incl. + NVMe HAT and 64 GB, 25 | 8 GB + 128 GB, 30 |
| PoE+ HAT / PSU (CE, EU plug) | 25 | 12 |
| Enclosure, branded (aluminium, laser logo) | 18 | 10 (relabel of the OEM case) |
| QR serial label, quick-start card, box | 4 | 4 |
| Assembly, flashing, burn-in test (24 h) | 8 | 8 |
| **Unit cost** | **≈ €140** | **≈ €180** |
| Shipping EU both ways + 5% RMA reserve | 20 | 22 |

## 3. Pricing math

- Revenue over the 12-month minimum: 12 × €29 = **€348**. Most customers keep the box past
  12 months, and a device lasts 4–5 years.
- Hardware is paid back in about 6–7 months (N100: €202 ÷ €29). The gross margin over 36 months
  is about 80%, including support.
- Price to partners at 30% off is €20.30 per month, which covers the N100 in about 10 months. A
  12-month minimum stays profitable, but only with **the device returned at the end of the loan
  (comodato)**. Refurbish and reship returned units, at about €15 each.
- We don't sell the device outright at first. We may add a one-off €249 purchase later, for public
  sector buyers who cannot rent equipment.

## 4. Enclosure and branding

The device matches the `EdgeBox` render: a dark anodised aluminium box, the angar logo laser-etched
on the lid, and an **orange status strip** on the front.

The status strip has four states:

- Off: no power.
- Pulsing: booting or not yet claimed.
- Solid: online.
- Fast blink: offline for more than 15 minutes.

Ports are on the side. The underside carries a label with the serial number, a QR code and the
CE/WEEE marks. For option B, start with an OEM case plus a relabel and front light pipe. Move to a
custom extrusion at more than 500 units per year.

## 5. Zero-touch provisioning

1. **Factory.** We flash a hardened Debian (or Raspberry Pi OS Lite, 64-bit) image. It includes
   `angar-edge`, a unique serial number (`AE-XXXX-XXXX`) and a per-device claim secret. The secret
   is sealed in the TPM on B and stored in a root-only file on A. We register the serial with its
   secret hash in angar as "unclaimed". The QR code on the label encodes `https://…/edge/claim?serial=AE-…`.
2. **Customer.** The customer scans the QR code while logged in, picks the workspace and the site
   name, and plugs in the LAN cable. The device is now **claimed**.
3. **First boot.** The device gets an address by DHCP, calls `POST /api/edge/claim` with its serial
   and claim secret, and receives its `ange_…` sensor token. After that it works like any
   software sensor.
4. **DNS option.** A web page on the device (`http://angar-edge.local`) shows its IP and the
   one-line change to make on the router's DHCP. This page is read-only, so there is no login to
   harden.

*Needs server work, not built yet:* a claim endpoint and page, and `EdgeSensor.serial` /
`claimSecretHash` / `claimedAt`. We can reuse `kind = "device"`.

## 6. Updates, watchdog, security

- **Signed OTA updates.** The device checks the `edge-latest` release once a day. Each binary is
  signed with minisign/ed25519, and the public key is baked into the image. Two slots (A/B) are
  kept and the device rolls back if the new binary doesn't report within 10 minutes. Updates are
  staged by ring: our own devices first, then 10%, then everyone.
- **Watchdog.** A systemd `WatchdogSec=` restarts the service, and the hardware watchdog reboots
  the box if it hangs. The device keeps unsent deltas on disk (bounded) and sends them when it
  reconnects.
- **Hardening.** SSH is off by default. Unattended security upgrades are on. Disks are encrypted
  with a TPM-bound key on B. There are no inbound ports except 53 and 514 on the LAN. For remote
  support, the device opens an outbound support tunnel only when the customer switches it on.

## 7. EU compliance (before first sale)

- **CE, self-declared (DoC).** EMC 2014/30/EU (EN 55032/55035) and LVD 2014/35/EU (EN 62368-1).
  Buy a pre-certified board and PSU and keep the reports in the technical file.
- **RED 2014/53/EU** applies only if Wi-Fi or Bluetooth is left on. **Disable the radios**
  (option B: order the model without Wi-Fi) to stay out of scope. The Cyber Resilience Act
  applies from 2027, and the signed updates and vulnerability handling above cover most of it.
- **RoHS 2011/65/EU** and REACH: get declarations from the suppliers.
- **WEEE.** Register as a producer in Italy (Registro AEE) and in Germany (stiftung ear) before
  placing devices on each market, or use a compliance scheme. A "producer" includes a relabeller.
  Battery rules apply only to the board's RTC coin cell.
- **GPSR (EU 2023/988).** Name an EU responsible person and put a product ID, safety information
  and the manufacturer address on the box.
- **Packaging.** CONAI (Italy) and LUCID (Germany) registrations.

## 8. Logistics and RMA

- Start with 3PL stock in Italy, shipping to Italy, Germany, Austria and Switzerland by DHL or
  GLS within 2–3 days. Ship from the office for the first 50 units.
- **RMA.** If a device is offline for more than 24 hours and remote checks fail, we send a
  pre-provisioned replacement the next day. The customer claims it with the QR code, and the old
  device's token is revoked automatically. A prepaid label for the return goes in the box.
- Track every serial through its lifecycle: stock → claimed → active → returned → refurbished.

## 9. Phased plan

1. **Now: software.** Docker, VM or Raspberry Pi installs, plus cloud logs, included from Growth.
   This proves demand at no hardware cost.
2. **Next: white-label mini-PC.** Build 25–50 N100 units by hand, with the zero-touch claim flow,
   signed OTA updates and CE/WEEE paperwork. Sell mainly through MSPs.
3. **At more than 500 units per year: custom.** A custom enclosure on the CM5 or N100, an
   integrated PoE option and a contract manufacturer in the EU.
