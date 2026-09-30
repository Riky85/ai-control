import { PageHeader, Notice } from "@/components/ui";
import Link from "next/link";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { VendorBadge } from "@/components/VendorIcon";
import { reviewAssetAction, approveAllReviewAction } from "@/lib/actions";
import { currentSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

const LEVEL_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

// Dove angar l'ha vista: il collegamento che l'ha trovata.
const SEEN_IN: Record<string, string> = {
  NETWORK: "Desktop app / network",
  MICROSOFT_365: "Microsoft 365",
  GOOGLE_WORKSPACE: "Google Workspace",
  GITHUB: "GitHub",
  BANK: "Bank",
  ACCOUNTING: "Accounting",
  FATTURE_IN_CLOUD: "Invoices",
};
const seenIn = (provider?: string | null) =>
  provider ? SEEN_IN[provider] ?? provider.replace(/_/g, " ").toLowerCase().replace(/^\w/, (m) => m.toUpperCase()) : "Added manually";

// Coda di revisione: una riga per AI, due pulsanti.
export default async function ReviewPage({ searchParams }: { searchParams: { reviewed?: string; found?: string; error?: string } }) {
  const orgId = currentOrgId();
  // I viewer vedono la coda ma non decidono (l'azione lo ricontrolla comunque).
  const canDecide = currentSession()?.role !== "VIEWER";
  const [pending, reviewedCount] = await Promise.all([
    db.aiAsset.findMany({
      where: { organizationId: orgId, deletedAt: null, status: { in: ["UNKNOWN", "UNREVIEWED"] } },
      include: { connector: { select: { provider: true } }, riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    db.aiAsset.count({ where: { organizationId: orgId, deletedAt: null, status: { in: ["APPROVED", "UNAPPROVED"] } } }),
  ]);
  // Prima i più rischiosi, poi i più recenti.
  const queue = pending.sort(
    (a, b) =>
      (LEVEL_RANK[a.riskAssessments[0]?.level ?? "LOW"] ?? 4) - (LEVEL_RANK[b.riskAssessments[0]?.level ?? "LOW"] ?? 4) ||
      b.firstSeenAt.getTime() - a.firstSeenAt.getTime()
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="To review"
        subtitle={queue.length ? `${queue.length} AI found by angar — allowed or not?` : undefined}
        action={
          <>
            {searchParams.reviewed && <span className="text-sm text-steady mr-2">✓ {/^\d+$/.test(searchParams.reviewed) ? `${searchParams.reviewed} approved` : `${searchParams.reviewed} reviewed`}</span>}
            {canDecide && queue.length > 3 && (
              <form action={approveAllReviewAction}>
                <button className="btn btn-secondary btn-sm">Approve all</button>
              </form>
            )}
          </>
        }
      />
      {searchParams.error && <Notice tone="error">{searchParams.error}</Notice>}
      {searchParams.found && <Notice>Scan done — {searchParams.found} AI service{searchParams.found === "1" ? "" : "s"} found.</Notice>}
      {!canDecide && queue.length > 0 && <Notice>Viewers can&apos;t decide — ask an editor.</Notice>}

      {queue.length === 0 ? (
        <div className="rounded-xl border border-line bg-panel p-10 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-steady/10 text-steady flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <h2 className="text-xl font-semibold text-ink-100 mt-4">All caught up</h2>
          <p className="text-sm text-ink-400 mt-1">{reviewedCount} AI reviewed. New ones will appear here.</p>
          <Link href="/" className="btn btn-primary mt-6">See your AI</Link>
        </div>
      ) : (
        <ul className="rounded-xl border border-line bg-panel divide-y divide-line overflow-hidden">
          {queue.map((a) => {
            const lvl = a.riskAssessments[0]?.level;
            const candidate = a.externalId?.startsWith("net:cand");
            return (
              <li key={a.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 px-4 py-3">
                <VendorBadge vendor={a.vendor ?? ""} name={a.name} size={30} />
                <Link href={`/assets/${a.id}`} className="flex-1 min-w-0 hover:underline">
                  <span className="flex items-center gap-2 text-sm font-medium text-ink-100 truncate">
                    {lvl && <span title={`Risk: ${lvl.toLowerCase()}`} className={`h-2 w-2 rounded-full shrink-0 ${lvl === "HIGH" || lvl === "CRITICAL" ? "bg-alarm" : lvl === "MEDIUM" ? "bg-signal" : "bg-steady"}`} />}
                    {a.name}
                    {candidate && <span className="text-[11px] font-medium text-signal bg-signal/10 rounded-full px-2 py-0.5">Possible AI</span>}
                  </span>
                  <span className="block text-xs text-ink-400 truncate">
                    {a.vendor ?? "Unknown vendor"} · seen in {seenIn(a.connector?.provider)}
                  </span>
                </Link>
                {canDecide && (
                  <form action={reviewAssetAction} className="flex items-center gap-2 shrink-0">
                    <input type="hidden" name="assetId" value={a.id} />
                    <button name="decision" value="notai" className="text-xs text-ink-400 hover:text-ink-100 underline mr-1">Not AI</button>
                    <button name="decision" value="reject" className="btn btn-secondary btn-sm">Not allowed</button>
                    <button name="decision" value="approve" className="btn btn-primary btn-sm">Approve</button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
