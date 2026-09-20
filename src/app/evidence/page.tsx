import { redirect } from "next/navigation";

// Pagina consolidata altrove per ridurre il numero di voci in sidebar —
// redirect invece di eliminare, per non rompere link/segnalibri esistenti.
export default function EvidenceRedirectPage() {
  redirect("/activity?tab=evidence");
}
