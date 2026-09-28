import { NextResponse } from "next/server";
import { DEVICE_MODELS, factoryTokenMatches, type DeviceModel } from "@/lib/edge/device-id";
import { createDeviceBatch, MAX_BATCH } from "@/lib/edge/devices";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Fabbrica: nuovo lotto di dispositivi angar. Authorization: Bearer $EDGE_FACTORY_TOKEN.
// Senza la variabile l'endpoint non esiste (404).
export async function POST(req: Request) {
  const expected = process.env.EDGE_FACTORY_TOKEN;
  if (!expected) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!factoryTokenMatches(req.headers.get("authorization"), expected)) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed;
  } catch {
    return NextResponse.json({ error: "Not JSON." }, { status: 400 });
  }
  const count = Number(body.count);
  if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH) return NextResponse.json({ error: `count must be 1–${MAX_BATCH}.` }, { status: 400 });
  const model = String(body.model ?? "");
  if (!(DEVICE_MODELS as readonly string[]).includes(model)) return NextResponse.json({ error: `model must be one of ${DEVICE_MODELS.join(", ")}.` }, { status: 400 });
  const batch = typeof body.batch === "string" ? body.batch.trim().slice(0, 60) || null : null;
  const devices = await createDeviceBatch(count, model as DeviceModel, batch);
  await audit("edge.devices_created", batch ?? undefined, { count, model, via: "api" }, { orgId: null, actorEmail: "factory" });
  return NextResponse.json({ devices }, { headers: { "Cache-Control": "no-store" } });
}
