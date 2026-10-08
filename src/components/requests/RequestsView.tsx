import Link from "next/link";
import CopyButton from "@/components/CopyButton";
import { EmptyState, Notice, PageHeader, StatCard, Table, Tabs, td } from "@/components/ui";
import { VendorBadge } from "@/components/VendorIcon";
import NudgeButton from "@/components/access/NudgeButton";
import { fmtDate, fmtEur } from "@/lib/format";
import { aiHref } from "@/lib/links";
import { decideRequestAction } from "@/lib/requests/actions";
import { DATA_TYPE_LABEL, REQUEST_STATUS_LABEL, type RequestStatus } from "@/lib/requests/types";
import type { RequestPreview } from "@/lib/requests/preview";

export interface RequestRow {
  id: string;
  requesterEmail: string;
  name: string;
  vendor: string | null;
  url: string | null;
  purpose: string;
  team: string | null;
  expectedUsers: number | null;
  dataTypes: string[];
  estMonthlyEur: number | null;
  status: string;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  aiAssetId: string | null;
  createdAt: Date;
}

export type RequestsTab = "waiting" | "decided" | "mine";

const STATUS_ASSET: Record<string, string> = { APPROVED: "Approved", UNAPPROVED: "Not allowed", UNREVIEWED: "To review", UNKNOWN: "To review" };

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "APPROVED" ? "text-steady bg-steady/10" : status === "REJECTED" ? "text-ink-400 bg-ink-100/[0.06]" : status === "NEEDS_INFO" ? "text-accent bg-accent/10" : "text-ink-100 bg-ink-100/10";
  return <span className={`text-[10px] rounded-[2px] px-1.5 py-0.5 font-mono uppercase tracking-[0.05em] whitespace-nowrap ${cls}`}>{REQUEST_STATUS_LABEL[status as RequestStatus] ?? status}</span>;
}

const host = (u: string | null) => {
  if (!u) return null;
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{k}</dt>
      <dd className="text-sm text-ink-100 mt-0.5 break-words">{children}</dd>
    </div>
  );
}

/** Una richiesta in coda: dettagli, anteprima (catalogo, doppioni, rischio dati) e decisione. */
function QueueCard({ r, p, back, nudge }: { r: RequestRow; p: RequestPreview | undefined; back: string; nudge: { users: number; nudgedAt: Date | null } | null }) {
  const h = host(r.url);
  return (
    <section className="rounded-xl border border-line bg-panel animate-rise">
      <div className="bg-ink border-b border-line rounded-t-xl px-5 py-3 bar-head flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <VendorBadge vendor={p?.service?.vendor ?? r.vendor ?? r.name} name={r.name} size={28} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-ink-100 truncate">{r.name}</h2>
              <StatusPill status={r.status} />
            </div>
            <div className="eyebrow mt-0.5 truncate">
              {[r.vendor, h].filter(Boolean).join(" · ") || "No vendor given"} · {r.requesterEmail} · {fmtDate(r.createdAt)}
            </div>
          </div>
        </div>
        {r.url && (
          <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-ghost btn-sm">
            Website ↗
          </a>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-line">
        <div className="p-5 flex flex-col gap-4">
          <p className="text-sm text-ink-100">{r.purpose}</p>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Fact k="Team">{r.team ?? "—"}</Fact>
            <Fact k="Expected users">{r.expectedUsers ?? "—"}</Fact>
            <Fact k="Their estimate">{r.estMonthlyEur != null ? `${fmtEur(r.estMonthlyEur)} a month` : "—"}</Fact>
          </dl>
          <div>
            <div className="eyebrow mb-1.5">Data it will see</div>
            <div className="flex flex-wrap gap-1">
              {r.dataTypes.map((d) => (
                <span key={d} className="inline-flex items-center rounded-[2px] border border-line px-1.5 py-0.5 text-[11px] text-ink-100">
                  {DATA_TYPE_LABEL[d] ?? d}
                </span>
              ))}
            </div>
          </div>
          {r.status === "NEEDS_INFO" && r.decisionNote && (
            <p className="text-xs text-ink-400">
              Asked by {r.decidedBy}: “{r.decisionNote}”
            </p>
          )}
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div className="eyebrow">Preview</div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Fact k="Catalog">{p?.service ? `${p.service.name} · ${p.service.vendor}` : "Not in the catalog"}</Fact>
            <Fact k="List price">
              {p?.listPrice ? (
                <>
                  {fmtEur(p.listPrice.eur)} a month
                  <span className="block text-xs text-ink-400">
                    {p.listPrice.users} × {p.listPrice.plan}
                  </span>
                </>
              ) : (
                "Unknown"
              )}
            </Fact>
          </dl>
          {p?.existing && (
            <div className="text-sm text-ink-100 flex flex-wrap items-center gap-2">
              <span>
                Already in your estate:{" "}
                <Link href={aiHref(p.existing.id)} className="underline">
                  {p.existing.name}
                </Link>{" "}
                <span className={`eyebrow ${p.existing.status === "UNAPPROVED" ? "!text-accent" : ""}`}>{STATUS_ASSET[p.existing.status] ?? p.existing.status}</span>
              </span>
              {nudge && (
                <span className="inline-flex items-center gap-2 text-xs text-ink-400">
                  {nudge.users} {nudge.users === 1 ? "person uses" : "people use"} it
                  <NudgeButton assetId={p.existing.id} nudgedAt={nudge.nudgedAt} back={back} />
                </span>
              )}
            </div>
          )}
          <div>
            <div className="eyebrow mb-1">Duplicate risk{p?.category ? ` · ${p.category}` : ""}</div>
            {p?.overlap.length ? (
              <p className="text-sm text-ink-100">
                {p.overlap.map((o, i) => (
                  <span key={o.id}>
                    {i > 0 && ", "}
                    <Link href={aiHref(o.id)} className="underline">
                      {o.name}
                    </Link>
                    <span className="text-ink-400"> ({o.users} {o.users === 1 ? "user" : "users"})</span>
                  </span>
                ))}{" "}
                <span className="text-ink-400">already do this job.</span>
              </p>
            ) : (
              <p className="text-sm text-ink-400">{p?.category ? "Nothing similar in your estate." : "Category unknown."}</p>
            )}
          </div>
          <div>
            <div className={`eyebrow mb-1 ${p?.risk.level === "High" ? "!text-accent" : ""}`}>Data risk · {p?.risk.level ?? "—"}</div>
            <p className="text-sm text-ink-100">{p?.risk.text}</p>
          </div>
        </div>
      </div>
      <form action={decideRequestAction} className="bg-ink border-t border-line rounded-b-xl px-5 py-3 bar-foot flex flex-col sm:flex-row sm:items-center gap-3">
        <input type="hidden" name="id" value={r.id} />
        <input type="hidden" name="back" value={back} />
        <input name="note" maxLength={1000} placeholder="Note to the requester (needed to reject or ask for info)" className="field flex-1 min-w-0 h-8 py-1" />
        <span className="flex items-center gap-1.5 shrink-0">
          <button name="decision" value="needs_info" className="btn btn-ghost btn-sm">Ask for info</button>
          <button name="decision" value="reject" className="btn btn-danger btn-sm">Reject</button>
          <button name="decision" value="approve" className="btn btn-secondary btn-sm">Approve</button>
        </span>
      </form>
    </section>
  );
}

const DECIDED_NOTE: Record<string, string> = {
  approve: "Approved. It is now in your estate and the requester has an email.",
  reject: "Rejected. The requester has an email with your note.",
  needs_info: "Asked for more information. The requester has an email with your question.",
};

/**
 * Richieste di nuove AI (corpo). Admin e owner: coda con anteprima e decisione, storico.
 * Tutti: le proprie richieste. I dati arrivano già pronti (pagina reale o pagina di prova).
 */
export default function RequestsView({
  tab,
  isAdmin,
  rows,
  previews,
  nudges,
  counts,
  shareUrl,
  error,
  sent,
  decided,
}: {
  tab: RequestsTab;
  isAdmin: boolean;
  rows: RequestRow[];
  previews: Map<string, RequestPreview>;
  nudges: Map<string, { users: number; nudgedAt: Date | null }>;
  counts: { waiting: number; approved30: number; needsInfo: number; mine: number };
  shareUrl: string;
  error?: string | null;
  sent?: boolean;
  decided?: string | null;
}) {
  const back = tab === "waiting" ? "/estate/requests" : `/estate/requests?tab=${tab}`;
  const decidedKey = decided?.replace(/-nomail$/, "") ?? null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Requests"
        subtitle="New AI systems people want to use"
        action={
          <>
            {isAdmin && <CopyButton text={shareUrl} label="Copy request link" className="btn btn-ghost btn-sm" />}
            <Link href="/estate/requests/new" className="btn btn-primary btn-sm">Request an AI system</Link>
          </>
        }
      />
      {error && <Notice tone="error">{error}</Notice>}
      {sent && <Notice tone="success">Request sent. You&apos;ll get an email when it&apos;s decided.</Notice>}
      {decidedKey && DECIDED_NOTE[decidedKey] && (
        <Notice tone="success">
          {DECIDED_NOTE[decidedKey]}
          {decided?.endsWith("-nomail") ? " (Email isn't set up, so tell them yourself.)" : ""}
        </Notice>
      )}

      {isAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <StatCard label="Waiting for a decision" value={String(counts.waiting)} hint={counts.waiting ? "Oldest first" : "All caught up"} tone={counts.waiting > 0 ? "warn" : undefined} />
          <StatCard label="Needs info" value={String(counts.needsInfo)} hint="Waiting on the requester" />
          <StatCard label="Approved in 30 days" value={String(counts.approved30)} hint="Added to your estate" />
        </div>
      )}

      {isAdmin && (
        <Tabs
          active={tab}
          items={[
            { key: "waiting", label: "Waiting", href: "/estate/requests", count: counts.waiting + counts.needsInfo },
            { key: "decided", label: "Decided", href: "/estate/requests?tab=decided" },
            { key: "mine", label: "Mine", href: "/estate/requests?tab=mine", count: counts.mine || undefined },
          ]}
        />
      )}

      {isAdmin && tab === "waiting" ? (
        rows.length === 0 ? (
          <EmptyState
            text="No request waiting. Share the request link so people ask before they sign up."
            action={<CopyButton text={shareUrl} label="Copy request link" />}
          />
        ) : (
          rows.map((r) => <QueueCard key={r.id} r={r} p={previews.get(r.id)} back={back} nudge={(() => { const ex = previews.get(r.id)?.existing; return ex ? nudges.get(ex.id) ?? null : null; })()} />)
        )
      ) : (
        <Table
          title={tab === "mine" || !isAdmin ? "Your requests" : "Decided"}
          columns={["AI system", ...(tab === "decided" ? ["Requested by"] : []), "Status", "Note", "Date", { label: "", className: "text-right" }]}
          empty={rows.length === 0 ? (tab === "decided" ? "Nothing decided yet." : "You haven't asked for an AI system yet.") : false}
        >
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={td}>
                <span className="text-ink-100 font-medium">{r.name}</span>
                <span className="block eyebrow mt-0.5 truncate max-w-[280px]">{r.purpose}</span>
              </td>
              {tab === "decided" && <td className={`${td} text-ink-400`}>{r.requesterEmail}</td>}
              <td className={td}>
                <StatusPill status={r.status} />
              </td>
              <td className={`${td} text-ink-400 max-w-[280px]`}>{r.decisionNote ?? "—"}</td>
              <td className={`${td} text-ink-400 tabular whitespace-nowrap`}>{fmtDate(r.decidedAt ?? r.createdAt)}</td>
              <td className={`${td} text-right whitespace-nowrap`}>
                {r.aiAssetId && r.status === "APPROVED" ? (
                  <Link href={aiHref(r.aiAssetId)} className="btn btn-ghost btn-sm">Open</Link>
                ) : r.status === "NEEDS_INFO" && !isAdmin ? (
                  <Link href="/estate/requests/new" className="btn btn-ghost btn-sm">Send details</Link>
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
