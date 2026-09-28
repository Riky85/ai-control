import { redirect } from "next/navigation";

// "Changes" è ora una scheda di Activity.
export default function ChangesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const qs = new URLSearchParams({ tab: "changes" });
  for (const k of ["q", "field"]) {
    const v = searchParams[k];
    if (typeof v === "string" && v) qs.set(k, v);
  }
  redirect(`/activity?${qs}`);
}
