// Un'unica palette per tutti i grafici della piattaforma (Home, AI
// Passports, Providers…), così la stessa torta ha gli stessi colori ovunque.
export const CHART_COLORS = ["#3D3FD9", "#8B8CF0", "#C7C8F8", "#1E1F8A", "#A5A6B4", "#5E60E6"];

// Rischio: stessa famiglia, intensità crescente — chiaro = basso, scuro = critico.
export const RISK_CHART_COLORS: Record<string, string> = {
  LOW: "#C7C8F8",
  MEDIUM: "#8B8CF0",
  HIGH: "#3D3FD9",
  CRITICAL: "#1E1F8A",
};
