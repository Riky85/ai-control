import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { planGate } from "@/lib/plan-gate";
import { appOrigin } from "@/lib/mail";
import { signState } from "@/lib/oauth-state";

export const dynamic = "force-dynamic";

// Punto di partenza del vero flusso "Connect": nessuna password, nessuna
// chiave API da copiare — il cliente clicca Connect, GitHub gestisce il
// login e la scelta dell'organizzazione, noi riceviamo solo l'esito.
// Solo Admin, con "state" firmato (workspace + utente) come gli altri connettori.

export async function GET(req: Request) {
  const s = await requireRole("ADMIN", "/connectors");
  const gate = await planGate(s.orgId, "connections", { provider: "GITHUB" });
  if (!gate.ok) return NextResponse.redirect(`${appOrigin(req.headers)}/connectors?error=${encodeURIComponent(gate.message)}`);
  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug) {
    return NextResponse.json(
      { error: "GitHub connector not configured on this platform yet: missing GITHUB_APP_SLUG." },
      { status: 503 }
    );
  }
  const url = `https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(signState({ orgId: s.orgId, email: s.email }))}`;
  return NextResponse.redirect(url);
}
