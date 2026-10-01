"use client";

import { useState, useTransition } from "react";
import { createDeviceBatchAction } from "@/lib/edge-actions";

// Qui e non in lib/edge/device-id.ts: quello usa "crypto" di Node, da non portare nel browser.
function devicesCsv(rows: { serial: string; secret: string; model: string; claimUrl: string }[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return ["serial,secret,model,claimUrl", ...rows.map((r) => [r.serial, r.secret, r.model, r.claimUrl].map(esc).join(","))].join("\n") + "\n";
}

/** Nuovo lotto di dispositivi angar → CSV scaricato subito (i segreti non si vedono più). */
export default function DeviceBatchForm() {
  const [count, setCount] = useState("10");
  const [model, setModel] = useState("n100");
  const [batch, setBatch] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const r = await createDeviceBatchAction({ count: Number(count), model, batch });
          if ("error" in r) return setMsg({ ok: false, text: r.error });
          const blob = new Blob([devicesCsv(r.devices)], { type: "text/csv" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `angar-devices-${(batch || model).replace(/[^\w-]+/g, "_")}-${new Date().toISOString().slice(0, 10)}.csv`;
          a.click();
          // Revocare subito può annullare il download in alcuni browser.
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          setMsg({ ok: true, text: `${r.devices.length} devices created — CSV downloaded. Secrets aren't shown again: keep the file safe.` });
        });
      }}
    >
      <input value={count} onChange={(e) => setCount(e.target.value)} type="number" min={1} max={500} className="field w-20 tabular" aria-label="How many devices" required />
      <select value={model} onChange={(e) => setModel(e.target.value)} className="field w-28" aria-label="Model">
        <option value="n100">N100</option>
        <option value="pi5">Pi 5</option>
      </select>
      <input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="Batch, e.g. 2026-10 N100" maxLength={60} className="field w-48" aria-label="Batch name" />
      <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Creating…" : "Create + download CSV"}</button>
      {msg && <span className={`text-xs w-full ${msg.ok ? "text-steady" : "text-alarm"}`}>{msg.text}</span>}
    </form>
  );
}
