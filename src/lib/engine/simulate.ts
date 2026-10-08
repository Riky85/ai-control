/**
 * angar Engine — Simulatore "e se…".
 *
 * Parte dai numeri reali di oggi (spesa di ogni AI, posti, persone attive,
 * Angar Score) e ricalcola al volo scenari: standardizzare su un'AI, togliere
 * i posti non usati, passare alla fatturazione annuale, bloccare le AI non
 * consentite, tagliare i posti di un reparto.
 *
 * Modulo PURO (nessun database): lo usa il componente client. Il modello
 * serializzabile lo prepara la pagina server (lib/engine/sim-model.ts).
 *
 * Effetto sul punteggio: ESATTO, non approssimato. Lo scenario corregge i
 * fatti dell'Angar Score (posti pagati e attivi, doppioni, fatturazione
 * annuale, spesa) e si ricalcola con la stessa funzione pura di score-model.ts.
 * Bloccare le AI non consentite non cambia il punteggio (misura l'efficienza
 * della spesa, non il controllo).
 */
import { AXES, AXIS_LABEL, LEVEL_LABEL, levelOf, type Axes, type Axis } from "@/lib/engine/score-meta";
import { scoreFromFacts, type ScoreFacts } from "@/lib/engine/score-model";

export type SimStatus = "APPROVED" | "UNREVIEWED" | "UNAPPROVED" | "UNKNOWN";

export interface SimAsset {
  id: string;
  name: string;
  vendor: string | null;
  category: string | null;
  status: SimStatus;
  /** Costo mensile di oggi (0 se non si sa). */
  monthlyEur: number;
  seats: number | null;
  /** Prezzo di un posto: reale (costo / posti) o listino. */
  seatEur: number | null;
  /** Persone attive negli ultimi 30 giorni (indici anonimi). */
  active: number[];
  /** Tutte le persone note (indici anonimi). */
  known: number[];
  /** Prezzo annuale / mensile del piano, solo se oggi si paga al mese e l'annuale costa meno. */
  yearlyRatio: number | null;
  /** Solo AI non consentite: usata negli ultimi 30 giorni. */
  inUse: boolean;
}

export interface SimModel {
  assets: SimAsset[];
  /** Reparto (indice in `departments`) di ogni persona; null = reparto troppo piccolo o assente. */
  personDept: (number | null)[];
  departments: string[];
  /** Categorie con almeno due AI tra cui scegliere. */
  categories: { key: string; label: string; assetIds: string[] }[];
  score: { score: number; axes: Axes; facts: ScoreFacts };
}

export interface Scenario {
  /** categoria → AI da tenere (null = tenere tutte). */
  standardise: Record<string, string | null>;
  removeUnused: boolean;
  yearly: boolean;
  blockUnapproved: boolean;
  cut: { dept: number; pct: number } | null;
}

export const EMPTY_SCENARIO: Scenario = { standardise: {}, removeUnused: false, yearly: false, blockUnapproved: false, cut: null };

export interface SimChange {
  key: string;
  text: string;
  /** Risparmio mensile (negativo = costo in più). */
  monthlyEur: number;
}

export interface SimResult {
  baseMonthly: number;
  monthly: number;
  yearly: number;
  saveMonthly: number;
  saveYearly: number;
  seats: { before: number; after: number };
  people: number;
  changes: SimChange[];
  score: { before: number; after: number; levelLabel: string; axes: Axes; delta: Record<Axis, number>; notes: Partial<Record<Axis, string>> };
}

interface State {
  a: SimAsset;
  kept: boolean;
  seats: number | null;
  monthly: number;
  active: Set<number>;
  known: Set<number>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** Costo di un'AI con n posti (solo AI a posti con un prezzo). */
const seatCost = (s: State, n: number) => (s.a.seatEur != null ? n * s.a.seatEur : s.monthly);

const init = (a: SimAsset): State => ({ a, kept: true, seats: a.seats, monthly: a.monthlyEur, active: new Set(a.active), known: new Set(a.known) });

/** Conta nella spesa come score.ts e Savings: tutte le AI tranne quelle non consentite. */
const spendOf = (states: State[]) => states.reduce((t, s) => t + (s.kept && s.a.status !== "UNAPPROVED" ? s.monthly : 0), 0);
const seatsOf = (states: State[]) => states.reduce((t, s) => t + (s.kept && s.a.status !== "UNAPPROVED" ? s.seats ?? 0 : 0), 0);

/** Ricalcola tutto per uno scenario. Pura e veloce (si chiama a ogni clic). */
export function simulate(model: SimModel, sc: Scenario): SimResult {
  const base = model.assets.map(init);
  const st = model.assets.map(init);
  const byId = new Map(st.map((s) => [s.a.id, s]));
  const changes: SimChange[] = [];
  const baseMonthly = spendOf(base);

  // 1. Bloccare le AI non consentite ancora in uso (non sono nella spesa: effetto su rischio e adozione).
  const blocked = sc.blockUnapproved ? st.filter((s) => s.a.status === "UNAPPROVED" && s.a.inUse) : [];
  for (const s of blocked) s.kept = false;
  if (blocked.length) {
    changes.push({ key: "block", text: `Block ${blocked.map((s) => s.a.name).slice(0, 3).join(", ")}${blocked.length > 3 ? ` and ${blocked.length - 3} more` : ""} on the network`, monthlyEur: 0 });
  }

  // 2. Standardizzare: si tiene un'AI della categoria, le altre si tolgono e le persone si spostano.
  for (const cat of model.categories) {
    const keepId = sc.standardise[cat.key];
    const keeper = keepId ? byId.get(keepId) : null;
    if (!keeper || !keeper.kept) continue;
    const others = cat.assetIds.map((id) => byId.get(id)!).filter((s) => s && s.kept && s !== keeper);
    if (!others.length) continue;
    const before = keeper.monthly + others.reduce((t, s) => t + s.monthly, 0);
    const moved = new Set<number>();
    for (const s of others) {
      s.active.forEach((p) => {
        if (!keeper.active.has(p)) moved.add(p);
        keeper.active.add(p);
      });
      s.known.forEach((p) => keeper.known.add(p));
      s.kept = false;
    }
    // Posti dimensionati sulle persone attive.
    if (keeper.a.seatEur != null) {
      keeper.seats = Math.max(1, keeper.active.size);
      keeper.monthly = seatCost(keeper, keeper.seats);
    }
    const save = before - keeper.monthly;
    changes.push({
      key: `std:${cat.key}`,
      text: `Standardise on ${keeper.a.name}: drop ${others.map((s) => s.a.name).join(", ")}${moved.size ? `, move ${plural(moved.size, "person", "people")}` : ""}${keeper.a.seatEur != null ? `, ${plural(keeper.seats!, "seat")}` : ""}`,
      monthlyEur: round2(save),
    });
  }

  // 3. Tagliare i posti di un reparto (prima chi non la usa, poi gli altri).
  if (sc.cut && model.departments[sc.cut.dept] != null) {
    const { dept, pct } = sc.cut;
    let cutSeats = 0;
    let save = 0;
    for (const s of st) {
      if (!s.kept || s.a.status === "UNAPPROVED" || s.a.seatEur == null || !s.seats) continue;
      const team = [...s.known].filter((p) => model.personDept[p] === dept).sort((x, y) => Number(s.active.has(x)) - Number(s.active.has(y)) || x - y);
      const n = Math.min(s.seats, Math.round(team.length * pct));
      if (n <= 0) continue;
      for (const p of team.slice(0, n)) {
        s.known.delete(p);
        s.active.delete(p);
      }
      const before = s.monthly;
      s.seats -= n;
      s.monthly = seatCost(s, s.seats);
      if (s.seats <= 0) s.kept = false;
      cutSeats += n;
      save += before - s.monthly;
    }
    if (cutSeats) changes.push({ key: "cut", text: `Cut ${plural(cutSeats, "seat")} of ${model.departments[dept]} (${Math.round(pct * 100)}%)`, monthlyEur: round2(save) });
  }

  // 4. Togliere i posti non usati (solo dove si sa chi la usa).
  if (sc.removeUnused) {
    let n = 0;
    let save = 0;
    for (const s of st) {
      if (!s.kept || s.a.status === "UNAPPROVED" || s.a.seatEur == null || !s.seats || s.known.size === 0) continue;
      const idle = s.seats - s.active.size;
      if (idle <= 0) continue;
      const before = s.monthly;
      s.seats = s.active.size;
      s.monthly = seatCost(s, s.seats);
      if (s.seats <= 0) s.kept = false;
      n += idle;
      save += before - s.monthly;
    }
    if (n) changes.push({ key: "unused", text: `Remove ${plural(n, "unused seat")}`, monthlyEur: round2(save) });
  }

  // 5. Fatturazione annuale dove il piano la prevede.
  if (sc.yearly) {
    let save = 0;
    const names: string[] = [];
    for (const s of st) {
      if (!s.kept || s.a.status === "UNAPPROVED" || s.a.yearlyRatio == null || s.monthly <= 0) continue;
      const d = s.monthly * (1 - s.a.yearlyRatio);
      s.monthly -= d;
      save += d;
      names.push(s.a.name);
    }
    if (names.length) changes.push({ key: "yearly", text: `Pay ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""} yearly`, monthlyEur: round2(save) });
  }

  const monthly = spendOf(st);
  const saveMonthly = baseMonthly - monthly;

  // Effetto sul punteggio: fatti corretti dallo scenario, stesso calcolo dell'Angar Score.
  const f: ScoreFacts = JSON.parse(JSON.stringify(model.score.facts));
  const kept = (id: string) => byId.get(id)?.kept ?? true;
  f.seatTools = f.seatTools
    .map((t) => {
      const s = byId.get(t.assetId);
      if (!s) return t;
      if (!s.kept) return { ...t, paidSeats: 0 };
      return { ...t, paidSeats: s.seats ?? t.paidSeats, activeSeats: s.active.size, knownPeople: Math.max(s.known.size, t.knownPeople > 0 ? 1 : 0) };
    })
    .filter((t) => t.paidSeats > 0);
  const yearlyIds = new Set(sc.yearly ? st.filter((s) => s.kept && s.a.status !== "UNAPPROVED" && s.a.yearlyRatio != null && s.monthly > 0).map((s) => s.a.id) : []);
  f.opportunities = f.opportunities.filter((o) => {
    if (o.kind === "duplicate") return o.assetIds.filter(kept).length >= 2;
    if (!kept(o.assetIds[0] ?? "")) return false;
    if (o.kind === "seats") {
      const t = f.seatTools.find((x) => x.assetId === o.assetIds[0]);
      return !!t && t.paidSeats > Math.min(t.activeSeats, t.paidSeats);
    }
    if (o.kind === "annual") return !yearlyIds.has(o.assetIds[0]);
    return true;
  });
  f.monthlySpendEur = Math.max(0, f.monthlySpendEur - saveMonthly);
  f.subscriptionSpendEur = Math.max(0, f.subscriptionSpendEur - saveMonthly);
  const res = scoreFromFacts(f);
  const before = model.score.score;
  const axes = res.axes;
  const delta = Object.fromEntries(AXES.map((a) => [a, (axes[a] ?? 0) - (model.score.axes[a] ?? 0)])) as Record<Axis, number>;
  const notes: Partial<Record<Axis, string>> = {};
  if (delta.utilization) notes.utilization = delta.utilization > 0 ? "Fewer idle seats" : "More idle seats";
  if (delta.tools) notes.tools = delta.tools > 0 ? "Fewer tools doing the same job" : "More overlap";
  if (delta.savings) notes.savings = delta.savings > 0 ? "Less waste left to find" : "Waste is a bigger share of a smaller bill";
  if (delta.visibility) notes.visibility = `${AXIS_LABEL.visibility} changes with spend`;
  const scoreAfter = res.score;

  const people = new Set<number>();
  for (const s of st) if (s.kept) s.active.forEach((p) => people.add(p));

  return {
    baseMonthly: round2(baseMonthly),
    monthly: round2(monthly),
    yearly: round2(monthly * 12),
    saveMonthly: round2(saveMonthly),
    saveYearly: round2(saveMonthly * 12),
    seats: { before: seatsOf(base), after: seatsOf(st) },
    people: people.size,
    changes,
    score: { before, after: scoreAfter, levelLabel: LEVEL_LABEL[levelOf(scoreAfter)], axes, delta, notes },
  };
}
