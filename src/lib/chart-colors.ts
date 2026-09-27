// Un'unica palette per tutti i grafici: famiglia dell'arancio Exein
// (stesso valore dell'accento in tailwind.config.ts).
export const CHART_COLORS = ["#FF7323", "#FFA878", "#FFD5BD", "#B84A10", "#B9B4AE", "#E85E10"];

// Rischio: stessa semantica di RiskGauge e Badge (variabili CSS del tema,
// valide sia in stroke SVG sia in style inline): verde = basso, ambra = medio,
// rosso = alto (tenue) / critico (pieno).
export const RISK_CHART_COLORS: Record<string, string> = {
  LOW: "rgb(var(--c-steady))",
  MEDIUM: "rgb(var(--c-signal))",
  HIGH: "rgb(var(--c-alarm) / 0.65)",
  CRITICAL: "rgb(var(--c-alarm))",
};
