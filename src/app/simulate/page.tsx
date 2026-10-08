import { redirect } from "next/navigation";

// Il simulatore rapido ora è una vista di Impact: redirect per non rompere link e segnalibri.
export default function SimulateRedirectPage() {
  redirect("/impact?view=score");
}
