import { createHash } from "crypto";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/mail";
import { appUrl } from "@/lib/alerts";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { reportEmail } from "../report-email";

export const dynamic = "force-dynamic";

const page = (title: string, text: string) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} — angar</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#202327;color:#EDEDEC;font:15px/1.5 system-ui,sans-serif;padding:16px}main{max-width:440px}h1{font-size:20px;margin:0 0 8px}p{color:#A1A09C;margin:0 0 16px}a{color:#FF7323}</style></head>
<body><main><h1>${title}</h1><p>${text}</p><a href="/check">Back to the AI Spend Check</a></main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

// Secondo passo del doppio opt-in: il clic sul link conferma l'indirizzo e fa partire il report (una volta sola).
export async function GET(req: Request) {
  if (!rateLimit(`lead-confirm:${clientIp(req.headers)}`, 20, 3_600_000)) return page("Too many requests", "Try again in a while.");
  const t = new URL(req.url).searchParams.get("t") ?? "";
  if (!/^[\w-]{20,64}$/.test(t)) return page("Link not valid", "This confirmation link is incomplete or has expired.");
  const hash = createHash("sha256").update(t).digest("hex");
  const lead = await db.lead.findUnique({ where: { confirmTokenHash: hash } });
  if (!lead || Date.now() - lead.createdAt.getTime() > 7 * 86400000) return page("Link not valid", "This confirmation link is incomplete or has expired.");
  if (lead.confirmedAt) return page("Already confirmed", `The report was sent to ${escapeHtml(lead.email)}.`);
  // Una sola conferma anche con due clic contemporanei.
  const claimed = await db.lead.updateMany({ where: { id: lead.id, confirmedAt: null }, data: { confirmedAt: new Date() } });
  if (claimed.count === 0) return page("Already confirmed", `The report was sent to ${escapeHtml(lead.email)}.`);
  const mail = reportEmail(lead, appUrl());
  const r = await sendEmail({ to: lead.email, ...mail });
  return r.sent ? page("Email confirmed", `Your AI Spend Check is on its way to ${escapeHtml(lead.email)}.`) : page("Email confirmed", "We couldn't send the report right now — please try the check again later.");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
