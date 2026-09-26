/**
 * Motore dei risparmi: regole deterministiche e spiegabili sui dati reali
 * (addebiti, posti, utenti attivi, modello usato). Nessun LLM, nessun numero
 * inventato: ogni suggerimento dice da dove viene e quanto è sicuro.
 */
import { db } from "@/lib/db";
import { AI_SERVICES } from "@/lib/discovery/catalog";
import { matchMerchant } from "@/lib/pricing/merchants";
import { PLANS, SERVICE_CATEGORY, CATEGORY_LABEL, categoryPlural, USD_TO_EUR, apiModelFor, cheaperModel, blended, estimateMonthlyEur, type Category } from "@/lib/pricing/catalog";

export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export interface Saving {
  key: string;
  kind: "annual" | "duplicate" | "seats" | "premium" | "model" | "idle" | "alternative";
  title: string;
  detail: string;
  monthlyEur: number;
  confidence: Confidence;
  assets: { id: string; name: string; vendor: string | null; serviceId: string | null }[];
  href: string;
}

const DAY = 86400000;
const round = (n: number) => Math.round(n);

export type AssetForSavings = Awaited<ReturnType<typeof loadAssets>>[number];

export async function loadAssets(organizationId: string, opts: { includeRejected?: boolean } = {}) {
  return db.aiAsset.findMany({
    where: { organizationId, deletedAt: null, ...(opts.includeRejected ? {} : { status: { not: "UNAPPROVED" as const } }) },
    include: {
      cost: true,
      alternatives: true,
      usages: { select: { lastSeenAt: true } },
      activities: { where: { eventType: "discovery.seen" }, orderBy: { occurredAt: "desc" }, take: 1, select: { occurredAt: true } },
      connector: { select: { provider: true, credentialsEncrypted: true } },
    },
    orderBy: { name: "asc" },
  });
}

/** Servizio del catalogo: dal campo salvato, altrimenti dal nome. */
export function serviceOf(a: { serviceId: string | null; name: string; vendor: string | null }) {
  if (a.serviceId) return a.serviceId;
  const byName = AI_SERVICES.find((s) => s.name.toLowerCase() === a.name.toLowerCase());
  return byName?.id ?? matchMerchant(`${a.name} ${a.vendor ?? ""}`);
}

export const categoryOf = (a: { serviceId: string | null; name: string; vendor: string | null; type?: string }): Category | null => {
  const s = serviceOf(a);
  return (s && SERVICE_CATEGORY[s]) || (a.type === "AI_API" ? "api" : a.type === "AI_DEV_TOOL" ? "coding" : null);
};

/** Costo mensile: reale se c'è, altrimenti stima da utenti × listino. */
export function monthlyOf(a: AssetForSavings): { eur: number; estimated: boolean } | null {
  if (a.cost?.monthlyCostEstimate != null) return { eur: a.cost.monthlyCostEstimate, estimated: a.cost.basis === "estimate" };
  const s = serviceOf(a);
  const users = a.usages.length;
  if (s && users > 0) {
    const e = estimateMonthlyEur(s, users);
    if (e) return { eur: e.eur, estimated: true };
  }
  return null;
}

export async function computeSavings(organizationId: string) {
  const [assets, dismissed, network] = await Promise.all([
    loadAssets(organizationId),
    db.savingDismissal.findMany({ where: { organizationId }, select: { key: true } }),
    db.connector.findUnique({ where: { organizationId_provider: { organizationId, provider: "NETWORK" } } }),
  ]);
  const out: Saving[] = [];
  const ref = (a: AssetForSavings) => ({ id: a.id, name: a.name, vendor: a.vendor, serviceId: serviceOf(a) });
  const now = Date.now();

  for (const a of assets) {
    const m = monthlyOf(a);
    if (!m || m.eur <= 0) continue;
    const plan = a.cost?.planId ? PLANS.find((p) => p.id === a.cost!.planId) : null;
    const seats = a.cost?.seats ?? null;

    // 1. Fatturazione annuale invece che mensile (piani business).
    if (plan?.annualMonthlyUsd && plan.annualMonthlyUsd < plan.monthlyUsd && !a.cost?.annualBilling && (a.cost?.basis === "bank" || a.cost?.basis === "invoice")) {
      const save = m.eur * (1 - plan.annualMonthlyUsd / plan.monthlyUsd);
      if (save >= 5)
        out.push({
          key: `annual:${a.id}`,
          kind: "annual",
          title: `Pay ${a.name} yearly instead of monthly`,
          detail: `${seats && seats > 1 ? `${seats} seats on ` : ""}${plan.name}: the yearly price is ${round((1 - plan.annualMonthlyUsd / plan.monthlyUsd) * 100)}% lower. Only do it for seats you're sure to keep.`,
          monthlyEur: save,
          confidence: "HIGH",
          assets: [ref(a)],
          href: `/assets/${a.id}`,
        });
    }

    // 2. Posti pagati ma non usati (serve sapere chi è attivo).
    const active = a.usages.filter((u) => u.lastSeenAt && now - u.lastSeenAt.getTime() < 30 * DAY).length;
    if (seats && a.usages.length > 0 && active < seats) {
      const perSeat = m.eur / seats;
      const idle = seats - active;
      out.push({
        key: `seats:${a.id}`,
        kind: "seats",
        title: `${idle} unused ${a.name} seat${idle === 1 ? "" : "s"}`,
        detail: `You pay for ${seats} seats; ${active} ${active === 1 ? "person has" : "people have"} used it in the last 30 days. Remove the seats nobody uses.`,
        monthlyEur: idle * perSeat,
        confidence: "HIGH",
        assets: [ref(a)],
        href: `/assets/${a.id}`,
      });
    }

    // 3. Posti "premium" dove probabilmente basta lo standard.
    if (plan && /premium|max-20x|chatgpt-pro/.test(plan.id)) {
      const standard = PLANS.find((p) => p.service === plan.service && p.business === plan.business && !/premium|max|pro$/.test(p.id) && p.monthlyUsd < plan.monthlyUsd) ??
        PLANS.find((p) => p.service === plan.service && p.monthlyUsd < plan.monthlyUsd && p.id !== plan.id);
      if (standard) {
        const n = seats ?? 1;
        const save = m.eur - n * standard.monthlyUsd * USD_TO_EUR;
        if (save > 10)
          out.push({
            key: `premium:${a.id}`,
            kind: "premium",
            title: `Move ${a.name} to ${standard.name}`,
            detail: `${n > 1 ? `${n} seats on ` : ""}${plan.name} cost ${round(plan.monthlyUsd / standard.monthlyUsd)}× the standard plan. Keep the higher tier only for heavy users.`,
            monthlyEur: save,
            confidence: "LOW",
            assets: [ref(a)],
            href: `/assets/${a.id}`,
          });
      }
    }

    // 4. Modello API più grande del necessario.
    const model = a.model && !a.model.includes(",") ? apiModelFor(a.model) : null;
    const cheaper = model ? cheaperModel(model) : null;
    if (model && cheaper && categoryOf(a) === "api") {
      const ratio = blended(cheaper) / blended(model);
      const save = m.eur * (1 - ratio) * 0.5; // ipotesi prudente: metà del traffico è spostabile
      if (save >= 10)
        out.push({
          key: `model:${a.id}`,
          kind: "model",
          title: `Route simple requests of ${a.name} to ${cheaper.name}`,
          detail: `${model.name} costs ${round(1 / ratio)}× ${cheaper.name}. If half of the requests are simple (classification, extraction, short answers), this is the saving. Test on real prompts first.`,
          monthlyEur: save,
          confidence: "LOW",
          assets: [ref(a)],
          href: `/assets/${a.id}`,
        });
    }

    // 5. Pagata ma nessuno la usa (solo se la scansione è attiva e recente).
    const seen = a.activities[0]?.occurredAt ?? null;
    const cat = categoryOf(a);
    if (network?.lastSyncedAt && now - network.lastSyncedAt.getTime() < 30 * DAY && cat && cat !== "api" && !seen && a.usages.length === 0 && (a.cost?.basis === "bank" || a.cost?.basis === "invoice")) {
      out.push({
        key: `idle:${a.id}`,
        kind: "idle",
        title: `Nobody seems to use ${a.name}`,
        detail: `You pay for it, but the latest scans didn't see it on any computer. Check with the team, then cancel it.`,
        monthlyEur: m.eur,
        confidence: "LOW",
        assets: [ref(a)],
        href: `/assets/${a.id}`,
      });
    }

    // 6. Alternative registrate a mano sul passaporto.
    const best = a.alternatives.filter((x) => x.estimatedMonthlyCost != null).sort((x, y) => x.estimatedMonthlyCost! - y.estimatedMonthlyCost!)[0];
    if (best && best.estimatedMonthlyCost! < m.eur) {
      out.push({
        key: `alt:${best.id}`,
        kind: "alternative",
        title: `Switch ${a.name} to ${best.provider} ${best.model}`,
        detail: best.reasoning ?? "Alternative recorded on the passport.",
        monthlyEur: m.eur - best.estimatedMonthlyCost!,
        confidence: (best.qualityConfidence as Confidence) ?? "MEDIUM",
        assets: [ref(a)],
        href: `/assets/${a.id}`,
      });
    }
  }

  // 7. Strumenti che fanno la stessa cosa, pagati entrambi.
  const byCat = new Map<Category, AssetForSavings[]>();
  for (const a of assets) {
    const c = categoryOf(a);
    const m = monthlyOf(a);
    if (!c || c === "api" || c === "local" || !m || m.estimated) continue;
    byCat.set(c, [...(byCat.get(c) ?? []), a]);
  }
  for (const [cat, list] of byCat) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((x, y) => monthlyOf(y)!.eur - monthlyOf(x)!.eur);
    const keep = sorted[0];
    const drop = sorted.slice(1);
    const save = drop.reduce((s, a) => s + monthlyOf(a)!.eur, 0);
    out.push({
      key: `dup:${cat}:${sorted.map((a) => a.id).join(",")}`,
      kind: "duplicate",
      title: `${list.length} ${categoryPlural(cat)} — keep one`,
      detail: `You pay for ${sorted.map((a) => a.name).join(", ")}. They do the same job: standardise on ${keep.name} and cancel the others where the same people have both.`,
      monthlyEur: save,
      confidence: "MEDIUM",
      assets: sorted.map(ref),
      href: `/assets?category=${cat}`,
    });
  }

  const hidden = new Set(dismissed.map((d) => d.key));
  const items = out.filter((s) => !hidden.has(s.key) && s.monthlyEur >= 1).sort((a, b) => b.monthlyEur - a.monthlyEur);
  // Più suggerimenti sulla stessa AI non si sommano oltre il suo costo.
  const cap = new Map<string, number>();
  let total = 0;
  for (const s of items) {
    if (s.kind === "duplicate") {
      total += s.monthlyEur;
      continue;
    }
    const id = s.assets[0]?.id ?? s.key;
    const a = assets.find((x) => x.id === id);
    const limit = (a && monthlyOf(a)?.eur) ?? s.monthlyEur;
    const used = cap.get(id) ?? 0;
    const add = Math.max(0, Math.min(s.monthlyEur, limit - used));
    cap.set(id, used + add);
    total += add;
  }
  return { items, totalMonthly: total, assets };
}
