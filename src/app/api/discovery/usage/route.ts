import { NextResponse } from "next/server";
import { ingestFindings, orgForToken, type Finding } from "@/lib/discovery/ingest";
import { recordDesktopDevice, cleanIps } from "@/lib/discovery/devices";
import { createAlert } from "@/lib/alerts";
import { db } from "@/lib/db";
import { orgPrivacyMode, personLabel } from "@/lib/privacy";

export const dynamic = "force-dynamic";

// Dall'estensione del browser e dall'app desktop: servizi AI usati, da chi
// (email di lavoro), quante volte e per quanto tempo. Mai URL o contenuti.
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const org = await orgForToken(token);
  if (!org) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > 500_000) return NextResponse.json({ error: "Too much data." }, { status: 413 });
  let body: { user?: string | null; findings?: Finding[]; source?: string; device?: string; os?: string; version?: string; ips?: unknown };
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
  // Con gli IP locali angar Edge capisce di chi è il traffico che vede in rete.
  if (desktop) await recordDesktopDevice(org.id, { device, email, os: body.os, version: body.version, aiCount: systems.length, ips: Array.isArray(body.ips) ? cleanIps(body.ips) : undefined });

  // Policy: AI segnate "Not allowed" usate da qualcuno → avviso all'IT e, sull'app
  // desktop, un messaggio gentile alla persona (una volta al giorno per AI).
  const blocked = systems.length
    ? await db.aiAsset.findMany({ where: { organizationId: org.id, deletedAt: null, status: "UNAPPROVED", name: { in: systems } }, select: { id: true, name: true, blockOnNetwork: true, insteadAssetId: true } })
    : [];
  // L'alternativa approvata da suggerire (solo AI dello stesso workspace, ancora approvate).
  const insteadIds = [...new Set(blocked.map((a) => a.insteadAssetId).filter((x): x is string => !!x))];
  const instead = new Map(
    (insteadIds.length ? await db.aiAsset.findMany({ where: { organizationId: org.id, deletedAt: null, status: "APPROVED", id: { in: insteadIds } }, select: { id: true, name: true } }) : []).map((a) => [a.id, a.name])
  );
  const today = new Date().toISOString().slice(0, 10);
  const notices: { key: string; title: string; message: string }[] = [];
  const mode = blocked.length ? await orgPrivacyMode(org.id) : "individual";
  for (const a of blocked) {
    const id = email ?? device;
    const who = personLabel(mode, id);
    await createAlert(org.id, {
      kind: "policy",
      severity: "critical",
      title: `${a.name} is not allowed — used by ${who}`,
      body: `${who.charAt(0).toUpperCase() + who.slice(1)} used ${a.name}, which your company marked as not allowed. Talk to them or suggest ${(a.insteadAssetId && instead.get(a.insteadAssetId)) || "the approved alternative"}.`,
      href: `/assets/${a.id}`,
      dedupeKey: `policy:${a.id}:${id}:${today}`,
    });
    notices.push({
      key: `${a.id}:${today}`,
      title: `${a.name} isn't approved at ${org.name}`,
      message: noticeMessage(org.name, a.name, a.insteadAssetId ? instead.get(a.insteadAssetId) : undefined, a.blockOnNetwork),
    });
  }
  return NextResponse.json({ ok: true, systems, notices });
}

function noticeMessage(company: string, ai: string, insteadName: string | undefined, blockedOnNetwork: boolean) {
  const use = insteadName ? `Use ${insteadName} instead.` : "Please use the approved AI tools instead — ask your IT team which ones.";
  const net = blockedOnNetwork ? ` ${ai} is blocked on the company network.` : "";
  return `${company} hasn't approved ${ai} for work.${net} ${use} (angar only sees the names of AI tools, never what you do in them.)`;
}
