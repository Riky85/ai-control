/**
 * angar Score — costanti e voto, senza database: si possono importare anche
 * dai componenti client (ScoreCard, ScoreRing).
 */
export type Axis = "efficiency" | "governance" | "risk" | "adoption";
export type Grade = "A" | "B" | "C" | "D" | "E";
export type ScoreConfidence = "low" | "medium" | "high";
export type Axes = Record<Axis, number>;

export const AXES: Axis[] = ["efficiency", "governance", "risk", "adoption"];
export const AXIS_WEIGHT: Axes = { efficiency: 0.3, governance: 0.25, risk: 0.25, adoption: 0.2 };
export const AXIS_LABEL: Record<Axis, string> = { efficiency: "Efficiency", governance: "Governance", risk: "Risk", adoption: "Adoption" };
/** Valore di un asse senza dati: né premio né castigo. */
export const NEUTRAL = 50;

export function gradeOf(score: number): Grade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "E";
}

export const GRADE_VERDICT: Record<Grade, string> = {
  A: "Lean, governed and well adopted.",
  B: "In good shape, with a few gaps to close.",
  C: "A solid base with clear room to improve.",
  D: "Real gaps in cost and control.",
  E: "AI is running without control.",
};
