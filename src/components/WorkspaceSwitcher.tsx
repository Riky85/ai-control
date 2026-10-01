"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { switchWorkspaceAction, createWorkspaceAction } from "@/lib/workspace-actions";
import { PLANS } from "@/lib/plans";

export interface WorkspaceOption {
  id: string;
  name: string;
}

// Tendina del workspace in cima alla sidebar: cambio, creazione (se il
// piano lo consente) e gestione.
export default function WorkspaceSwitcher({
  current,
  workspaces,
  canCreate,
  planName: legacyName,
  limit,
}: {
  current: WorkspaceOption | null;
  workspaces: WorkspaceOption[];
  canCreate: boolean;
  planName: string;
  limit: number | null;
}) {
  // Il layout passa il nome storico del piano ("Growth"): qui si mostra quello pubblico ("Save").
  const planName = PLANS.find((p) => p.name === legacyName || p.displayName === legacyName)?.displayName ?? legacyName;
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative mb-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-sb-ink/[0.12] bg-sb-ink/[0.03] text-[15px] text-sb-ink hover:bg-sb-ink/[0.06] transition-colors"
      >
        <span className="h-5 w-5 rounded bg-accent text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
          {(current?.name ?? "W").charAt(0).toUpperCase()}
        </span>
        <span className="flex-1 truncate text-left">{current?.name ?? "Workspace"}</span>
        <svg width="12" height="12" viewBox="0 0 10 10" fill="none" className={`shrink-0 text-sb-muted transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2.5 4l2.5 2.5L7.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1.5 rounded-xl border border-sb-ink/[0.12] bg-pop shadow-2xl p-1.5 text-sm">
          <div className="px-2.5 pt-1.5 pb-1 text-[11px] uppercase tracking-wide text-sb-faint">Workspaces</div>
          {workspaces.map((w) => (
            <form key={w.id} action={switchWorkspaceAction}>
              <input type="hidden" name="orgId" value={w.id} />
              <button className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sb-soft hover:bg-sb-ink/[0.06] transition-colors">
                <span className="h-5 w-5 rounded bg-sb-ink/[0.1] text-[11px] font-semibold flex items-center justify-center shrink-0">{w.name.charAt(0).toUpperCase()}</span>
                <span className="flex-1 truncate">{w.name}</span>
                {w.id === current?.id && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-accent shrink-0">
                    <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </form>
          ))}

          <div className="my-1.5 border-t border-sb-ink/[0.08]" />

          {canCreate ? (
            creating ? (
              <form action={createWorkspaceAction} className="flex gap-1.5 p-1">
                <input
                  name="name"
                  autoFocus
                  required
                  placeholder="Workspace name"
                  className="flex-1 min-w-0 rounded-lg bg-sb-ink/[0.06] border border-sb-ink/[0.12] px-2.5 py-1.5 text-sb-ink placeholder:text-sb-faint outline-none focus:border-sb-ink/30"
                />
                <button className="btn btn-primary btn-sm">Create</button>
              </form>
            ) : (
              <button onClick={() => setCreating(true)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sb-soft hover:bg-sb-ink/[0.06] transition-colors">
                <span className="h-5 w-5 flex items-center justify-center text-sb-muted">+</span>
                Create workspace
              </button>
            )
          ) : (
            <Link href="/billing" className="flex items-start gap-2 px-2.5 py-2 rounded-lg text-sb-muted hover:bg-sb-ink/[0.06] transition-colors">
              <span className="h-5 w-5 flex items-center justify-center">+</span>
              <span>
                <span className="block text-sb-soft">Create workspace</span>
                <span className="block text-xs">
                  {planName} includes {limit} workspace{limit === 1 ? "" : "s"} — upgrade for more
                </span>
              </span>
            </Link>
          )}
          <Link href="/workspace?tab=workspaces" className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-sb-soft hover:bg-sb-ink/[0.06] transition-colors">
            <span className="h-5 w-5 flex items-center justify-center text-sb-muted">⚙</span>
            Manage workspaces
          </Link>
          <Link href="/billing" className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-sb-soft hover:bg-sb-ink/[0.06] transition-colors">
            <span className="h-5 w-5 flex items-center justify-center text-sb-muted">€</span>
            <span className="flex-1">Plan & billing</span>
            <span className="text-xs text-sb-faint">{planName}</span>
          </Link>
        </div>
      )}
    </div>
  );
}
