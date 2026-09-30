import Link from "next/link";
import { AxisGauge, AxisTrack } from "@/components/engine/ScoreCard";
import { LEVEL, levelOf } from "@/components/engine/score-level";
import { LockIcon } from "@/components/LockedFeature";
import { Pill, Section, NextStep, StackBar } from "./parts";

/**
 * Blocchi di presentazione della pagina Governance: solo dati serializzabili
 * in ingresso, nessuna query (si possono provare con dati finti).
 */

export interface Holdback {
  label: string;
  href: string;
  /** Punti persi sull'asse (positivo). */
  pts: number;
}

/** Testata: asse Governance dell'angar Score + prontezza AI Act, e cosa li tiene giù. */
export function GovernanceHeader({ governance, readiness, holds }: { governance: number | null; readiness: number; holds: Holdback[] }) {
  return (
    <section className="rounded-2xl border border-line bg-panel animate-rise" aria-labelledby="gov-readiness-title">
      {/* Barra grigia in alto con il titolo del blocco. */}
      <div className="bg-ink border-b border-line rounded-t-2xl px-5 py-3 text-sm bar-head">
        <h2 id="gov-readiness-title" className="font-semibold text-ink-100">Governance readiness</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-5 p-5">
        <div className="grid grid-cols-2 gap-3">
          {governance != null && <AxisGauge label="Governance" value={governance} size={72} href="/score#axis-governance" />}
          <div className={governance != null ? "" : "col-span-2"}>
            <AxisGauge label="AI Act readiness" value={readiness} size={72} href="/compliance" />
          </div>
        </div>
        <div className="min-w-0 flex flex-col">
          <div className="text-xs text-ink-400 mb-1.5">What holds it back</div>
          {holds.length === 0 ? (
            <p className="text-sm text-ink-400 flex items-center gap-2 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-steady" aria-hidden />
              Nothing — every check passes.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {holds.slice(0, 3).map((h) => (
                <li key={h.label}>
                  <Link href={h.href} className="flex items-baseline gap-3 py-2 text-sm group">
                    <span className="flex-1 min-w-0 truncate text-ink-100 group-hover:underline">{h.label}</span>
                    <span className="tabular text-accent font-medium shrink-0">+{h.pts} pts</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export interface DecisionsData {
  allowed: number;
  review: number;
  notAllowed: number;
  /** AI "Not allowed" usate negli ultimi 30 giorni. */
  blockedInUse: number;
  /** AI consentite senza un responsabile. */
  noOwner: number;
}

/** Decisioni sulle AI: consentite / da rivedere / non consentite, con il prossimo passo. */
export function DecisionsCard({ d }: { d: DecisionsData }) {
  const total = d.allowed + d.review + d.notAllowed;
  const next =
    d.blockedInUse > 0
      ? { href: "/?status=UNAPPROVED#your-ai", label: `Stop ${d.blockedInUse} AI that ${d.blockedInUse === 1 ? "is" : "are"} not allowed but still used` }
      : d.review > 0
        ? { href: "/review", label: `Review ${d.review} AI` }
        : d.noOwner > 0
          ? { href: "/assets", label: `Give ${d.noOwner} allowed AI an owner` }
          : null;
  return (
    <Section
      id="decisions"
      title="AI decisions"
      meta={total ? `${total} AI found` : "No AI found yet"}
      footer={next ? <NextStep href={next.href} label={next.label} /> : <NextStep done label={total ? "Every AI has a decision" : "Connect a source to find AI"} />}
    >
      <div className="px-5 py-4 flex flex-col gap-4">
        <StackBar
          label="AI decisions"
          parts={[
            { key: "ok", label: "Allowed", value: d.allowed, bar: "bg-steady/60", dot: "bg-steady", href: "/?status=APPROVED#your-ai" },
            { key: "rv", label: "To review", value: d.review, bar: "bg-signal/60", dot: "bg-signal", href: "/review" },
            { key: "no", label: "Not allowed", value: d.notAllowed, bar: "bg-alarm/60", dot: "bg-alarm", href: "/?status=UNAPPROVED#your-ai" },
          ]}
        />
        <dl className="divide-y divide-line border-t border-line text-sm">
          <div className="flex items-center justify-between gap-3 pt-2.5 pb-2">
            <dt className="text-ink-400">Not allowed but still used</dt>
            <dd>{d.blockedInUse ? <Pill tone="alarm">{d.blockedInUse} in the last 30 days</Pill> : <Pill tone="steady">None</Pill>}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 pt-2 pb-0.5">
            <dt className="text-ink-400">Allowed AI without an owner</dt>
            <dd>{d.noOwner ? <Pill tone="signal">{d.noOwner}</Pill> : <Pill tone="steady">None</Pill>}</dd>
          </div>
        </dl>
      </div>
    </Section>
  );
}

export type TierKey = "HIGH_RISK" | "LIMITED_RISK" | "MINIMAL_RISK" | "UNCLASSIFIED";

export interface AiActData {
  readiness: number;
  tiers: Record<TierKey, number>;
  missingOwners: number;
  literacyRecorded: boolean;
  /** Prossima scadenza non ancora in vigore (ISO), con titolo. */
  nextDate: { date: string; title: string } | null;
  inForce: number;
  phases: number;
}

const TIERS: { key: TierKey; label: string; bar: string; dot: string }[] = [
  { key: "HIGH_RISK", label: "High risk", bar: "bg-alarm/45", dot: "bg-alarm" },
  { key: "LIMITED_RISK", label: "Limited risk", bar: "bg-signal/50", dot: "bg-signal" },
  { key: "MINIMAL_RISK", label: "Minimal risk", bar: "bg-steady/50", dot: "bg-steady" },
  { key: "UNCLASSIFIED", label: "Not classified", bar: "bg-ink-400/40", dot: "bg-ink-400" },
];

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
function until(iso: string, now = Date.now()) {
  const days = Math.ceil((new Date(iso).getTime() - now) / 86400000);
  if (days <= 0) return "now";
  if (days < 60) return `in ${days} days`;
  const months = Math.round(days / 30.4);
  return months < 24 ? `in ${months} months` : `in ${Math.round(months / 12)} years`;
}

/** EU AI Act: prontezza, AI per livello di rischio e prossima scadenza. */
export function AiActCard({ d }: { d: AiActData }) {
  const total = TIERS.reduce((t, x) => t + d.tiers[x.key], 0);
  const max = Math.max(1, ...TIERS.map((x) => d.tiers[x.key]));
  const lv = LEVEL[levelOf(d.readiness)];
  const next =
    d.tiers.UNCLASSIFIED > 0
      ? { href: "/compliance", label: `Classify ${d.tiers.UNCLASSIFIED} AI` }
      : d.missingOwners > 0
        ? { href: "/assets", label: `Give ${d.missingOwners} AI an owner` }
        : !d.literacyRecorded
          ? { href: "/compliance", label: "Record AI literacy training" }
          : null;
  return (
    <Section
      id="ai-act"
      title="EU AI Act"
      meta={
        <span className="flex items-center gap-2">
          Readiness <b className="font-medium text-ink-100 tabular">{d.readiness}/100</b>
          <Pill tone={levelOf(d.readiness) === "weak" ? "alarm" : levelOf(d.readiness) === "fair" ? "accent" : levelOf(d.readiness) === "good" ? "signal" : "steady"}>{lv.label}</Pill>
        </span>
      }
      action={
        <Link href="/compliance" className="text-sm text-ink-400 hover:text-ink-100">
          Open →
        </Link>
      }
      footer={next ? <NextStep href={next.href} label={next.label} /> : <NextStep done label="Ready for what is in force today" />}
    >
      <div className="px-5 py-4 flex flex-col gap-4">
        <AxisTrack value={d.readiness} />
        <ul className="flex flex-col gap-2" aria-label="AI by risk class">
          {TIERS.map((t) => {
            const n = d.tiers[t.key];
            return (
              <li key={t.key} className="grid grid-cols-[7.5rem_minmax(0,1fr)_2rem] items-center gap-3 text-sm">
                <span className="flex items-center gap-2 text-ink-400">
                  <span className={`h-2 w-2 rounded-full ${t.dot}`} aria-hidden />
                  {t.label}
                </span>
                <span className="relative h-3" aria-hidden>
                  <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
                  {n > 0 && <span className={`absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full ${t.bar}`} style={{ width: `${Math.max(3, (n / max) * 100)}%` }} />}
                </span>
                <span className={`text-right tabular ${n ? "text-ink-100 font-medium" : "text-ink-400"}`}>{n}</span>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-2.5 text-xs text-ink-400">
          {d.nextDate ? (
            <span className="min-w-0">
              Next <b className="font-medium text-ink-100">{fmtDay(d.nextDate.date)}</b> · {d.nextDate.title}
            </span>
          ) : (
            <span>Every phase is in force</span>
          )}
          <span className="tabular shrink-0">
            {d.nextDate ? `${until(d.nextDate.date)} · ` : ""}
            {d.inForce} of {d.phases} phases in force
          </span>
        </div>
        {total === 0 && <p className="text-xs text-ink-400 -mt-2">No AI to classify yet.</p>}
      </div>
    </Section>
  );
}

export interface RecordLink {
  href: string;
  label: string;
  tag: string;
  download?: boolean;
  locked?: boolean;
}

/** Registri: export del registro AI, evidence pack, audit log e gli altri archivi. */
export function RecordsCard({ links }: { links: RecordLink[] }) {
  return (
    <Section id="records" title="Records" meta="Proof for auditors, the board and NIS2">
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line rounded-b-2xl overflow-hidden">
        {links.map((l) => {
          const inner = (
            <>
              <span className="min-w-0">
                <span className="block text-sm text-ink-100 group-hover:underline truncate">{l.label}</span>
                <span className="block text-xs text-ink-400 truncate">{l.locked ? "Available on Growth" : l.tag}</span>
              </span>
              <span className="text-ink-400 group-hover:text-ink-100 shrink-0" aria-hidden>
                {l.locked ? <LockIcon /> : l.download ? "↓" : "→"}
              </span>
            </>
          );
          const cls = "group flex items-center justify-between gap-3 px-5 py-3 hover:bg-ink-100/[0.02] transition-colors h-full";
          return (
            <li key={l.href} className="bg-panel">
              {l.download && !l.locked ? (
                <a href={l.href} className={cls}>
                  {inner}
                </a>
              ) : (
                <Link href={l.locked ? "/billing" : l.href} className={cls}>
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
