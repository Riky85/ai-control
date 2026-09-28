import { currentOrgId } from "@/lib/org";
import { NextResponse } from "next/server";
import { planGate } from "@/lib/plan-gate";
import { appOrigin } from "@/lib/mail";

export const dynamic = "force-dynamic";

// Punto di partenza del vero flusso "Connect": nessuna password, nessuna
// chiave API da copiare — il cliente clicca Connect, GitHub gestisce il
// login e la scelta dell'organizzazione, noi riceviamo solo l'esito.

export async function GET(req: Request) {
  const gate = await planGate(currentOrgId(), "connections", { provider: "GITHUB" });
  if (!gate.ok) return NextResponse.redirect(`${appOrigin(req.headers)}/connectors?error=${encodeURIComponent(gate.message)}`);
  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug) {
    return NextResponse.json(
      { error: "GitHub connector not configured on this platform yet: missing GITHUB_APP_SLUG." },
      { status: 503 }
    );
  }
  const url = `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(currentOrgId())}`;
  return NextResponse.redirect(url);
}
