import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { verifyState } from "@/lib/oauth-state";
import { encryptJson } from "@/lib/crypto";
import { appOrigin } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { ficTokenRequest, syncFattureInCloud } from "@/lib/connectors/fatture-in-cloud";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = appOrigin(req.headers);
  const q = new URL(req.url).searchParams;
  const back = (msg: string) => NextResponse.redirect(`${origin}/sources?error=${encodeURIComponent(msg)}`);
  const state = verifyState(q.get("state"));
  const s = currentSession();
  if (!state || !s || state.orgId !== s.orgId || state.email !== s.email) return back("The Fatture in Cloud sign-in expired — try again.");
  if (q.get("error")) return back(`Fatture in Cloud: ${q.get("error_description") ?? q.get("error")}`);
  let creds;
  try {
    creds = await ficTokenRequest({ grant_type: "authorization_code", code: q.get("code") ?? "", redirect_uri: `${origin}/api/connectors/fattureincloud/callback` });
  } catch (err) {
    return back((err as Error).message);
  }
  await db.connector.upsert({
    where: { organizationId_provider: { organizationId: s.orgId, provider: "FATTURE_IN_CLOUD" } },
    update: { credentialsEncrypted: encryptJson(creds), status: "CONNECTED", lastSyncError: null },
    create: { organizationId: s.orgId, provider: "FATTURE_IN_CLOUD", credentialsEncrypted: encryptJson(creds), status: "CONNECTED", scopes: ["received_documents:r"] },
  });
  await audit("connector.connect", "FATTURE_IN_CLOUD");
  try {
    const r = await syncFattureInCloud(s.orgId);
    return NextResponse.redirect(`${origin}/?spend=${r.services}`);
  } catch (err) {
    return back(`Connected, but reading invoices failed: ${(err as Error).message}`);
  }
}
