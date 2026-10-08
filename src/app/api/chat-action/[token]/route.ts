import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { verifyChatAction, memberRole, atLeast, reviewAssetCore, acceptSavingCore, savingRef, type ChatActionToken } from "@/lib/chat-actions";
import { computeSavings } from "@/lib/savings";
import { audit } from "@/lib/audit";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Link one-click dai messaggi Teams (e Slack senza app) e dal brief
 * settimanale via email: token firmato con SESSION_SECRET, valido 7 giorni.
 * Azioni: approva / non consentita (un'AI), accetta un risparmio. Serve il login (il middleware manda al
 * login e poi torna qui) con ruolo EDITOR o superiore nel workspace giusto.
 * GET mostra la conferma, POST esegue: i controlli dei link nelle chat e gli
 * antivirus che aprono i link non possono decidere al posto di nessuno.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const c = await check(params.token);
  if ("error" in c) return page("Can't do that", c.error);
  if (c.kind === "saving") {
    return page(
      `Accept this saving?`,
      `${c.saving.title} — about ${eur(c.saving.monthlyEur)} a month. It goes to Savings → In progress, and angar confirms it on the next charges. You're signed in as ${c.email}.`,
      `<form method="post"><button class="btn primary">Accept saving</button></form><a class="link" href="/opportunities">Open Opportunities</a>`
    );
  }
  const verb = c.t.act === "approve" ? "Allow" : "Mark as not allowed";
  return page(
    `${verb}: ${c.asset.name}?`,
    `Current status: ${c.asset.status.toLowerCase()}. You're signed in as ${c.email}.`,
    `<form method="post"><button class="btn ${c.t.act === "approve" ? "primary" : "danger"}">${esc(verb)}</button></form><a class="link" href="/assets/${encodeURIComponent(c.asset.id)}">Open in angar</a>`
  );
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  // Solo dal nostro stesso sito (il modulo della pagina di conferma).
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return page("Can't do that", "This request didn't come from angar.");
  if (!rateLimit(`chat-action:${clientIp(req.headers)}`, 30, 60_000)) return page("Slow down", "Too many requests — try again in a minute.");
  const c = await check(params.token);
  if ("error" in c) return page("Can't do that", c.error);
  if (c.kind === "saving") {
    const r = await acceptSavingCore(c.t.org, c.t.asset, c.email, "chat-link");
    if (!r.ok) return page("Can't do that", r.error);
    return NextResponse.redirect(new URL("/opportunities?view=progress", originOf(req)), 303);
  }
  if (c.t.act !== "approve" && c.t.act !== "reject") return page("Can't do that", "Unknown action.");
  const r = await reviewAssetCore(c.t.org, c.t.asset, c.t.act, c.email, "chat-link");
  if (!r.ok) return page("Can't do that", r.error);
  return NextResponse.redirect(new URL(`/assets/${encodeURIComponent(c.t.asset)}`, originOf(req)), 303);
}

type Checked =
  | { error: string }
  | { kind: "asset"; t: ChatActionToken; email: string; asset: { id: string; name: string; status: string } }
  | { kind: "saving"; t: ChatActionToken; email: string; saving: { title: string; monthlyEur: number } };

async function check(token: string): Promise<Checked> {
  const t = verifyChatAction(token);
  if (!t) return { error: "This link is invalid or has expired (links from chat messages and the weekly brief last 7 days). Open angar to decide." };
  const s = currentSession();
  if (!s) return { error: "Please sign in first." };
  if (s.orgId !== t.org) return { error: "This link belongs to another workspace — switch workspace in angar and open the link again." };
  const role = await memberRole(t.org, s.email);
  if (!atLeast(role, "EDITOR")) {
    await audit("chat.action_denied", t.asset, { via: "chat-link", act: t.act, role }, { orgId: t.org, actorEmail: s.email });
    return { error: t.act === "accept_saving" ? "You need the editor role or higher to accept a saving." : "You need the editor role or higher to decide whether an AI is allowed." };
  }
  if (t.act === "accept_saving") {
    const [{ items }, accepted] = await Promise.all([
      computeSavings(t.org),
      db.savingAction.findMany({ where: { organizationId: t.org, savingKey: { not: null }, status: { not: "failed" } }, select: { savingKey: true } }),
    ]);
    if (accepted.some((a) => a.savingKey && savingRef(a.savingKey) === t.asset)) return { error: "This saving has already been accepted — you'll find it in Savings → In progress." };
    const item = items.find((i) => savingRef(i.key) === t.asset);
    if (!item) return { error: "That saving isn't there any more — it may have changed with new data. Open Savings to see the current list." };
    return { kind: "saving", t, email: s.email, saving: { title: item.title, monthlyEur: item.monthlyEur } };
  }
  const asset = await db.aiAsset.findFirst({ where: { id: t.asset, organizationId: t.org, deletedAt: null }, select: { id: true, name: true, status: true } });
  if (!asset) return { error: "That AI isn't in this workspace any more." };
  return { kind: "asset", t, email: s.email, asset };
}

const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");

function originOf(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return process.env.APP_URL ?? (host ? `${req.headers.get("x-forwarded-proto") ?? "https"}://${host}` : new URL(req.url).origin);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string, actions = `<a class="link" href="/">Open angar</a>`) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · angar</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0E0E12;color:#EDEDF0;font:15px/1.5 system-ui,sans-serif;padding:24px}
.card{max-width:440px;width:100%;border:1px solid #26262E;background:#15151B;border-radius:16px;padding:28px;display:flex;flex-direction:column;gap:16px}
h1{font-size:22px;margin:0;font-weight:600}p{margin:0;color:#9A9AA6;font-size:14px}.brand{font-weight:600;font-size:18px;margin-bottom:8px}
form{margin:0}.btn{width:100%;height:44px;border-radius:12px;border:0;font-weight:600;font-size:15px;cursor:pointer;color:#fff}.primary{background:#FF7323}.danger{background:#E5484D}
.link{color:#FF7323;font-size:14px;text-decoration:none}</style></head>
<body><div class="card"><div class="brand">angar</div><h1>${esc(title)}</h1><p>${esc(body)}</p>${actions}</div></body></html>`;
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY" } });
}
