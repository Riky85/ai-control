import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import Link from "next/link";
import VendorIcon from "@/components/VendorIcon";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";

const TABS = [
  { key: "systems", label: "AI Systems" },
  { key: "providers", label: "Providers" },
  { key: "changes", label: "Changes" },
  { key: "issues", label: "Open issues" },
] as const;

// Home — stessa struttura del profilo dispositivo condiviso: intestazione
// con badge di stato, fascia statistiche su sfondo grigio, schede VERE
// (stessa pagina, contenuto diverso — non link che portano altrove).
export default async function OverviewPage({ searchParams }: { searchParams: { tab?: string } }) {
  const tab = TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab! : "systems";

  const org = await db.organization.findUnique({ where: { id: ORG_ID } });
  const [total, approvedCount, attention, allAssets, changes] = await Promise.all([
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
    db.assetChange.findMany({
      where: { aiAsset: { organizationId: ORG_ID } },
      include: { aiAsset: true },
      orderBy: { detectedAt: "desc" },
      take: 20,
    }),
  ]);

  const highRisk = allAssets.filter((a) => ["HIGH", "CRITICAL"].includes(a.riskAssessments[0]?.level ?? ""));
  const providerCount = new Set(allAssets.map((a) => a.vendor).filter(Boolean)).size;
  const providerRows: [string, number][] = Array.from(
    allAssets.reduce((map: Map<string, number>, a) => {
      const v = a.vendor ?? "Unknown vendor";
      map.set(v, (map.get(v) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  );
  const firstSeen = allAssets.length ? new Date(Math.min(...allAssets.map((a) => new Date(a.firstSeenAt).getTime()))) : null;
  const lastScan = allAssets.length ? new Date(Math.max(...allAssets.map((a) => (a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0)))) : null;

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

      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-100">{org?.name ?? "Angar"}</h1>
          <p className="text-sm font-mono text-ink-400 mt-0.5">AI estate overview</p>
        </div>
        {highRisk.length > 0 && (
          <Link
            href="/assets?risk=HIGH"
            className="text-xs font-medium text-alarm border border-alarm/40 bg-alarm/5 rounded-full px-3 py-1 shrink-0 hover:bg-alarm/10 transition-colors"
          >
            {highRisk.length} AT RISK
          </Link>
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

      <div className="flex gap-1 border-b border-line">
        {TABS.map((t) => {
          const count = { systems: total, providers: providerCount, changes: changes.length, issues: attention.length }[t.key];
          return (
            <Link
              key={t.key}
              href={`/?tab=${t.key}`}
              className={`text-sm px-3 py-2 -mb-px border-b-2 transition-colors ${
                tab === t.key ? "border-steady text-ink-100 font-medium" : "border-transparent text-ink-400 hover:text-ink-100"
              }`}
            >
              {t.label} {count}
            </Link>
          );
        })}
      </div>

      {tab === "systems" && (
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
                <tr key={a.id}>
                  <td className="py-3">
                    <Link href={`/assets/${a.id}`} className="flex items-center gap-3 font-medium text-ink-100 hover:underline">
                      <VendorIcon vendor={a.vendor ?? ""} size={20} />
                      {a.name}
                    </Link>
                  </td>
                  <td className="py-3 text-ink-400">{a.type.replace(/_/g, " ").toLowerCase()}</td>
                  <td className="py-3 text-ink-400">{a.owner?.name ?? "No owner"}</td>
                  <td className="py-3">{r ? <Badge>{r.level}</Badge> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {tab === "providers" && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-ink-400 border-b border-line">
              <th className="py-2 font-medium">Provider</th>
              <th className="py-2 font-medium">AI systems</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {providerRows.map(([vendor, count]) => (
              <tr key={vendor}>
                <td className="py-3">
                  <Link href="/providers" className="flex items-center gap-3 font-medium text-ink-100 hover:underline">
                    <VendorIcon vendor={vendor} size={20} />
                    {vendor}
                  </Link>
                </td>
                <td className="py-3 text-ink-400">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === "changes" && (
        <div className="divide-y divide-line">
          {changes.length === 0 && <div className="py-6 text-sm text-ink-400 text-center">No changes detected yet.</div>}
          {changes.map((c) => (
            <Link key={c.id} href={`/assets/${c.aiAssetId}`} className="flex items-center justify-between py-3 text-sm hover:underline">
              <div className="flex items-center gap-3">
                <VendorIcon vendor={c.aiAsset.vendor ?? ""} size={18} />
                <span className="font-medium text-ink-100">{c.aiAsset.name}</span>
                <span className="text-xs text-ink-400">{c.field}</span>
              </div>
              <div className="text-xs">
                <span className="text-ink-400">{c.oldValue ?? "—"}</span>
                <span className="mx-1.5 text-ink-400">→</span>
                <span className="text-ink-100 font-medium">{c.newValue ?? "—"}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {tab === "issues" && (
        <div className="divide-y divide-line">
          {attention.length === 0 && <div className="py-6 text-sm text-ink-400 text-center">Nothing needs attention.</div>}
          {attention.map((a) => {
            const r = a.riskAssessments[0];
            return (
              <Link key={a.id} href={`/assets/${a.id}`} className="flex items-center justify-between py-3 text-sm hover:underline">
                <div className="flex items-center gap-3">
                  <VendorIcon vendor={a.vendor ?? ""} size={18} />
                  <span className="font-medium text-ink-100">{a.name}</span>
                </div>
                {r && <Badge>{r.level}</Badge>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
