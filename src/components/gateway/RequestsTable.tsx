"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { REDACT_LABEL, type RedactKind } from "@/lib/gateway/detect";
import { REASON_LABEL } from "@/lib/gateway/policy";
import type { GwRequestRow } from "@/lib/gateway/data";
import { ResultPill, fmtClock, fmtCost, fmtDayShort, fmtInt, keyHint, redactionText, resultNote } from "./shared";

const PROVIDER: Record<string, string> = { openai: "OpenAI", anthropic: "Anthropic" };

/**
 * Tabella delle richieste (Overview: ultime 50; Logs: pagina) con il pannello
 * di dettaglio a destra. Solo metadati: nessun testo di prompt o risposta esiste.
 */
export default function RequestsTable({
  rows,
  title,
  note,
  footer,
  showDay = false,
  empty = "No requests yet.",
  initialId,
}: {
  rows: GwRequestRow[];
  title?: string;
  note?: React.ReactNode;
  footer?: React.ReactNode;
  showDay?: boolean;
  empty?: string;
  initialId?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(initialId ?? null);
  const open = rows.find((r) => r.id === openId) ?? null;

  return (
    <div className="rounded-xl border border-line bg-panel animate-rise min-w-0">
      {title && (
        <div className="bar-head rounded-t-xl border-b border-line px-5 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-bold text-ink-100">{title}</h2>
          {note && <span className="text-xs text-ink-400">{note}</span>}
        </div>
      )}
      <div className={`overflow-x-auto ${title ? "" : "rounded-t-xl"}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bar-thead text-left text-xs text-ink-400 bg-ink border-b border-line">
              <th className="px-5 py-2.5 font-semibold hidden md:table-cell">Time</th>
              <th className="px-5 py-2.5 font-semibold">App / key</th>
              <th className="px-5 py-2.5 font-semibold hidden md:table-cell">Model</th>
              <th className="px-5 py-2.5 font-semibold text-right hidden md:table-cell">Tokens</th>
              <th className="px-5 py-2.5 font-semibold text-right hidden md:table-cell">Cost</th>
              <th className="px-5 py-2.5 font-semibold">Policy result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const note = resultNote(r);
              const tokens = r.inputTokens + r.outputTokens;
              return (
                <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer hover:bg-ink-100/[0.03] transition-colors">
                  <td className="px-5 py-3 text-ink-400 tabular whitespace-nowrap hidden md:table-cell">
                    {showDay && <span className="mr-1.5">{fmtDayShort(r.at)}</span>}
                    {fmtClock(r.at)}
                  </td>
                  <td className="px-5 py-3 min-w-0">
                    <button type="button" className="text-left font-medium text-ink-100 hover:underline" onClick={() => setOpenId(r.id)}>
                      {r.keyName || "Deleted key"}
                    </button>
                    <div className="font-mono text-[11px] text-ink-400 mt-0.5 hidden md:block">{keyHint(r.keyLast4)}</div>
                    <div className="text-xs text-ink-400 mt-0.5 md:hidden tabular">
                      {fmtClock(r.at)} · {fmtCost(r.costEur)}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-ink-100 hidden md:table-cell">{r.model ?? <span className="text-ink-400">—</span>}</td>
                  <td className="px-5 py-3 text-right tabular text-ink-400 hidden md:table-cell">{tokens ? fmtInt(tokens) : "—"}</td>
                  <td className="px-5 py-3 text-right tabular text-ink-100 hidden md:table-cell">{fmtCost(r.costEur)}</td>
                  <td className="px-5 py-3">
                    <ResultPill result={r.result} />
                    {note && <div className="text-xs text-ink-400 mt-1">{note}</div>}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-ink-400">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {footer && <div className="bar-foot rounded-b-xl border-t border-line px-5 py-3 text-sm text-ink-400 flex flex-wrap items-center gap-x-4 gap-y-2">{footer}</div>}
      {open && <RequestDrawer row={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function RequestDrawer({ row, onClose }: { row: GwRequestRow; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const redacted = Object.entries(row.redactions ?? {}).filter(([, n]) => (n ?? 0) > 0) as [RedactKind, number][];
  const total = redacted.reduce((s, [, n]) => s + n, 0);
  const sub =
    row.result === "redacted"
      ? `Sent after masking ${total} value${total === 1 ? "" : "s"}`
      : row.result === "blocked"
        ? `Not sent: ${(row.reason && REASON_LABEL[row.reason]) || "policy"}`
        : row.result === "error"
          ? `${(row.reason && REASON_LABEL[row.reason]) || "Error"} · HTTP ${row.status}`
          : "Sent unchanged";
  const when = `${new Date(row.at).toDateString() === new Date().toDateString() ? "Today" : fmtDayShort(row.at)}, ${fmtClock(row.at)}`;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Request ${row.id}`}>
      <div className="absolute inset-0 bg-black/40 animate-fade" onClick={onClose} aria-hidden />
      <aside className="absolute top-0 right-0 h-full w-[480px] max-w-full border-l border-line bg-panel flex flex-col animate-slide-in">
        <div className="px-6 pt-5 pb-4 border-b border-line flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-xs text-ink-400">{row.id}</div>
            <h2 className="font-display text-lg font-semibold text-ink-100 mt-1 truncate">{row.keyName || "Deleted key"}</h2>
            <div className="text-sm text-ink-400 mt-0.5">
              {when}
              {row.team && <> · {row.team}</>} · <span className="font-mono">{keyHint(row.keyLast4)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <ResultPill result={row.result} />
              <span className="text-sm text-ink-400">{sub}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="btn btn-secondary btn-icon shrink-0">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3">
            <Mini label="Tokens in" value={row.inputTokens ? fmtInt(row.inputTokens) : "—"} />
            <Mini label="Tokens out" value={row.outputTokens ? fmtInt(row.outputTokens) : "—"} />
            <Mini label="Cost" value={fmtCost(row.costEur)} />
            <Mini label="Latency" value={`${fmtInt(row.latencyMs)} ms`} />
          </div>

          <section>
            <h3 className="text-sm font-bold text-ink-100 mb-1">Request</h3>
            <dl className="divide-y divide-line text-sm">
              <Line k="Model" v={row.model ?? "—"} />
              <Line k="Route" v={`${PROVIDER[row.provider] ?? row.provider} · /${row.endpoint}${row.stream ? " · streaming" : ""}`} />
              <Line k="Gateway overhead" v={row.overheadMs != null ? `${fmtInt(row.overheadMs)} ms` : "—"} />
              <Line k="Status" v={row.status ? `HTTP ${row.status}` : "—"} />
              <Line k="Policy result" v={row.result === "blocked" || row.result === "error" ? (row.reason && REASON_LABEL[row.reason]) || row.result : row.result === "redacted" ? "Allowed after redaction" : "Allowed"} />
            </dl>
          </section>

          <section>
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <h3 className="text-sm font-bold text-ink-100">Redactions found</h3>
              {total > 0 && <span className="text-xs text-ink-400">{redactionText(row.redactions)}</span>}
            </div>
            {total > 0 ? (
              <div className="rounded-lg border border-line divide-y divide-line">
                {redacted.map(([k, n]) => (
                  <div key={k} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-ink-400">{REDACT_LABEL[k]}</span>
                    <span className="font-mono text-ink-100">
                      [{k}] ×{n}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-400">None.</p>
            )}
            <p className="text-xs text-ink-400 mt-2">Values are never kept.</p>
          </section>

          <section>
            <h3 className="text-sm font-bold text-ink-100 mb-2">Prompt</h3>
            <div className="rounded-lg border border-dashed border-line px-4 py-3 flex gap-3">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 mt-0.5 text-ink-400">
                <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.4" />
              </svg>
              <div className="text-sm">
                <div className="font-medium text-ink-100">Prompt not stored</div>
                <div className="text-ink-400 mt-0.5">The gateway keeps metadata only. Prompts and answers pass through in memory and are never saved.</div>
              </div>
            </div>
          </section>
        </div>

        <div className="px-6 py-4 border-t border-line flex items-center gap-3">
          <Link href={`/gateway?tab=logs&id=${encodeURIComponent(row.id)}`} className="btn btn-secondary">
            Open in logs
          </Link>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(row.id);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Copied" : "Copy request ID"}
          </button>
        </div>
      </aside>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line px-4 py-3">
      <div className="text-xs text-ink-400">{label}</div>
      <div className="font-display text-xl font-semibold tabular text-ink-100 mt-1">{value}</div>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-6 py-2.5">
      <dt className="text-ink-400 shrink-0">{k}</dt>
      <dd className="text-ink-100 text-right">{v}</dd>
    </div>
  );
}
