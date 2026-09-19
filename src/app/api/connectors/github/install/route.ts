import { NextResponse } from "next/server";

// Punto di partenza del vero flusso "Connect": nessuna password, nessuna
// chiave API da copiare — il cliente clicca Connect, GitHub gestisce il
// login e la scelta dell'organizzazione, noi riceviamo solo l'esito.
const ORG_ID = "demo-org";

export async function GET() {
  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug) {
    return NextResponse.json(
      { error: "GitHub connector not configured on this platform yet: missing GITHUB_APP_SLUG." },
      { status: 503 }
    );
  }
  const url = `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(ORG_ID)}`;
  return NextResponse.redirect(url);
}
