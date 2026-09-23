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
      <select
        value={searchParams.get("type") ?? ""}
        onChange={(e) => setParam("type", e.target.value)}
        className="bg-panel border border-line rounded-lg px-3 py-2 text-sm text-ink-100 hover:border-ink-400 transition-colors cursor-pointer"
      >
        <option value="">All types</option>
        {typeOptions.map((t) => (
          <option key={t} value={t}>
            {t.replace(/_/g, " ").toLowerCase()}
          </option>
        ))}
      </select>
      <select
        value={searchParams.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}
        className="bg-panel border border-line rounded-lg px-3 py-2 text-sm text-ink-100 hover:border-ink-400 transition-colors cursor-pointer"
      >
        <option value="">All statuses</option>
        {statusOptions.map((s) => (
          <option key={s} value={s}>
            {statusLabels[s]}
          </option>
        ))}
      </select>
      <select
        value={searchParams.get("risk") ?? ""}
        onChange={(e) => setParam("risk", e.target.value)}
        className="bg-panel border border-line rounded-lg px-3 py-2 text-sm text-ink-100 hover:border-ink-400 transition-colors cursor-pointer"
      >
        <option value="">All risk levels</option>
        {riskOptions.map((r) => (
          <option key={r} value={r}>
            {riskLabels[r]}
          </option>
        ))}
      </select>
      {hasFilters && (
        <button onClick={() => router.push("/assets")} className="text-xs text-ink-400 hover:text-ink-100">
          Clear
        </button>
      )}
    </div>
  );
}
