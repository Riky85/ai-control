import Link from "next/link";
import { Pill, Section, NextStep } from "./parts";

/** Chiavi API di AI trovate nel codice su GitHub (sola lettura, chiave sempre mascherata). */
export interface ExposedKeyRow {
  repo: string;
  path: string;
  url: string;
  provider: string;
  masked: string;
  firstSeen: string; // ISO
}

const MAX = 8;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function ExposedKeys({ rows, githubConnected }: { rows: ExposedKeyRow[]; githubConnected: boolean }) {
  if (!rows.length && !githubConnected) return null;
  const shown = rows.slice(0, MAX);
  return (
    <Section
      id="exposed-keys"
      title="Exposed AI keys"
      meta={rows.length ? "Found in code on GitHub · the full key is never stored" : "angar looks for AI keys in your GitHub code at every sync"}
      action={rows.length ? <Pill tone="alarm">{rows.length} found</Pill> : <Pill tone="steady">None found</Pill>}
      footer={
        rows.length ? (
          <span className="flex items-center gap-2 text-ink-100">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-alarm" aria-hidden />
            Revoke the key at the provider, then remove it from the code.
          </span>
        ) : (
          <NextStep done label="No AI keys found in your repositories" />
        )
      }
    >
      {rows.length > 0 && (
        <ul className="divide-y divide-line">
          {shown.map((r) => (
            <li key={`${r.repo}|${r.path}|${r.masked}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-2.5">
              <div className="min-w-0">
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="block text-sm text-ink-100 hover:underline truncate" title={`${r.repo}/${r.path}`}>
                  {r.repo} <span className="text-ink-400">/ {r.path}</span> ↗
                </a>
                <div className="text-xs text-ink-400 mt-0.5 flex flex-wrap gap-x-2 tabular">
                  <span>{r.provider}</span>
                  <code className="font-mono text-ink-100">{r.masked}</code>
                  <span>first seen {day(r.firstSeen)}</span>
                </div>
              </div>
              <Pill tone="alarm">Revoke</Pill>
            </li>
          ))}
          {rows.length > MAX && (
            <li className="px-5 py-2 text-xs text-ink-400">
              +{rows.length - MAX} more in <Link href="/alerts" className="underline hover:text-ink-100">Alerts</Link>
            </li>
          )}
        </ul>
      )}
    </Section>
  );
}
