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
import SetupCard from "@/components/SetupCard";
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
    },
    orderBy: { lastSeenAt: "desc" },
  });

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
      {!org?.onboardingCompletedAt && <SetupCard orgId={currentOrgId()} />}

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

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="AI systems" value={String(assets.length)} href="/assets" />
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

      <div className="grid grid-cols-2 gap-4">
        <Panel
          title="Needs attention"
          subtitle="Not approved yet, or at high risk"
          action={<Link href="/governance?tab=reviews" className="btn btn-secondary btn-sm">Review</Link>}
        >
          <div className="divide-y divide-line -mx-5 border-t border-line">
            {attention.map((a) => (
              <Link key={a.id} href={`/assets/${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-black/[0.02] transition-colors">
                <VendorBadge vendor={a.vendor ?? ""} name={a.name} size={28} />
                <span className="flex-1 min-w-0 text-sm font-medium text-ink-100 truncate">{a.name}</span>
                {risk(a) && <Badge>{risk(a)!}</Badge>}
                <Badge>{a.status}</Badge>
              </Link>
            ))}
            {attention.length === 0 && <p className="px-5 py-4 text-sm text-ink-400">Nothing needs attention.</p>}
          </div>
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
      </div>
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-ink-400">No data yet — connect a provider to populate this.</p>;
}
