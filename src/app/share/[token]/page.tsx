import { Wordmark } from "@/components/Logo";
import { fmtEur } from "@/lib/format";
import { fmtDate } from "@/lib/format";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import Badge from "@/components/Badge";
import DonutChart from "@/components/DonutChart";
import BarChart from "@/components/BarChart";
import EstateGraph from "@/components/EstateGraph";
import { StatCard, Panel, Table } from "@/components/ui";
import { VendorBadge } from "@/components/VendorIcon";
import { RISK_CHART_COLORS } from "@/lib/chart-colors";
import { monthlyOf } from "@/lib/savings";

export const dynamic = "force-dynamic";
const SENSITIVE = ["PII", "FINANCIAL", "SOURCE_CODE"];
const STATUS_LABEL: Record<string, string> = { APPROVED: "Approved", UNREVIEWED: "Needs review", UNAPPROVED: "Not allowed", UNKNOWN: "Needs review" };

// Dashboard condivisa: pubblica, sola lettura, nessun link verso l'app.
export default async function SharedDashboardPage({ params }: { params: { token: string } }) {
  const link = await db.shareLink.findUnique({ where: { token: params.token }, include: { organization: true } });
  const dead = !link || link.revokedAt || (link.expiresAt && link.expiresAt < new Date());
  if (dead) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="text-ink-100 mb-2"><Wordmark size={20} /></div>
          <h1 className="text-lg font-semibold text-ink-100">This link is no longer available</h1>
          <p className="text-sm text-ink-400 mt-1">It was revoked or has expired. Ask the person who shared it for a new one.</p>
        </div>
      </div>
    );
  }
  await db.shareLink.update({ where: { id: link.id }, data: { viewCount: { increment: 1 }, lastViewedAt: new Date() } });

  const assets = await db.aiAsset.findMany({
    where: { organizationId: link.organizationId, deletedAt: null },
    include: { cost: true, usages: { select: { id: true } }, riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 }, dataAccess: { include: { dataAsset: true } } },
    orderBy: { name: "asc" },
  });
  const risk = (a: (typeof assets)[number]) => a.riskAssessments[0]?.level;
  // Stesso calcolo della dashboard: costo reale, altrimenti stima utenti × listino.
  const monthly = (a: (typeof assets)[number]) => monthlyOf(a)?.eur ?? null;
  const spend = assets.reduce((s, a) => s + (monthly(a) ?? 0), 0);
  const providers = new Set(assets.map((a) => a.vendor).filter(Boolean)).size;
  const highRisk = assets.filter((a) => ["HIGH", "CRITICAL"].includes(risk(a) ?? "")).length;
  const riskSlices = (["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const)
    .map((l) => ({ l, n: assets.filter((a) => risk(a) === l).length }))
    .filter((x) => x.n > 0)
    .map(({ l, n }) => ({ label: l.charAt(0) + l.slice(1).toLowerCase(), value: n, color: RISK_CHART_COLORS[l] }));
  // UNKNOWN e UNREVIEWED sono entrambi "Needs review": una sola barra.
  const statusRows = [
    { label: STATUS_LABEL.UNKNOWN, value: assets.filter((a) => a.status === "UNKNOWN" || a.status === "UNREVIEWED").length },
    { label: STATUS_LABEL.APPROVED, value: assets.filter((a) => a.status === "APPROVED").length },
    { label: STATUS_LABEL.UNAPPROVED, value: assets.filter((a) => a.status === "UNAPPROVED").length },
  ];

  // Dentro l'app (utente loggato) il layout dà già padding e ha i due pulsanti fissi in alto a destra.
  const inApp = Boolean(currentSession());

  return (
    <div className={`flex flex-col gap-4 ${inApp ? "" : "px-4 sm:px-10 py-8 max-w-[1400px] mx-auto"}`}>
      <div className={`flex items-end justify-between gap-4 ${inApp ? "lg:pr-[8.25rem]" : ""}`}>
        <div className="min-w-0">
          <div className="text-xs text-ink-400 mb-1">
            Shared by {link.organization.name} · read-only · {fmtDate(new Date())}
          </div>
          <h1 className="font-display text-[28px] leading-tight font-semibold tracking-tight text-ink-100 break-words">{link.name}</h1>
        </div>
        <span className="text-ink-100 shrink-0"><Wordmark size={18} /></span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="AI systems" value={String(assets.length)} />
        <StatCard label="Providers" value={String(providers)} />
        <StatCard label="Monthly spend" value={spend > 0 ? fmtEur(spend) : "—"} />
        <StatCard label="High risk" value={String(highRisk)} tone={highRisk > 0 ? "alarm" : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                <td className="px-5 py-3 tabular text-ink-100">{monthly(a) != null ? fmtEur(monthly(a)!) : "—"}</td>
              </tr>
            ))}
          </Table>
      <p className="text-xs text-ink-400 text-center">Read-only view shared from angar — data is live.</p>
    </div>
  );
}
