"use client";

import { useState } from "react";
import type { CheckSnapshot } from "./report-data";

/** "Email me this report": salva solo email, azienda e numeri aggregati (Lead). */
export default function EmailReport({ snapshot, compact }: { snapshot: CheckSnapshot; compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch("/api/check/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          company: company || undefined,
          monthlySpend: snapshot.spend,
          monthlySavings: snapshot.save,
          aiCount: snapshot.lines.length,
          ais: snapshot.lines.map((l) => ({ name: l.name, monthlyEur: l.monthlyEur })),
          topSavings: snapshot.savings.slice(0, 5).map((s) => ({ title: s.title, monthlyEur: s.monthlyEur })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; emailed?: boolean; confirm?: boolean };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Something went wrong — try again.");
      setState("done");
      // Doppio opt-in: prima arriva un link di conferma, poi il report.
      setMsg(data.confirm ? `Check your inbox: confirm ${email} and we'll send the report right away.` : "Thanks. We can't email reports right now — use Print / save as PDF to keep it.");
    } catch (err) {
      setState("error");
      setMsg((err as Error).message);
    }
  }

  if (state === "done") return <div className="rounded-lg bg-steady/10 px-4 py-3 text-sm text-steady">{msg}</div>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className={`flex gap-2 ${compact ? "flex-col" : ""}`}>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" aria-label="Work email" className="field flex-1 min-w-0" />
        <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" aria-label="Company" className="field flex-1 min-w-0" />
        <button disabled={state === "sending"} className="btn btn-secondary shrink-0 disabled:opacity-60">{state === "sending" ? "Sending…" : "Email me this report"}</button>
      </div>
      {state === "error" && <div className="text-xs text-alarm">{msg}</div>}
      <div className="text-xs text-ink-400">We keep only your email and the totals above — never the statement.</div>
    </form>
  );
}
