"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendPolicyAcks, sendAckReminders, resolveAckToken, recordAck, ensurePolicySnapshot } from "@/lib/policy-ack";
import { LITERACY, pickLang, scoreQuiz } from "@/lib/literacy";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const BACK = "/governance?tab=policies";
const go = (q: string) => redirect(`${BACK}&${q}#ack`);

/** Crea i link personali per la versione corrente della policy e li invia per email. */
export async function sendPolicyAckAction() {
  const s = await requireRole("EDITOR", BACK);
  const r = await sendPolicyAcks(s.orgId, s.email);
  await audit("policy_ack.send", r.version, { people: r.people, created: r.created, sent: r.sent });
  revalidatePath("/governance");
  if (!r.created) go(`error=${encodeURIComponent(r.reason ?? "Nothing to send.")}`);
  go(r.emailOff ? `ack=links&n=${r.created}` : `ack=sent&n=${r.sent}`);
}

/** Pubblica la versione corrente senza link personali (per il link generico). */
export async function publishPolicyAction() {
  const s = await requireRole("EDITOR", BACK);
  const snap = await ensurePolicySnapshot(s.orgId);
  await audit("policy_ack.publish", snap.version);
  revalidatePath("/governance");
  go("ack=published");
}

/** Promemoria subito (oltre a quello settimanale automatico). */
export async function remindPolicyAckAction() {
  const s = await requireRole("EDITOR", BACK);
  const n = await sendAckReminders(s.orgId, s.email);
  await audit("policy_ack.remind", `${n} reminders`);
  revalidatePath("/governance");
  go(n ? `ack=reminded&n=${n}` : `error=${encodeURIComponent("Nobody to remind: reminders go to people who haven't confirmed in 7 days (max 2), and need email to be configured.")}`);
}

/** Conferma dalla pagina pubblica /ack/[token] (nessun login: il token è la chiave). */
export async function submitAckAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").slice(0, 120);
  const back = `/ack/${encodeURIComponent(token)}`;
  if (!rateLimit(`ack:${clientIp(headers())}`, 20, 60_000)) redirect(`${back}?err=rate`);
  const target = await resolveAckToken(token);
  if (!target) redirect(back);
  const lang = pickLang(String(formData.get("lang") ?? ""), null);
  const answers: Record<string, number | null> = {};
  let digits = "";
  for (const q of LITERACY[lang].questions) {
    const v = Number(formData.get(q.id));
    const ok = Number.isInteger(v) && v >= 0 && v < q.options.length;
    answers[q.id] = ok ? v : null;
    digits += ok ? String(v) : "x";
  }
  if (digits.includes("x")) redirect(`${back}?lang=${lang}&err=answers`);
  const score = scoreQuiz(answers, lang);
  const ok = await recordAck(target!, score, lang);
  if (!ok) redirect(back);
  redirect(`${back}?lang=${lang}&done=1&a=${digits}`);
}
