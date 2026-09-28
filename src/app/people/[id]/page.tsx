import { PageHeader, StatCard } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { orgPrivacyMode, showsPeople } from "@/lib/privacy";
import { updateUserAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function PersonDetailPage({ params }: { params: { id: string } }) {
  // Nelle modalità privacy per reparto / solo totali non esiste una pagina per persona.
  if (!showsPeople(await orgPrivacyMode(currentOrgId()))) redirect("/people");
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
    // Sempre limitato all'azienda corrente: una parte locale come "john" non deve pescare eventi di altri clienti.
    where: { actorRef: { in: [person.email, emailLocalPart] }, aiAsset: { organizationId: currentOrgId() } },
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
        action={
          <details className="relative">
            <summary className="btn btn-secondary list-none cursor-pointer">Edit</summary>
            <form action={updateUserAction} className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-line bg-panel p-4 shadow-card flex flex-col gap-3">
              <input type="hidden" name="userId" value={person.id} />
              <label className="flex flex-col gap-1.5 text-xs text-ink-400">
                Name
                <input name="name" defaultValue={person.name ?? ""} placeholder="Full name" className="field" />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-ink-400">
                Department
                <input name="department" defaultValue={person.department ?? ""} placeholder="e.g. Sales" className="field" />
              </label>
              <p className="text-xs text-ink-400">The email comes from the company account and can&apos;t be changed here.</p>
              <button className="btn btn-primary btn-sm">Save</button>
            </form>
          </details>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="AI assets owned" value={String(person.ownedAssets.length)} />
        <StatCard label="High risk owned" value={String(highRiskOwned)} tone={highRiskOwned > 0 ? "alarm" : undefined} />
        <StatCard label="Status" value={highRiskOwned > 0 ? "Attention" : "Good"} tone={highRiskOwned > 0 ? "alarm" : undefined} />
      </div>

      <div>
        <h2 className="text-base font-semibold text-ink-100 mb-3">Assets owned</h2>
        <div className="rounded-xl border border-line bg-panel divide-y divide-line">
          {person.ownedAssets.map((a) => (
            <Link key={a.id} href={`/assets/${a.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-ink-100/[0.025] transition-colors">
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
        <div className="rounded-xl border border-line bg-panel divide-y divide-line">
          {person.usages.map((u) => (
            <Link key={u.id} href={`/assets/${u.aiAssetId}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-ink-100/[0.025] transition-colors">
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
          <div className="rounded-xl border border-line bg-panel divide-y divide-line">
            {recentActivity.map((a) => (
              <Link key={a.id} href={`/activity/${a.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-ink-100/[0.025] transition-colors">
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
