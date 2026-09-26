import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { verifyState } from "@/lib/oauth-state";
import { encryptJson } from "@/lib/crypto";
import { appOrigin } from "@/lib/mail";
import { runConnectorSync } from "@/lib/connectors/sync";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = appOrigin(req.headers);
  const q = new URL(req.url).searchParams;
  const back = (msg: string) => NextResponse.redirect(`${origin}/sources?error=${encodeURIComponent(msg)}`);
  const state = verifyState(q.get("state"));
  const s = currentSession();
  if (!state || !s || state.orgId !== s.orgId || state.email !== s.email) return back("The Google sign-in expired or didn't match your session — try again.");
  if (q.get("error")) return back(`Google: ${q.get("error")}`);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: q.get("code") ?? "",
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: `${origin}/api/connectors/google/callback`,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!res.ok) return back(`Google didn't accept the sign-in (${res.status}).`);
  const tok = (await res.json()) as { refresh_token?: string };
  if (!tok.refresh_token) return back("Google didn't return a long-lived token — remove angar from your Google account's third-party access and connect again.");
  await db.connector.upsert({
    where: { organizationId_provider: { organizationId: s.orgId, provider: "GOOGLE_WORKSPACE" } },
    update: { credentialsEncrypted: encryptJson({ refreshToken: tok.refresh_token }), status: "CONNECTED", lastSyncError: null },
    create: { organizationId: s.orgId, provider: "GOOGLE_WORKSPACE", credentialsEncrypted: encryptJson({ refreshToken: tok.refresh_token }), status: "CONNECTED", scopes: ["reports.audit.readonly"] },
  });
  await audit("connector.connect", "GOOGLE_WORKSPACE");
  const r = await runConnectorSync(s.orgId, "GOOGLE_WORKSPACE");
  if (!r.ok) return back(`Connected, but the first read failed: ${r.error.slice(0, 200)}. Only a Google Workspace super admin can grant this.`);
  return NextResponse.redirect(`${origin}/?connected=GOOGLE_WORKSPACE`);
}
