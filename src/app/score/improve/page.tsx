import { redirect } from "next/navigation";

// "Improve my score" ora è la vista "Raise the score" di Opportunities: redirect per non rompere link e segnalibri.
export default function ImproveScoreRedirectPage() {
  redirect("/opportunities?view=score");
}
