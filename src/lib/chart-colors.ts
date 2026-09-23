// Un'unica palette per tutti i grafici: famiglia dell'arancio Exein
// (stesso valore dell'accento in tailwind.config.ts).
export const CHART_COLORS = ["#FF7323", "#FFA878", "#FFD5BD", "#B84A10", "#B9B4AE", "#E85E10"];

// Rischio: stessa famiglia, intensità crescente — chiaro = basso, scuro = critico.
export const RISK_CHART_COLORS: Record<string, string> = {
  LOW: "#FFD5BD",
  MEDIUM: "#FFA878",
  HIGH: "#FF7323",
  CRITICAL: "#B84A10",
};
