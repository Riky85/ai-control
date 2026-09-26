import { redirect } from "next/navigation";

// La lista delle AI ora vive in Home (con gli stessi filtri).
export default function AssetsPage({ searchParams }: { searchParams: Record<string, string> }) {
  const qs = new URLSearchParams(searchParams).toString();
  redirect(qs ? `/?${qs}` : "/");
}
