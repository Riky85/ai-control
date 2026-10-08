import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// "state" OAuth firmato: lega il ritorno dal provider al workspace e
// all'utente che ha iniziato il collegamento, e scade dopo 15 minuti.
// Niente segreto di ripiego in produzione: senza SESSION_SECRET si rifiuta di firmare.
function secret() {
  const s = process.env.SESSION_SECRET || process.env.CREDENTIALS_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET missing");
  return "dev-secret";
}
// Separazione di dominio: la stessa chiave firma anche altro, il prefisso impedisce scambi di token.
const mac = (body: string) => createHmac("sha256", secret()).update(`oauth-state:${body}`).digest("base64url");

export function signState(data: { orgId: string; email: string }) {
  const body = Buffer.from(JSON.stringify({ ...data, n: randomBytes(8).toString("hex"), x: Date.now() + 15 * 60000 })).toString("base64url");
  const sig = mac(body);
  return `${body}.${sig}`;
}

export function verifyState(state: string | null): { orgId: string; email: string } | null {
  if (!state) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  let expected: string;
  try {
    expected = mac(body);
  } catch {
    return null;
  }
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const d = JSON.parse(Buffer.from(body, "base64url").toString());
    return d.x > Date.now() ? { orgId: d.orgId, email: d.email } : null;
  } catch {
    return null;
  }
}
