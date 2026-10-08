import { redirect } from "next/navigation";

// "Find AI automatically": estensione, scansione, log di rete ed Edge sono ora in Connect → /connect/other.
// I parametri (es. ?error=) passano.
export default function DiscoverPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && k !== "view") qs.set(k, v);
  redirect(qs.toString() ? `/connect/other?${qs}` : "/connect/other");
}
