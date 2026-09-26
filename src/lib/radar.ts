/**
 * Radar: cosa è cambiato da solo, senza che nessuno lo segnalasse —
 * nuove AI, aumenti di spesa, nuovi posti, modelli cambiati.
 */
import { db } from "@/lib/db";
import { fmtEur } from "@/lib/format";

export interface RadarEvent {
  kind: "new_ai" | "spend_up" | "model_change" | "new_charge";
  title: string;
  detail: string;
  at: Date;
  href: string;
  tone: "alarm" | "signal" | "steady";
}

const DAY = 86400000;
const monthKey = (d: Date) => d.toISOString().slice(0, 7);

export async function radar(organizationId: string, days = 45): Promise<RadarEvent[]> {
  const since = new Date(Date.now() - days * DAY);
  const [newAssets, changes, records] = await Promise.all([
    db.aiAsset.findMany({ where: { organizationId, deletedAt: null, firstSeenAt: { gte: since } }, orderBy: { firstSeenAt: "desc" }, take: 10 }),
    db.assetChange.findMany({ where: { aiAsset: { organizationId }, detectedAt: { gte: since }, field: { in: ["model", "vendor"] } }, include: { aiAsset: true }, orderBy: { detectedAt: "desc" }, take: 10 }),
    db.spendRecord.findMany({ where: { organizationId, date: { gte: new Date(Date.now() - 120 * DAY) } }, include: { aiAsset: { select: { id: true, name: true } } } }),
  ]);
  const out: RadarEvent[] = [];

  for (const a of newAssets) {
    out.push({
      kind: "new_ai",
      title: `New AI: ${a.name}`,
      detail: a.status === "UNKNOWN" || a.status === "UNREVIEWED" ? "Found automatically — decide if it's allowed." : "Added to your AI list.",
      at: a.firstSeenAt,
      href: `/assets/${a.id}`,
      tone: a.status === "UNKNOWN" || a.status === "UNREVIEWED" ? "signal" : "steady",
    });
  }
  for (const c of changes) {
    out.push({ kind: "model_change", title: `${c.aiAsset.name} changed ${c.field}`, detail: `${c.oldValue ?? "—"} → ${c.newValue ?? "—"}. Check that quality and cost are still right.`, at: c.detectedAt, href: `/assets/${c.aiAssetId}`, tone: "signal" });
  }

  // Spesa per AI: ultimo mese con addebiti rispetto al precedente.
  const byAsset = new Map<string, { name: string; months: Map<string, number>; last: Date }>();
  for (const r of records) {
    if (!r.aiAsset) continue;
    const e = byAsset.get(r.aiAsset.id) ?? { name: r.aiAsset.name, months: new Map(), last: r.date };
    e.months.set(monthKey(r.date), (e.months.get(monthKey(r.date)) ?? 0) + r.amountEur);
    if (r.date > e.last) e.last = r.date;
    byAsset.set(r.aiAsset.id, e);
  }
  for (const [id, e] of byAsset) {
    const keys = [...e.months.keys()].sort();
    if (keys.length < 2) continue;
    const cur = e.months.get(keys[keys.length - 1])!;
    const prev = e.months.get(keys[keys.length - 2])!;
    if (prev > 0 && cur > prev * 1.2 && cur - prev >= 10) {
      out.push({
        kind: "spend_up",
        title: `${e.name} costs ${Math.round((cur / prev - 1) * 100)}% more`,
        detail: `${fmtEur(prev)} → ${fmtEur(cur)} a month. New seats, a plan change or more API usage.`,
        at: e.last,
        href: `/assets/${id}`,
        tone: "alarm",
      });
    }
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 8);
}
