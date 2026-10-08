import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// /savings è diventato Opportunities: stesse schede (Suggestions → All, In progress, Contracts,
// Subscriptions, Autopilot). I vecchi link e i segnalibri continuano a funzionare.
export default function SavingsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val == null || val === "") continue;
    if (k === "view" && val === "suggestions") continue;
    // Vecchio filtro per tipo di risparmio → categoria.
    if (k === "kind") {
      const cat = val === "duplicate" ? "CONSOLIDATE" : val === "idle" ? "REMOVE" : val === "model" || val === "alternative" ? "SWITCH" : "SAVE";
      q.set("cat", cat);
      continue;
    }
    if (k === "confidence") continue;
    q.set(k, val);
  }
  redirect(`/opportunities${q.toString() ? `?${q}` : ""}`);
}
