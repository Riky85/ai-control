/**
 * angar Engine — Simulatore "e se…".
 *
 * Parte dai numeri reali di oggi (spesa di ogni AI, posti, persone attive,
 * angar Score) e ricalcola al volo scenari: standardizzare su un'AI, togliere
 * i posti non usati, passare alla fatturazione annuale, bloccare le AI non
 * consentite, tagliare i posti di un reparto.
 *
 * Modulo PURO (nessun database): lo usa il componente client. Il modello
 * serializzabile lo prepara la pagina server (app/simulate/model.ts).
 *
 * Effetto sul punteggio: approssimato ma spiegato, con le stesse regole di
 * score.ts per gli assi toccati (efficienza: spreco / spesa; rischio: AI non
 * consentite ancora in uso; adozione: quota d'uso su AI approvate). La
 * governance non cambia.
 */
import { AXES, AXIS_WEIGHT, gradeOf, type Axes, type Axis, type Grade } from "@/lib/engine/score-meta";

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

export interface SimScoreFacts {
  monthlySpendEur: number;
  wasteMonthlyEur: number;
  costKnown: boolean;
  unapprovedInUse: number;
  usageKnown: boolean;
  peopleBase: number;
}

export interface SimModel {
  assets: SimAsset[];
  /** Reparto (indice in `departments`) di ogni persona; null = reparto troppo piccolo o assente. */
  personDept: (number | null)[];
  departments: string[];
  /** Categorie con almeno due AI tra cui scegliere. */
  categories: { key: string; label: string; assetIds: string[] }[];
  score: { score: number; grade: Grade; axes: Axes; facts: SimScoreFacts };
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
  score: { before: number; after: number; grade: Grade; axes: Axes; delta: Axes; notes: Partial<Record<Axis, string>> };
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
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** Costo di un'AI con n posti (solo AI a posti con un prezzo). */
const seatCost = (s: State, n: number) => (s.a.seatEur != null ? n * s.a.seatEur : s.monthly);

/** Stesse regole di score.ts (efficiency): 1 punto ogni 0,625% di spreco, massimo −80. */
export function efficiencyPenalty(waste: number, spend: number) {
  if (spend <= 0) return 0;
  return Math.min(80, Math.round(Math.min(1, Math.max(0, waste) / spend) * 160));
}

/** Stesse regole di score.ts (risk): −12 per AI non consentita in uso, massimo −35. */
export const unapprovedPenalty = (n: number) => (n > 0 ? Math.min(35, n * 12) : 0);

/** Stesse regole di score.ts (adoption): portata (60) + quota d'uso su AI approvate (40). */
export function adoptionPenalty(o: { people: number; approvedPeople: number; rows: number; approvedRows: number; peopleBase: number }) {
  const base = Math.max(o.peopleBase, o.people, 1);
  const p1 = Math.round(60 * (1 - Math.min(1, o.approvedPeople / base / 0.5)));
  const p2 = o.rows > 0 ? Math.round(40 * (1 - o.approvedRows / o.rows)) : 0;
  return p1 + p2;
}

function adoptionOf(states: State[], peopleBase: number) {
  const people = new Set<number>();
  const approved = new Set<number>();
  let rows = 0;
  let approvedRows = 0;
  for (const s of states) {
    if (!s.kept) continue;
    rows += s.active.size;
    s.active.forEach((p) => people.add(p));
    if (s.a.status === "APPROVED") {
      approvedRows += s.active.size;
      s.active.forEach((p) => approved.add(p));
    }
  }
  return adoptionPenalty({ people: people.size, approvedPeople: approved.size, rows, approvedRows, peopleBase });
}

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
  let wasteCut = 0;

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
    wasteCut += Math.max(0, save);
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
    wasteCut += save;
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
    wasteCut += save;
    if (names.length) changes.push({ key: "yearly", text: `Pay ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""} yearly`, monthlyEur: round2(save) });
  }

  const monthly = spendOf(st);
  const saveMonthly = baseMonthly - monthly;

  // Effetto sul punteggio (stesse regole di score.ts sugli assi toccati).
  const f = model.score.facts;
  const axes = { ...model.score.axes };
  const delta: Axes = { efficiency: 0, governance: 0, risk: 0, adoption: 0 };
  const notes: Partial<Record<Axis, string>> = {};
  if (f.costKnown && f.monthlySpendEur > 0 && saveMonthly !== 0) {
    const newSpend = Math.max(0, f.monthlySpendEur - saveMonthly);
    const d = efficiencyPenalty(f.wasteMonthlyEur, f.monthlySpendEur) - efficiencyPenalty(f.wasteMonthlyEur - wasteCut, newSpend);
    delta.efficiency = d;
    if (d) notes.efficiency = d > 0 ? "Less money on waste" : "Waste is a bigger share of a smaller bill";
  }
  if (blocked.length) {
    const left = Math.max(0, f.unapprovedInUse - blocked.length);
    delta.risk = unapprovedPenalty(f.unapprovedInUse) - unapprovedPenalty(left);
    if (delta.risk) notes.risk = "No AI that isn't allowed in use";
  }
  if (f.usageKnown) {
    const d = adoptionOf(base, f.peopleBase) - adoptionOf(st, f.peopleBase);
    delta.adoption = d;
    if (d) notes.adoption = d > 0 ? "More use on approved AI" : "Fewer people on approved AI";
  }
  for (const a of AXES) {
    const next = clamp(axes[a] + delta[a]);
    delta[a] = next - axes[a];
    axes[a] = next;
  }
  const after = Math.round(AXES.reduce((t, a) => t + axes[a] * AXIS_WEIGHT[a], 0));
  // Punteggio di partenza ricalcolato dagli stessi assi, così la differenza è solo lo scenario.
  const before = model.score.score;
  const baseRecalc = Math.round(AXES.reduce((t, a) => t + model.score.axes[a] * AXIS_WEIGHT[a], 0));
  const scoreAfter = before + (after - baseRecalc);

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
    score: { before, after: scoreAfter, grade: gradeOf(scoreAfter), axes, delta, notes },
  };
}
