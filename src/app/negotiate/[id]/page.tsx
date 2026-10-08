import Link from "next/link";
import { notFound } from "next/navigation";
import { currentOrgId } from "@/lib/org";
import { currentSession } from "@/lib/auth";
import { loadDossier } from "@/lib/engine/negotiate";
import { PageHeader } from "@/components/ui";
import { VendorBadge } from "@/components/VendorIcon";
import CopyButton from "@/components/CopyButton";
import { PriceRangeBar, VerdictPill } from "@/components/engine/PriceIndexCard";
import { NegotiationStrength, UsageSpark } from "@/components/engine/NegotiationParts";
import { SeatTrack } from "@/components/usage/cards";
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
  const cell = "bg-panel px-5 py-4 flex flex-col gap-1 min-w-0";
  const big = "font-display text-[22px] leading-tight font-semibold tracking-tight tabular text-ink-100";
  const deadlineSoon = r.daysToDeadline != null && r.daysToDeadline >= 0 && r.daysToDeadline <= 14;
  const source = d.price.referenceLabel === "market median" ? "peers" : d.price.referenceLabel ? "list" : "none";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader subtitle="Get a better price"
        crumbs={[{ label: "Opportunities", href: "/opportunities" }, { label: "Contracts", href: "/opportunities?view=contracts" }, { label: d.asset.name }]}
        title={`Negotiate ${d.asset.name}`}
        action={
          <Link href={`/assets/${d.asset.id}`} className="btn btn-ghost btn-sm">
            Open AI
          </Link>
        }
      />

      {/* La richiesta */}
      <section className="relative overflow-hidden rounded-xl border border-line bg-panel animate-rise">
        {/* Barra grigia in alto: la richiesta, piano e categoria. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-ink border-b border-line rounded-t-xl px-5 py-3 text-sm bar-head">
          <span className="font-semibold text-ink-100">The ask</span>
          {(d.asset.planName || d.asset.categoryLabel) && (
            <span className="text-xs text-ink-400">{[d.asset.planName, d.asset.categoryLabel].filter(Boolean).join(" · ")}</span>
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

      {/* Date, costo, posti */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-xl border border-line bg-line animate-rise" aria-label="Renewal summary">
        <div className={cell}>
          <span className="text-xs text-ink-400">{r.autoRenew === false ? "Contract ends" : "Renews"}</span>
          <span className={big}>{r.date ? fmtDate(r.date) : "—"}</span>
          <span className="text-xs text-ink-400 truncate">
            {r.date ? `${days(r.daysToRenewal!)} · ${r.source === "contract" ? "from the contract" : "from your bills"}` : "Add contract dates on the AI's page"}
          </span>
        </div>
        <div className={cell}>
          <span className="flex items-center justify-between gap-2 text-xs text-ink-400">
            Notice deadline
            {deadlineSoon && <Pill tone="signal">Soon</Pill>}
          </span>
          <span className={big}>{r.deadline ? fmtDate(r.deadline) : "—"}</span>
          <span className="text-xs text-ink-400 truncate">
            {r.deadline ? `${days(r.daysToDeadline!)}${r.noticeDays ? ` · ${r.noticeDays} days' notice` : ""}` : "No notice period recorded"}
          </span>
        </div>
        <div className={cell}>
          <span className="text-xs text-ink-400">Cost</span>
          <span className={big}>{d.cost.monthlyEur != null ? fmtEur(d.cost.monthlyEur) : "—"}</span>
          <span className="text-xs text-ink-400 truncate">
            {d.cost.monthlyEur != null ? `a month · ${fmtEur(d.cost.yearlyEur!)} a year · ${d.cost.annual ? "yearly" : "monthly"} billing` : "No cost yet"}
          </span>
        </div>
        <div className={cell}>
          <span className="flex items-center justify-between gap-2 text-xs text-ink-400">
            Seats used
            {d.seats.unused > 0 && <Pill tone="signal">{d.seats.unused} unused</Pill>}
          </span>
          <span className={big}>
            {d.seats.paid != null && d.seats.known > 0 ? (
              <>
                {d.seats.active}
                <span className="text-sm font-normal text-ink-400"> / {d.seats.paid}</span>
              </>
            ) : d.seats.paid != null ? (
              d.seats.paid
            ) : (
              "—"
            )}
          </span>
          {d.seats.paid != null && d.seats.known > 0 ? <SeatTrack used={d.seats.active} paid={d.seats.paid} /> : <span className="text-xs text-ink-400">{d.seats.paid ? "Users unknown" : "No seat plan"}</span>}
        </div>
      </section>

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
                  Target <b className="font-medium text-accent">{seat(d.target.seatEur)}</b>
                </span>
              )}
            </div>
            <PriceRangeBar row={{ peers: d.price.peers, listSeatEur: d.price.listSeatEur, yourSeatEur: d.price.yourSeatEur, verdict: d.price.verdict }} />
            <p className="text-xs text-ink-400">{d.price.peers ? `Median of ${d.price.peers.count} companies on angar · anonymous.` : "Not enough companies for a market price yet — list price shown."}</p>
          </div>
        </Section>

        {/* Uso nel tempo */}
        <Section
          title="Usage trend"
          meta={`Active people each week · last ${d.trend.weekly.length} weeks`}
          action={
            d.trend.changePct != null ? (
              <Pill tone={d.trend.direction === "down" ? "signal" : "muted"}>
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
        meta={d.levers.length ? `${fmtEur(d.target.saveYearlyEur)} a year in total` : "Nothing to cut — ask for flexibility instead"}
        footer={
          d.alternatives.length > 0 ? (
            <span className="text-ink-400">
              Also in use:{" "}
              {d.alternatives.map((a, n) => (
                <span key={a.id}>
                  {n > 0 && ", "}
                  <Link href={`/assets/${a.id}`} className="text-ink-100 hover:underline">
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
                <span className="tabular text-ink-100">
                  {fmtEur(l.yearlyEur)}
                  <span className="text-ink-400"> a year</span>
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
            <CopyButton text={`${d.email.subject}\n\n${d.email.body}`} label="Copy" />
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
