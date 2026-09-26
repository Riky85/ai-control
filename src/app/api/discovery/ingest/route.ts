import { NextResponse } from "next/server";
import { ingestFindings, orgForToken, type Finding } from "@/lib/discovery/ingest";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Riceve dallo scanner SOLO i servizi AI già riconosciuti sul computer.
// Autenticazione: token di scoperta del workspace (salvato solo come hash).
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const org = await orgForToken(token);
  if (!org) return NextResponse.json({ error: "Invalid discovery token — create a new one in angar (Sources > Scan computers & network)." }, { status: 401 });

  const raw = await req.text();
  if (raw.length > 2_000_000) return NextResponse.json({ error: "Too much data." }, { status: 413 });
  let body: { device?: string; findings?: Finding[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Not JSON." }, { status: 400 });
  }
  const findings = Array.isArray(body.findings) ? body.findings : [];
  const device = String(body.device ?? "Unknown device").slice(0, 120);
  const systems = await ingestFindings(org.id, device, findings);
  await db.auditLog.create({ data: { organizationId: org.id, actorEmail: `scanner:${device}`, action: "discovery.ingest", target: `${systems.length} systems` } }).catch(() => {});
  return NextResponse.json({ ok: true, systems });
}
