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
  if (!state || !s || state.orgId !== s.orgId || state.email !== s.email) return back("The Microsoft sign-in expired or didn't match your session — try again.");
  if (q.get("error")) return back(`Microsoft: ${q.get("error_description") ?? q.get("error")}`);
  const tenant = q.get("tenant");
  if (!tenant || q.get("admin_consent") !== "True") return back("Microsoft didn't confirm the administrator's approval.");
  await db.connector.upsert({
    where: { organizationId_provider: { organizationId: s.orgId, provider: "MICROSOFT_365" } },
    update: { credentialsEncrypted: encryptJson({ tenantId: tenant }), status: "CONNECTED", lastSyncError: null },
    create: { organizationId: s.orgId, provider: "MICROSOFT_365", credentialsEncrypted: encryptJson({ tenantId: tenant }), status: "CONNECTED", scopes: ["graph:.default"] },
  });
  await audit("connector.connect", "MICROSOFT_365");
  const r = await runConnectorSync(s.orgId, "MICROSOFT_365");
  if (!r.ok) return back(`Connected, but the first read failed: ${r.error.slice(0, 200)}`);
  return NextResponse.redirect(`${origin}/?connected=MICROSOFT_365`);
}
