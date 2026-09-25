import { PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PersonDetailPage({ params }: { params: { id: string } }) {
  const person = await db.user.findFirst({
    where: { id: params.id, organizationId: currentOrgId() },
    include: {
      ownedAssets: {
        where: { deletedAt: null },
        include: { riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } },
      },
      usages: {
        include: { aiAsset: { include: { riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } } } },
      },
    },
  });

  if (!person) notFound();

  const highRiskOwned = person.ownedAssets.filter((a) =>
    ["HIGH", "CRITICAL"].includes(a.riskAssessments[0]?.level ?? "")
  ).length;

  // Attività recenti attribuite a questa persona via actorRef. Match esatto
  // sull'email (vale per Microsoft 365, che usa userPrincipalName) più un
  // fallback euristico sulla parte locale dell'email (utile per GitHub, che
  // popola actorRef con lo username GitHub — un sistema di identità diverso,
  // senza garanzia di coincidenza: e' un best-effort, non un'attribuzione
  // certa, e va trattato come tale in un prodotto di governance).
  const emailLocalPart = person.email.split("@")[0];
  const recentActivity = await db.aiAssetActivity.findMany({
    where: { actorRef: { in: [person.email, emailLocalPart] } },
    orderBy: { occurredAt: "desc" },
    take: 10,
    include: { aiAsset: true },
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        crumbs={[{ label: "People", href: "/people" }]}
        title={person.name ?? person.email}
        subtitle={`${person.email}${person.department ? ` · ${person.department}` : ""}`}
      />

      <div className="rounded-xl border border-line bg-panel shadow-card grid grid-cols-3 divide-x divide-line">
        <div className="px-5 py-4">
          <div className="tabular font-display text-2xl font-semibold text-ink-100">{person.ownedAssets.length}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mt-1">AI assets owned</div>
        </div>
        <div className="px-5 py-4">
          <div className={`tabular font-display text-2xl font-semibold text-ink-100`}>
            {highRiskOwned}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mt-1">High risk owned</div>
        </div>
        <div className="px-5 py-4">
          <div className="mt-1.5"><Badge>{highRiskOwned > 0 ? "ATTENTION" : "GOOD"}</Badge></div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mt-1">Status</div>
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold text-ink-100 mb-3">Assets owned</h2>
        <div className="rounded-xl border border-line bg-panel shadow-card divide-y divide-line">
          {person.ownedAssets.map((a) => (
            <Link key={a.id} href={`/assets/${a.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-black/[0.025] transition-colors">
              <span className="font-medium text-ink-100">{a.name}</span>
              <div className="flex items-center gap-3 text-xs">
                {a.riskAssessments[0] && <Badge>{a.riskAssessments[0].level}</Badge>}
                <Badge>{a.status}</Badge>
              </div>
            </Link>
          ))}
          {person.ownedAssets.length === 0 && (
            <div className="px-4 py-4 text-sm text-ink-400">No assets owned.</div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold text-ink-100 mb-3">Assets used</h2>
        <div className="rounded-xl border border-line bg-panel shadow-card divide-y divide-line">
          {person.usages.map((u) => (
            <Link key={u.id} href={`/assets/${u.aiAssetId}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-black/[0.025] transition-colors">
              <span className="font-medium text-ink-100">{u.aiAsset.name}</span>
              {u.aiAsset.riskAssessments[0] && <Badge>{u.aiAsset.riskAssessments[0].level}</Badge>}
            </Link>
          ))}
          {person.usages.length === 0 && (
            <div className="px-4 py-4 text-sm text-ink-400">No usage on record.</div>
          )}
        </div>
      </div>

      {recentActivity.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-ink-100 mb-3">Recent activity</h2>
          <div className="rounded-xl border border-line bg-panel shadow-card divide-y divide-line">
            {recentActivity.map((a) => (
              <Link key={a.id} href={`/activity/${a.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-black/[0.025] transition-colors">
                <div className="flex items-center gap-3">
                  <span className="tabular text-xs text-ink-400">{fmtDateTime(a.occurredAt)}</span>
                  <span className="text-ink-100">{a.aiAsset.name}</span>
                  <span className="text-ink-400 text-xs">{a.eventType}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
