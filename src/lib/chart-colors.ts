// Un'unica palette per tutti i grafici (Home, AI Passports, Providers…):
// famiglia arancio Claude, così la stessa torta ha gli stessi colori ovunque.
export const CHART_COLORS = ["#D97757", "#EBA98E", "#F5D3C5", "#A2492C", "#B9B4AE", "#C8795C"];

// Rischio: stessa famiglia, intensità crescente — chiaro = basso, scuro = critico.
export const RISK_CHART_COLORS: Record<string, string> = {
  LOW: "#F5D3C5",
  MEDIUM: "#EBA98E",
  HIGH: "#D97757",
  CRITICAL: "#A2492C",
};
