import { fmtDate } from "@/lib/format";
import { currentOrgId } from "@/lib/org";
import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import Link from "next/link";
import VendorIcon, { VendorBadge } from "@/components/VendorIcon";
import DonutChart from "@/components/DonutChart";
import BarChart from "@/components/BarChart";
import EstateGraph from "@/components/EstateGraph";
import { StatCard, Panel, PageHeader } from "@/components/ui";
import ExportMenu from "@/components/ExportMenu";
import { RISK_CHART_COLORS } from "@/lib/chart-colors";

export const dynamic = "force-dynamic";

const SENSITIVE = ["PII", "FINANCIAL", "SOURCE_CODE"];
const STATUS_LABEL: Record<string, string> = { APPROVED: "Approved", UNREVIEWED: "In review", UNAPPROVED: "Rejected", UNKNOWN: "Not started" };

export default async function OverviewPage() {
  const org = await db.organization.findUnique({ where: { id: currentOrgId() } });
  const assets = await db.aiAsset.findMany({
    where: { organizationId: currentOrgId(), deletedAt: null },
    include: {
      owner: true,
      cost: true,
      riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 },
      dataAccess: { include: { dataAsset: true } },
      alternatives: true,
    },
    orderBy: { lastSeenAt: "desc" },
  });
  const brokenConnections = await db.connector.findMany({ where: { organizationId: currentOrgId(), status: "ERROR" } });

  const risk = (a: (typeof assets)[number]) => a.riskAssessments[0]?.level;
  const attention = assets
    .filter((a) => a.status !== "APPROVED" || ["HIGH", "CRITICAL"].includes(risk(a) ?? ""))
    .slice(0, 5);
  const changes = await db.assetChange.findMany({
    where: { aiAsset: { organizationId: currentOrgId() } },
    include: { aiAsset: true },
    orderBy: { detectedAt: "desc" },
    take: 5,
  });
  const highRisk = assets.filter((a) => ["HIGH", "CRITICAL"].includes(risk(a) ?? ""));
  const providers = new Set(assets.map((a) => a.vendor).filter(Boolean));
  const monthlySpend = assets.reduce((s, a) => s + (a.cost?.monthlyCostEstimate ?? 0), 0);
  const inReview = assets.filter((a) => a.status !== "APPROVED").length;

  const toReview = assets.filter((a) => a.status === "UNKNOWN" || a.status === "UNREVIEWED");
  const noOwner = assets.filter((a) => !a.ownerId && a.status !== "UNAPPROVED");
  const noCost = assets.filter((a) => a.cost?.monthlyCostEstimate == null && a.status !== "UNAPPROVED");
  const savings = assets.reduce((sum, a) => {
    const cur = a.cost?.monthlyCostEstimate;
    const best = Math.min(...a.alternatives.map((x) => x.estimatedMonthlyCost ?? Infinity));
    return cur != null && best < cur ? sum + (cur - best) : sum;
  }, 0);
  const topProvider = Array.from(
    assets.reduce((m, a) => m.set(a.vendor ?? "Unknown", (m.get(a.vendor ?? "Unknown") ?? 0) + (a.cost?.monthlyCostEstimate ?? 0)), new Map<string, number>())
  ).sort((x, y) => y[1] - x[1])[0];

  type Action = { tone: "alarm" | "signal" | "accent" | "steady"; title: string; detail: string; href: string; cta: string };
  const actions: Action[] = [
    ...brokenConnections.map((cn) => ({ tone: "alarm" as const, title: `${cn.provider.replace(/_/g, " ").toLowerCase()} connection needs attention`, detail: cn.lastSyncError?.slice(0, 120) ?? "The last sync failed.", href: `/connectors#${cn.provider}`, cta: "Fix" })),
    ...(toReview.length ? [{ tone: "accent" as const, title: `${toReview.length} AI system${toReview.length === 1 ? "" : "s"} waiting for review`, detail: "Approve or reject, and set owner and cost — one screen each.", href: "/review", cta: "Review" }] : []),
    ...highRisk.slice(0, 3).map((a) => ({ tone: "alarm" as const, title: `${a.name} is at high risk`, detail: ((a.riskAssessments[0]?.reasons as string[] | undefined) ?? [])[0] ?? "See why in its passport.", href: `/assets/${a.id}?tab=risk`, cta: "See why" })),
    ...(noOwner.length ? [{ tone: "signal" as const, title: `${noOwner.length} system${noOwner.length === 1 ? " has" : "s have"} no owner`, detail: "Every AI system needs someone responsible for it.", href: "/review", cta: "Assign" }] : []),
    ...(noCost.length ? [{ tone: "signal" as const, title: `${noCost.length} system${noCost.length === 1 ? " has" : "s have"} no cost`, detail: "Add a monthly cost to see where the money goes.", href: "/assets", cta: "Add costs" }] : []),
    ...(savings > 0 ? [{ tone: "steady" as const, title: `You could save €${savings.toLocaleString()} a month`, detail: "Cheaper alternatives you've recorded, compared with today's costs.", href: "/savings", cta: "See savings" }] : []),
  ].slice(0, 6);

  const riskSlices = (["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const)
    .map((l) => ({ l, n: assets.filter((a) => risk(a) === l).length }))
    .filter((x) => x.n > 0)
    .map(({ l, n }) => ({ label: l.charAt(0) + l.slice(1).toLowerCase(), value: n, color: RISK_CHART_COLORS[l], href: `/assets?risk=${l}` }));

  const statusRows = (["UNKNOWN", "UNREVIEWED", "APPROVED", "UNAPPROVED"] as const).map((s) => ({
    label: STATUS_LABEL[s],
    value: assets.filter((a) => a.status === s).length,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        subtitle={`${org?.name ?? ""} — your AI estate at a glance.`}
        action={
          <div className="flex items-center gap-2">
            {highRisk.length > 0 && (
              <Link href="/assets?risk=HIGH" className="btn btn-secondary">
                <span className="h-2 w-2 rounded-full bg-alarm" />
                {highRisk.length} at high risk
              </Link>
            )}
            <ExportMenu dataset="assets" />
          </div>
        }
      />

      {assets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-12 text-center">
          <h2 className="text-lg font-semibold text-ink-100">Let's find the AI your company uses</h2>
          <p className="text-sm text-ink-400 mt-1">Connect one source — it takes a couple of minutes. angar only reads.</p>
          <Link href="/onboarding" className="btn btn-primary mt-5">Get started</Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Answer label="AI in use" value={String(assets.length)} detail={`${providers.size} provider${providers.size === 1 ? "" : "s"}`} href="/assets" />
            <Answer
              label="Monthly cost"
              value={monthlySpend > 0 ? `€${monthlySpend.toLocaleString()}` : "—"}
              detail={monthlySpend > 0 && topProvider ? `${Math.round((topProvider[1] / monthlySpend) * 100)}% on ${topProvider[0]}` : "Add costs to see this"}
              href="/providers"
            />
            <Answer label="Needs action" value={String(actions.length)} detail={actions.length ? "See the list below" : "Nothing right now"} href="#next" dot={actions.some((a) => a.tone === "alarm") ? "bg-alarm" : actions.length ? "bg-signal" : "bg-steady"} />
          </div>

          <Panel title="What to do next" subtitle="Most important first — one click each">
            <div id="next" className="divide-y divide-line -mx-5 border-t border-line">
              {actions.map((a) => (
                <div key={a.title} className="flex items-center gap-4 px-5 py-3.5">
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${{ alarm: "bg-alarm", signal: "bg-signal", accent: "bg-accent", steady: "bg-steady" }[a.tone]}`} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-ink-100">{a.title}</span>
                    <span className="block text-sm text-ink-400 truncate">{a.detail}</span>
                  </span>
                  <Link href={a.href} className={`btn btn-sm ${a.tone === "accent" ? "btn-primary" : "btn-secondary"}`}>{a.cta}</Link>
                </div>
              ))}
              {actions.length === 0 && <p className="px-5 py-5 text-sm text-ink-400">All clear — every AI system is reviewed, owned and costed.</p>}
            </div>
          </Panel>
        </>
      )}

      {assets.length > 0 && (
        <>
      <div className="grid grid-cols-2 gap-4">
        <Panel title="What is the risk of your AI?" subtitle="AI systems by risk level">
          {riskSlices.length > 0 ? <DonutChart slices={riskSlices} centerLabel="systems" /> : <Empty />}
        </Panel>
        <Panel title="Where are your systems in review?" subtitle="AI systems by review status">
          <BarChart rows={statusRows} />
        </Panel>
      </div>

      <Panel title="AI estate map" subtitle="Which provider powers each system, and which data it touches">
        {assets.length > 0 ? (
          <div className="max-w-4xl mx-auto">
          <EstateGraph
            systems={assets.map((a) => ({
              id: a.id,
              name: a.name,
              vendor: a.vendor,
              risky: ["HIGH", "CRITICAL"].includes(risk(a) ?? ""),
              data: a.dataAccess.map((d) => ({ name: d.dataAsset.name, sensitive: SENSITIVE.includes(d.dataAsset.sensitivity) })),
            }))}
          />
          </div>
        ) : (
          <Empty />
        )}
      </Panel>

        <Panel
          title="Recent changes"
          subtitle="Model, vendor and status changes detected"
          action={<Link href="/changes" className="btn btn-secondary btn-sm">All changes</Link>}
        >
          <div className="divide-y divide-line -mx-5 border-t border-line">
            {changes.map((ch) => (
              <Link key={ch.id} href={`/assets/${ch.aiAssetId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-black/[0.02] transition-colors">
                <VendorBadge vendor={ch.aiAsset.vendor ?? ""} name={ch.aiAsset.name} size={28} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-ink-100 truncate">{ch.aiAsset.name}</span>
                  <span className="block text-xs text-ink-400 truncate">
                    {ch.field}: {ch.oldValue ?? "—"} → <span className="text-ink-100">{ch.newValue ?? "—"}</span>
                  </span>
                </span>
                <span className="text-xs text-ink-400 shrink-0">{fmtDate(ch.detectedAt)}</span>
              </Link>
            ))}
            {changes.length === 0 && <p className="px-5 py-4 text-sm text-ink-400">No changes detected yet.</p>}
          </div>
        </Panel>
        </>
      )}
    </div>
  );
}

function Answer({ label, value, detail, href, dot }: { label: string; value: string; detail: string; href: string; dot?: string }) {
  return (
    <Link href={href} className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-3 hover:border-ink-400 transition-colors">
      <span className="text-sm text-ink-400 flex items-center gap-2">
        {dot && <span className={`h-2 w-2 rounded-full ${dot}`} />}
        {label}
      </span>
      <span className="font-display text-[34px] leading-none font-semibold tracking-tight text-ink-100 tabular">{value}</span>
      <span className="text-sm text-ink-400">{detail}</span>
    </Link>
  );
}

function Empty() {
  return <p className="text-sm text-ink-400">No data yet — connect a provider to populate this.</p>;
}
