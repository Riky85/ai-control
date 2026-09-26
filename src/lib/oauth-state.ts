import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// "state" OAuth firmato: lega il ritorno dal provider al workspace e
// all'utente che ha iniziato il collegamento, e scade dopo 15 minuti.
const secret = () => process.env.SESSION_SECRET ?? process.env.CREDENTIALS_SECRET ?? "dev-secret";

export function signState(data: { orgId: string; email: string }) {
  const body = Buffer.from(JSON.stringify({ ...data, n: randomBytes(8).toString("hex"), x: Date.now() + 15 * 60000 })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string | null): { orgId: string; email: string } | null {
  if (!state) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const d = JSON.parse(Buffer.from(body, "base64url").toString());
    return d.x > Date.now() ? { orgId: d.orgId, email: d.email } : null;
  } catch {
    return null;
  }
}
