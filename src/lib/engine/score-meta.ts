/**
 * Angar Score — costanti, livelli ed etichette, senza database: si possono
 * importare anche dai componenti client (ScoreCard, simulatore).
 *
 * Metodo 2 (ottobre 2026): "AI spend efficiency", 5 dimensioni.
 */
export type Axis = "visibility" | "utilization" | "tools" | "consumption" | "savings";
/** Valore di ogni dimensione (0..100); null = non misurata e senza peso (solo consumo). */
export type Axes = Record<Axis, number | null>;
export type Level = "weak" | "fair" | "good" | "strong";
/** Disponibilità dei dati: dice quanto fidarsi del punteggio. */
export type ScoreConfidence = "provisional" | "early" | "measured" | "high";

/** Versione del metodo salvata nelle fotografie (EngineSnapshot.axes.v). */
export const SCORE_METHOD = 2;

export const AXES: Axis[] = ["visibility", "utilization", "tools", "consumption", "savings"];
export const AXIS_WEIGHT: Record<Axis, number> = { visibility: 0.2, utilization: 0.3, tools: 0.2, consumption: 0.2, savings: 0.1 };
export const AXIS_LABEL: Record<Axis, string> = {
  visibility: "Spend visibility",
  utilization: "License utilization",
  tools: "Tool efficiency",
  consumption: "Consumption efficiency",
  savings: "Savings opportunity",
};
export const AXIS_HINT: Record<Axis, string> = {
  visibility: "How much of your AI spend angar sees and attributes",
  utilization: "Paid seats that people really use",
  tools: "Tools that do the same job, paid twice",
  consumption: "API and usage-based spend: models, growth, forecast",
  savings: "Savings found, as a share of spend",
};

/** Valore di una dimensione che angar non può misurare: mai più di questo (niente punti regalati). */
export const UNMEASURED_CAP = 60;
/** Tetto del punteggio finché non ci sono dati d'uso (Provisional). */
export const PROVISIONAL_CAP = 70;

/** Livelli più esigenti dei vecchi assi: 90+ Excellent, 80+ Good, 70+ Fair, sotto Needs attention. */
export function levelOf(v: number): Level {
  return v >= 90 ? "strong" : v >= 80 ? "good" : v >= 70 ? "fair" : "weak";
}

export const LEVEL_LABEL: Record<Level, string> = { strong: "Excellent", good: "Good", fair: "Fair", weak: "Needs attention" };

/**
 * Pillole e punti dei livelli: solo pillole e punti sono colorati, le barre restano grigie.
 * Niente arancio (#FF7323): l'accento è riservato al pulsante principale della pagina.
 * Classi scritte per intero perché Tailwind le trovi.
 */
export const LEVEL_STYLE: Record<Level | "none", { pill: string; dot: string }> = {
  strong: { pill: "text-steady bg-steady/10", dot: "bg-steady" },
  good: { pill: "text-steady bg-steady/10", dot: "bg-steady" },
  fair: { pill: "text-signal bg-signal/10", dot: "bg-signal" },
  weak: { pill: "text-alarm bg-alarm/10", dot: "bg-alarm" },
  none: { pill: "text-ink-400 bg-ink-100/[0.06]", dot: "bg-ink-400" },
};

export const CONFIDENCE_LABEL: Record<ScoreConfidence, string> = {
  provisional: "Provisional",
  early: "Early measurement",
  measured: "Measured",
  high: "High confidence",
};

export const CONFIDENCE_TEXT: Record<ScoreConfidence, string> = {
  provisional: "Spend only: usage data is not available yet — install the desktop app or connect accounts.",
  early: "Usage measured for less than 30 days.",
  measured: "Usage measured for 30 days or more.",
  high: "60+ days of usage across most paid seats, on real costs.",
};

/** Frase sotto il numero, dal livello (la parte sui risparmi la aggiunge chi la mostra). */
export function verdictOf(score: number, confidence: ScoreConfidence): string {
  const lv = levelOf(score);
  const base =
    lv === "strong" ? "Your AI spend is highly efficient." : lv === "good" ? "Your AI spend is well optimized." : lv === "fair" ? "Your AI spend has clear room to improve." : "Much of your AI spend needs attention.";
  return confidence === "provisional" ? `${base.slice(0, -1)}, based on spend only.` : base;
}
