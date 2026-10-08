import Link from "next/link";
import { notFound } from "next/navigation";
import { currentOrgId } from "@/lib/org";
import { currentSession } from "@/lib/auth";
import { loadDossier } from "@/lib/engine/negotiate";
import { PageHeader, StatCard } from "@/components/ui";
import { VendorBadge } from "@/components/VendorIcon";
import CopyButton from "@/components/CopyButton";
import { PriceRangeBar, VerdictPill } from "@/components/engine/PriceIndexCard";
import { NegotiationStrength, UsageSpark } from "@/components/engine/NegotiationParts";
import { Section, Pill } from "@/components/governance/parts";
import { fmtDate, fmtEur } from "@/lib/format";

export const dynamic = "force-dynamic";

const seat = (n: number) => fmtEur(n, { decimals: n < 100 });
const days = (n: number) => (n < 0 ? "passed" : n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

// Dossier per il prossimo rinnovo di un'AI: date, prezzo contro il mercato, posti, richiesta ed email al fornitore.
export default async function NegotiatePage({ params }: { params: { id: string } }) {
  const orgId = currentOrgId();
  const s = currentSession();
  const d = await loadDossier(orgId, params.id, s?.name ?? null);
  if (!d) notFound();

  const r = d.renewal;
  const deadlineSoon = r.daysToDeadline != null && r.daysToDeadline >= 0 && r.daysToDeadline <= 14;
  const source = d.price.referenceLabel === "market median" ? "peers" : d.price.referenceLabel ? "list" : "none";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader subtitle="Get a better price"
        crumbs={[{ label: "Opportunities", href: "/opportunities" }, { label: "Contracts", href: "/opportunities?view=contracts" }, { label: d.asset.name }]}
        title={`Negotiate ${d.asset.name}`}
        action={
          <Link href={`/estate/${d.asset.id}`} className="btn btn-ghost btn-sm">
            Open AI
          </Link>
        }
      />

      {/* La richiesta */}
      <section className="relative overflow-hidden rounded-xl border border-line bg-panel animate-rise">
        {/* Barra grigia in alto: la richiesta, piano e categoria. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-ink border-b border-line rounded-t-xl px-5 py-3 text-sm bar-head">
          <span className="font-bold text-ink-100">The ask</span>
          {(d.asset.planName || d.asset.categoryLabel) && (
            <span className="eyebrow">{[d.asset.planName, d.asset.categoryLabel].filter(Boolean).join(" · ")}</span>
          )}
        </div>
        <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem] gap-6 p-5 lg:p-6">
          <div className="flex items-start gap-4 min-w-0">
            <VendorBadge vendor={d.asset.vendor ?? ""} name={d.asset.name} size={44} />
            <div className="min-w-0">
              <h2 className="font-display text-[22px] leading-snug font-semibold tracking-tight text-ink-100">{d.ask}</h2>
              {d.target.yearlyEur != null && d.cost.yearlyEur != null && d.target.saveYearlyEur >= 1 && (
                <p className="text-sm text-ink-400 mt-1 tabular">
                  From <b className="font-medium text-ink-100">{fmtEur(d.cost.yearlyEur)}</b> to <b className="font-medium text-ink-100">{fmtEur(d.target.yearlyEur)}</b> a year
                  {d.cost.estimated ? " · cost estimated from list prices" : ""}
                </p>
              )}
            </div>
          </div>
          <NegotiationStrength level={d.strength.level} reasons={d.strength.reasons} />
        </div>
      </section>

      {/* Date, costo, posti: la stessa riga di card delle altre pagine. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          label={r.autoRenew === false ? "Contract ends" : "Renews"}
          value={r.date ? fmtDate(r.date) : "—"}
          hint={r.date ? `${days(r.daysToRenewal!)} · ${r.source === "contract" ? "from the contract" : "from your bills"}` : "Add contract dates on the AI's page"}
        />
        <StatCard
          label="Notice deadline"
          value={r.deadline ? fmtDate(r.deadline) : "—"}
          hint={r.deadline ? `${days(r.daysToDeadline!)}${r.noticeDays ? ` · ${r.noticeDays} days' notice` : ""}` : "No notice period recorded"}
          tone={deadlineSoon ? "warn" : undefined}
        />
        <StatCard
          label="Cost"
          value={d.cost.monthlyEur != null ? `${fmtEur(d.cost.monthlyEur)}/mo` : "—"}
          hint={d.cost.monthlyEur != null ? `${fmtEur(d.cost.yearlyEur!)} a year · ${d.cost.annual ? "yearly" : "monthly"} billing` : "No cost yet"}
        />
        <StatCard
          label="Seats used"
          value={d.seats.paid != null && d.seats.known > 0 ? `${d.seats.active} / ${d.seats.paid}` : d.seats.paid != null ? String(d.seats.paid) : "—"}
          hint={d.seats.unused > 0 ? `${d.seats.unused} unused` : d.seats.paid != null && d.seats.known > 0 ? "Active / paid" : d.seats.paid ? "Users unknown" : "No seat plan"}
          tone={d.seats.unused > 0 ? "warn" : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Prezzo di un posto */}
        <Section title="What you pay vs the market" meta="One seat, a month" action={<VerdictPill verdict={d.price.verdict} source={source} deltaPct={d.price.deltaPct} />}>
          <div className="p-5 flex flex-col gap-3">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-400 tabular">
              <span>
                You <b className="font-medium text-ink-100">{d.price.yourSeatEur != null ? seat(d.price.yourSeatEur) : "—"}</b>
              </span>
              {d.price.peers && (
                <span>
                  Market <b className="font-medium text-ink-100">{seat(d.price.peers.median)}</b>
                  <span className="text-xs"> · middle 50% {seat(d.price.peers.p25)} to {seat(d.price.peers.p75)}</span>
                </span>
              )}
              {d.price.listSeatEur != null && (
                <span>
                  List <b className="font-medium text-ink-100">{seat(d.price.listSeatEur)}</b>
                </span>
              )}
              {d.target.seatEur != null && (
                <span>
                  Target <b className="font-normal text-accent">{seat(d.target.seatEur)}</b>
                </span>
              )}
            </div>
            <PriceRangeBar row={{ peers: d.price.peers, listSeatEur: d.price.listSeatEur, yourSeatEur: d.price.yourSeatEur, verdict: d.price.verdict }} />
            <p className="text-xs text-ink-400">{d.price.peers ? `Median of ${d.price.peers.count} companies on angar · anonymous.` : "Not enough companies for a market price yet. List price shown."}</p>
          </div>
        </Section>

        {/* Uso nel tempo */}
        <Section
          title="Usage trend"
          meta={`Active people each week · last ${d.trend.weekly.length} weeks`}
          action={
            d.trend.changePct != null ? (
              <Pill tone={d.trend.direction === "down" ? "accent" : "muted"}>
                {d.trend.changePct > 0 ? "+" : d.trend.changePct < 0 ? "−" : ""}
                {Math.abs(d.trend.changePct)}% in 4 weeks
              </Pill>
            ) : undefined
          }
        >
          <div className="p-5">
            <UsageSpark weekly={d.trend.weekly} />
          </div>
        </Section>
      </div>

      {/* Leve e alternative */}
      <Section
        title="Levers"
        meta={d.levers.length ? `${fmtEur(d.target.saveYearlyEur)} a year in total` : "Nothing to cut: ask for flexibility instead"}
        footer={
          d.alternatives.length > 0 ? (
            <span className="text-ink-400">
              Also in use:{" "}
              {d.alternatives.map((a, n) => (
                <span key={a.id}>
                  {n > 0 && ", "}
                  <Link href={`/estate/${a.id}`} className="text-ink-100 hover:underline">
                    {a.name}
                  </Link>
                  <span className="tabular"> ({a.active} active)</span>
                </span>
              ))}
            </span>
          ) : undefined
        }
      >
        {d.levers.length > 0 && (
          <ul className="divide-y divide-line">
            {d.levers.map((l) => (
              <li key={l.key} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span className="text-ink-100">{l.label}</span>
                <span className="tabular text-[17px] font-light tracking-[-0.03em] text-ink-100">
                  {fmtEur(l.yearlyEur)}
                  <span className="text-xs tracking-normal text-ink-400"> a year</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Email al fornitore */}
      <Section
        title="Email to the vendor"
        meta={d.email.subject}
        action={
          <>
            <CopyButton text={`${d.email.subject}\n\n${d.email.body}`} label="Copy email" className="btn btn-ghost btn-sm" />
            <a href={d.email.mailto} className="btn btn-primary btn-sm">
              Open in email
            </a>
          </>
        }
      >
        <pre className="m-5 whitespace-pre-wrap rounded-xl border border-line bg-ink px-4 py-3 font-sans text-sm leading-relaxed text-ink-100">{d.email.body}</pre>
      </Section>
    </div>
  );
}
