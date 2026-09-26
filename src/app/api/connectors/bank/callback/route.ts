import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { verifyState } from "@/lib/oauth-state";
import { appOrigin } from "@/lib/mail";
import { audit } from "@/lib/audit";
import { finishBankAuth, syncBank } from "@/lib/connectors/bank";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = appOrigin(req.headers);
  const q = new URL(req.url).searchParams;
  const back = (msg: string) => NextResponse.redirect(`${origin}/sources/bank?error=${encodeURIComponent(msg)}`);
  const state = verifyState(q.get("state"));
  const s = currentSession();
  if (!state || !s || state.orgId !== s.orgId || state.email !== s.email) return back("The bank sign-in expired or didn't match your session — try again.");
  if (q.get("error")) return back(`The bank said: ${q.get("error_description") ?? q.get("error")}`);
  try {
    await finishBankAuth(s.orgId, q.get("code") ?? "", "Bank");
    await audit("connector.connect", "BANK");
    const r = await syncBank(s.orgId);
    return NextResponse.redirect(`${origin}/?spend=${r.services}`);
  } catch (err) {
    return back((err as Error).message);
  }
}
