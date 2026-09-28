import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { reviewAssetCore, respondSeatCore, slackUserEmail, memberRole, atLeast, chatActionUrl, verifySlackSignature, type ChatAct } from "@/lib/chat-actions";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Pulsanti dei messaggi Slack (Request URL dell'app Slack → Interactivity).
 * Firma v0: HMAC-SHA256(SLACK_SIGNING_SECRET, "v0:<timestamp>:<body>"),
 * timestamp entro 5 minuti. L'utente Slack diventa un membro del workspace
 * angar tramite l'email (users.info col bot): per approvare serve EDITOR+.
 */
export async function POST(req: Request) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return NextResponse.json({ error: "Slack interactivity isn't configured" }, { status: 404 });
  if (!rateLimit(`slack:${clientIp(req.headers)}`, 120, 60_000)) return new NextResponse("Too many requests", { status: 429 });

  const raw = await req.text();
  if (raw.length > 200_000) return new NextResponse("Too large", { status: 413 });
  if (!verifySlackSignature(secret, req.headers.get("x-slack-request-timestamp"), req.headers.get("x-slack-signature"), raw)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: SlackPayload;
  try {
    payload = JSON.parse(new URLSearchParams(raw).get("payload") ?? "");
  } catch {
    return new NextResponse("Bad payload", { status: 400 });
  }
  if (payload.type !== "block_actions" || !payload.actions?.length) return new NextResponse("", { status: 200 });
  const action = payload.actions[0];
  const reply = (text: string, replace = false) => respond(payload.response_url, text, replace);

  // Pulsanti-link (senza azione lato server): Slack notifica comunque il clic.
  if (action.action_id.startsWith("angar_link_")) return new NextResponse("", { status: 200 });

  const email = await slackUserEmail(payload.user?.id ?? "");

  if (action.action_id === "angar_seat_keep" || action.action_id === "angar_seat_release") {
    const response = action.action_id === "angar_seat_keep" ? "keep" : "release";
    const r = await db.seatReminder.findUnique({ where: { token: String(action.value ?? "") } });
    // Solo la persona a cui è stato chiesto può rispondere.
    if (!r || !email || r.email.toLowerCase() !== email) {
      await reply("This seat check isn't for your account — use the link in your email instead.");
      return new NextResponse("", { status: 200 });
    }
    await respondSeatCore(r.token, response);
    await reply(response === "keep" ? "Got it — you keep your seat." : "Thanks — the seat will be freed.", true);
    return new NextResponse("", { status: 200 });
  }

  const m = /^angar_review_(approve|reject)$/.exec(action.action_id);
  if (!m) return new NextResponse("", { status: 200 });
  let v: { o?: string; a?: string };
  try {
    v = JSON.parse(String(action.value ?? "{}"));
  } catch {
    return new NextResponse("", { status: 200 });
  }
  const act = m[1] as ChatAct;
  if (!v.o || !v.a) return new NextResponse("", { status: 200 });
  if (!email) {
    // Bot non configurato o email non leggibile: si rimanda al link firmato (login in angar).
    await reply(`I can't match your Slack account to angar. Confirm here instead: ${chatActionUrl({ act, org: v.o, asset: v.a })}`);
    return new NextResponse("", { status: 200 });
  }
  const role = await memberRole(v.o, email);
  if (!atLeast(role, "EDITOR")) {
    await audit("chat.action_denied", v.a, { via: "slack", role }, { orgId: v.o, actorEmail: email });
    await reply(role ? "You need the editor role or higher in angar to decide this." : `${email} isn't a member of this angar workspace.`);
    return new NextResponse("", { status: 200 });
  }
  const r = await reviewAssetCore(v.o, v.a, act, email, "slack");
  await reply(r.ok ? `${act === "approve" ? "✅" : "⛔"} *${r.name}* marked ${act === "approve" ? "allowed" : "not allowed"} by ${email}.` : r.error, r.ok);
  return new NextResponse("", { status: 200 });
}

type SlackPayload = {
  type: string;
  user?: { id: string };
  response_url?: string;
  actions?: { action_id: string; value?: string }[];
};

async function respond(url: string | undefined, text: string, replace: boolean) {
  // Solo l'endpoint di risposta di Slack (mai URL arbitrari dal payload).
  if (!url || !/^https:\/\/hooks\.slack\.com\//.test(url)) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(replace ? { replace_original: true, text } : { response_type: "ephemeral", replace_original: false, text }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}
