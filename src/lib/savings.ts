/**
 * Motore dei risparmi: regole deterministiche e spiegabili sui dati reali
 * (addebiti, posti, utenti attivi, modello usato). Nessun LLM, nessun numero
 * inventato: ogni suggerimento dice da dove viene e quanto è sicuro.
 */
import * as React from "react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { countActive, SEAT_WINDOW_DAYS } from "@/lib/seats";
import { AI_SERVICES } from "@/lib/discovery/catalog";
import { matchMerchant } from "@/lib/pricing/merchants";
import { SERVICE_CATEGORY, categoryPlural, type Category } from "@/lib/pricing/catalog";
import { seatSavings } from "@/lib/pricing/manual";
import { toEur } from "@/lib/spend/fx";
import { legacyPlans, legacyPlanById, legacyApiModelFor, cheaperApiModel, blendedPrice, defaultBusinessSeat, estimateSeatCost, seatsEur } from "@/lib/pricing/service";

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

/** Abbonamento inserito a mano ancora valido: vince su AiSystemCost per posti e prezzi (vedi monthlyOf). */
export const manualSubscriptionArgs = {
  where: { origin: "manual", effectiveUntil: null },
  orderBy: { updatedAt: "desc" },
  take: 1,
  include: { seatLines: true },
} satisfies Prisma.AiAsset$subscriptionsArgs;

/**
 * Relazioni che servono a monthlyOf: costo e abbonamento manuale. Ogni lettura
 * delle AI che poi chiama monthlyOf le include (in `include` o `select`), così
 * tutte le pagine mostrano lo stesso costo.
 */
export const assetCostInclude = { cost: true, subscriptions: manualSubscriptionArgs } as const;

export async function loadAssets(organizationId: string, opts: { includeRejected?: boolean } = {}) {
  return db.aiAsset.findMany({
    where: { organizationId, deletedAt: null, ...(opts.includeRejected ? {} : { status: { not: "UNAPPROVED" as const } }) },
    include: {
      cost: true,
      alternatives: true,
      usages: { select: { lastSeenAt: true } },
      activities: { where: { eventType: { in: ["discovery.seen", "edge.seen"] } }, orderBy: { occurredAt: "desc" }, take: 1, select: { occurredAt: true } },
      connector: { select: { provider: true, credentialsEncrypted: true } },
      // Abbonamento inserito a mano: vince su AiSystemCost per posti e prezzi.
      subscriptions: manualSubscriptionArgs,
    },
    orderBy: { name: "asc" },
  });
}

/** Servizio del catalogo: dal campo salvato, altrimenti dal nome. */
export function serviceOf(a: { serviceId: string | null; name: string; vendor: string | null; type?: string }) {
  if (a.serviceId) return a.serviceId;
  // Un server MCP ("GitHub MCP", "Notion MCP") non è un abbonamento AI: niente listino né stime.
  if (a.type === "MCP_SERVER") return null;
  const byName = AI_SERVICES.find((s) => s.name.toLowerCase() === a.name.toLowerCase());
  return byName?.id ?? matchMerchant(`${a.name} ${a.vendor ?? ""}`);
}

export const categoryOf = (a: { serviceId: string | null; name: string; vendor: string | null; type?: string }): Category | null => {
  const s = serviceOf(a);
  return (s && SERVICE_CATEGORY[s]) || (a.type === "AI_API" ? "api" : a.type === "AI_DEV_TOOL" ? "coding" : null);
};

/** Abbonamento manuale (se caricato) di un'AI. */
type ManualSubLike = { origin: string; currency: string; actualMonthly: number | null; contractMonthly: number | null };
const manualOf = <T extends ManualSubLike>(a: { subscriptions?: readonly T[] }) => a.subscriptions?.find((x) => x.origin === "manual") ?? null;

/** Costo mensile: abbonamento inserito a mano (fatturato, poi contratto), poi reale, altrimenti stima da utenti × listino. */
export function monthlyOf(
  a: Pick<AssetForSavings, "cost" | "serviceId" | "name" | "vendor"> & { usages: readonly unknown[]; type?: string; subscriptions?: readonly ManualSubLike[] }
): { eur: number; estimated: boolean } | null {
  const ms = manualOf(a);
  const manualEur = ms ? ms.actualMonthly ?? ms.contractMonthly : null;
  if (ms && manualEur != null) return { eur: Math.round(toEur(manualEur, ms.currency).eur * 100) / 100, estimated: false };
  if (a.cost?.monthlyCostEstimate != null) return { eur: a.cost.monthlyCostEstimate, estimated: a.cost.basis === "estimate" };
  const s = serviceOf(a);
  const users = a.usages.length;
  if (s && users > 0) {
    const st = defaultBusinessSeat(s);
    const e = st ? estimateSeatCost([{ seatType: st.id, seats: users, cycle: "monthly" }]) : null;
    if (e && e.known) return { eur: Math.round(e.eur * 100) / 100, estimated: true };
  }
  return null;
}

/**
 * Chiave attuale di un suggerimento. I doppioni avevano la chiave
 * "dup:<categoria>:<id,…>" (cambiava con gli strumenti): oggi è "dup:<categoria>".
 */
export function canonicalSavingKey(key: string) {
  if (!key.startsWith("dup:")) return key;
  const [, cat] = key.split(":");
  return `dup:${cat}`;
}

/** Filtri Prisma (da mettere in OR) per una chiave e le sue forme vecchie (doppioni: "dup:<categoria>:…"). */
export function savingKeyFilters(key: string): ({ equals: string } | { startsWith: string })[] {
  const k = canonicalSavingKey(key);
  return k.startsWith("dup:") ? [{ equals: k }, { startsWith: `${k}:` }] : [{ equals: k }];
}

export async function computeSavings(organizationId: string) {
  const [assets, dismissed, ledger, network] = await Promise.all([
    loadAssets(organizationId),
    // Nascosti: "not for us" e quelli già accettati nel registro dei risparmi (tranne i falliti).
    db.savingDismissal.findMany({ where: { organizationId }, select: { key: true } }),
    db.savingAction.findMany({ where: { organizationId, savingKey: { not: null }, status: { not: "failed" } }, select: { savingKey: true, status: true } }),
    db.connector.findUnique({ where: { organizationId_provider: { organizationId, provider: "NETWORK" } } }),
  ]);
  const out: Saving[] = [];
  const ref = (a: AssetForSavings) => ({ id: a.id, name: a.name, vendor: a.vendor, serviceId: serviceOf(a) });
  const now = Date.now();

  for (const a of assets) {
    const m = monthlyOf(a);
    if (!m || m.eur <= 0) continue;
    const plan = legacyPlanById(a.cost?.planId);
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
    const active = countActive(a.usages, SEAT_WINDOW_DAYS, now);
    const ms = manualOf(a);
    if (ms && ms.seatLines.length) {
      // Abbonamento inserito a mano: posti per tipo, valorizzati al prezzo effettivo
      // (contratto → fatturato → listino), con la base di calcolo nel dettaglio.
      const sv = seatSavings({ ...ms, seatLines: ms.seatLines }, a.usages.length > 0 ? active : null, new Date(now));
      if (sv && sv.monthlyEur > 0)
        out.push({
          key: `seats:${a.id}`,
          kind: "seats",
          title: `${sv.idle} unused ${a.name} seat${sv.idle === 1 ? "" : "s"}`,
          detail: `You pay for ${sv.paid} seats; ${sv.active} in use. Remove the seats nobody uses. Basis: ${sv.basis}.`,
          monthlyEur: sv.monthlyEur,
          confidence: "HIGH",
          assets: [ref(a)],
          href: `/assets/${a.id}`,
        });
    } else if (seats && a.usages.length > 0 && active < seats) {
      const perSeat = m.eur / seats;
      const idle = seats - active;
      out.push({
        key: `seats:${a.id}`,
        kind: "seats",
        title: `${idle} unused ${a.name} seat${idle === 1 ? "" : "s"}`,
        detail: `You pay for ${seats} seats; ${active} ${active === 1 ? "person has" : "people have"} used it in the last 30 days. Remove the seats nobody uses. Basis: ${idle} idle × €${perSeat.toFixed(2)} a month each (${m.estimated ? "list price" : "monthly cost ÷ paid seats"}).`,
        monthlyEur: idle * perSeat,
        confidence: "HIGH",
        assets: [ref(a)],
        href: `/assets/${a.id}`,
      });
    }

    // 3. Posti "premium" dove probabilmente basta lo standard.
    if (plan && /premium|max-20x|chatgpt-pro/.test(plan.id)) {
      const plans = legacyPlans();
      // Solo piani a pagamento: un piano gratuito (prezzo 0) darebbe un rapporto infinito.
      const standard = plans.find((p) => p.service === plan.service && p.business === plan.business && !/premium|max|pro$/.test(p.id) && p.monthlyUsd > 0 && p.monthlyUsd < plan.monthlyUsd) ??
        plans.find((p) => p.service === plan.service && p.monthlyUsd > 0 && p.monthlyUsd < plan.monthlyUsd && p.id !== plan.id);
      if (standard) {
        const n = seats ?? 1;
        const save = m.eur - seatsEur(standard.id, n);
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
    const model = a.model && !a.model.includes(",") ? legacyApiModelFor(a.model) : null;
    const cheaper = model ? cheaperApiModel(model) : null;
    if (model && cheaper && categoryOf(a) === "api") {
      const ratio = blendedPrice(cheaper) / blendedPrice(model);
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
      // Chiave stabile per categoria: se cambiano gli strumenti, "not for us" e accettazioni restano.
      key: `dup:${cat}`,
      kind: "duplicate",
      title: `${list.length} ${categoryPlural(cat)} — keep one`,
      detail: `You pay for ${sorted.map((a) => a.name).join(", ")}. They do the same job: standardise on ${keep.name} and cancel the others where the same people have both.`,
      monthlyEur: save,
      confidence: "MEDIUM",
      assets: sorted.map(ref),
      href: `/assets?category=${cat}`,
    });
  }

  // Le vecchie chiavi dei doppioni ("dup:<categoria>:<id,…>") valgono come la chiave nuova.
  const hidden = new Set([...dismissed.map((d) => d.key), ...ledger.map((a) => a.savingKey!)].map(canonicalSavingKey));
  // Accettati ma non ancora fatti: fuori dall'elenco, ma l'angar Score li conta ancora (lo spreco c'è ancora).
  const accepted = new Set(ledger.filter((a) => a.status === "accepted").map((a) => canonicalSavingKey(a.savingKey!)));
  const inProgress = out.filter((s) => accepted.has(s.key) && s.monthlyEur >= 1);
  const visible = out.filter((s) => !hidden.has(s.key) && s.monthlyEur >= 1);
  // Se un'AI va tolta perché doppione, gli altri suggerimenti su di lei non servono.
  const dropped = new Set(visible.filter((s) => s.kind === "duplicate").flatMap((s) => s.assets.slice(1).map((a) => a.id)));
  const items = visible.filter((s) => s.kind === "duplicate" || !dropped.has(s.assets[0]?.id ?? "")).sort((a, b) => b.monthlyEur - a.monthlyEur);
  // Più suggerimenti sulla stessa AI non si sommano oltre il suo costo.
  const cap = new Map<string, number>();
  let total = 0;
  // Ripartizione per tipo di leva, che somma esattamente al totale (stesso cap).
  const byKind = new Map<Saving["kind"], { monthly: number; count: number }>();
  // Quota di ogni suggerimento davvero sommata al totale (dopo il tetto): la usano le Opportunities per non contare due volte.
  const counted = new Map<string, number>();
  const addKind = (k: Saving["kind"], eur: number) => {
    const cur = byKind.get(k) ?? { monthly: 0, count: 0 };
    byKind.set(k, { monthly: cur.monthly + eur, count: cur.count + 1 });
  };
  for (const s of items) {
    if (s.kind === "duplicate") {
      total += s.monthlyEur;
      addKind(s.kind, s.monthlyEur);
      counted.set(s.key, s.monthlyEur);
      continue;
    }
    const id = s.assets[0]?.id ?? s.key;
    const a = assets.find((x) => x.id === id);
    const limit = (a && monthlyOf(a)?.eur) ?? s.monthlyEur;
    const used = cap.get(id) ?? 0;
    const add = Math.max(0, Math.min(s.monthlyEur, limit - used));
    cap.set(id, used + add);
    total += add;
    addKind(s.kind, add);
    counted.set(s.key, add);
  }
  return { items, totalMonthly: total, assets, byKind, inProgress, counted };
}

/** computeSavings una volta sola per richiesta (layout, pagina e componenti la condividono). */
// cache() esiste solo nel livello server di React: fuori (job pianificati) si usa la funzione normale.
const reactCache = (React as { cache?: <T extends (...a: never[]) => unknown>(fn: T) => T }).cache;
export const computeSavingsCached = reactCache ? reactCache(computeSavings) : computeSavings;
