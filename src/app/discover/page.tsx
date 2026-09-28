import { redirect } from "next/navigation";

// "Find AI automatically" è ora l'area Desktop app (/download); estensione, scansione,
// log di rete ed Edge sono nella scheda "Other ways". I parametri (es. ?error=) passano.
export default function DiscoverPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const qs = new URLSearchParams({ view: "other" });
  for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && k !== "view") qs.set(k, v);
  redirect(`/download?${qs}`);
}
