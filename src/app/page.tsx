import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import Link from "next/link";
import VendorIcon, { VendorBadge } from "@/components/VendorIcon";
import DonutChart from "@/components/DonutChart";
import BarChart from "@/components/BarChart";
import EstateGraph from "@/components/EstateGraph";
import { StatCard, Panel, PageHeader } from "@/components/ui";
import { RISK_CHART_COLORS } from "@/lib/chart-colors";

export const dynamic = "force-dynamic";

const ORG_ID = "demo-org";
const SENSITIVE = ["PII", "FINANCIAL", "SOURCE_CODE"];
const STATUS_LABEL: Record<string, string> = { APPROVED: "Approved", UNREVIEWED: "In review", UNAPPROVED: "Rejected", UNKNOWN: "Not started" };

export default async function OverviewPage() {
  const org = await db.organization.findUnique({ where: { id: ORG_ID } });
  const assets = await db.aiAsset.findMany({
    where: { organizationId: ORG_ID, deletedAt: null },
    include: {
      owner: true,
      cost: true,
      riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 },
      dataAccess: { include: { dataAsset: true } },
    },
    orderBy: { lastSeenAt: "desc" },
  });

  const risk = (a: (typeof assets)[number]) => a.riskAssessments[0]?.level;
  const highRisk = assets.filter((a) => ["HIGH", "CRITICAL"].includes(risk(a) ?? ""));
  const providers = new Set(assets.map((a) => a.vendor).filter(Boolean));
  const monthlySpend = assets.reduce((s, a) => s + (a.cost?.monthlyCostEstimate ?? 0), 0);
  const inReview = assets.filter((a) => a.status !== "APPROVED").length;

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
      {!org?.onboardingCompletedAt && (
        <div className="rounded-xl bg-accent-soft px-4 py-3 flex items-center gap-3">
          <span className="text-xs font-medium text-white bg-accent rounded-full px-2.5 py-0.5 shrink-0">Setup</span>
          <p className="text-sm text-ink-100">
            Connect your first provider to discover your AI automatically.{" "}
            <Link href="/connectors" className="font-medium text-accent-dark underline">Go to Connections</Link>
          </p>
        </div>
      )}

      <PageHeader
        title="Overview"
        subtitle={`${org?.name ?? ""} — your AI estate at a glance.`}
        action={
          highRisk.length > 0 ? (
            <Link href="/assets?risk=HIGH" className="text-xs font-medium text-alarm bg-alarm/10 rounded-full px-3 py-1.5 hover:bg-alarm/15 transition-colors">
              {highRisk.length} at high risk →
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="AI systems" value={String(assets.length)} href="/assets" tone="accent" />
        <StatCard label="Providers" value={String(providers.size)} href="/providers" />
        <StatCard label="Monthly spend" value={monthlySpend > 0 ? `€${monthlySpend.toLocaleString()}` : "—"} href="/savings" />
        <StatCard label="Need review" value={String(inReview)} href="/governance?tab=reviews" tone={inReview > 0 ? "signal" : undefined} />
      </div>

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

      <div className="rounded-xl border border-line bg-panel overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-100">AI systems</h2>
          <Link href="/assets" className="btn btn-secondary btn-sm">
            View all
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-400 bg-ink border-b border-line">
              <th className="px-5 py-2.5 font-medium">System</th>
              <th className="px-5 py-2.5 font-medium">Provider</th>
              <th className="px-5 py-2.5 font-medium">Owner</th>
              <th className="px-5 py-2.5 font-medium">Cost / mo</th>
              <th className="px-5 py-2.5 font-medium">Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {assets.slice(0, 8).map((a) => (
              <tr key={a.id}>
                <td className="px-5 py-3">
                  <Link href={`/assets/${a.id}`} className="flex items-center gap-3 font-medium text-ink-100 hover:underline">
                    <VendorBadge vendor={a.vendor ?? ""} name={a.name} size={28} />
                    {a.name}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <span className="flex items-center gap-2 text-ink-400">
                    <VendorIcon vendor={a.vendor ?? ""} size={16} />
                    {a.vendor ?? "Unknown"}
                  </span>
                </td>
                <td className="px-5 py-3 text-ink-400">{a.owner?.name ?? "—"}</td>
                <td className="px-5 py-3 text-ink-100 tabular">{a.cost?.monthlyCostEstimate != null ? `€${a.cost.monthlyCostEstimate.toLocaleString()}` : "—"}</td>
                <td className="px-5 py-3">{risk(a) ? <Badge>{risk(a)!}</Badge> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-ink-400">No data yet — connect a provider to populate this.</p>;
}
