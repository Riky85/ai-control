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
