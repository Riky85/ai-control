import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { signState } from "@/lib/oauth-state";
import { appOrigin } from "@/lib/mail";
import { msConfigured } from "@/lib/connectors/workplace";

export const dynamic = "force-dynamic";

// Porta l'amministratore Microsoft alla schermata di consenso (sola lettura).
export async function GET(req: Request) {
  const s = await requireRole("ADMIN", "/sources");
  const origin = appOrigin(req.headers);
  if (!msConfigured()) return NextResponse.redirect(`${origin}/sources?error=${encodeURIComponent("Microsoft 365 isn't available on this deployment yet.")}`);
  const url = new URL("https://login.microsoftonline.com/organizations/v2.0/adminconsent");
  url.searchParams.set("client_id", process.env.MS365_CLIENT_ID!);
  url.searchParams.set("scope", "https://graph.microsoft.com/.default");
  url.searchParams.set("redirect_uri", `${origin}/api/connectors/microsoft/callback`);
  url.searchParams.set("state", signState({ orgId: s.orgId, email: s.email }));
  return NextResponse.redirect(url.toString());
}
