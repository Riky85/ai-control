import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Client Stripe minimale via REST (niente SDK). Tutto è disattivato finché
 * STRIPE_SECRET_KEY non è configurata: la pagina Billing lo dichiara.
 */
export const stripeEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);

function encode(params: Record<string, string>) {
  return new URLSearchParams(params).toString();
}

export async function stripePost<T = any>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: encode(params),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe error ${res.status}`);
  return json as T;
}

/** Verifica la firma del webhook (schema v1, tolleranza 5 minuti). */
export function verifyStripeSignature(payload: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = parts["t"];
  const v1 = header.split(",").filter((kv) => kv.startsWith("v1=")).map((kv) => kv.slice(3));
  if (!t || v1.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return v1.some((sig) => sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}
