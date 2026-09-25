import { fmtDate } from "@/lib/format";
import { db } from "@/lib/db";
import Badge from "@/components/Badge";
import DonutChart from "@/components/DonutChart";
import BarChart from "@/components/BarChart";
import EstateGraph from "@/components/EstateGraph";
import { StatCard, Panel, Table } from "@/components/ui";
import { VendorBadge } from "@/components/VendorIcon";
import { RISK_CHART_COLORS } from "@/lib/chart-colors";

export const dynamic = "force-dynamic";
const SENSITIVE = ["PII", "FINANCIAL", "SOURCE_CODE"];
const STATUS_LABEL: Record<string, string> = { APPROVED: "Approved", UNREVIEWED: "In review", UNAPPROVED: "Rejected", UNKNOWN: "Not started" };

// Dashboard condivisa: pubblica, sola lettura, nessun link verso l'app.
export default async function SharedDashboardPage({ params }: { params: { token: string } }) {
  const link = await db.shareLink.findUnique({ where: { token: params.token }, include: { organization: true } });
  const dead = !link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date());
  if (dead) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="font-brand text-xl text-ink-100 mb-2">angar</div>
          <h1 className="text-lg font-semibold text-ink-100">This link is no longer available</h1>
          <p className="text-sm text-ink-400 mt-1">It was revoked or has expired. Ask the person who shared it for a new one.</p>
        </div>
      </div>
    );
  }
  await db.shareLink.update({ where: { id: link.id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } });

  const assets = await db.aiAsset.findMany({
    where: { organizationId: link.organizationId, deletedAt: null },
    include: { cost: true, riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 }, dataAccess: { include: { dataAsset: true } } },
    orderBy: { name: "asc" },
  });
  const risk = (a: (typeof assets)[number]) => a.riskAssessments[0]?.level;
  const spend = assets.reduce((s, a) => s + (a.cost?.monthlyCostEstimate ?? 0), 0);
  const providers = new Set(assets.map((a) => a.vendor).filter(Boolean)).size;
  const highRisk = assets.filter((a) => ["HIGH", "CRITICAL"].includes(risk(a) ?? "")).length;
  const riskSlices = (["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const)
    .map((l) => ({ l, n: assets.filter((a) => risk(a) === l).length }))
    .filter((x) => x.n > 0)
    .map(({ l, n }) => ({ label: l.charAt(0) + l.slice(1).toLowerCase(), value: n, color: RISK_CHART_COLORS[l] }));
  const statusRows = (["UNKNOWN", "UNREVIEWED", "APPROVED", "UNAPPROVED"] as const).map((s) => ({ label: STATUS_LABEL[s], value: assets.filter((a) => a.status === s).length }));

  return (
    <div className="flex flex-col gap-6 px-10 py-8 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs text-ink-400 mb-1">
            Shared by {link.organization.name} · read-only · {fmtDate(new Date())}
          </div>
          <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-ink-100">{link.name}</h1>
        </div>
        <span className="font-brand text-lg text-ink-100">angar</span>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="AI systems" value={String(assets.length)} />
        <StatCard label="Providers" value={String(providers)} />
        <StatCard label="Monthly spend" value={spend > 0 ? `€${spend.toLocaleString()}` : "—"} />
        <StatCard label="High risk" value={String(highRisk)} tone={highRisk > 0 ? "alarm" : undefined} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Panel title="Risk" subtitle="AI systems by risk level">
          {riskSlices.length ? <DonutChart slices={riskSlices} centerLabel="systems" /> : <p className="text-sm text-ink-400">No data.</p>}
        </Panel>
        <Panel title="Review status" subtitle="AI systems by review status">
          <BarChart rows={statusRows} />
        </Panel>
      </div>

      <Panel title="AI estate map" subtitle="Which provider powers each system, and which data it touches">
        <div className="max-w-4xl mx-auto">
          <EstateGraph
            linkNodes={false}
            systems={assets.map((a) => ({
              id: a.id,
              name: a.name,
              vendor: a.vendor,
              risky: ["HIGH", "CRITICAL"].includes(risk(a) ?? ""),
              data: a.dataAccess.map((d) => ({ name: d.dataAsset.name, sensitive: SENSITIVE.includes(d.dataAsset.sensitivity) })),
            }))}
          />
        </div>
      </Panel>

      <Table columns={["System", "Provider", "Status", "Risk", "Cost / mo"]}>
            {assets.map((a) => (
              <tr key={a.id}>
                <td className="px-5 py-3">
                  <span className="flex items-center gap-3 font-medium text-ink-100">
                    <VendorBadge vendor={a.vendor ?? ""} name={a.name} size={28} />
                    {a.name}
                  </span>
                </td>
                <td className="px-5 py-3 text-ink-400">{a.vendor ?? "Unknown"}</td>
                <td className="px-5 py-3"><Badge>{a.status}</Badge></td>
                <td className="px-5 py-3">{risk(a) ? <Badge>{risk(a)!}</Badge> : "—"}</td>
                <td className="px-5 py-3 tabular text-ink-100">{a.cost?.monthlyCostEstimate != null ? `€${a.cost.monthlyCostEstimate.toLocaleString()}` : "—"}</td>
              </tr>
            ))}
          </Table>
      <p className="text-xs text-ink-400 text-center">Read-only snapshot shared from angar. Data is live at the moment you open the link.</p>
    </div>
  );
}
