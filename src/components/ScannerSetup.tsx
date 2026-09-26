"use client";

import { useState, useTransition } from "react";
import { createDiscoveryTokenAction } from "@/lib/discovery-actions";

type Os = "mac" | "windows" | "network" | "edge";

// Il token compare una volta sola, già dentro i comandi da copiare.
export default function ScannerSetup({ base, hint, canCreate }: { base: string; hint: string | null; canCreate: boolean }) {
  const [token, setToken] = useState<string | null>(null);
  const [os, setOs] = useState<Os>("mac");
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const t = token ?? "YOUR_TOKEN";
  const url = `${base}/api/discovery/scanner.py`;
  const cmd =
    os === "mac"
      ? `curl -fsSL ${url} -o angar-scan.py && python3 angar-scan.py --token ${t}`
      : os === "windows"
        ? `iwr ${url} -OutFile angar-scan.py; py angar-scan.py --token ${t}`
        : os === "network"
          ? `curl -fsSL ${url} -o angar-scan.py && sudo python3 angar-scan.py --token ${t} --sniff 900 --yes`
          : `docker run -d --name angar-edge --restart unless-stopped --network host --cap-add NET_RAW --cap-add NET_ADMIN -e ANGAR_TOKEN=${t} python:3.12-alpine sh -c "apk add --no-cache tcpdump curl >/dev/null && curl -fsSL ${url} -o /s.py && while true; do python3 /s.py --network-only --sniff 3600 --yes; done"`;

  return (
    <div className="flex flex-col gap-3">
      {!token ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!canCreate || pending}
            onClick={() => start(async () => setToken((await createDiscoveryTokenAction()).token))}
            className="btn btn-primary disabled:opacity-50"
          >
            {pending ? "Creating…" : hint ? "Create a new token" : "Create scan token"}
          </button>
          <span className="text-xs text-ink-400">
            {hint ? <>Current token <span className="font-mono">{hint}</span> — a new one replaces it.</> : "Links the scan results to this workspace."}
            {!canCreate && " Needs the admin role."}
          </span>
        </div>
      ) : (
        <div className="text-xs text-ink-400">Token created — it's already in the command below. Copy it now: it won't be shown again.</div>
      )}

      <div className="inline-flex gap-1 bg-ink rounded-lg p-1 self-start">
        {(
          [
            ["mac", "macOS / Linux"],
            ["windows", "Windows"],
            ["network", "Whole network"],
            ["edge", "Always on (angar Edge)"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setOs(id)} className={`text-xs px-3 py-1 rounded-md transition-colors ${os === id ? "bg-panel text-ink-100 font-medium shadow-card" : "text-ink-400 hover:text-ink-100"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-stretch gap-2">
        <code className="flex-1 min-w-0 rounded-lg border border-line bg-ink px-3 py-2.5 text-xs font-mono text-ink-100 overflow-x-auto whitespace-nowrap">{cmd}</code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(cmd);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="btn btn-secondary shrink-0"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-xs text-ink-400">
        {os === "mac" && "Open Terminal, paste, press Enter. It shows what it found and asks before sending."}
        {os === "windows" && "Open PowerShell, paste, press Enter. Needs Python 3 (free in the Microsoft Store)."}
        {os === "network" &&
          "Run once on a server that sees your DNS traffic (e.g. the DNS server or a mirror port): it listens for 15 minutes and reports every AI service used by anyone on the network."}
        {os === "edge" &&
          "angar Edge as software: paste on any always-on Linux machine with Docker that sees your DNS traffic (DNS server, firewall mirror port, a small PC). It reports new AI every hour, forever. No hardware to buy."}
      </p>
    </div>
  );
}
