import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { appOrigin } from "@/lib/mail";
import { currentSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Link di conferma email (24 ore, monouso; nel DB solo l'hash).
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const origin = appOrigin(req.headers);
  const signedIn = Boolean(currentSession());
  const token = String(params.token ?? "").slice(0, 100);
  const row = token.length >= 20 ? await db.emailVerificationToken.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } }) : null;
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    const msg = "That confirmation link has expired or was already used.";
    return NextResponse.redirect(signedIn ? `${origin}/account?error=${encodeURIComponent(msg + " Send a new one below.")}` : `${origin}/login?error=${encodeURIComponent(msg + " Sign in to get a new one.")}`);
  }
  const account = await db.account.update({ where: { id: row.accountId }, data: { emailVerifiedAt: new Date() } });
  await db.emailVerificationToken.updateMany({ where: { accountId: row.accountId, usedAt: null }, data: { usedAt: new Date() } });
  await audit("auth.email_verified", account.email, undefined, { orgId: null, actorEmail: account.email });
  return NextResponse.redirect(signedIn ? `${origin}/account?verified=1` : `${origin}/login?verified=1&email=${encodeURIComponent(account.email)}`);
}
