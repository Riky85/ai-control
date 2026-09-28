# angar Edge — sensor ⇄ server protocol

A sensor is created on the platform (Edge → Sensors). It gets a token `ange_…`
(shown once; only its SHA-256 is stored in `EdgeSensor.tokenHash`). All calls
send `Authorization: Bearer ange_…`. Server default: `https://ai-control-production.up.railway.app`.

Privacy rule for every path: never URLs, paths, query strings, page titles or
content. Only: AI service id, domain matched against the catalog, client IP /
hostname, counts, bytes sent (from firewall logs), day.

## GET /api/edge/config

Called at start and every 10 minutes.

```json
{
  "sensorId": "…", "name": "Milan office", "company": "Acme S.p.A.",
  "privacyMode": "individual" | "department" | "anonymous",
  "dnsEnabled": true, "syslogEnabled": true, "blockEnabled": false, "scanLan": false,
  "reportEverySec": 300,
  "services": [ { "id": "chatgpt", "name": "ChatGPT", "kind": "web" | "api", "domains": ["chatgpt.com", "chat.openai.com"] } ],
  "blocked": [ { "serviceId": "deepseek", "name": "DeepSeek", "domains": ["deepseek.com"], "instead": "Microsoft Copilot" } ]
}
```

Domain matching is by suffix (`chatgpt.com` matches `ab.chatgpt.com`), same as
`src/lib/discovery/catalog.ts#matchDomain`. `kind` is `api` for API endpoints
(AiAssetType AI_API) — calls to them are "invisible AI" (scripts, automations, agents).

When `privacyMode` is `anonymous` the sensor sends `client: "*"` and no names.

## POST /api/edge/report

Deltas since the previous successful report (the server adds them up).

```json
{
  "version": "0.1.0", "os": "linux-x86_64", "hostIp": "192.168.1.20",
  "stats": { "dnsQueries": 1234, "aiQueries": 56, "clients": 14, "blocked": 2, "logLines": 0, "uptimeSec": 3600 },
  "events": [
    { "day": "2026-09-28", "serviceId": "chatgpt", "kind": "web", "client": "192.168.1.34", "clientName": "PC-MARIO",
      "hits": 12, "bytesUp": 0, "blocked": 0, "source": "dns" }
  ],
  "candidates": [ { "day": "2026-09-28", "domain": "newaitool.ai", "client": "192.168.1.34", "hits": 3, "source": "dns" } ],
  "localModels": [ { "ip": "192.168.1.50", "port": 11434, "runtime": "ollama", "models": ["llama3.1:8b"] } ]
}
```

`source`: `dns` | `syslog:fortinet` | `syslog:sophos` | `syslog:paloalto` | `syslog:meraki` |
`syslog:unifi` | `syslog:pfsense` | `syslog:generic` | `scan`.
`bytesUp` only comes from firewall logs (e.g. Fortinet `sentbyte`); DNS can't see bytes.
Limits: ≤ 5000 events, ≤ 500 candidates, ≤ 200 local models, body ≤ 1 MB.

Response: `{ "ok": true }` (401 bad token, 413 too big).

## POST /api/edge/logs (cloud log push)

For sensors of kind `cloud` (Cloudflare Gateway Logpush HTTP destination,
Zscaler NSS / Cloud NSS HTTP, Cisco Umbrella, any SIEM forwarder). Body: raw text,
NDJSON, CSV or syslog lines (≤ 5 MB, optionally `Content-Encoding: gzip`).
Token in `Authorization: Bearer ange_…` or `?token=ange_…` (some log pushers can't set headers).
The server parses lines with the same rules as the sensor's syslog parsers
(`src/lib/edge/parse.ts`) and stores EdgeEvents with `source: "cloud:<vendor>"`.

## Sensor behaviour

- **DNS mode** (`dnsEnabled`): UDP+TCP :53 forwarder to upstream resolvers (flag / env,
  default: resolvers from `/etc/resolv.conf` that aren't itself, else 1.1.1.1 and 9.9.9.9).
  Every query is matched locally; only AI matches are counted. With `blockEnabled`,
  queries for `blocked` domains get `0.0.0.0` / `::` (A/AAAA) with TTL 60 and are counted as `blocked`.
- **Syslog mode** (`syslogEnabled`): UDP+TCP :514 (and :5514 for non-root). Parsers
  for Fortinet, Sophos, Palo Alto, Meraki, UniFi/dnsmasq, pfSense/Unbound, generic.
- **LAN scan** (`scanLan`, opt-in): every 6 h, TCP-probe the sensor's own /24 on
  11434 (Ollama `/api/tags`) and 1234 (LM Studio `/v1/models`), 2 s timeout, ≤ 64 in parallel.
- Reports every `reportEverySec`; keeps unsent deltas (bounded) when offline.

## Hardware devices (angar device): factory registry and zero-touch claim

Each device is flashed with `/etc/angar-edge/device.json`:

```json
{ "serial": "AE-7K3M-Q9TZ", "secret": "<32+ random chars>", "model": "n100" | "pi5" }
```

The server keeps a factory registry (`EdgeDevice`: serial, sha256 of secret, model,
status `stock` | `claimed` | `returned` | `retired`, linked sensor). Serials are
created by platform admins on /system (batch → CSV with serial, secret, claim URL
for the QR label) or with `POST /api/edge/devices` + `Authorization: Bearer $EDGE_FACTORY_TOKEN`
body `{ "count": 10, "model": "n100" }` → `{ "devices": [{ "serial", "secret", "claimUrl" }] }`.

The QR label encodes `<app>/edge/claim?serial=AE-XXXX-XXXX`. A workspace admin opens
it (or types the serial in Edge → Sensors → Add a device), names the site, and the
device is linked to a new `EdgeSensor` (kind `device`).

### POST /api/edge/claim (called by the device, no token yet)

Body `{ "serial": "AE-…", "secret": "…", "version": "0.2.0" }`.
- 404 unknown serial / 403 wrong secret (constant-time compare of hashes).
- 202 `{ "status": "unclaimed", "claimUrl": "…" }` while nobody has claimed it (device retries every 30 s).
- 200 `{ "status": "claimed", "token": "ange_…", "sensorId": "…", "company": "…" }` once claimed.
  Every successful call issues a fresh token (rotating the previous one), so a
  re-flashed or reset device can always recover; the device stores it in its state dir.
- 410 `{ "status": "retired" }` if the device was replaced / returned (device stops sending and shows it on its status page).

### Signed updates

The `edge-latest` release also carries `angar-edge-linux-<arch>.sig` (ed25519 signature,
base64, of the binary) and `angar-edge-version.txt`. Devices check once a day, verify the
signature with the public key built into the binary (`EDGE_UPDATE_PUBKEY`), swap binaries
atomically keeping the previous one, and roll back if the new one fails to report within 10 minutes.
