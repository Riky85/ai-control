import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import Link from "next/link";
import VendorIcon from "@/components/VendorIcon";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

// Home — stessa struttura del profilo dispositivo/agente che ci hai
// mandato: intestazione con badge di stato, fascia statistiche a colonne
// divise, schede, tabella. Stessi blocchi, dati nostri al posto dei loro.
export default async function OverviewPage() {
  const org = await db.organization.findUnique({ where: { id: ORG_ID } });
  const [total, approvedCount, attention, allAssets, changesCount] = await Promise.all([
    db.aiAsset.count({ where: { organizationId: ORG_ID, deletedAt: null } }),
    db.aiAsset.count({ where: { organizationId: ORG_ID, deletedAt: null, status: "APPROVED" } }),
    db.aiAsset.findMany({
      where: { organizationId: ORG_ID, deletedAt: null, status: { not: "APPROVED" } },
      include: { riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    db.aiAsset.findMany({
      where: { organizationId: ORG_ID, deletedAt: null },
      include: { owner: true, riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { lastSeenAt: "desc" },
    }),
    db.assetChange.count({ where: { aiAsset: { organizationId: ORG_ID } } }),
  ]);

  const highRiskCount = allAssets.filter((a) => ["HIGH", "CRITICAL"].includes(a.riskAssessments[0]?.level ?? "")).length;
  const providerCount = new Set(allAssets.map((a) => a.vendor).filter(Boolean)).size;
  const firstSeen = allAssets.length
    ? new Date(Math.min(...allAssets.map((a) => new Date(a.firstSeenAt).getTime())))
    : null;
  const lastScan = allAssets.length
    ? new Date(Math.max(...allAssets.map((a) => (a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0))))
    : null;

  return (
    <div className="flex flex-col gap-5">
      {!org?.onboardingCompletedAt && (
        <div className="rounded-xl border border-line bg-panel shadow-card px-5 py-3.5 flex items-center gap-3">
          <span className="text-xs font-medium text-white bg-accent rounded-full px-2.5 py-1 shrink-0">Setup</span>
          <p className="text-sm text-ink-100">
            Finish setting up Angar.{" "}
            <Link href="/onboarding" className="underline hover:text-ink-400">Run setup</Link>
          </p>
        </div>
      )}

      <div className="rounded-xl border border-line bg-panel shadow-card p-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink-100">{org?.name ?? "Angar"}</h1>
            <p className="text-sm font-mono text-ink-400 mt-0.5">AI estate overview</p>
          </div>
          {highRiskCount > 0 && (
            <span className="text-xs font-medium text-alarm border border-alarm/40 bg-alarm/5 rounded-full px-3 py-1 shrink-0">
              {highRiskCount} AT RISK
            </span>
          )}
        </div>

        <div className="grid grid-cols-6 divide-x divide-line border border-line rounded-lg overflow-hidden">
          <div className="px-4 py-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mb-1">AI systems</div>
            <div className="text-sm font-semibold text-ink-100">{total}</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mb-1">Providers</div>
            <div className="text-sm font-semibold text-ink-100">{providerCount}</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mb-1">Approved</div>
            <div className="text-sm font-semibold text-ink-100">{approvedCount}</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mb-1">Open issues</div>
            <div className={`text-sm font-semibold ${attention.length > 0 ? "text-signal" : "text-ink-100"}`}>{attention.length}</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mb-1">First seen</div>
            <div className="text-sm font-semibold text-ink-100">{firstSeen ? firstSeen.toLocaleDateString() : "—"}</div>
          </div>
          <div className="px-4 py-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mb-1">Last sync</div>
            <div className="text-sm font-semibold text-ink-100">{lastScan ? lastScan.toLocaleString() : "—"}</div>
          </div>
        </div>

        <div className="flex gap-1 border-b border-line mt-5 mb-4">
          <span className="text-sm px-3 py-2 -mb-px border-b-2 border-steady text-ink-100 font-medium">AI Systems {total}</span>
          <Link href="/providers" className="text-sm px-3 py-2 -mb-px border-b-2 border-transparent text-ink-400 hover:text-ink-100 transition-colors">
            Providers {providerCount}
          </Link>
          <Link href="/changes" className="text-sm px-3 py-2 -mb-px border-b-2 border-transparent text-ink-400 hover:text-ink-100 transition-colors">
            Changes {changesCount}
          </Link>
          <Link href="/governance?tab=reviews" className="text-sm px-3 py-2 -mb-px border-b-2 border-transparent text-ink-400 hover:text-ink-100 transition-colors">
            Open issues {attention.length}
          </Link>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-ink-400 border-b border-line">
              <th className="py-2 font-medium">Asset</th>
              <th className="py-2 font-medium">Type</th>
              <th className="py-2 font-medium">Owner</th>
              <th className="py-2 font-medium">Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {allAssets.map((a) => {
              const r = a.riskAssessments[0];
              return (
                <tr key={a.id} className="hover:bg-black/[0.015] transition-colors">
                  <td className="py-2.5">
                    <Link href={`/assets/${a.id}`} className="flex items-center gap-2.5 font-medium text-ink-100 hover:underline">
                      <VendorIcon vendor={a.vendor ?? ""} size={13} />
                      {a.name}
                    </Link>
                  </td>
                  <td className="py-2.5 text-ink-400">{a.type.replace(/_/g, " ").toLowerCase()}</td>
                  <td className="py-2.5 text-ink-400">{a.owner?.name ?? "No owner"}</td>
                  <td className="py-2.5">{r ? <Badge>{r.level}</Badge> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
