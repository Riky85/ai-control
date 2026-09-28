import { NextResponse } from "next/server";
import { sensorForToken, tokenFrom } from "@/lib/edge/auth";
import { batchFromReport, processEdgeBatch, touchSensor } from "@/lib/edge/ingest";
import { privacyModeOf } from "@/lib/privacy";

export const dynamic = "force-dynamic";

const MAX_BODY = 1_000_000;

// Delta dal sensore (eventi AI, AI candidate, modelli locali): il server li somma.
export async function POST(req: Request) {
  const sensor = await sensorForToken(tokenFrom(req));
  if (!sensor) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return NextResponse.json({ error: "Too much data." }, { status: 413 });
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BODY) return NextResponse.json({ error: "Too much data." }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed;
  } catch {
    return NextResponse.json({ error: "Not JSON." }, { status: 400 });
  }
  const batch = batchFromReport(body, privacyModeOf(sensor.organization));
  await touchSensor(sensor, { version: body.version, os: body.os, hostIp: body.hostIp, stats: body.stats, localModels: batch.localModels });
  const result = await processEdgeBatch(sensor, batch);
  return NextResponse.json({ ok: true, ...result });
}
