// Livelli dell'Angar Score (e dei suoi assi): solo i colori di stato — rosso, ambra, verde (l'arancio è del pulsante principale).
// Classi scritte per intero perché Tailwind le trovi.
export type Level = "weak" | "fair" | "good" | "strong";

export function levelOf(v: number): Level {
  return v >= 80 ? "strong" : v >= 60 ? "good" : v >= 40 ? "fair" : "weak";
}

export const LEVEL: Record<Level, { label: string; text: string; pill: string; dot: string; fill: string; hex: string; hexLight: string }> = {
  weak: { label: "Weak", text: "text-alarm", pill: "text-alarm bg-alarm/10", dot: "bg-alarm", fill: "bg-alarm/35", hex: "rgb(var(--c-alarm))", hexLight: "rgb(var(--c-alarm) / 0.55)" },
  fair: { label: "Fair", text: "text-signal", pill: "text-signal bg-signal/10", dot: "bg-signal", fill: "bg-signal/35", hex: "rgb(var(--c-signal))", hexLight: "rgb(var(--c-signal) / 0.6)" },
  good: { label: "Good", text: "text-steady", pill: "text-steady bg-steady/10", dot: "bg-steady", fill: "bg-steady/35", hex: "rgb(var(--c-steady))", hexLight: "rgb(var(--c-steady) / 0.6)" },
  strong: { label: "Strong", text: "text-steady", pill: "text-steady bg-steady/10", dot: "bg-steady", fill: "bg-steady/35", hex: "rgb(var(--c-steady))", hexLight: "rgb(var(--c-steady) / 0.6)" },
};
