import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/discovery/ingest";

/** Token di un sensore angar Edge: mostrato una sola volta, salvato solo come SHA-256. */
export function newEdgeToken() {
  const token = "ange_" + randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token), hint: token.slice(0, 9) + "…" + token.slice(-4) };
}

export async function sensorForToken(token: string | null | undefined) {
  if (!token || !token.startsWith("ange_") || token.length > 100) return null;
  return db.edgeSensor.findUnique({ where: { tokenHash: hashToken(token) }, include: { organization: true } });
}

/** Token da "Authorization: Bearer …" oppure, per i log pusher che non impostano header, da ?token=. */
export function tokenFrom(req: Request, allowQuery = false): string | null {
  const h = req.headers.get("authorization");
  const bearer = h?.replace(/^Bearer\s+/i, "").trim();
  if (bearer) return bearer;
  if (!allowQuery) return null;
  try {
    return new URL(req.url).searchParams.get("token");
  } catch {
    return null;
  }
}
