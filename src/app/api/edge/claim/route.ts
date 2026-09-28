import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { newEdgeToken } from "@/lib/edge/auth";
import { normalizeSerial, secretMatches } from "@/lib/edge/device-id";
import { claimUrlFor } from "@/lib/edge/devices";

export const dynamic = "force-dynamic";

const MIN_INTERVAL_MS = 5_000;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

// Chiamato dal dispositivo angar (seriale + segreto, ancora senza token). Vedi docs/edge-protocol.md.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 10_000) return json({ error: "Too much data." }, 413);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed;
  } catch {
    return json({ error: "Not JSON." }, 400);
  }
  const serial = normalizeSerial(body.serial);
  const device = serial ? await db.edgeDevice.findUnique({ where: { serial } }) : null;
  if (!device) return json({ error: "Unknown serial." }, 404);
  if (!secretMatches(body.secret, device.claimSecretHash)) return json({ error: "Wrong secret." }, 403);

  // Al massimo una chiamata ogni 5 s per seriale (solo dopo il segreto, così nessuno può bloccare un device altrui).
  const now = new Date();
  const slot = await db.edgeDevice.updateMany({
    where: { id: device.id, OR: [{ lastClaimCallAt: null }, { lastClaimCallAt: { lt: new Date(now.getTime() - MIN_INTERVAL_MS) } }] },
    data: { lastClaimCallAt: now },
  });
  if (!slot.count) return json({ error: "Too many requests." }, 429, { "Retry-After": "5" });

  if (device.status === "stock") return json({ status: "unclaimed", claimUrl: claimUrlFor(device.serial) }, 202);
  if (device.status !== "claimed" || !device.sensorId) return json({ status: "retired" }, 410);

  // Ogni chiamata riuscita ruota il token: un device resettato o riflashato si riprende sempre.
  const t = newEdgeToken();
  const version = typeof body.version === "string" ? body.version.slice(0, 40) : undefined;
  const sensor = await db.edgeSensor
    .update({
      where: { id: device.sensorId },
      data: { tokenHash: t.hash, tokenHint: t.hint, ...(version ? { version } : {}) },
      select: { id: true, organization: { select: { name: true } } },
    })
    .catch(() => null);
  if (!sensor) return json({ status: "retired" }, 410);
  return json({ status: "claimed", token: t.token, sensorId: sensor.id, company: sensor.organization.name });
}
