import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { signState } from "@/lib/oauth-state";
import { appOrigin } from "@/lib/mail";
import { FIC_BASE, FIC_SCOPE, ficConfigured } from "@/lib/connectors/fatture-in-cloud";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await requireRole("ADMIN", "/sources");
  const origin = appOrigin(req.headers);
  if (!ficConfigured()) return NextResponse.redirect(`${origin}/sources?error=${encodeURIComponent("Fatture in Cloud isn't available on this deployment yet.")}`);
  const url = new URL(`${FIC_BASE}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.FIC_CLIENT_ID!);
  url.searchParams.set("redirect_uri", `${origin}/api/connectors/fattureincloud/callback`);
  url.searchParams.set("scope", FIC_SCOPE);
  url.searchParams.set("state", signState({ orgId: s.orgId, email: s.email }));
  return NextResponse.redirect(url.toString());
}
