import { NextResponse } from "next/server";
import { ingestFindings, orgForToken, type Finding } from "@/lib/discovery/ingest";

export const dynamic = "force-dynamic";

// Dall'estensione del browser: servizi AI visitati e da chi (email di lavoro).
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const org = await orgForToken(token);
  if (!org) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > 500_000) return NextResponse.json({ error: "Too much data." }, { status: 413 });
  let body: { user?: string | null; findings?: Finding[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Not JSON." }, { status: 400 });
  }
  const email = typeof body.user === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.user) ? body.user.toLowerCase().slice(0, 200) : null;
  const findings = (Array.isArray(body.findings) ? body.findings : []).filter((f) => f && f.kind === "domain").slice(0, 200);
  const systems = await ingestFindings(org.id, "Browser extension", findings, email);
  return NextResponse.json({ ok: true, systems });
}
