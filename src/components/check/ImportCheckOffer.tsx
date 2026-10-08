"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearSnapshot, loadSnapshot, type CheckCharge } from "./report-data";
import { importCheckSnapshotAction } from "@/lib/check-import-actions";

/**
 * Passaggio Spend check → workspace: se nel browser c'è lo snapshot dell'AI Spend Check
 * (fatto prima di registrarsi) con gli addebiti, propone di importarli. Mostrato solo
 * con il workspace vuoto (lo decide la pagina server). Dopo l'import lo snapshot si cancella.
 */
export default function ImportCheckOffer({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [charges, setCharges] = useState<CheckCharge[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const snap = loadSnapshot();
    if (snap?.charges?.length) setCharges(snap.charges);
  }, []);

  if (!charges?.length) return null;
  const n = charges.length;

  return (
    <div className={`w-full rounded-xl border border-line bg-panel px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-left ${className}`}>
      <div className="flex-1 min-w-[12rem]">
        <div className="text-ink-100 font-medium">You ran a Spend check before signing up</div>
        <div className="text-ink-400 text-xs mt-0.5">{error ?? `${n.toLocaleString("en-GB")} AI ${n === 1 ? "charge" : "charges"} saved in this browser.`}</div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          className="btn btn-secondary btn-sm disabled:opacity-60"
          onClick={() =>
            start(async () => {
              const r = await importCheckSnapshotAction(charges);
              if (!r.ok) {
                setError(r.error);
                return;
              }
              clearSnapshot();
              setCharges(null);
              router.push(`/?spend=${r.services}`);
              router.refresh();
            })
          }
        >
          {pending ? "Importing…" : `Import your Spend check (${n.toLocaleString("en-GB")} ${n === 1 ? "charge" : "charges"})`}
        </button>
        <button
          type="button"
          className="text-xs text-ink-400 hover:text-ink-100 underline"
          onClick={() => {
            clearSnapshot();
            setCharges(null);
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
