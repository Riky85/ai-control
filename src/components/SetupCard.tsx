import Link from "next/link";
import { db } from "@/lib/db";
import { completeOnboardingAction } from "@/lib/actions";

/**
 * Wizard di avvio in evidenza sulla Home. Ogni passo si spunta in base ai
 * dati reali del workspace (non "hai visitato la pagina"). Sparisce quando
 * tutti i passi sono fatti o quando lo si chiude.
 */
export default async function SetupCard({ orgId }: { orgId: string }) {
  const [connected, githubOrKeys, reviewed, owned, members, policies] = await Promise.all([
    db.connector.count({ where: { organizationId: orgId, status: "CONNECTED", credentialsEncrypted: { not: null } } }),
    db.aiAsset.count({ where: { organizationId: orgId, connectorId: null, deletedAt: null } }),
    db.aiAsset.count({ where: { organizationId: orgId, deletedAt: null, status: { in: ["APPROVED", "UNAPPROVED"] } } }),
    db.aiAsset.count({ where: { organizationId: orgId, deletedAt: null, ownerId: { not: null } } }),
    db.workspaceMember.count({ where: { organizationId: orgId } }),
    db.policy.count({ where: { organizationId: orgId, enabled: true } }),
  ]);

  const steps = [
    { title: "Connect a provider", hint: "Paste an API key, connect GitHub or import a CSV.", done: connected > 0 || githubOrKeys > 0, href: "/onboarding", cta: "Connect" },
    { title: "Review what was found", hint: "Approve or reject each AI system.", done: reviewed > 0, href: "/review", cta: "Review" },
    { title: "Assign owners", hint: "Every system needs someone responsible.", done: owned > 0, href: "/review", cta: "Assign" },
    { title: "Invite your team", hint: "Colleagues see and edit with their own role.", done: members > 1, href: "/workspace", cta: "Invite" },
    { title: "Turn on a policy", hint: "Start from the ready-made library.", done: policies > 0, href: "/governance?tab=policies", cta: "Add policy" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  if (!next) return null;

  return (
    <section className="rounded-xl border border-accent/30 bg-accent-soft/40 p-6 animate-rise">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-lg font-semibold text-ink-100">Set up angar</h2>
          <p className="text-sm text-ink-400 mt-0.5">
            {doneCount} of {steps.length} done — about 10 minutes to see your whole AI estate.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <form action={completeOnboardingAction}>
            <button className="text-sm text-ink-400 hover:text-ink-100 transition-colors">Hide</button>
          </form>
          <Link href={next.href} className="btn btn-primary">Continue: {next.title.toLowerCase()}</Link>
        </div>
      </div>

      <div className="h-1.5 bg-panel rounded-full overflow-hidden mt-4">
        <div className="h-full bg-accent rounded-full animate-grow" style={{ width: `${Math.max((doneCount / steps.length) * 100, 3)}%` }} />
      </div>

      <ol className="grid grid-cols-5 gap-3 mt-5">
        {steps.map((s, i) => {
          const isNext = s === next;
          return (
            <li key={s.title} className={`rounded-lg p-3 flex flex-col gap-2 ${isNext ? "bg-panel border border-accent/40 shadow-card" : "bg-panel/70 border border-transparent"}`}>
              <div className="flex items-center gap-2">
                <span
                  className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                    s.done ? "bg-steady text-white" : isNext ? "bg-accent text-white" : "bg-ink text-ink-400"
                  }`}
                >
                  {s.done ? (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <span className={`text-sm font-medium ${s.done ? "text-ink-400 line-through" : "text-ink-100"}`}>{s.title}</span>
              </div>
              <p className="text-xs text-ink-400 flex-1">{s.hint}</p>
              {!s.done && (
                <Link href={s.href} className={`btn btn-sm ${isNext ? "btn-primary" : "btn-secondary"} self-start`}>
                  {s.cta}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
