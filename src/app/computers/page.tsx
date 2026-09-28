import { redirect } from "next/navigation";

// I computer collegati ora sono una scheda dell'area Desktop app (/download).
export default function ComputersPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const qs = new URLSearchParams({ view: "computers" });
  for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && k !== "view") qs.set(k, v);
  redirect(`/download?${qs}`);
}
