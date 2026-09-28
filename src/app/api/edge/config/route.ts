import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sensorForToken, tokenFrom } from "@/lib/edge/auth";
import { edgeConfig } from "@/lib/edge/config";

export const dynamic = "force-dynamic";

// Configurazione del sensore (all'avvio e ogni 10 minuti): impostazioni, catalogo, AI bloccate.
export async function GET(req: Request) {
  const sensor = await sensorForToken(tokenFrom(req));
  if (!sensor) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const cfg = await edgeConfig(sensor);
  await db.edgeSensor.update({ where: { id: sensor.id }, data: { lastSeenAt: new Date() } });
  return NextResponse.json(cfg, { headers: { "Cache-Control": "no-store" } });
}
