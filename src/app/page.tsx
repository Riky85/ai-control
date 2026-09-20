import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import Link from "next/link";
import VendorIcon from "@/components/VendorIcon";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

// Home ridotta all'essenziale: una domanda, una risposta, un'azione.
// "Quanti AI abbiamo, quanti sono ok, cosa devo guardare adesso" — non
// sei widget diversi in competizione per l'attenzione.
export default async function OverviewPage() {
  const org = await db.organization.findUnique({ where: { id: ORG_ID } });
  const [total, approvedCount, attention] = await Promise.all([
    db.aiAsset.count({ where: { organizationId: ORG_ID, deletedAt: null } }),
    db.aiAsset.count({ where: { organizationId: ORG_ID, deletedAt: null, status: "APPROVED" } }),
    db.aiAsset.findMany({
      where: { organizationId: ORG_ID, deletedAt: null, status: { not: "APPROVED" } },
      orderBy: { firstSeenAt: "desc" },
      take: 8,
      include: { riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">Angar</h1>
        <p className="text-sm text-ink-400 mt-1.5">Your AI estate, under control.</p>
      </div>

      {!org?.onboardingCompletedAt && (
        <div className="rounded-xl border border-line bg-panel shadow-card px-5 py-3.5 flex items-center gap-3">
          <span className="text-xs font-medium text-white bg-accent rounded-full px-2.5 py-1 shrink-0">Setup</span>
          <p className="text-sm text-ink-100">
            Finish setting up Angar.{" "}
            <Link href="/onboarding" className="underline hover:text-ink-400">Run setup</Link>
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Link href="/assets" className="rounded-xl border border-line bg-panel shadow-card p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all">
          <div className="text-xs text-ink-400 mb-1.5">AI systems</div>
          <div className="font-display text-3xl font-bold text-accent">{total}</div>
        </Link>
        <Link href="/assets?status=APPROVED" className="rounded-xl border border-line bg-panel shadow-card p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all">
          <div className="text-xs text-ink-400 mb-1.5">Approved</div>
          <div className="font-display text-3xl font-bold text-ink-100">{approvedCount}</div>
        </Link>
        <Link href="/governance?tab=reviews" className="rounded-xl border border-line bg-panel shadow-card p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all">
          <div className="text-xs text-ink-400 mb-1.5">Needs attention</div>
          <div className={`font-display text-3xl font-bold ${attention.length > 0 ? "text-alarm" : "text-ink-100"}`}>{attention.length}</div>
        </Link>
      </div>

      <div>
        <h2 className="text-sm font-medium text-ink-400 mb-3">What needs your attention right now</h2>
        <div className="rounded-xl border border-line bg-panel shadow-card divide-y divide-line overflow-hidden">
          {attention.length === 0 && (
            <div className="p-6 text-sm text-ink-400 text-center">Nothing needs attention — every known system has been reviewed.</div>
          )}
          {attention.map((a) => {
            const r = a.riskAssessments[0];
            return (
              <Link
                href={`/assets/${a.id}`}
                key={a.id}
                className="flex items-center justify-between px-5 py-3.5 text-sm hover:bg-black/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-ink-400 shrink-0"><VendorIcon vendor={a.vendor ?? ""} size={14} /></span>
                  <span className="font-medium text-ink-100 truncate">{a.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r && <Badge>{r.level}</Badge>}
                  <Badge>{a.status}</Badge>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
