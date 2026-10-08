import { db } from "@/lib/db";
import { currentSession, activeMember } from "@/lib/auth";
import { planGate } from "@/lib/plan-gate";
import { appOrigin } from "@/lib/mail";
import { loadRegister } from "@/lib/compliance/register";
import { ropaCsv } from "@/lib/compliance/ropa";

export const dynamic = "force-dynamic";

// Registro GDPR art. 30 delle AI in CSV (stesso piano dell'export del registro AI).
export async function GET(req: Request) {
  const s = currentSession();
  if (!s) return new Response("Not signed in", { status: 401 });
  const member = await activeMember(s);
  if (!member || member.status !== "active") return new Response("Forbidden", { status: 403 });
  const gate = await planGate(s.orgId, "registerExport");
  if (!gate.ok) return Response.redirect(`${appOrigin(req.headers)}/billing?error=${encodeURIComponent(gate.message)}`, 303);
  const [org, reg] = await Promise.all([db.organization.findUnique({ where: { id: s.orgId }, select: { name: true } }), loadRegister(s.orgId)]);
  const slug = `${(org?.name ?? "angar").replace(/[^a-z0-9]+/gi, "-")}-gdpr-art30-ai-register-${new Date().toISOString().slice(0, 10)}`.toLowerCase();
  return new Response(ropaCsv(reg.rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}.csv"`, "Cache-Control": "no-store" },
  });
}
