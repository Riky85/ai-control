import { redirect } from "next/navigation";

// Le approvazioni vivono in "To review" (AI Estate): redirect per non rompere link e segnalibri.
export default function ApprovalsRedirectPage() {
  redirect("/review");
}
