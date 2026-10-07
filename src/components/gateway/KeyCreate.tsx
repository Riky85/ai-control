"use client";

import { useState, useTransition } from "react";
import { createGatewayKeyAction } from "@/lib/gateway-actions";

/** Nuova chiave del Gateway: la chiave intera si vede solo qui, una volta. */
export default function KeyCreate({ teams, disabled }: { teams: string[]; disabled?: boolean }) {
  const [form, setForm] = useState({ name: "", team: "", provider: "any", cap: "", models: "" });
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-wrap gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await createGatewayKeyAction(form);
            if ("error" in r) setError(r.error);
            else {
              setKey(r.key);
              setCopied(false);
              setForm({ name: "", team: form.team, provider: "any", cap: "", models: "" });
            }
          });
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-ink-400 flex-1 min-w-[150px]">
          App or key name
          <input value={form.name} onChange={set("name")} required maxLength={60} placeholder="Support bot" className="field" disabled={disabled} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-400 flex-1 min-w-[150px]">
          Team
          <input value={form.team} onChange={set("team")} maxLength={40} list="gw-teams" placeholder="Customer support" className="field" disabled={disabled} />
          <datalist id="gw-teams">
            {teams.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-400 flex-1 min-w-[150px]">
          Provider
          <select value={form.provider} onChange={set("provider")} className="field" disabled={disabled}>
            <option value="any">Both</option>
            <option value="openai">OpenAI only</option>
            <option value="anthropic">Anthropic only</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-400 flex-1 min-w-[150px]">
          Monthly cap €
          <input value={form.cap} onChange={set("cap")} inputMode="decimal" placeholder="None" className="field tabular" disabled={disabled} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-400 flex-1 min-w-[150px]">
          Allowed models
          <input value={form.models} onChange={set("models")} placeholder="Workspace rules" className="field font-mono text-xs" disabled={disabled} />
        </label>
        <button className="btn btn-secondary shrink-0" disabled={disabled || pending}>
          {pending ? "Creating…" : "Create key"}
        </button>
      </form>
      {error && <p className="text-xs text-alarm">{error}</p>}
      {key && (
        <div className="rounded-lg border border-line p-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input readOnly value={key} className="field flex-1 min-w-0 font-mono text-xs" onFocus={(e) => e.target.select()} aria-label="New gateway key" />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={async () => {
                await navigator.clipboard.writeText(key);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-ink-400">Copy it now: it won&apos;t be shown again.</p>
        </div>
      )}
    </div>
  );
}
