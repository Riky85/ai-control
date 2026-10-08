import { redirect } from "next/navigation";

// L'editor dell'abbonamento ora è /estate/[id]/subscription: redirect per non rompere link e segnalibri.
export default function AssetSubscriptionRedirectPage({ params, searchParams }: { params: { id: string }; searchParams: Record<string, string> }) {
  const qs = new URLSearchParams(searchParams).toString();
  redirect(`/estate/${encodeURIComponent(params.id)}/subscription${qs ? `?${qs}` : ""}`);
}
