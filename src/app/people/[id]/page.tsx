import { PageHeader, StatCard } from "@/components/ui";
import { fmtAgo, fmtDateTime } from "@/lib/format";
import { Insight } from "@/components/insight";
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
      // Le AI eliminate non compaiono (il loro link porterebbe a una pagina inesistente).
      usages: {
        where: { aiAsset: { deletedAt: null } },
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

  // Uso nei 30 giorni: AI attive, AI non usate da un mese, AI non consentite in uso.
  const since = Date.now() - 30 * 86400000;
  const lastSeen = person.usages.reduce<Date | null>((m, u) => (u.lastSeenAt && (!m || u.lastSeenAt > m) ? u.lastSeenAt : m), null);
  const active = person.usages.filter((u) => u.lastSeenAt && u.lastSeenAt.getTime() >= since);
  const notAllowed = person.usages.filter((u) => u.aiAsset.status === "UNAPPROVED" && !u.aiAsset.deletedAt);
  const dormant = person.usages.filter((u) => u.lastSeenAt && u.lastSeenAt.getTime() < since && !u.aiAsset.deletedAt);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: "People", href: "/people" }]}
        title={person.name ?? person.email}
        subtitle={`${person.email}${person.department ? ` · ${person.department}` : ""}`}
        action={
          <details className="relative">
            <summary className="btn btn-secondary list-none cursor-pointer">Edit</summary>
            <form action={updateUserAction} className="absolute left-0 lg:left-auto lg:right-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-panel p-4 shadow-card flex flex-col gap-3">
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="AI used" value={String(person.usages.length)} hint={`${active.length} in the last 30 days`} tone="accent" />
        <StatCard label="Last active" value={lastSeen ? fmtAgo(lastSeen) : "—"} hint={lastSeen ? fmtDateTime(lastSeen) : "No usage seen yet"} />
        <StatCard label="AI assets owned" value={String(person.ownedAssets.length)} hint={person.ownedAssets.length ? "Accountable for them" : "Owns none"} />
        <StatCard label="High risk owned" value={String(highRiskOwned)} hint={highRiskOwned > 0 ? "Status: attention" : "Status: good"} tone={highRiskOwned > 0 ? "alarm" : undefined} />
      </div>
      {notAllowed.length > 0 ? (
        <Insight tone="alarm" href={`/assets/${notAllowed[0].aiAssetId}`} cta={`Open ${notAllowed[0].aiAsset.name}`}>
          Uses <b className="font-medium">{notAllowed[0].aiAsset.name}</b>
          {notAllowed.length > 1 ? ` and ${notAllowed.length - 1} more AI` : ""}, which {notAllowed.length > 1 ? "aren't" : "isn't"} allowed — point them to an approved alternative.
        </Insight>
      ) : dormant.length > 0 ? (
        <Insight tone="signal" href="/usage?view=cleanup" cta="Seat clean-up">
          Hasn&apos;t used <b className="font-medium">{dormant[0].aiAsset.name}</b>
          {dormant.length > 1 ? ` and ${dormant.length - 1} more AI` : ""} in 30 days — the seat could be freed.
        </Insight>
      ) : null}

      <div>
        <div className="rounded-xl border border-line bg-panel divide-y divide-line overflow-hidden">
          <h2 className="px-4 py-3 text-sm font-bold text-ink-100">Assets owned</h2>
          {person.ownedAssets.map((a) => (
            <Link key={a.id} href={`/assets/${a.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-ink-100/[0.025] transition-colors">
              <span className="font-medium text-ink-100 truncate min-w-0">{a.name}</span>
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
        <div className="rounded-xl border border-line bg-panel divide-y divide-line overflow-hidden">
          <h2 className="px-4 py-3 text-sm font-bold text-ink-100">Assets used</h2>
          {person.usages.map((u) => (
            <Link key={u.id} href={`/assets/${u.aiAssetId}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-ink-100/[0.025] transition-colors">
              <span className="font-medium text-ink-100 truncate min-w-0">{u.aiAsset.name}</span>
              <div className="flex items-center gap-3 text-xs shrink-0">
                <span className="text-ink-400 tabular">{u.lastSeenAt ? `Last used ${fmtAgo(u.lastSeenAt)}` : "Not seen yet"}</span>
                {u.aiAsset.riskAssessments[0] && <Badge>{u.aiAsset.riskAssessments[0].level}</Badge>}
              </div>
            </Link>
          ))}
          {person.usages.length === 0 && (
            <div className="px-4 py-4 text-sm text-ink-400">
              No usage on record — <Link href="/download" className="underline hover:text-ink-100">install the desktop app</Link> to see which AI they use.
            </div>
          )}
        </div>
      </div>

      {recentActivity.length > 0 && (
        <div>
          <div className="rounded-xl border border-line bg-panel divide-y divide-line overflow-hidden">
            <h2 className="px-4 py-3 text-sm font-bold text-ink-100">Recent activity</h2>
            {recentActivity.map((a) => (
              <Link key={a.id} href={`/activity/${a.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-ink-100/[0.025] transition-colors">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 min-w-0">
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
