import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { PageHeader, Panel, Table, td } from "@/components/ui";
import { loadMarketFeed } from "@/lib/market/service";
import { changeHeadline, eurShort, eurSigned, impactLine, simulateHref } from "@/lib/market/format";
import { fmtDay, fmtMoney, SOURCE_LABEL } from "@/lib/pricing/service";
import type { SystemImpact } from "@/lib/market/impact";

export const dynamic = "force-dynamic";

const CONF: Record<string, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
const day = (d: Date | null) => (d ? fmtDay(d) : "Not recorded");

type Prices = { prices?: Record<string, number>; currency?: string; lifecycle?: string; retiresAt?: string | null; deprecatedAt?: string | null };

/** Stato vecchio / nuovo in una riga leggibile. */
function stateText(s: unknown) {
  const x = (s ?? null) as Prices | null;
  if (!x) return "Not recorded";
  if (x.prices) return Object.entries(x.prices).map(([k, v]) => `${k.replace(/_/g, " ")} ${fmtMoney(v, x.currency ?? "USD")}`).join(" · ");
  if (x.lifecycle) return [x.lifecycle, x.deprecatedAt ? `deprecated ${x.deprecatedAt}` : null, x.retiresAt ? `retires ${x.retiresAt}` : null].filter(Boolean).join(" · ");
  return JSON.stringify(x).slice(0, 200);
}

// Un cambiamento del mercato e cosa tocca nell'AI estate: sistemi, applicazioni, team, alternative.
export default async function MarketChangePage({ params }: { params: { id: string } }) {
  const orgId = currentOrgId();
  const now = new Date();
  const change = await db.aiMarketChange.findUnique({ where: { id: params.id } });
  if (!change) notFound();
  await loadMarketFeed(orgId, { now, materialOnly: false });
  const impact = await db.aiMarketChangeImpact.findUnique({ where: { organizationId_changeId: { organizationId: orgId, changeId: change.id } } });
  const h = changeHeadline(change, now);
  const sim = simulateHref(change);
  const detail = (impact?.detail ?? {}) as { systems?: SystemImpact[]; applications?: { id: string; name: string }[]; teams?: { id: string; name: string }[]; alternatives?: { id: string; name: string }[] };
  const facts: [string, React.ReactNode][] = [
    ["Before", stateText(change.oldState)],
    ["After", stateText(change.newState)],
    ["Effective", day(change.effectiveAt)],
    ["Announced", day(change.announcedAt)],
    ["Detected", day(change.detectedAt)],
    ["Source", change.sourceUrl ? <a href={change.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:underline break-all">{SOURCE_LABEL[change.sourceType as keyof typeof SOURCE_LABEL] ?? change.sourceType} ↗</a> : "None"],
    ["Confidence", CONF[change.confidence] ?? change.confidence],
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader crumbs={[{ label: "AI market changes", href: "/market" }, { label: h.subject }]} title={`${h.subject}: ${h.change}`} subtitle={h.provider} action={sim ? <Link href={sim} className="btn btn-primary">Simulate</Link> : undefined} />

      <Panel title="Change" flush>
        <div className="divide-y divide-line">
          {facts.map(([k, v]) => (
            <div key={k} className="flex flex-wrap sm:flex-nowrap gap-x-4 gap-y-1 px-5 py-3 text-sm">
              <span className="sm:w-40 shrink-0 eyebrow pt-0.5">{k}</span>
              <span className="text-ink-100 min-w-0">{v}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Table
        title="Affected systems"
        note={impact ? impactLine(impact) : undefined}
        columns={["AI system", { label: "Share", className: "text-right" }, { label: "Monthly spend", className: "text-right" }, { label: "Yearly change", className: "text-right" }]}
        empty={!detail.systems?.length ? "This change doesn't affect your AI." : false}
        footer={
          detail.systems?.length ? (
            <span className="text-ink-400">
              {[
                detail.applications?.length ? `Applications: ${detail.applications.map((a) => a.name).join(", ")}` : null,
                detail.teams?.length ? `Teams: ${detail.teams.map((t) => t.name).join(", ")}` : null,
                detail.alternatives?.length ? `Alternatives: ${detail.alternatives.map((a) => a.name).join(", ")}` : null,
              ].filter(Boolean).join(" · ") || "No applications or teams linked yet."}
            </span>
          ) : undefined
        }
      >
        {(detail.systems ?? []).map((s) => (
          <tr key={s.id}>
            <td className={td}><Link href={`/assets/${s.id}`} className="text-ink-100 hover:underline">{s.name}</Link></td>
            <td className={`${td} text-right tabular text-ink-400`}>{Math.round(s.fraction * 100)}%</td>
            <td className={`${td} text-right tabular text-ink-100`}>{s.monthlyEur != null ? `${s.costKind === "estimated" ? "≈ " : ""}${eurShort(s.monthlyEur)}` : "Unknown"}</td>
            <td className={`${td} text-right tabular text-ink-100`} title={s.deltaBasis === "tokens" ? "Observed tokens × price change" : s.deltaBasis === "spend" ? "Spend × price change" : undefined}>
              {s.annualDeltaEur != null ? eurSigned(s.annualDeltaEur) : "—"}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
