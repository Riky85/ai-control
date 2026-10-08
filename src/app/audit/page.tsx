import { redirect } from "next/navigation";

// Il log di audit ora è una scheda di Activity: redirect per non rompere link e segnalibri (la ricerca resta).
export default function AuditRedirectPage({ searchParams }: { searchParams: Record<string, string> }) {
  const q = new URLSearchParams({ ...searchParams, tab: "audit" });
  redirect(`/activity?${q}`);
}
