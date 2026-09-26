import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { computeSavings } from "@/lib/savings";

export const dynamic = "force-dynamic";

type Row = Record<string, string | number | null | undefined>;
type Sheet = { name: string; rows: Row[] };

const eur = (n?: number | null) => (n == null ? null : Math.round(n * 100) / 100);
const day = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const label = (s?: string | null) => (s ? s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (m) => m.toUpperCase()) : null);

async function build(dataset: string, orgId: string): Promise<{ title: string; sheets: Sheet[] } | null> {
  if (dataset === "assets") {
    const assets = await db.aiAsset.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: { owner: true, cost: true, riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 }, assuranceReports: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { name: "asc" },
    });
    return {
      title: "AI Passports",
      sheets: [{
        name: "AI systems",
        rows: assets.map((a) => ({
          System: a.name, Vendor: a.vendor, Type: label(a.type), Model: a.model, Owner: a.owner?.name ?? a.owner?.email, Department: a.department,
          Status: label(a.status), Risk: label(a.riskAssessments[0]?.level), "Assurance %": a.assuranceReports[0]?.score,
          "Cost €/month": eur(a.cost?.monthlyCostEstimate), "First seen": day(a.firstSeenAt), "Last seen": day(a.lastSeenAt),
        })),
      }],
    };
  }
  if (dataset === "providers") {
    const assets = await db.aiAsset.findMany({ where: { organizationId: orgId, deletedAt: null }, include: { cost: true, riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } } });
    const by = new Map<string, typeof assets>();
    assets.forEach((a) => by.set(a.vendor ?? "Unknown", [...(by.get(a.vendor ?? "Unknown") ?? []), a]));
    return {
      title: "Providers",
      sheets: [{
        name: "Providers",
        rows: Array.from(by.entries()).map(([vendor, list]) => ({
          Provider: vendor, "AI systems": list.length,
          "High/critical risk": list.filter((a) => ["HIGH", "CRITICAL"].includes(a.riskAssessments[0]?.level ?? "")).length,
          "Cost €/month": eur(list.reduce((s, a) => s + (a.cost?.monthlyCostEstimate ?? 0), 0)),
          Systems: list.map((a) => a.name).join(", "),
        })),
      }],
    };
  }
  if (dataset === "savings") {
    const { items } = await computeSavings(orgId);
    const rows: Row[] = items.map((i) => ({
      Suggestion: i.title, "AI systems": i.assets.map((a) => a.name).join(", "), "Saving €/month": eur(i.monthlyEur), "Saving €/year": eur(i.monthlyEur * 12),
      Confidence: label(i.confidence), Why: i.detail,
    }));
    const spend = await db.spendRecord.findMany({ where: { organizationId: orgId }, orderBy: { date: "desc" } });
    return {
      title: "Savings",
      sheets: [
        { name: "Savings", rows },
        { name: "AI charges", rows: spend.map((r) => ({ Date: day(r.date), Service: r.service, "Amount €": eur(r.amountEur), Source: label(r.source), Description: r.description })) },
      ],
    };
  }
  if (dataset === "changes") {
    const changes = await db.assetChange.findMany({ where: { aiAsset: { organizationId: orgId } }, include: { aiAsset: true }, orderBy: { detectedAt: "desc" } });
    return {
      title: "Changes",
      sheets: [{ name: "Changes", rows: changes.map((c) => ({ Detected: c.detectedAt.toISOString().replace("T", " ").slice(0, 16), System: c.aiAsset.name, Field: label(c.field), Before: c.oldValue, After: c.newValue })) }],
    };
  }
  if (dataset === "people") {
    const users = await db.user.findMany({ where: { organizationId: orgId }, include: { ownedAssets: true }, orderBy: { name: "asc" } });
    return { title: "People", sheets: [{ name: "People", rows: users.map((u) => ({ Name: u.name, Email: u.email, Department: u.department, "AI systems owned": u.ownedAssets.length, Systems: u.ownedAssets.map((a) => a.name).join(", ") })) }] };
  }
  if (dataset === "activity") {
    const acts = await db.aiAssetActivity.findMany({ where: { aiAsset: { organizationId: orgId } }, include: { aiAsset: true }, orderBy: { occurredAt: "desc" }, take: 5000 });
    return { title: "Activity", sheets: [{ name: "Events", rows: acts.map((a) => ({ When: a.occurredAt.toISOString().replace("T", " ").slice(0, 16), System: a.aiAsset.name, Event: a.eventType, Actor: a.actorRef, Source: label(a.source) })) }] };
  }
  if (dataset.startsWith("passport-")) {
    const a = await db.aiAsset.findFirst({
      where: { id: dataset.slice("passport-".length), organizationId: orgId },
      include: {
        owner: true, cost: true, alternatives: true, connectedSystems: true, dataAccess: { include: { dataAsset: true } },
        riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 }, assuranceReports: { orderBy: { createdAt: "desc" }, take: 1 },
        activities: { orderBy: { occurredAt: "desc" }, take: 200 }, changes: { orderBy: { detectedAt: "desc" } },
      },
    });
    if (!a) return null;
    const risk = a.riskAssessments[0];
    const assurance = a.assuranceReports[0];
    const checks = (assurance?.checks as unknown as { label: string; status: string; detail: string }[] | undefined) ?? [];
    return {
      title: `Passport — ${a.name}`,
      sheets: [
        { name: "Passport", rows: [
          ["Name", a.name], ["Vendor", a.vendor], ["Type", label(a.type)], ["Model", a.model], ["Owner", a.owner?.name ?? a.owner?.email], ["Department", a.department],
          ["Status", label(a.status)], ["EU AI Act", label(a.euAiActTier)], ["Risk", `${label(risk?.level) ?? "—"} (${risk?.score ?? "—"}/100)`],
          ["Assurance", `${label(assurance?.level) ?? "—"} (${assurance?.score ?? "—"}%)`], ["Cost €/month", eur(a.cost?.monthlyCostEstimate)],
          ["Annualized €", eur(a.cost?.monthlyCostEstimate != null ? a.cost.monthlyCostEstimate * 12 : null)], ["First seen", day(a.firstSeenAt)], ["Last seen", day(a.lastSeenAt)],
        ].map(([Field, Value]) => ({ Field: Field as string, Value: Value as string })) },
        { name: "Dependencies", rows: [
          ...a.connectedSystems.map((s) => ({ Kind: "System", Name: s.system, Detail: s.detail })),
          ...a.dataAccess.map((d) => ({ Kind: "Data", Name: d.dataAsset.name, Detail: label(d.dataAsset.sensitivity) })),
        ] },
        { name: "Risk & assurance", rows: [...((risk?.reasons as string[] | undefined) ?? []).map((r) => ({ Kind: "Risk factor", Item: r, Result: null })), ...checks.map((c) => ({ Kind: "Control", Item: c.label, Result: `${label(c.status)} — ${c.detail}` }))] },
        { name: "Alternatives", rows: a.alternatives.map((x) => ({ Provider: x.provider, Model: x.model, "€/month": eur(x.estimatedMonthlyCost), "Migration days": x.migrationEffortDays, Quality: label(x.qualityConfidence), Notes: x.reasoning })) },
        { name: "Changes", rows: a.changes.map((c) => ({ Detected: day(c.detectedAt), Field: label(c.field), Before: c.oldValue, After: c.newValue })) },
        { name: "Activity", rows: a.activities.map((x) => ({ When: x.occurredAt.toISOString().replace("T", " ").slice(0, 16), Event: x.eventType, Actor: x.actorRef, Source: label(x.source) })) },
      ],
    };
  }
  return null;
}

export async function GET(_req: Request, { params }: { params: { dataset: string } }) {
  const orgId = currentOrgId();
  const [org, data] = await Promise.all([db.organization.findUnique({ where: { id: orgId } }), build(params.dataset, orgId)]);
  if (!data) return new Response("Unknown export", { status: 404 });

  const wb = new ExcelJS.Workbook();
  wb.creator = "angar";
  wb.created = new Date();
  for (const sheet of data.sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 31));
    const headers = sheet.rows.length ? Object.keys(sheet.rows[0]) : ["No data"];
    ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.min(48, Math.max(12, h.length + 2, ...sheet.rows.map((r) => String(r[h] ?? "").length + 2))) }));
    sheet.rows.forEach((r) => ws.addRow(r));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FF141418" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F6F8" } };
    head.border = { bottom: { style: "thin", color: { argb: "FFE6E6EB" } } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    if (sheet.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    headers.forEach((h, i) => { if (/€/.test(h)) ws.getColumn(i + 1).numFmt = '#,##0.00 "€"'; });
  }
  const buffer = await wb.xlsx.writeBuffer();
  const slug = `${(org?.name ?? "angar").replace(/[^a-z0-9]+/gi, "-")}-${data.title.replace(/[^a-z0-9]+/gi, "-")}-${new Date().toISOString().slice(0, 10)}`.toLowerCase();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${slug}.xlsx"`,
    },
  });
}
