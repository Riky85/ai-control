import { NextResponse } from "next/server";
import { ingestFindings, type Finding } from "@/lib/discovery/ingest";
import { cleanMcpServer, type McpServerIn } from "@/lib/discovery/mcp-catalog";
import { recordDesktopDevice, cleanIps } from "@/lib/discovery/devices";
import { authUsageToken, bindDesktopToken, touchDesktopToken } from "@/lib/discovery/desktop-tokens";
import { identitiesFor, pseudonymFor } from "@/lib/discovery/pseudonym";
import { rateLimit, retryAfter } from "@/lib/rate-limit";
import { createAlert } from "@/lib/alerts";
import { db } from "@/lib/db";
import { personLabel } from "@/lib/privacy";

export const dynamic = "force-dynamic";

// Un invio ogni 30 minuti per computer: 60 al minuto per token dell'installazione.
// Il vecchio token unico dell'azienda è condiviso da tutti i computer e browser: più largo.
const RATE = { limit: 60, windowMs: 60_000 };
const LEGACY_RATE = { limit: 1200, windowMs: 60_000 };

// Dall'estensione del browser e dall'app desktop: servizi AI usati, da chi
// (email di lavoro), quante volte e per quanto tempo. Mai URL o contenuti.
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const auth = await authUsageToken(token);
  if (!auth) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const rate = auth.desktopToken ? RATE : LEGACY_RATE;
  if (!rateLimit(`usage:${auth.key}`, rate.limit, rate.windowMs)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(retryAfter(rate.limit, rate.windowMs)) } });
  }
  const { org, desktopToken } = auth;
  const raw = await req.text();
  if (raw.length > 500_000) return NextResponse.json({ error: "Too much data." }, { status: 413 });
  let body: { user?: string | null; findings?: Finding[]; source?: string; device?: string; os?: string; version?: string; ips?: unknown; since?: unknown; mcp?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Not JSON." }, { status: 400 });
  }
  const email = typeof body.user === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.user) ? body.user.toLowerCase().slice(0, 200) : null;

  // Token dell'installazione: il primo invio lo lega a questa email; un'altra email → 403.
  if (desktopToken && !(await bindDesktopToken(desktopToken, email ? await pseudonymFor(org.id, email) : null))) {
    return NextResponse.json({ error: "This installation is linked to another person. Set up angar again from your company link." }, { status: 403 });
  }

  const desktop = body.source === "desktop";
  const kinds = desktop ? ["domain", "app", "candidate", "candidate_app"] : ["domain"];
  const findings = (Array.isArray(body.findings) ? body.findings : []).filter((f) => f && kinds.includes(f.kind)).slice(0, 2000);
  const device = desktop ? (typeof body.device === "string" && body.device.trim() ? body.device.trim().slice(0, 120) : "Desktop app") : "Browser extension";
  // Server MCP configurati sul computer (app desktop 0.5.6+, una volta al giorno): solo nomi, mai chiavi.
  const mcp = desktop && Array.isArray(body.mcp) ? body.mcp.slice(0, 200).map(cleanMcpServer).filter((s): s is McpServerIn => !!s) : [];
  const systems = await ingestFindings(org.id, device, findings, email, desktop ? "desktop" : "extension", mcp);

  // Privacy nel database: fuori da "per persona" il computer si salva con lo
  // pseudonimo della persona e un nome host offuscato.
  const ids = await identitiesFor(org.id, org.privacyMode);
  const who = email ? ids.person(email) : null;
  // Ricorda il computer, così l'utente vede sulla piattaforma che l'app è collegata.
  // Con gli IP locali angar Edge capisce di chi è il traffico che vede in rete.
  let deviceKey: string | null = null;
  if (desktop) {
    const i = device.indexOf("·");
    const storedDevice = ids.people || i < 0 ? device : `${device.slice(0, i).trim()} · ${ids.host(device.slice(i + 1).trim())}`;
    deviceKey = await recordDesktopDevice(org.id, { device: storedDevice, email: who, os: body.os, version: body.version, aiCount: systems.length, ips: Array.isArray(body.ips) ? cleanIps(body.ips) : undefined });
  }
  if (desktopToken) await touchDesktopToken(desktopToken.id, deviceKey).catch(() => {});

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
  for (const a of blocked) {
    // Nella chiave dell'avviso (salvata) mai l'email fuori da "per persona".
    const id = who ?? (ids.people ? device : "someone");
    const whoLabel = personLabel(ids.mode, email ?? device);
    await createAlert(org.id, {
      kind: "policy",
      severity: "critical",
      title: `${a.name} is not allowed — used by ${whoLabel}`,
      body: `${whoLabel.charAt(0).toUpperCase() + whoLabel.slice(1)} used ${a.name}, which your company marked as not allowed. Talk to them or suggest ${(a.insteadAssetId && instead.get(a.insteadAssetId)) || "the approved alternative"}.`,
      href: `/assets/${a.id}`,
      dedupeKey: `policy:${a.id}:${id}:${today}`,
    });
    notices.push({
      key: `${a.id}:${today}`,
      title: `${a.name} isn't approved at ${org.name}`,
      message: noticeMessage(org.name, a.name, a.insteadAssetId ? instead.get(a.insteadAssetId) : undefined, a.blockOnNetwork),
    });
  }
  // Dati azzerati dopo l'ultimo invio di questo computer: l'app rimanda gli ultimi 30 giorni.
  const since = typeof body.since === "number" ? body.since : null;
  const resync = desktop && !!org.dataResetAt && since !== null && since < org.dataResetAt.getTime();
  return NextResponse.json({ ok: true, systems, notices, resync });
}

function noticeMessage(company: string, ai: string, insteadName: string | undefined, blockedOnNetwork: boolean) {
  const use = insteadName ? `Use ${insteadName} instead.` : "Please use the approved AI tools instead — ask your IT team which ones.";
  const net = blockedOnNetwork ? ` ${ai} is blocked on the company network.` : "";
  return `${company} hasn't approved ${ai} for work.${net} ${use} (angar only sees the names of AI tools, never what you do in them.)`;
}
