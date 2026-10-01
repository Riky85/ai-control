import Link from "next/link";
import { teamValue, type TeamValue as Team, type TeamVerdict } from "@/lib/budgets";
import { orgPrivacyMode, showsDepartments, MIN_GROUP } from "@/lib/privacy";
import { fmtEur } from "@/lib/format";

const MAX_ROWS = 8;
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Pillola del verdetto: colore + testo (mai solo colore). */
function VerdictPill({ t }: { t: Team }) {
  const map: Record<TeamVerdict, { label: string; cls: string }> = {
    high: { label: "High use", cls: "text-steady bg-steady/10" },
    fair: { label: t.idleEur >= 1 ? `Fair use · ${fmtEur(t.idleEur)} idle` : "Fair use", cls: "text-ink-400 bg-ink-100/[0.06]" },
    under: { label: `Underused — ${fmtEur(t.idleEur)} a month idle`, cls: "text-signal bg-signal/10" },
    idle: { label: `Not used — ${fmtEur(t.idleEur || t.monthlyEur)} a month idle`, cls: "text-alarm bg-alarm/10" },
    none: { label: "No paid AI", cls: "text-ink-400 bg-ink-100/[0.06]" },
  };
  const v = map[t.verdict];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tabular whitespace-nowrap ${v.cls}`}>{v.label}</span>;
}

/** Barretta orizzontale: lunghezza = spesa (rispetto al team più caro), parte chiara = posti non usati. */
function SpendBar({ t, max }: { t: Team; max: number }) {
  const w = max > 0 ? (t.monthlyEur / max) * 100 : 0;
  const idle = t.monthlyEur > 0 ? Math.min(1, t.idleEur / t.monthlyEur) : 0;
  const label = `${fmtEur(t.monthlyEur)} a month${t.idleEur >= 1 ? `, ${fmtEur(t.idleEur)} on seats not used in 30 days` : ""}`;
  return (
    <div className="relative h-3" role="img" aria-label={label} title={label}>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
      <div className="absolute left-0 top-1/2 flex h-1.5 -translate-y-1/2 overflow-hidden rounded-full" style={{ width: `${Math.max(w, t.monthlyEur > 0 ? 2 : 0)}%` }}>
        <div className="h-full bg-accent/70" style={{ width: `${(1 - idle) * 100}%` }} />
        <div className="h-full bg-accent/20" style={{ width: `${idle * 100}%` }} />
      </div>
    </div>
  );
}

/**
 * "Value by team": spesa AI mensile di ogni reparto, persone attive vs posti,
 * utilizzo, costo per ogni persona attiva e verdetto. Gruppi sotto le 5
 * persone uniti in "Other (small teams)", mai nomi.
 */
export default async function TeamValue({ orgId }: { orgId: string }) {
  const mode = await orgPrivacyMode(orgId);
  if (!showsDepartments(mode)) {
    return (
      <section className="rounded-2xl border border-line bg-panel px-5 py-4 text-sm text-ink-400">
        <span className="font-medium text-ink-100">Value by team</span> is off: employee privacy is set to totals only.{" "}
        <Link href="/settings?tab=privacy" className="underline hover:text-ink-100">Change it</Link>
      </section>
    );
  }
  const { teams, suppressed, unassignedSeatsEur } = await teamValue(orgId);
  const shown = teams.slice(0, MAX_ROWS);
  const max = Math.max(0, ...teams.map((t) => t.monthlyEur));
  const idleTotal = teams.reduce((s, t) => s + t.idleEur, 0);
  return (
    <section className="rounded-2xl border border-line bg-panel animate-rise" aria-labelledby="team-value-title">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-ink border-b border-line rounded-t-2xl px-5 py-3 bar-head">
        <div className="min-w-0">
          <h2 id="team-value-title" className="text-sm font-bold text-ink-100">Value by team</h2>
          <p className="text-xs text-ink-400 mt-0.5">
            AI spend a month and how much of it is used{idleTotal >= 1 ? <> · <b className="font-medium text-ink-100">{fmtEur(idleTotal)}</b> a month on idle seats</> : null}
          </p>
        </div>
        <span className="flex items-center gap-3 text-[11px] text-ink-400 shrink-0" aria-hidden>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-full bg-accent/70" />Used</span>
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-3 rounded-full bg-accent/20" />Idle</span>
        </span>
      </div>

      {suppressed ? (
        <p className="p-5 text-sm text-ink-400">Fewer than {MIN_GROUP} people use paid AI — teams appear once groups are large enough to stay anonymous.</p>
      ) : shown.length === 0 ? (
        <p className="p-5 text-sm text-ink-400">
          No paid AI with known users yet. <Link href="/sources" className="underline hover:text-ink-100">Add costs</Link> and <Link href="/people" className="underline hover:text-ink-100">set departments</Link> to see value by team.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((t) => (
            <li key={t.department} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 px-5 py-3">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className={`text-sm font-medium truncate ${t.merged ? "text-ink-400" : "text-ink-100"}`}>{t.department}</span>
                  <span className="text-sm tabular text-ink-100 shrink-0">{fmtEur(t.monthlyEur)}</span>
                </div>
                <div className="text-xs text-ink-400 mt-0.5 flex flex-wrap gap-x-2 tabular">
                  <span title="People who used AI in the last 30 days">
                    <b className="font-medium text-ink-100">{t.activePeople}</b> of {t.people} active
                  </span>
                  {t.seats > 0 && (
                    <span title="Paid seats used in the last 30 days">
                      {t.activeSeats} of {t.seats} seats used
                    </span>
                  )}
                  {t.utilisation != null && <span>{pct(t.utilisation)} use</span>}
                  {t.eurEachActive != null && <span>{fmtEur(t.eurEachActive)} each active user</span>}
                </div>
              </div>
              <div className="hidden sm:block"><SpendBar t={t} max={max} /></div>
              <VerdictPill t={t} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3 bg-ink border-t border-line rounded-b-2xl px-5 py-3 text-xs text-ink-400 bar-foot">
        <span>
          Active = used in the last 30 days · teams under {MIN_GROUP} people are grouped, no names
          {unassignedSeatsEur >= 1 ? ` · ${fmtEur(unassignedSeatsEur)} a month on seats with nobody assigned` : ""}
        </span>
        {teams.length > MAX_ROWS && <span className="tabular shrink-0">+{teams.length - MAX_ROWS} more</span>}
      </div>
    </section>
  );
}
