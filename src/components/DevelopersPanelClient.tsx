"use client";

import { useState, useTransition } from "react";
import { createApiKeyAction, createWebhookAction } from "@/lib/developers-actions";

type Ev = { id: string; label: string };

/** Moduli di creazione: la chiave API e il segreto del webhook si vedono una volta sola. */
export function NewApiKey({ disabled }: { disabled?: boolean }) {
  const [name, setName] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await createApiKeyAction({ name });
            if ("error" in r) setError(r.error);
            else {
              setKey(r.key);
              setName("");
            }
          });
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name, e.g. Power BI" className="field flex-1 min-w-0" maxLength={60} disabled={disabled} />
        <button className="btn btn-secondary btn-sm" disabled={disabled || pending}>{pending ? "Creating…" : "Create key"}</button>
      </form>
      {error && <p className="text-xs text-alarm">{error}</p>}
      {key && <Secret value={key} note="Copy it now: it won&apos;t be shown again." />}
    </div>
  );
}

export function NewWebhook({ events, disabled }: { events: readonly Ev[]; disabled?: boolean }) {
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<string[]>(events.map((e) => e.id));
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await createWebhookAction({ url, events: picked });
          if ("error" in r) setError(r.error);
          else {
            setSecret(r.secret);
            setUrl("");
          }
        });
      }}
    >
      <div className="flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} type="url" required placeholder="https://example.com/angar-webhook" className="field flex-1 min-w-0" disabled={disabled} />
        <button className="btn btn-secondary btn-sm" disabled={disabled || pending}>{pending ? "Adding…" : "Add webhook"}</button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {events.map((ev) => (
          <label key={ev.id} className="flex items-center gap-1.5 text-xs text-ink-400 cursor-pointer">
            <input type="checkbox" className="accent-accent" checked={picked.includes(ev.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, ev.id] : picked.filter((x) => x !== ev.id))} disabled={disabled} />
            <span className="font-mono text-ink-100">{ev.id}</span>
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-alarm">{error}</p>}
      {secret && <Secret value={secret} note="Signing secret — copy it now, it won't be shown again. Verify X-Angar-Signature = sha256=HMAC-SHA256(secret, `${X-Angar-Timestamp}.${body}`)." />}
    </form>
  );
}

function Secret({ value, note }: { value: string; note: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-line bg-ink-100/[0.03] p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input readOnly value={value} className="field flex-1 min-w-0 font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="text-xs text-ink-400">{note}</p>
    </div>
  );
}
