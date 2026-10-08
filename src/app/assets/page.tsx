import { redirect } from "next/navigation";

// La lista delle AI vive in AI Estate (/estate, stessi filtri): un solo salto, i parametri restano.
export default function AssetsPage({ searchParams }: { searchParams: Record<string, string> }) {
  const qs = new URLSearchParams(searchParams).toString();
  redirect(qs ? `/estate?${qs}` : "/estate");
}
