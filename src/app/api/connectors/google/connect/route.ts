import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { planGate } from "@/lib/plan-gate";
import { signState } from "@/lib/oauth-state";
import { appOrigin } from "@/lib/mail";
import { googleConfigured } from "@/lib/connectors/workplace";
import { GOOGLE_SCOPES } from "@/lib/connectors/google-workspace";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await requireRole("ADMIN", "/sources");
  const origin = appOrigin(req.headers);
  if (!googleConfigured()) return NextResponse.redirect(`${origin}/sources?error=${encodeURIComponent("Google Workspace isn't available on this deployment yet.")}`);
  const gate = await planGate(s.orgId, "connections", { provider: "GOOGLE_WORKSPACE" });
  if (!gate.ok) return NextResponse.redirect(`${origin}/sources?error=${encodeURIComponent(gate.message)}`);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", `${origin}/api/connectors/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("state", signState({ orgId: s.orgId, email: s.email }));
  return NextResponse.redirect(url.toString());
}
