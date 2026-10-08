import { redirect } from "next/navigation";

// Il dettaglio di un'AI ora è /estate/[id]: redirect per non rompere link e segnalibri (i parametri restano).
export default function AssetRedirectPage({ params, searchParams }: { params: { id: string }; searchParams: Record<string, string> }) {
  const qs = new URLSearchParams(searchParams).toString();
  redirect(`/estate/${encodeURIComponent(params.id)}${qs ? `?${qs}` : ""}`);
}
