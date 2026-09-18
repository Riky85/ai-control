import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PersonDetailPage({ params }: { params: { id: string } }) {
  const person = await db.user.findUnique({
    where: { id: params.id },
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
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-xs text-ink-400 mb-2">
          <Link href="/people" className="hover:text-ink-100 hover:underline">People</Link>
          <span className="mx-1.5">/</span>
          {person.name ?? person.email}
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink-100">{person.name ?? person.email}</h1>
        <p className="text-sm text-ink-400 mt-1.5">
          {person.email}{person.department && ` · ${person.department}`}
        </p>
      </div>

      <div className="rounded-lg border border-line bg-panel shadow-card grid grid-cols-3 divide-x divide-line">
        <div className="px-5 py-4">
          <div className="tabular font-display text-2xl font-semibold text-ink-100">{person.ownedAssets.length}</div>
          <div className="text-xs text-ink-400 mt-0.5">AI assets owned</div>
        </div>
        <div className="px-5 py-4">
          <div className={`tabular font-display text-2xl font-semibold ${highRiskOwned > 0 ? "text-alarm" : "text-ink-100"}`}>
            {highRiskOwned}
          </div>
          <div className="text-xs text-ink-400 mt-0.5">High risk owned</div>
        </div>
        <div className="px-5 py-4">
          <div className={`text-sm font-medium mt-1.5 ${highRiskOwned > 0 ? "text-alarm" : "text-steady"}`}>
            {highRiskOwned > 0 ? "Attention" : "Good"}
          </div>
          <div className="text-xs text-ink-400 mt-0.5">Status</div>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-ink-400 mb-3">Assets owned</h2>
        <div className="rounded-md border border-line bg-panel shadow-card divide-y divide-line">
          {person.ownedAssets.map((a) => (
            <Link key={a.id} href={`/assets/${a.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-white/[0.025] transition-colors">
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
        <h2 className="text-sm font-medium text-ink-400 mb-3">Assets used</h2>
        <div className="rounded-md border border-line bg-panel shadow-card divide-y divide-line">
          {person.usages.map((u) => (
            <Link key={u.id} href={`/assets/${u.aiAssetId}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-white/[0.025] transition-colors">
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
          <h2 className="text-sm font-medium text-ink-400 mb-3">Recent activity</h2>
          <div className="rounded-md border border-line bg-panel shadow-card divide-y divide-line">
            {recentActivity.map((a) => (
              <Link key={a.id} href={`/activity/${a.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-white/[0.025] transition-colors">
                <div className="flex items-center gap-3">
                  <span className="tabular text-xs text-ink-400">{new Date(a.occurredAt).toLocaleString()}</span>
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
