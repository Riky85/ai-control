import { NextResponse } from "next/server";
import { ingestFindings, orgForToken, type Finding } from "@/lib/discovery/ingest";
import { recordDesktopDevice } from "@/lib/discovery/devices";

export const dynamic = "force-dynamic";

// Dall'estensione del browser e dall'app desktop: servizi AI usati, da chi
// (email di lavoro), quante volte e per quanto tempo. Mai URL o contenuti.
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const org = await orgForToken(token);
  if (!org) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > 500_000) return NextResponse.json({ error: "Too much data." }, { status: 413 });
  let body: { user?: string | null; findings?: Finding[]; source?: string; device?: string; os?: string; version?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Not JSON." }, { status: 400 });
  }
  const email = typeof body.user === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.user) ? body.user.toLowerCase().slice(0, 200) : null;
  const desktop = body.source === "desktop";
  const kinds = desktop ? ["domain", "app", "candidate", "candidate_app"] : ["domain"];
  const findings = (Array.isArray(body.findings) ? body.findings : []).filter((f) => f && kinds.includes(f.kind)).slice(0, 2000);
  const device = desktop ? (typeof body.device === "string" && body.device.trim() ? body.device.trim().slice(0, 120) : "Desktop app") : "Browser extension";
  const systems = await ingestFindings(org.id, device, findings, email, desktop ? "desktop" : "extension");
  // Ricorda il computer, così l'utente vede sulla piattaforma che l'app è collegata.
  if (desktop) await recordDesktopDevice(org.id, { device, email, os: body.os, version: body.version, aiCount: systems.length });
  return NextResponse.json({ ok: true, systems });
}
