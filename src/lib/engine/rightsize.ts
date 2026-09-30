/**
 * angar Engine — Il piano giusto per ogni persona.
 *
 * Dall'uso di ciascuna persona (giorni attivi e minuti dell'app desktop /
 * estensione negli ultimi 30 giorni, ultimo accesso) e dal piano di ogni AI
 * (catalogo PLANS) raccomanda:
 *  - chi la usa molto → tenere (o, se usa davvero tanto, valutare il piano superiore);
 *  - chi la usa poco → piano più economico, oppure piano gratuito / posto condiviso;
 *  - chi non la usa da 30 giorni → togliere il posto.
 * Con l'impatto in euro. Deterministico, solo database.
 *
 * Privacy: i nomi escono solo in modalità "individual"; altrimenti solo conteggi.
 */
import { db } from "@/lib/db";
import { loadAssets, monthlyOf, serviceOf } from "@/lib/savings";
import { SEAT_WINDOW_DAYS } from "@/lib/seats";
import { PLANS, USD_TO_EUR, type Plan } from "@/lib/pricing/catalog";
import { orgPrivacyMode, showsPeople, type PrivacyMode } from "@/lib/privacy";
import { isPseudonym } from "@/lib/discovery/pseudonym";

const DAY = 86400000;
const COUNTED = ["desktop.active", "extension.active"];
const PERSON_EVENTS = [...COUNTED, "signin", "copilot.active"];

/** Soglie (ultimi 30 giorni). */
export const HEAVY_DAYS = 12;
export const HEAVY_MINUTES = 600;
export const LIGHT_DAYS = 3;
export const LIGHT_MINUTES = 120;
export const POWER_DAYS = 18;
export const POWER_MINUTES = 1500;

export type Segment = "heavy" | "regular" | "light" | "inactive";

export interface PersonUse {
  /** Etichetta mostrabile (nome o email); ignorata fuori dalla modalità individuale. */
  label: string;
  lastSeenAt: Date | null;
  activeDays: number;
  minutes: number;
  /** true se ci sono attività misurate (giorni/minuti), non solo l'ultimo accesso. */
  measured: boolean;
}

export function segmentOf(p: PersonUse, now = Date.now()): Segment {
  const recent = p.lastSeenAt != null && p.lastSeenAt.getTime() >= now - SEAT_WINDOW_DAYS * DAY;
  if (!recent && p.activeDays === 0) return "inactive";
  if (!p.measured) return "regular";
  if (p.activeDays >= HEAVY_DAYS || p.minutes >= HEAVY_MINUTES) return "heavy";
  if (p.activeDays <= LIGHT_DAYS && p.minutes < LIGHT_MINUTES) return "light";
  return "regular";
}

const isPower = (p: PersonUse) => p.activeDays >= POWER_DAYS && p.minutes >= POWER_MINUTES;

/** Piano più economico dello stesso servizio (stesso tipo business/personale), il più vicino sotto. */
export function cheaperPlan(plan: Plan): Plan | null {
  return PLANS.filter((p) => p.service === plan.service && p.business === plan.business && p.monthlyUsd < plan.monthlyUsd).sort((a, b) => b.monthlyUsd - a.monthlyUsd)[0] ?? null;
}

/** Piano superiore (premium) dello stesso servizio, il più vicino sopra. */
export function upperPlan(plan: Plan): Plan | null {
  return PLANS.filter((p) => p.service === plan.service && p.business === plan.business && p.monthlyUsd > plan.monthlyUsd).sort((a, b) => a.monthlyUsd - b.monthlyUsd)[0] ?? null;
}

/** Piano "premium": costa almeno il doppio del piano più economico dello stesso tipo. */
export function isPremiumPlan(plan: Plan): boolean {
  const c = cheaperPlan(plan);
  return c != null && plan.monthlyUsd >= c.monthlyUsd * 2;
}

export type ActionKind = "remove" | "downgrade" | "free" | "upgrade" | "keep";

export interface RightsizeAction {
  kind: ActionKind;
  count: number;
  /** Nomi, solo in modalità individuale (altrimenti null). */
  people: string[] | null;
  toPlan: string | null;
  /** Effetto sul costo mensile: positivo = risparmio, negativo = costo in più. */
  monthlyEur: number;
}

export interface RightsizeAsset {
  assetId: string;
  name: string;
  vendor: string | null;
  planName: string | null;
  seats: number | null;
  seatEur: number;
  counts: Record<Segment, number>;
  /** Posti pagati senza nessuna persona nota. */
  unassigned: number;
  actions: RightsizeAction[];
  saveMonthlyEur: number;
  upgradeMonthlyEur: number;
}

export interface RightsizeResult {
  assets: RightsizeAsset[];
  saveMonthlyEur: number;
  upgradeMonthlyEur: number;
  counts: Record<Segment, number>;
  individual: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Raccomandazioni per una sola AI. Pura. */
export function rightsizeAsset(
  a: { assetId: string; name: string; vendor: string | null; plan: Plan | null; seats: number | null; seatEur: number },
  people: PersonUse[],
  individual: boolean,
  now = Date.now(),
): RightsizeAsset {
  const groups: Record<Segment, PersonUse[]> = { heavy: [], regular: [], light: [], inactive: [] };
  for (const p of people) groups[segmentOf(p, now)].push(p);
  const unassigned = a.seats != null ? Math.max(0, a.seats - people.length) : 0;
  const names = (list: PersonUse[]) => (individual ? list.map((p) => p.label).sort((x, y) => x.localeCompare(y)) : null);
  const actions: RightsizeAction[] = [];

  // Senza posti pagati noti si conta un posto per persona nota.
  const inactive = groups.inactive.length + unassigned;
  if (inactive > 0) actions.push({ kind: "remove", count: inactive, people: names(groups.inactive), toPlan: null, monthlyEur: round2(inactive * a.seatEur) });

  const cheaper = a.plan ? cheaperPlan(a.plan) : null;
  const premium = a.plan ? isPremiumPlan(a.plan) : false;
  const ratio = cheaper && a.plan ? cheaper.monthlyUsd / a.plan.monthlyUsd : null;

  // Chi la usa poco (e, su un piano premium, anche chi la usa normalmente): piano più economico
  // se esiste, altrimenti piano gratuito o posto condiviso.
  const down = [...groups.light, ...(premium ? groups.regular : [])];
  if (down.length && cheaper && ratio != null) {
    actions.push({ kind: "downgrade", count: down.length, people: names(down), toPlan: cheaper.name, monthlyEur: round2(down.length * a.seatEur * (1 - ratio)) });
  } else if (groups.light.length) {
    actions.push({ kind: "free", count: groups.light.length, people: names(groups.light), toPlan: null, monthlyEur: round2(groups.light.length * a.seatEur) });
  }
  // Chi la usa moltissimo: valutare il piano superiore (costo in più, non un risparmio).
  const power = groups.heavy.filter(isPower);
  const upper = a.plan && !premium ? upperPlan(a.plan) : null;
  if (upper && a.plan && power.length) {
    actions.push({ kind: "upgrade", count: power.length, people: names(power), toPlan: upper.name, monthlyEur: -round2(power.length * a.seatEur * (upper.monthlyUsd / a.plan.monthlyUsd - 1)) });
  }
  const keep = groups.heavy.length - (upper ? power.length : 0) + (premium ? 0 : groups.regular.length);
  if (keep > 0) {
    const kept = [...groups.heavy.filter((p) => !(upper && isPower(p))), ...(premium ? [] : groups.regular)];
    actions.push({ kind: "keep", count: keep, people: names(kept), toPlan: null, monthlyEur: 0 });
  }

  const save = actions.filter((x) => x.monthlyEur > 0).reduce((t, x) => t + x.monthlyEur, 0);
  const up = -actions.filter((x) => x.monthlyEur < 0).reduce((t, x) => t + x.monthlyEur, 0);
  return {
    assetId: a.assetId,
    name: a.name,
    vendor: a.vendor,
    planName: a.plan?.name ?? null,
    seats: a.seats,
    seatEur: round2(a.seatEur),
    counts: { heavy: groups.heavy.length, regular: groups.regular.length, light: groups.light.length, inactive: groups.inactive.length },
    unassigned,
    actions,
    saveMonthlyEur: round2(save),
    upgradeMonthlyEur: round2(up),
  };
}

/** Somma i risultati delle singole AI. Pura. */
export function summarise(assets: RightsizeAsset[], individual: boolean): RightsizeResult {
  const counts: Record<Segment, number> = { heavy: 0, regular: 0, light: 0, inactive: 0 };
  for (const a of assets) for (const k of Object.keys(counts) as Segment[]) counts[k] += a.counts[k];
  const sorted = [...assets].sort((x, y) => y.saveMonthlyEur - x.saveMonthlyEur || x.name.localeCompare(y.name));
  return {
    assets: sorted,
    saveMonthlyEur: round2(sorted.reduce((t, a) => t + a.saveMonthlyEur, 0)),
    upgradeMonthlyEur: round2(sorted.reduce((t, a) => t + a.upgradeMonthlyEur, 0)),
    counts,
    individual,
  };
}

// ───────────────────────── dal database ─────────────────────────

/** Raccomandazioni per tutte le AI a posti dell'azienda. */
export async function rightsizeFor(orgId: string, now = Date.now()): Promise<RightsizeResult> {
  const since = new Date(now - SEAT_WINDOW_DAYS * DAY);
  const [mode, assets] = await Promise.all([orgPrivacyMode(orgId), loadAssets(orgId)]);
  const individual = showsPeople(mode as PrivacyMode);

  // Solo AI pagate con un piano a posti o un numero di posti.
  const seated = assets
    .map((a) => {
      const m = monthlyOf(a);
      const plan = a.cost?.planId ? PLANS.find((p) => p.id === a.cost!.planId) ?? null : null;
      const seats = a.cost?.seats && a.cost.seats > 0 ? a.cost.seats : null;
      if (!m || m.eur <= 0 || (!plan && !seats)) return null;
      const users = seats ?? a.usages.length;
      const list = plan ? (a.cost?.annualBilling && plan.annualMonthlyUsd ? plan.annualMonthlyUsd : plan.monthlyUsd) * USD_TO_EUR : null;
      const seatEur = users > 0 ? m.eur / users : list;
      if (!seatEur || a.usages.length === 0) return null;
      return { a, plan, seats, seatEur, service: serviceOf(a) };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  if (!seated.length) return summarise([], individual);

  const ids = seated.map((s) => s.a.id);
  const [usages, events] = await Promise.all([
    db.aiAssetUsage.findMany({
      where: { aiAssetId: { in: ids } },
      select: { aiAssetId: true, lastSeenAt: true, externalUserRef: true, user: { select: { email: true, name: true } } },
    }),
    db.aiAssetActivity.findMany({
      where: { aiAssetId: { in: ids }, occurredAt: { gte: since }, OR: [{ eventType: { in: PERSON_EVENTS } }, { eventType: { startsWith: "oauth." } }] },
      select: { aiAssetId: true, actorRef: true, occurredAt: true, eventType: true, payload: true },
      take: 20000,
    }),
  ]);

  // Giorni attivi e minuti per persona × AI (stessa lettura della pagina Usage).
  const minutesOf = (p: unknown) => Math.max(0, Math.min(Number((p as { minutes?: number } | null)?.minutes) || 0, 24 * 60));
  const act = new Map<string, { days: Set<string>; minutes: number; last: Date }>();
  for (const e of events) {
    const who = (e.actorRef ?? "").toLowerCase();
    if (!who.includes("@") && !isPseudonym(who)) continue;
    const k = `${e.aiAssetId}|${who}`;
    const r = act.get(k) ?? { days: new Set<string>(), minutes: 0, last: e.occurredAt };
    r.days.add(e.occurredAt.toISOString().slice(0, 10));
    if (COUNTED.includes(e.eventType)) r.minutes += minutesOf(e.payload);
    if (e.occurredAt > r.last) r.last = e.occurredAt;
    act.set(k, r);
  }

  const out: RightsizeAsset[] = [];
  for (const s of seated) {
    const people: PersonUse[] = usages
      .filter((u) => u.aiAssetId === s.a.id)
      .map((u) => {
        const email = (u.user?.email ?? u.externalUserRef ?? "").toLowerCase();
        const r = email ? act.get(`${s.a.id}|${email}`) : undefined;
        const last = [u.lastSeenAt, r?.last].filter((d): d is Date => !!d).sort((x, y) => y.getTime() - x.getTime())[0] ?? null;
        const label = isPseudonym(email) ? "Anonymous person" : u.user?.name || u.user?.email || u.externalUserRef || "Unknown person";
        return { label, lastSeenAt: last, activeDays: r?.days.size ?? 0, minutes: r?.minutes ?? 0, measured: !!r };
      });
    out.push(rightsizeAsset({ assetId: s.a.id, name: s.a.name, vendor: s.a.vendor, plan: s.plan, seats: s.seats, seatEur: s.seatEur }, people, individual, now));
  }
  return summarise(out, individual);
}
