/**
 * angar Score — "AI spend efficiency" (metodo 2). Modulo PURO: nessun
 * database, nessun React. Lo usano il caricatore (score.ts), il simulatore
 * nel browser e le prove con dati finti.
 *
 * ── Formula ────────────────────────────────────────────────────────────
 * Cinque dimensioni 0..100, ognuna = 100 − penalità (ogni penalità è un
 * "driver" con etichetta e link). Tutto è un RAPPORTO: non si premia mai chi
 * spende meno, solo chi spende meglio.
 *
 *  1. Spend visibility (20%)
 *     − 30 punti divisi tra le fonti mancanti: banca/carte, fatture e, se ci
 *       sono API a consumo, la fatturazione del fornitore (o del cloud);
 *     − 35 × quota degli addebiti AI non attribuiti a un'AI nota;
 *     − 15 × quota della spesa stimata da listino (non vista sugli addebiti);
 *     − 20 × quota della spesa su AI senza responsabile.
 *  2. License utilization (30%)
 *     U = Σ posti attivi × prezzo / Σ posti pagati × prezzo (solo AI a posti
 *     con persone note: "misurate"). Valore misurato Sm = (U − 25%) / 75% × 100
 *     (25% o meno = 0, 100% = 100). Con copertura parziale (quota € delle AI
 *     a posti misurate = c): valore = c × Sm + (1 − c) × min(Sm, 60).
 *  3. Tool efficiency (20%)
 *     − 200 × (spesa doppia sugli strumenti che fanno lo stesso lavoro /
 *     spesa in abbonamenti), al massimo −100. Fonte: risparmi "duplicate".
 *  4. Consumption efficiency (20%) — API e spesa a consumo
 *     − 100 × (risparmio da modelli sovradimensionati / spesa a consumo), max −50;
 *     − 100 × (spesa sopra l'atteso / spesa a consumo), max −50.
 *     Senza dati di consumo NON pesa: i pesi delle altre si rinormalizzano.
 *  5. Savings opportunity (10%)
 *     − 300 × (risparmi trovati pesati per certezza / spesa), max −100
 *     (alta certezza × 1, media × 0,5, bassa × 0,25).
 *
 * ── Dati mancanti (regola unica) ───────────────────────────────────────
 *  - Una dimensione che angar non può misurare vale 60 (UNMEASURED_CAP),
 *    mai di più. Eccezione: il consumo senza dati non pesa affatto, e l'uso
 *    delle licenze non pesa se l'uso è misurato e non ci sono AI a posti.
 *  - Senza dati d'uso (Provisional) il totale non supera 70 (PROVISIONAL_CAP).
 *
 * ── Confidenza ─────────────────────────────────────────────────────────
 *  Provisional (nessun dato d'uso) → Early measurement (uso < 30 giorni) →
 *  Measured (≥ 30 giorni) → High confidence (≥ 60 giorni, persone note su
 *  almeno il 70% dei posti pagati, meno di metà della spesa stimata).
 *
 * ── Driver ─────────────────────────────────────────────────────────────
 *  Punti sul totale = penalità × peso rinormalizzato, arrotondati col metodo
 *  del resto più grande: la somma dei driver è ESATTAMENTE 100 − punteggio.
 *
 * ── Azioni ("Improve my score") ────────────────────────────────────────
 *  Ogni azione è una correzione dei fatti (applyFix): i punti guadagnati
 *  sono punteggio(fatti corretti) − punteggio(fatti), mai stimati a occhio.
 */
import {
  AXES,
  AXIS_WEIGHT,
  AXIS_LABEL,
  UNMEASURED_CAP,
  PROVISIONAL_CAP,
  SCORE_METHOD,
  levelOf,
  LEVEL_LABEL,
  CONFIDENCE_LABEL,
  verdictOf,
  type Axis,
  type Axes,
  type Level,
  type ScoreConfidence,
} from "./score-meta";

export type OpportunityKind = "annual" | "duplicate" | "seats" | "premium" | "model" | "idle" | "alternative";
export type OpportunityConfidence = "HIGH" | "MEDIUM" | "LOW";

/** Un'AI a posti: posti pagati, persone attive negli ultimi 30 giorni, persone note. */
export interface SeatTool {
  assetId: string;
  name: string;
  paidSeats: number;
  activeSeats: number;
  knownPeople: number;
  seatEur: number;
}

/** Un risparmio trovato dal motore dei risparmi (savings.ts), in forma serializzabile. */
export interface Opportunity {
  key: string;
  kind: OpportunityKind;
  title: string;
  detail: string;
  monthlyEur: number;
  confidence: OpportunityConfidence;
  href: string;
  assetIds: string[];
  assetNames: string[];
  /** Costo mensile di ciascuna AI coinvolta (stesso ordine di assetIds). */
  assetMonthlyEur: number[];
  /** Solo doppioni: nome della categoria al plurale ("chat assistants"). */
  label?: string;
  /** Solo doppioni: persone attive su più di uno strumento della categoria (null = non si sa). */
  overlapPeople?: number | null;
  /** Accettato nel registro dei risparmi ma non ancora fatto: conta ancora. */
  inProgress?: boolean;
  /**
   * Quota sommata al totale dei risparmi (computeSavings.counted: tetto sul costo di ogni AI,
   * 0 per quelli già accettati), come il totale delle Opportunities. Assente = monthlyEur.
   */
  countedEur?: number;
}

/** Risparmio di un'opportunità che entra nei totali (senza doppi conteggi sulla stessa AI). */
export const countedOf = (o: Pick<Opportunity, "monthlyEur" | "countedEur">) => o.countedEur ?? o.monthlyEur;

/** Spesa a consumo sopra l'atteso (ultimo addebito vs mediana dei precedenti, o gateway 30 vs 30 giorni). */
export interface GrowthItem {
  key: string;
  assetId: string | null;
  name: string;
  currentEur: number;
  expectedEur: number;
  href: string;
}

/** Fatti già letti dal database: l'unico input del calcolo. Solo dati JSON (vanno anche nel browser). */
export interface ScoreFacts {
  aiCount: number;
  /** Spesa AI mensile nota (tutte le AI tranne quelle non consentite e i server MCP). */
  monthlySpendEur: number;
  costKnown: boolean;
  /** Quota della spesa stimata da listino (0..1). */
  estimatedShare: number;
  estimatedCount: number;
  /** Quota degli addebiti AI (90 giorni) attribuiti a un'AI nota; null = nessun addebito. */
  classifiedShare: number | null;
  unclassifiedCharges: number;
  /** Quota della spesa su AI con un responsabile (0..1). */
  ownedShare: number;
  unownedCount: number;
  sources: {
    bank: boolean;
    invoices: boolean;
    /** Fatturazione del fornitore o del cloud collegata. */
    billing: boolean;
    /** C'è spesa a consumo (API): senza la fatturazione del fornitore non si vede tutta. */
    billingNeeded: boolean;
    /** Dati d'uso (app desktop, account aziendali, estensione, scansione). */
    usage: boolean;
  };
  /** Spesa in abbonamenti (tutto tranne il consumo). */
  subscriptionSpendEur: number;
  seatTools: SeatTool[];
  opportunities: Opportunity[];
  consumption: { measured: boolean; spendEur: number; growth: GrowthItem[] };
  /** Giorni dal primo dato d'uso; null = nessun dato d'uso. */
  usageDays: number | null;
}

export type DimensionStatus = "measured" | "partial" | "unmeasured" | "na";

export interface Driver {
  /** Dimensione; "data" = tetto Provisional (dati d'uso mancanti). */
  axis: Axis | "data";
  label: string;
  /** Punti persi sulla dimensione (negativo, intero). */
  impact: number;
  /** Punti persi sul totale (negativo o 0, intero). La somma di tutti = punteggio − 100. */
  points: number;
  /** Alias di points (compatibilità). */
  scoreImpact: number;
  href: string;
  /** true = manca il dato, non è un problema dell'azienda. */
  missingData?: boolean;
  /** Azione di "Improve my score" che lo sistema, se c'è. */
  actionKey?: string;
}

export interface Dimension {
  axis: Axis;
  label: string;
  /** Valore intero 0..100; null = non misurata e senza peso. */
  value: number | null;
  /** Peso effettivo dopo la rinormalizzazione (0..1). */
  weight: number;
  status: DimensionStatus;
  level: Level | null;
  levelLabel: string;
  drivers: Driver[];
  /** Somma dei punti persi sul totale da questa dimensione (negativo o 0). */
  points: number;
}

export interface ScoreResult {
  method: number;
  score: number;
  level: Level;
  levelLabel: string;
  verdict: string;
  confidence: ScoreConfidence;
  confidenceLabel: string;
  axes: Axes;
  dimensions: Dimension[];
  /** Tutti i driver, dal più pesante. Somma dei points = score − 100. */
  drivers: Driver[];
  /** Punti tolti dal tetto Provisional (0 se non applicato). */
  capPoints: number;
  /** Cosa collegare per misurare di più. */
  gaps: { label: string; href: string }[];
  facts: ScoreFacts;
}

// ── Utilità ────────────────────────────────────────────────────────────

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
export const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");
const eurSeat = (n: number) => "€" + (Number.isInteger(Math.round(n * 100) / 100) ? String(Math.round(n)) : n.toFixed(2));
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Ripartisce `total` punti interi in proporzione ai valori `raw` (resto più
 * grande), così la somma torna esatta.
 */
export function allocate(total: number, raw: number[]): number[] {
  const sum = raw.reduce((s, w) => s + Math.max(0, w), 0);
  if (!sum || total <= 0) return raw.map(() => 0);
  const scaled = raw.map((w) => (Math.max(0, w) / sum) * total);
  const out = scaled.map(Math.floor);
  let left = total - out.reduce((s, n) => s + n, 0);
  const order = scaled.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

/** Penalità grezza di una dimensione (punti 0..100 sulla dimensione, non ancora arrotondati). */
interface Pen {
  label: string;
  pts: number;
  href: string;
  missingData?: boolean;
  actionKey?: string;
}
interface RawDim {
  value: number | null;
  status: DimensionStatus;
  pens: Pen[];
}

const NOT_MEASURED_USAGE = "Usage data is not available yet — install the desktop app or connect accounts";

/** Dimensione non misurabile: vale 60, con un driver che dice cosa collegare. */
const unmeasured = (label: string, href: string): RawDim => ({ value: UNMEASURED_CAP, status: "unmeasured", pens: [{ label, pts: 100 - UNMEASURED_CAP, href, missingData: true }] });

const scaleTo = (pens: Pen[], max: number) => {
  const sum = pens.reduce((s, p) => s + p.pts, 0);
  return sum > max ? pens.map((p) => ({ ...p, pts: (p.pts * max) / sum })) : pens;
};

// ── Dimensioni ─────────────────────────────────────────────────────────

function visibility(f: ScoreFacts): RawDim {
  const pens: Pen[] = [];
  const s = f.sources;
  const kinds = [
    { ok: s.bank, label: "No bank or card data connected", href: "/sources", key: "src:bank" },
    { ok: s.invoices, label: "No invoices connected", href: "/sources", key: "src:invoices" },
    ...(s.billingNeeded ? [{ ok: s.billing, label: "Provider billing not connected for API spend", href: "/connectors", key: "src:billing" }] : []),
  ];
  for (const k of kinds) if (!k.ok) pens.push({ label: k.label, pts: 30 / kinds.length, href: k.href, actionKey: k.key });
  if (!f.costKnown || f.monthlySpendEur <= 0) {
    pens.push({ label: "No AI spend connected yet", pts: 50, href: "/sources", missingData: true });
  } else {
    const cls = f.classifiedShare ?? 1;
    if (cls < 1) pens.push({ label: `${plural(f.unclassifiedCharges, "AI charge")} not matched to an AI`, pts: 35 * (1 - cls), href: "/sources", actionKey: "classify" });
    if (f.estimatedShare > 0)
      pens.push({ label: `${pct(f.estimatedShare)} of spend estimated from list prices`, pts: 15 * f.estimatedShare, href: "/sources", actionKey: "estimates" });
  }
  if (f.ownedShare < 1 && f.unownedCount > 0) pens.push({ label: `${plural(f.unownedCount, "paid AI", "paid AI")} without an owner`, pts: 20 * (1 - f.ownedShare), href: "/governance", actionKey: "owners" });
  return { value: clamp(100 - pens.reduce((t, p) => t + p.pts, 0)), status: "measured", pens };
}

/** Copertura dei posti: quota € delle AI a posti con persone note. */
function seatCoverage(f: ScoreFacts) {
  const tools = f.seatTools.filter((t) => t.paidSeats > 0 && t.seatEur > 0);
  const total = tools.reduce((s, t) => s + t.paidSeats * t.seatEur, 0);
  const measured = tools.filter((t) => t.knownPeople > 0);
  const mEur = measured.reduce((s, t) => s + t.paidSeats * t.seatEur, 0);
  // Posti con una persona nota (per "usage across most seats").
  const seatsAll = tools.reduce((s, t) => s + t.paidSeats, 0);
  const seatsKnown = tools.reduce((s, t) => s + Math.min(t.knownPeople, t.paidSeats), 0);
  return { tools, measured, total, mEur, cov: total > 0 ? mEur / total : 0, seatShare: seatsAll > 0 ? seatsKnown / seatsAll : 1 };
}

function utilization(f: ScoreFacts): RawDim {
  const { tools, measured, mEur, cov } = seatCoverage(f);
  if (!tools.length) {
    // Uso misurato e nessuna AI a posti (solo API o piani senza posti noti): non si applica.
    if (f.sources.usage || f.subscriptionSpendEur <= 0) return { value: null, status: "na", pens: [] };
    return unmeasured(NOT_MEASURED_USAGE, "/download");
  }
  if (!measured.length) return unmeasured(NOT_MEASURED_USAGE, "/download");
  const idleEur = (t: SeatTool) => Math.max(0, t.paidSeats - Math.min(t.activeSeats, t.paidSeats)) * t.seatEur;
  const used = measured.reduce((s, t) => s + Math.min(t.activeSeats, t.paidSeats) * t.seatEur, 0);
  const U = mEur > 0 ? used / mEur : 1;
  const sm = clamp(((U - 0.25) / 0.75) * 100);
  const value = cov * sm + (1 - cov) * Math.min(sm, UNMEASURED_CAP);
  const pens: Pen[] = [];
  const lost = cov * (100 - sm);
  const idle = measured.filter((t) => idleEur(t) > 0);
  const totIdle = idle.reduce((s, t) => s + idleEur(t), 0);
  for (const t of idle) {
    const n = t.paidSeats - Math.min(t.activeSeats, t.paidSeats);
    pens.push({ label: `${plural(n, `inactive ${t.name} seat`)} of ${t.paidSeats}`, pts: totIdle > 0 ? (lost * idleEur(t)) / totIdle : 0, href: `/assets/${t.assetId}?tab=people`, actionKey: `seats:${t.assetId}` });
  }
  const unm = (1 - cov) * (100 - Math.min(sm, UNMEASURED_CAP));
  if (unm > 0) {
    const n = tools.length - measured.length;
    pens.push({ label: `Incomplete usage data: ${plural(n, "paid tool")} not measured yet`, pts: unm, href: "/download", missingData: true });
  }
  return { value, status: cov >= 1 ? "measured" : "partial", pens };
}

function toolEfficiency(f: ScoreFacts): RawDim {
  if (!f.costKnown || f.monthlySpendEur <= 0) return unmeasured("Add costs to find tools paid twice", "/sources");
  const base = f.subscriptionSpendEur > 0 ? f.subscriptionSpendEur : f.monthlySpendEur;
  const dups = f.opportunities.filter((o) => o.kind === "duplicate" && o.monthlyEur > 0);
  const pens = dups.map((o) => ({
    label: `${o.assetIds.length} ${o.label ?? "tools"} that do the same job${o.overlapPeople ? ` · ${plural(o.overlapPeople, "person uses", "people use")} more than one` : ""}`,
    pts: (o.monthlyEur / base) * 200,
    href: o.href,
    actionKey: `opp:${o.key}`,
  }));
  const scaled = scaleTo(pens, 100);
  return { value: clamp(100 - scaled.reduce((t, p) => t + p.pts, 0)), status: "measured", pens: scaled };
}

function consumptionEff(f: ScoreFacts): RawDim {
  const c = f.consumption;
  if (!c.measured || c.spendEur <= 0) return { value: null, status: "na", pens: [] };
  const models = f.opportunities.filter((o) => o.kind === "model" && o.monthlyEur > 0);
  const mPens = scaleTo(
    models.map((o) => ({ label: `${o.assetNames[0] ?? "API"}: model bigger than needed for simple requests`, pts: (o.monthlyEur / c.spendEur) * 100, href: o.href, actionKey: `opp:${o.key}` })),
    50
  );
  const gPens = scaleTo(
    c.growth
      .filter((g) => g.currentEur > g.expectedEur)
      .map((g) => ({
        label: `${g.name} spend ${pct(g.currentEur / Math.max(1, g.expectedEur) - 1)} above expected`,
        pts: ((g.currentEur - g.expectedEur) / c.spendEur) * 100,
        href: g.href,
        actionKey: `growth:${g.key}`,
      })),
    50
  );
  const pens = [...mPens, ...gPens];
  return { value: clamp(100 - pens.reduce((t, p) => t + p.pts, 0)), status: "measured", pens };
}

export const CERTAINTY_WEIGHT: Record<OpportunityConfidence, number> = { HIGH: 1, MEDIUM: 0.5, LOW: 0.25 };
const CERTAINTY_WORD: Record<OpportunityConfidence, string> = { HIGH: "high-confidence", MEDIUM: "medium-confidence", LOW: "low-confidence" };

function savingsOpp(f: ScoreFacts): RawDim {
  if (!f.costKnown || f.monthlySpendEur <= 0) return unmeasured("Add costs to find savings", "/sources");
  const pens: Pen[] = [];
  for (const c of ["HIGH", "MEDIUM", "LOW"] as OpportunityConfidence[]) {
    // Stessa quota "counted" del totale delle Opportunities: niente somma oltre il costo dell'AI.
    const e = f.opportunities.filter((o) => o.confidence === c).reduce((t, o) => t + countedOf(o), 0);
    if (e >= 1) pens.push({ label: `${eur(e)} a month of ${CERTAINTY_WORD[c]} savings found`, pts: ((e * CERTAINTY_WEIGHT[c]) / f.monthlySpendEur) * 300, href: "/opportunities" });
  }
  const scaled = scaleTo(pens, 100);
  return { value: clamp(100 - scaled.reduce((t, p) => t + p.pts, 0)), status: "measured", pens: scaled };
}

// ── Confidenza ─────────────────────────────────────────────────────────

export function confidenceOf(f: ScoreFacts): ScoreConfidence {
  if (f.usageDays == null || !f.sources.usage) return "provisional";
  if (f.usageDays < 30) return "early";
  const { seatShare } = seatCoverage(f);
  if (f.usageDays >= 60 && seatShare >= 0.7 && f.estimatedShare < 0.5 && f.costKnown) return "high";
  return "measured";
}

// ── Calcolo ────────────────────────────────────────────────────────────

/** Il calcolo intero, dai fatti al punteggio. Pura: stessi fatti, stesso risultato. */
export function scoreFromFacts(f: ScoreFacts): ScoreResult {
  const raw: Record<Axis, RawDim> = {
    visibility: visibility(f),
    utilization: utilization(f),
    tools: toolEfficiency(f),
    consumption: consumptionEff(f),
    savings: savingsOpp(f),
  };
  const active = AXES.filter((a) => raw[a].value != null);
  const wsum = active.reduce((s, a) => s + AXIS_WEIGHT[a], 0) || 1;
  const w = (a: Axis) => (raw[a].value != null ? AXIS_WEIGHT[a] / wsum : 0);
  let exact = active.reduce((s, a) => s + w(a) * (raw[a].value as number), 0);

  const confidence = confidenceOf(f);
  let capExact = 0;
  if (confidence === "provisional" && exact > PROVISIONAL_CAP) {
    capExact = exact - PROVISIONAL_CAP;
    exact = PROVISIONAL_CAP;
  }
  const score = Math.round(clamp(exact));

  // Driver: punti sul totale ripartiti col resto più grande, somma esatta = 100 − score.
  const flat = AXES.flatMap((a) => raw[a].pens.map((p) => ({ a, p, exact: p.pts * w(a) })));
  const pieces = [...flat.map((x) => x.exact), capExact];
  const ints = allocate(100 - score, pieces);

  // Impatto sulla dimensione: interi che sommano a 100 − valore arrotondato.
  const dimensions: Dimension[] = AXES.map((a) => {
    const d = raw[a];
    const value = d.value == null ? null : Math.round(d.value);
    const own = flat.map((x, i) => ({ ...x, i })).filter((x) => x.a === a);
    const imp = value == null ? own.map(() => 0) : allocate(100 - value, own.map((x) => x.p.pts));
    const drivers: Driver[] = own
      .map((x, k) => ({
        axis: a,
        label: x.p.label,
        impact: -imp[k],
        points: -ints[x.i],
        scoreImpact: -ints[x.i],
        href: x.p.href,
        ...(x.p.missingData ? { missingData: true } : {}),
        ...(x.p.actionKey ? { actionKey: x.p.actionKey } : {}),
      }))
      .filter((d) => d.impact < 0 || d.points < 0);
    const level = value == null || d.status === "unmeasured" ? null : levelOf(value);
    return {
      axis: a,
      label: AXIS_LABEL[a],
      value,
      weight: Math.round(w(a) * 1000) / 1000,
      status: d.status,
      level,
      levelLabel: level ? LEVEL_LABEL[level] : "Not measured yet",
      drivers,
      points: drivers.reduce((t, x) => t + x.points, 0),
    };
  });
  const capPoints = ints[ints.length - 1];
  const drivers: Driver[] = dimensions.flatMap((d) => d.drivers);
  if (capPoints > 0)
    drivers.push({ axis: "data", label: "Provisional: capped at 70 until usage is measured", impact: 0, points: -capPoints, scoreImpact: -capPoints, href: "/download", missingData: true });
  drivers.sort((x, y) => x.points - y.points || x.impact - y.impact);

  const gaps: ScoreResult["gaps"] = [];
  if (!f.sources.usage) gaps.push({ label: "Install the desktop app", href: "/download" });
  if (!f.sources.usage) gaps.push({ label: "Connect company accounts", href: "/connect" });
  if (!f.sources.bank) gaps.push({ label: "Add a bank or card statement", href: "/sources" });
  if (!f.sources.invoices) gaps.push({ label: "Add invoices", href: "/sources" });
  if (f.sources.billingNeeded && !f.sources.billing) gaps.push({ label: "Connect provider billing", href: "/connectors" });

  const level = levelOf(score);
  return {
    method: SCORE_METHOD,
    score,
    level,
    levelLabel: LEVEL_LABEL[level],
    verdict: verdictOf(score, confidence),
    confidence,
    confidenceLabel: CONFIDENCE_LABEL[confidence],
    axes: Object.fromEntries(dimensions.map((d) => [d.axis, d.status === "na" ? null : d.value])) as Axes,
    dimensions,
    drivers,
    capPoints,
    gaps,
    facts: f,
  };
}

// ── Correzioni e azioni ────────────────────────────────────────────────

export type Fix =
  | { type: "seats"; assetId: string }
  | { type: "opportunity"; key: string }
  | { type: "growth"; key: string }
  | { type: "owners" }
  | { type: "classify" }
  | { type: "estimates" }
  | { type: "source"; source: "bank" | "invoices" | "billing" };

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Fatti con la correzione applicata (copia: l'originale non cambia). */
export function applyFix(facts: ScoreFacts, fix: Fix): ScoreFacts {
  const f = clone(facts);
  const lower = (eurCut: number, consumption = false) => {
    const cut = Math.max(0, eurCut);
    f.monthlySpendEur = Math.max(0, f.monthlySpendEur - cut);
    if (consumption) f.consumption.spendEur = Math.max(0, f.consumption.spendEur - cut);
    else f.subscriptionSpendEur = Math.max(0, f.subscriptionSpendEur - cut);
  };
  const fixSeats = (assetId: string) => {
    const t = f.seatTools.find((x) => x.assetId === assetId);
    if (!t) return;
    const keep = Math.min(t.activeSeats, t.paidSeats);
    lower((t.paidSeats - keep) * t.seatEur);
    t.paidSeats = keep;
    f.seatTools = f.seatTools.filter((x) => x.paidSeats > 0);
    f.opportunities = f.opportunities.filter((o) => !(o.kind === "seats" && o.assetIds[0] === assetId));
  };
  switch (fix.type) {
    case "seats":
      fixSeats(fix.assetId);
      break;
    case "opportunity": {
      const o = f.opportunities.find((x) => x.key === fix.key);
      if (!o) break;
      if (o.kind === "seats") {
        fixSeats(o.assetIds[0]);
        break;
      }
      f.opportunities = f.opportunities.filter((x) => x.key !== fix.key);
      lower(o.monthlyEur, o.kind === "model");
      // AI tolte (doppione o mai usata): spariscono anche i loro posti.
      const gone = o.kind === "duplicate" ? o.assetIds.slice(1) : o.kind === "idle" ? o.assetIds.slice(0, 1) : [];
      if (gone.length) {
        // Doppione: chi usava gli strumenti tolti passa a quello tenuto (senza contare due volte chi li usava entrambi).
        if (o.kind === "duplicate") {
          const keeper = f.seatTools.find((t) => t.assetId === o.assetIds[0]);
          const moved = Math.max(0, f.seatTools.filter((t) => gone.includes(t.assetId)).reduce((n, t) => n + Math.min(t.activeSeats, t.paidSeats), 0) - (o.overlapPeople ?? 0));
          if (keeper && keeper.knownPeople > 0) keeper.activeSeats = Math.min(keeper.paidSeats, keeper.activeSeats + moved);
        }
        f.seatTools = f.seatTools.filter((t) => !gone.includes(t.assetId));
        f.opportunities = f.opportunities.filter((x) => x.kind === "duplicate" || !gone.includes(x.assetIds[0]));
      }
      break;
    }
    case "growth": {
      const g = f.consumption.growth.find((x) => x.key === fix.key);
      if (!g) break;
      f.consumption.growth = f.consumption.growth.filter((x) => x.key !== fix.key);
      lower(Math.min(g.currentEur - g.expectedEur, f.consumption.spendEur), true);
      break;
    }
    case "owners":
      f.ownedShare = 1;
      f.unownedCount = 0;
      break;
    case "classify":
      if (f.classifiedShare != null) f.classifiedShare = 1;
      f.unclassifiedCharges = 0;
      break;
    case "estimates":
      f.estimatedShare = 0;
      f.estimatedCount = 0;
      break;
    case "source":
      f.sources[fix.source] = true;
      break;
  }
  return f;
}

export type ActionCertainty = "high" | "medium" | "investigate";
export const CERTAINTY_LABEL: Record<ActionCertainty, string> = { high: "High", medium: "Medium", investigate: "Investigation required" };
const RANK_WEIGHT: Record<ActionCertainty, number> = { high: 1, medium: 0.6, investigate: 0.3 };

export interface ScoreAction {
  key: string;
  axis: Axis;
  title: string;
  detail: string;
  /** Punti guadagnati: punteggio con la correzione − punteggio di oggi. */
  points: number;
  /** Risparmio mensile (null = azione sui dati, senza euro). */
  monthlyEur: number | null;
  /** Base del calcolo, visibile ("35 seats × €25 → 21 seats × €25 = €350 a month"). */
  basis: string | null;
  certainty: ActionCertainty;
  href: string;
  cta: string;
  inProgress: boolean;
  fix: Fix;
  /** Ordinamento: certezza × (punti + 1) × (1 + risparmio / €100). */
  rank: number;
}

export interface ActionPlan {
  actions: ScoreAction[];
  best: ScoreAction | null;
  /** Punteggio con tutte le azioni applicate insieme. */
  potential: number;
  potentialSavingsEur: number;
}

const CONF_TO_CERTAINTY: Record<OpportunityConfidence, ActionCertainty> = { HIGH: "high", MEDIUM: "medium", LOW: "investigate" };

/** Elenco deterministico delle azioni, ciascuna con i punti ricalcolati. */
export function scoreActions(facts: ScoreFacts, base: ScoreResult = scoreFromFacts(facts)): ActionPlan {
  type Draft = Omit<ScoreAction, "points" | "rank">;
  const drafts: Draft[] = [];
  const early = base.confidence === "early" || base.confidence === "provisional";
  const axisOf = (k: OpportunityKind): Axis => (k === "duplicate" ? "tools" : k === "model" ? "consumption" : k === "seats" ? "utilization" : "savings");

  // 1. Posti inattivi (solo AI misurate).
  const seatAssets = new Set<string>();
  for (const t of facts.seatTools) {
    const keep = Math.min(t.activeSeats, t.paidSeats);
    const n = t.paidSeats - keep;
    if (t.knownPeople <= 0 || n <= 0) continue;
    seatAssets.add(t.assetId);
    const save = n * t.seatEur;
    const inProg = facts.opportunities.some((o) => o.kind === "seats" && o.assetIds[0] === t.assetId && o.inProgress);
    drafts.push({
      key: `seats:${t.assetId}`,
      axis: "utilization",
      title: `Remove ${plural(n, `inactive ${t.name} seat`)}`,
      detail: `${t.paidSeats} paid, ${keep} active in the last 30 days, ${n} inactive.`,
      monthlyEur: save,
      basis: `${t.paidSeats} seats × ${eurSeat(t.seatEur)} → ${keep} seats × ${eurSeat(t.seatEur)} = ${eur(save)} a month`,
      certainty: early ? "medium" : "high",
      href: inProg ? "/opportunities?view=progress" : `/assets/${t.assetId}?tab=people`,
      cta: inProg ? "See progress" : "Review seats",
      inProgress: inProg,
      fix: { type: "seats", assetId: t.assetId },
    });
  }

  // 2. Risparmi trovati (doppioni, annuale, piani, modelli, AI mai usate, alternative).
  for (const o of facts.opportunities) {
    if (o.kind === "seats" && seatAssets.has(o.assetIds[0])) continue;
    if (o.monthlyEur < 1) continue;
    let basis: string;
    if (o.kind === "duplicate") {
      const drop = o.assetNames.slice(1).map((n, i) => `${n} ${eur(o.assetMonthlyEur[i + 1] ?? 0)}`);
      basis = `Keep ${o.assetNames[0]}; cancel ${drop.join(" + ")} = ${eur(o.monthlyEur)} a month`;
    } else if (o.kind === "annual" && o.assetMonthlyEur[0]) {
      basis = `${eur(o.assetMonthlyEur[0])} a month billed monthly × ${pct(o.monthlyEur / o.assetMonthlyEur[0])} yearly discount = ${eur(o.monthlyEur)} a month`;
    } else if (o.kind === "idle" && o.assetMonthlyEur[0]) {
      basis = `${eur(o.assetMonthlyEur[0])} a month, no use seen = ${eur(o.monthlyEur)} a month`;
    } else if (o.assetMonthlyEur[0]) {
      basis = `${eur(o.assetMonthlyEur[0])} a month today → ${eur(Math.max(0, o.assetMonthlyEur[0] - o.monthlyEur))} a month = ${eur(o.monthlyEur)} a month`;
    } else basis = `${eur(o.monthlyEur)} a month`;
    drafts.push({
      key: `opp:${o.key}`,
      axis: axisOf(o.kind),
      title: o.kind === "duplicate" ? `Consolidate ${o.label ?? "overlapping tools"}: keep ${o.assetNames[0]}` : o.title,
      detail: o.detail,
      monthlyEur: o.monthlyEur,
      basis,
      certainty: CONF_TO_CERTAINTY[o.confidence],
      href: o.inProgress ? "/opportunities?view=progress" : o.href,
      cta: o.inProgress ? "See progress" : o.confidence === "LOW" ? "Investigate" : "Review",
      inProgress: !!o.inProgress,
      fix: { type: "opportunity", key: o.key },
    });
  }

  // 3. Spesa a consumo sopra l'atteso: da verificare.
  for (const g of facts.consumption.growth) {
    const extra = g.currentEur - g.expectedEur;
    if (extra < 1) continue;
    drafts.push({
      key: `growth:${g.key}`,
      axis: "consumption",
      title: `Investigate ${g.name} spend: +${pct(g.currentEur / Math.max(1, g.expectedEur) - 1)}`,
      detail: `${eur(g.currentEur)} now vs ${eur(g.expectedEur)} expected from the previous months.`,
      monthlyEur: extra,
      basis: `${eur(g.currentEur)} now − ${eur(g.expectedEur)} expected = ${eur(extra)} a month`,
      certainty: "investigate",
      href: g.href,
      cta: "Investigate",
      inProgress: false,
      fix: { type: "growth", key: g.key },
    });
  }

  // 4. Visibilità della spesa (nessun euro: solo punti).
  if (facts.unownedCount > 0 && facts.ownedShare < 1)
    drafts.push({ key: "owners", axis: "visibility", title: `Assign an owner to ${plural(facts.unownedCount, "paid AI", "paid AI")}`, detail: "Every paid AI with someone who answers for its cost.", monthlyEur: null, basis: null, certainty: "high", href: "/governance", cta: "Assign owners", inProgress: false, fix: { type: "owners" } });
  if (facts.classifiedShare != null && facts.classifiedShare < 1 && facts.unclassifiedCharges > 0)
    drafts.push({ key: "classify", axis: "visibility", title: `Match ${plural(facts.unclassifiedCharges, "AI charge")} to an AI`, detail: "Charges angar found but couldn't attribute to a known AI.", monthlyEur: null, basis: null, certainty: "high", href: "/sources", cta: "Review charges", inProgress: false, fix: { type: "classify" } });
  if (facts.estimatedShare >= 0.05 && facts.costKnown)
    drafts.push({ key: "estimates", axis: "visibility", title: `Add real costs for ${plural(facts.estimatedCount, "AI", "AI")} estimated from list prices`, detail: "A bank statement or invoice replaces the estimate.", monthlyEur: null, basis: null, certainty: "high", href: "/sources", cta: "Add costs", inProgress: false, fix: { type: "estimates" } });
  const s = facts.sources;
  if (!s.bank) drafts.push({ key: "src:bank", axis: "visibility", title: "Connect bank or card data", detail: "See every AI charge, including expensed ones.", monthlyEur: null, basis: null, certainty: "high", href: "/sources", cta: "Connect", inProgress: false, fix: { type: "source", source: "bank" } });
  if (!s.invoices) drafts.push({ key: "src:invoices", axis: "visibility", title: "Add invoices", detail: "Invoices attribute charges to plans and seats.", monthlyEur: null, basis: null, certainty: "high", href: "/sources", cta: "Add invoices", inProgress: false, fix: { type: "source", source: "invoices" } });
  if (s.billingNeeded && !s.billing) drafts.push({ key: "src:billing", axis: "visibility", title: "Connect provider billing for API spend", detail: "OpenAI, Anthropic, Azure, AWS or Google billing shows usage-based spend.", monthlyEur: null, basis: null, certainty: "high", href: "/connectors", cta: "Connect", inProgress: false, fix: { type: "source", source: "billing" } });

  const actions: ScoreAction[] = drafts
    .map((d) => {
      const points = scoreFromFacts(applyFix(facts, d.fix)).score - base.score;
      const rank = RANK_WEIGHT[d.certainty] * (Math.max(0, points) + 1) * (1 + (d.monthlyEur ?? 0) / 100);
      return { ...d, points, rank: Math.round(rank * 1000) / 1000 };
    })
    .filter((a) => a.points >= 1 || (a.monthlyEur ?? 0) >= 1)
    .sort((a, b) => b.rank - a.rank || b.points - a.points || a.key.localeCompare(b.key));

  // Tutte insieme: i punti non sono una semplice somma (pesi, tetti, rapporti).
  let all = facts;
  for (const a of actions) all = applyFix(all, a.fix);
  const potential = actions.length ? Math.max(base.score, scoreFromFacts(all).score) : base.score;
  const best = actions.find((a) => !a.inProgress && (a.points > 0 || (a.monthlyEur ?? 0) > 0)) ?? null;
  // Risparmi senza doppi conteggi: stessa AI, al massimo il suo costo (come savings.ts) — qui basta la differenza di spesa.
  const potentialSavingsEur = Math.max(0, facts.monthlySpendEur - all.monthlySpendEur);
  return { actions, best, potential, potentialSavingsEur };
}

/** Il primo modo per migliorare (compatibilità con chi voleva il "top driver"). */
export function topImprovement(r: ScoreResult): Driver | null {
  return r.drivers.filter((d) => d.points < 0 && !d.missingData)[0] ?? null;
}
