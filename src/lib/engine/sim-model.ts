/**
 * Modello serializzabile del simulatore: i numeri reali di oggi, senza nomi
 * di persone (solo indici anonimi) e con i reparti solo se la privacy lo
 * consente (almeno MIN_GROUP persone per reparto).
 */
import { db } from "@/lib/db";
import { loadAssets, monthlyOf, serviceOf, categoryOf } from "@/lib/savings";
import { SEAT_WINDOW_DAYS } from "@/lib/seats";
import { computeScoreCached } from "@/lib/engine/score";
import { listSeatEur } from "@/lib/engine/price-index";
import { PLANS, CATEGORY_LABEL, type Category } from "@/lib/pricing/catalog";
import { orgPrivacyMode, showsDepartments, MIN_GROUP } from "@/lib/privacy";
import type { SimAsset, SimModel, SimStatus } from "@/lib/engine/simulate";

const DAY = 86400000;
/** Categorie in cui ha senso "tenerne una sola". */
const STANDARDISE: Category[] = ["assistant", "coding"];

export async function loadSimModel(orgId: string, now = Date.now()): Promise<SimModel> {
  const cutoff = now - SEAT_WINDOW_DAYS * DAY;
  const [assets, score, mode] = await Promise.all([loadAssets(orgId, { includeRejected: true }), computeScoreCached(orgId), orgPrivacyMode(orgId)]);
  const ids = assets.map((a) => a.id);
  const [usages, recentActivity] = await Promise.all([
    db.aiAssetUsage.findMany({ where: { aiAssetId: { in: ids } }, select: { id: true, aiAssetId: true, userId: true, externalUserRef: true, lastSeenAt: true, user: { select: { department: true } } } }),
    // AI non consentite: "in uso" come in score.ts (ultimo accesso, persone o attività recenti).
    db.aiAssetActivity.groupBy({ by: ["aiAssetId"], where: { aiAssetId: { in: assets.filter((a) => a.status === "UNAPPROVED").map((a) => a.id) }, occurredAt: { gte: new Date(cutoff) } }, _count: { _all: true } }),
  ]);

  // Persona = utente noto, altrimenti riferimento esterno (stessa chiave di score.ts).
  const index = new Map<string, number>();
  const deptOf: (string | null)[] = [];
  const idx = (key: string, dept: string | null) => {
    let i = index.get(key);
    if (i == null) {
      i = index.size;
      index.set(key, i);
      deptOf.push(dept);
    } else if (!deptOf[i] && dept) deptOf[i] = dept;
    return i;
  };
  const byAsset = new Map<string, { active: number[]; known: number[] }>();
  for (const u of usages) {
    const i = idx(u.userId ?? u.externalUserRef ?? u.id, u.user?.department?.trim() || null);
    const r = byAsset.get(u.aiAssetId) ?? { active: [], known: [] };
    r.known.push(i);
    if (u.lastSeenAt && u.lastSeenAt.getTime() >= cutoff) r.active.push(i);
    byAsset.set(u.aiAssetId, r);
  }

  // Reparti mostrabili: solo con la privacy per reparto o per persona, e con almeno MIN_GROUP persone.
  const departments: string[] = [];
  const personDept: (number | null)[] = deptOf.map(() => null);
  if (showsDepartments(mode)) {
    const size = new Map<string, { label: string; n: number }>();
    for (const d of deptOf) if (d) size.set(d.toLowerCase(), { label: size.get(d.toLowerCase())?.label ?? d, n: (size.get(d.toLowerCase())?.n ?? 0) + 1 });
    const ok = [...size.entries()].filter(([, v]) => v.n >= MIN_GROUP).sort((a, b) => b[1].n - a[1].n || a[1].label.localeCompare(b[1].label));
    const pos = new Map(ok.map(([k, v], i) => (departments.push(v.label), [k, i] as const)));
    deptOf.forEach((d, i) => {
      personDept[i] = d ? pos.get(d.toLowerCase()) ?? null : null;
    });
  }

  const inUseIds = new Set(recentActivity.map((r) => r.aiAssetId));
  const simAssets: SimAsset[] = assets.map((a) => {
    const m = monthlyOf(a);
    const seats = a.cost?.seats && a.cost.seats > 0 ? a.cost.seats : null;
    const svc = serviceOf(a);
    const plan = a.cost?.planId ? PLANS.find((p) => p.id === a.cost!.planId) ?? null : null;
    const list = svc ? listSeatEur(svc, a.cost?.planId, Boolean(a.cost?.annualBilling))?.eur ?? null : null;
    const seatEur = m && m.eur > 0 && seats ? m.eur / seats : list;
    const u = byAsset.get(a.id) ?? { active: [], known: [] };
    const recent = (d: Date | null | undefined) => !!d && d.getTime() >= cutoff;
    return {
      id: a.id,
      name: a.name,
      vendor: a.vendor,
      category: categoryOf(a),
      status: a.status as SimStatus,
      monthlyEur: m?.eur ?? 0,
      seats,
      seatEur: seatEur != null ? Math.round(seatEur * 100) / 100 : null,
      active: u.active,
      known: u.known,
      yearlyRatio: !a.cost?.annualBilling && plan?.annualMonthlyUsd && plan.annualMonthlyUsd < plan.monthlyUsd ? plan.annualMonthlyUsd / plan.monthlyUsd : null,
      inUse: a.status === "UNAPPROVED" && (recent(a.lastSeenAt) || u.active.length > 0 || inUseIds.has(a.id)),
    };
  });

  const categories = STANDARDISE.map((c) => ({
    key: c,
    label: CATEGORY_LABEL[c],
    assetIds: simAssets
      .filter((a) => a.category === c && a.status !== "UNAPPROVED" && (a.monthlyEur > 0 || a.active.length > 0))
      .sort((x, y) => y.active.length - x.active.length || y.monthlyEur - x.monthlyEur)
      .map((a) => a.id),
  })).filter((c) => c.assetIds.length >= 2);

  return {
    assets: simAssets,
    personDept,
    departments,
    categories,
    // Fatti dell'Angar Score (solo numeri e nomi delle AI): il simulatore ricalcola con la stessa funzione.
    score: { score: score.score, axes: score.axes, facts: score.facts },
  };
}
