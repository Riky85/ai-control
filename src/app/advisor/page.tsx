import { redirect } from "next/navigation";

// L'Advisor ora è la vista "Standard stack" di Opportunities: redirect per non rompere link e segnalibri.
export default function AdvisorRedirectPage() {
  redirect("/opportunities?view=stack");
}
