import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import Link from "next/link";
import VendorIcon from "@/components/VendorIcon";
import DonutChart from "@/components/DonutChart";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

// Home ridotta ma non spoglia: 3 numeri chiave, un grafico che dà un
// colpo d'occhio in più, una lista di cosa richiede attenzione — non sei
// widget diversi in competizione, ma nemmeno il vuoto.
export default async function OverviewPage() {
  const org = await db.organization.findUnique({ where: { id: ORG_ID } });
  const [total, approvedCount, attention, candidates] = await Promise.all([
    db.aiAsset.count({ where: { organizationId: ORG_ID, deletedAt: null } }),
    db.aiAsset.count({ where: { organizationId: ORG_ID, deletedAt: null, status: "APPROVED" } }),
    db.aiAsset.findMany({
      where: { organizationId: ORG_ID, deletedAt: null, status: { not: "APPROVED" } },
      orderBy: { firstSeenAt: "desc" },
      take: 8,
      include: { riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    db.aiAsset.findMany({
      where: { organizationId: ORG_ID, deletedAt: null },
      include: { riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
  ]);

  const RISK_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
  const RISK_COLOR: Record<string, string> = { LOW: "#1F9254", MEDIUM: "#B7791F", HIGH: "#C4433B", CRITICAL: "#C4433B" };
  const riskCounts = new Map<string, number>();
  for (const a of candidates) {
    const level = a.riskAssessments[0]?.level;
    if (level) riskCounts.set(level, (riskCounts.get(level) ?? 0) + 1);
  }
  const riskSlices = RISK_ORDER.filter((l) => riskCounts.has(l)).map((l) => ({
    label: l.charAt(0) + l.slice(1).toLowerCase(),
    value: riskCounts.get(l)!,
    color: RISK_COLOR[l],
    href: `/assets?risk=${l}`,
  }));

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

      <div className="grid grid-cols-2 gap-5">
        {riskSlices.length > 0 && (
          <div className="rounded-xl border border-line bg-panel shadow-card p-5">
            <h2 className="text-sm font-medium text-ink-400 mb-4">Risk distribution</h2>
            <DonutChart slices={riskSlices} centerLabel="assessed" />
          </div>
        )}

        <div>
          <h2 className="text-sm font-medium text-ink-400 mb-3">What needs your attention</h2>
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
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-black/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-ink-400 shrink-0"><VendorIcon vendor={a.vendor ?? ""} size={13} /></span>
                    <span className="font-medium text-ink-100 truncate">{a.name}</span>
                  </div>
                  {r && <Badge>{r.level}</Badge>}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
