// Un'unica palette per tutti i grafici: famiglia dell'arancio di brand
// (stessi valori dell'accento in tailwind.config.ts).
export const CHART_COLORS = ["#FF6A13", "#FFA36B", "#FFD2B3", "#B8420A", "#B9B4AE", "#E0550A"];

// Rischio: stessa famiglia, intensità crescente — chiaro = basso, scuro = critico.
export const RISK_CHART_COLORS: Record<string, string> = {
  LOW: "#FFD2B3",
  MEDIUM: "#FFA36B",
  HIGH: "#FF6A13",
  CRITICAL: "#B8420A",
};
