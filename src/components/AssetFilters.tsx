"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * Filtri con applicazione immediata al cambio — niente bottone "Filter"
 * separato che può disallinearsi dal valore selezionato. Ogni select
 * aggiorna subito l'URL (query string), che il server usa per rifiltrare.
 */
export default function AssetFilters({
  typeOptions,
  statusOptions,
  statusLabels,
  riskOptions,
  riskLabels,
}: {
  typeOptions: string[];
  statusOptions: string[];
  statusLabels: Record<string, string>;
  riskOptions: readonly string[];
  riskLabels: Record<string, string>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/assets?${params.toString()}`);
  }

  const hasFilters = searchParams.get("type") || searchParams.get("status") || searchParams.get("risk");

  return (
    <div className="flex items-center gap-3">
      <label className="relative inline-flex items-center border border-line rounded-lg bg-panel hover:border-ink-400 transition-colors text-sm">
        <span className="pl-3 text-ink-400">Type</span>
        <select
        value={searchParams.get("type") ?? ""}
        onChange={(e) => setParam("type", e.target.value)}
        className="appearance-none bg-transparent pl-1.5 pr-8 py-2 font-medium text-ink-100 cursor-pointer outline-none"
      >
        <option value="">All</option>
        {typeOptions.map((t) => (
          <option key={t} value={t}>
            {t.replace(/_/g, " ").toLowerCase()}
          </option>
        ))}
      </select>
        <svg width="12" height="12" viewBox="0 0 10 10" fill="none" className="absolute right-2.5 pointer-events-none text-ink-400"><path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
      </label>
      <label className="relative inline-flex items-center border border-line rounded-lg bg-panel hover:border-ink-400 transition-colors text-sm">
        <span className="pl-3 text-ink-400">Status</span>
        <select
        value={searchParams.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}
        className="appearance-none bg-transparent pl-1.5 pr-8 py-2 font-medium text-ink-100 cursor-pointer outline-none"
      >
        <option value="">All</option>
        {statusOptions.map((s) => (
          <option key={s} value={s}>
            {statusLabels[s]}
          </option>
        ))}
      </select>
        <svg width="12" height="12" viewBox="0 0 10 10" fill="none" className="absolute right-2.5 pointer-events-none text-ink-400"><path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
      </label>
      <label className="relative inline-flex items-center border border-line rounded-lg bg-panel hover:border-ink-400 transition-colors text-sm">
        <span className="pl-3 text-ink-400">Risk</span>
        <select
        value={searchParams.get("risk") ?? ""}
        onChange={(e) => setParam("risk", e.target.value)}
        className="appearance-none bg-transparent pl-1.5 pr-8 py-2 font-medium text-ink-100 cursor-pointer outline-none"
      >
        <option value="">All</option>
        {riskOptions.map((r) => (
          <option key={r} value={r}>
            {riskLabels[r]}
          </option>
        ))}
      </select>
        <svg width="12" height="12" viewBox="0 0 10 10" fill="none" className="absolute right-2.5 pointer-events-none text-ink-400"><path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
      </label>
      {hasFilters && (
        <button onClick={() => router.push("/assets")} className="btn btn-secondary btn-sm">
          ↺ Reset
        </button>
      )}
    </div>
  );
}
