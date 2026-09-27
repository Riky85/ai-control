import { NextResponse } from "next/server";
import { ingestFindings, orgForToken, type Finding } from "@/lib/discovery/ingest";
import { recordDesktopDevice } from "@/lib/discovery/devices";
import { createAlert } from "@/lib/alerts";
import { db } from "@/lib/db";

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

  // Policy: AI segnate "Not allowed" usate da qualcuno → avviso all'IT e, sull'app
  // desktop, un messaggio gentile alla persona (una volta al giorno per AI).
  const blocked = systems.length
    ? await db.aiAsset.findMany({ where: { organizationId: org.id, deletedAt: null, status: "UNAPPROVED", name: { in: systems } }, select: { id: true, name: true } })
    : [];
  const today = new Date().toISOString().slice(0, 10);
  const notices: { key: string; title: string; message: string }[] = [];
  for (const a of blocked) {
    const who = email ?? device;
    await createAlert(org.id, {
      kind: "policy",
      severity: "critical",
      title: `${a.name} is not allowed — used by ${who}`,
      body: `${who} used ${a.name}, which your company marked as not allowed. Talk to them or suggest the approved alternative.`,
      href: `/assets/${a.id}`,
      dedupeKey: `policy:${a.id}:${who}:${today}`,
    });
    notices.push({
      key: `${a.id}:${today}`,
      title: `${a.name} isn't approved at ${org.name}`,
      message: `${org.name} hasn't approved ${a.name} for work. Please use the approved AI tools instead — ask your IT team which ones. (angar only sees the names of AI tools, never what you do in them.)`,
    });
  }
  return NextResponse.json({ ok: true, systems, notices });
}
