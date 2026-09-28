"use client";

import { useState, useTransition } from "react";
import CopyButton from "@/components/CopyButton";
import { createSensorAction, rotateSensorTokenAction } from "@/lib/edge-actions";

const DEFAULT_SERVER = "https://ai-control-production.up.railway.app";

type Created = { id?: string; name: string; kind: string; token: string };

function Cmd({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-ink-400">{label}</span>
      <div className="flex items-start gap-2">
        <code className="flex-1 min-w-0 rounded-lg border border-line bg-ink px-3 py-2 text-xs text-ink-100 font-mono break-all select-all">{value}</code>
        <CopyButton text={value} />
      </div>
    </div>
  );
}

const SYSLOG_NOTES: [string, string][] = [
  ["Fortinet", "Log & Report → Log Settings → Send logs to syslog (or: config log syslogd setting). Enable web filter / DNS logging on the policy."],
  ["Sophos", "System services → Log settings → Add syslog server; tick Web filter and Application control."],
  ["Palo Alto", "Device → Server Profiles → Syslog, then add it to the Log Forwarding profile for URL and Traffic logs."],
  ["Meraki", "Network-wide → General → Reporting → add a syslog server with the URLs role."],
  ["UniFi", "Settings → System → Remote logging (syslog), with DNS query logging on (dnsmasq)."],
  ["pfSense / OPNsense", "Enable Unbound “log queries”, then Status → System logs → Settings → remote log server."],
];

const CLOUD_NOTES: [string, string][] = [
  ["Cloudflare Gateway", "Logpush → Create job → HTTP destination. Dataset: Gateway DNS (and Gateway HTTP). Paste the push URL."],
  ["Zscaler", "Cloud NSS feed → HTTPS endpoint = push URL, JSON output with clientip/cintip, hostname and reqsize."],
  ["Cisco Umbrella", "Forward the DNS or proxy CSV logs (e.g. from your S3 export) with any shipper, gzip allowed."],
  ["Any SIEM", "Splunk, Sentinel, Elastic, Graylog: an HTTP output of raw lines or NDJSON. Up to 5 MB per request."],
];

export function SetupSteps({ created, appUrl, edgeImage }: { created: Created; appUrl: string; edgeImage: string }) {
  const server = appUrl !== DEFAULT_SERVER ? appUrl : null;
  const t = created.token;
  if (created.kind === "cloud") {
    const push = `${appUrl}/api/edge/logs?token=${t}`;
    return (
      <div className="flex flex-col gap-4">
        <Cmd label="Push URL (POST, text / NDJSON / CSV / syslog, gzip ok). The token is in it: treat it as a secret." value={push} />
        <Cmd label="Test it" value={`curl -X POST --data-binary @dns.log "${push}"`} />
        <Notes items={CLOUD_NOTES} />
      </div>
    );
  }
  const install = `curl -fsSL ${appUrl}/api/edge/install.sh | sudo ${server ? `ANGAR_SERVER=${server} ` : ""}sh -s -- ${t}`;
  const docker = `docker run -d --name angar-edge --restart unless-stopped --network host -e ANGAR_EDGE_TOKEN=${t}${server ? ` -e ANGAR_SERVER=${server}` : ""} -v angar-edge:/var/lib/angar-edge ${edgeImage}`;
  return (
    <div className="flex flex-col gap-4">
      <Cmd label="Linux with systemd (Raspberry Pi OS 64-bit, Debian, Ubuntu, any VM)" value={install} />
      <Cmd label="or Docker (host network, so it sees the real device IPs)" value={docker} />
      <div className="text-sm text-ink-400 flex flex-col gap-1">
        <span className="text-ink-100 font-medium">Then pick one (or both):</span>
        <span>1. DNS — set the DNS server your router / DHCP hands out to the sensor&apos;s IP.</span>
        <span>2. Firewall logs — send syslog to the sensor&apos;s IP on UDP 514.</span>
      </div>
      <Notes items={SYSLOG_NOTES} label="Syslog settings by firewall" />
    </div>
  );
}

function Notes({ items, label = "Setup by vendor" }: { items: [string, string][]; label?: string }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-sm text-ink-400 hover:text-ink-100 select-none">{label} ›</summary>
      <dl className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="text-ink-100 font-medium">{k}</dt>
            <dd className="text-ink-400">{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** "Add a sensor": tipo, nome → token mostrato una sola volta con i comandi pronti. */
export function AddSensor({ appUrl, edgeImage, canEdit }: { appUrl: string; edgeImage: string; canEdit: boolean }) {
  const [kind, setKind] = useState<"software" | "cloud">("software");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [pending, start] = useTransition();

  if (created) {
    return (
      <section className="rounded-xl border border-accent/50 bg-panel p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink-100">{created.name} is ready</h2>
            <p className="text-sm text-ink-400 mt-0.5">Copy the token now — it&apos;s shown only once. It appears online here within a few minutes.</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setCreated(null); setName(""); }}>Done</button>
        </div>
        <Cmd label="Token" value={created.token} />
        <SetupSteps created={created} appUrl={appUrl} edgeImage={edgeImage} />
      </section>
    );
  }

  const options = [
    { id: "software" as const, title: "Software on a server", desc: "VM, Raspberry Pi or any Linux box — Docker or one-line install. DNS and firewall logs." },
    { id: "cloud" as const, title: "Cloud logs", desc: "Cloudflare Gateway, Zscaler, Cisco Umbrella or your SIEM push logs to angar." },
  ];
  return (
    <section className="rounded-xl border border-line bg-panel p-5">
      <h2 className="text-base font-semibold text-ink-100">Add a sensor</h2>
      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await createSensorAction({ name, kind });
            if ("error" in r) setError(r.error);
            else setCreated(r);
          });
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {options.map((o) => (
            <label key={o.id} className={`rounded-lg border p-3 cursor-pointer transition-colors ${kind === o.id ? "border-accent bg-ink" : "border-line hover:border-ink-400"}`}>
              <input type="radio" name="kind" value={o.id} checked={kind === o.id} onChange={() => setKind(o.id)} className="sr-only" />
              <div className="text-sm font-medium text-ink-100">{o.title}</div>
              <div className="text-xs text-ink-400 mt-0.5">{o.desc}</div>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "cloud" ? "Name, e.g. Cloudflare Gateway" : "Name, e.g. Milan office"} className="field w-64" maxLength={60} required disabled={!canEdit} />
          <button className="btn btn-primary btn-sm" disabled={pending || !canEdit}>{pending ? "Creating…" : "Create sensor"}</button>
          {!canEdit && <span className="text-xs text-ink-400">Only admins can add sensors.</span>}
        </div>
        {error && <p className="text-sm text-alarm">{error}</p>}
      </form>
    </section>
  );
}

/** Token perso: se ne genera uno nuovo (il vecchio smette di funzionare). */
export function RotateToken({ sensorId, name, kind, appUrl, edgeImage }: { sensorId: string; name: string; kind: string; appUrl: string; edgeImage: string }) {
  const [created, setCreated] = useState<Created | null>(null);
  const [pending, start] = useTransition();
  if (created) {
    return (
      <div className="flex flex-col gap-3 mt-2 max-w-3xl">
        <Cmd label="New token (shown once — the old one no longer works)" value={created.token} />
        <SetupSteps created={created} appUrl={appUrl} edgeImage={edgeImage} />
      </div>
    );
  }
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Create a new token for ${name}? The current one stops working right away.`)) return;
        start(async () => {
          const r = await rotateSensorTokenAction(sensorId);
          if ("token" in r) setCreated({ name, kind, token: r.token });
          else alert(r.error);
        });
      }}
    >
      New token
    </button>
  );
}

/** Pulsante con conferma (eliminare un sensore cancella anche i suoi dati). */
export function ConfirmSubmit({ label, message, className = "btn btn-ghost btn-sm text-alarm" }: { label: string; message: string; className?: string }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
