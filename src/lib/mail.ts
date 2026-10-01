/**
 * Invio email con trasporto intercambiabile:
 * - SMTP_URL impostata (es. smtps://utente:password@smtp-relay.brevo.com:465):
 *   invio via SMTP con nodemailer, verso il provider scelto (anche europeo,
 *   es. Brevo o Mailjet, entrambi in Francia);
 * - altrimenti Resend (REST), con RESEND_API_KEY.
 * In entrambi i casi serve EMAIL_FROM (es. "angar <noreply@tuodominio.it>").
 * Con la modalità solo UE (ANGAR_EU_ONLY=1) Resend non si usa mai: senza
 * SMTP_URL l'email resta spenta.
 * Senza configurazione non fallisce: restituisce sent=false e l'interfaccia
 * mostra il link da copiare a mano.
 */
import { euOnlyDeployment, smtpConfigured } from "@/lib/eu-only";

type Transport = "smtp" | "resend" | null;

/** Quale trasporto userebbe un invio adesso. */
export function emailTransport(): Transport {
  if (!process.env.EMAIL_FROM) return null;
  if (smtpConfigured()) return "smtp";
  if (process.env.RESEND_API_KEY && !euOnlyDeployment()) return "resend";
  return null;
}

export const emailEnabled = () => emailTransport() !== null;

export async function sendEmail(msg: { to: string; subject: string; text: string; html?: string }): Promise<{ sent: boolean; reason?: string }> {
  const transport = emailTransport();
  if (!transport) {
    const reason = euOnlyDeployment() && process.env.RESEND_API_KEY && !smtpConfigured() ? "EU-only mode is on: email needs an SMTP server (SMTP_URL)." : "Email isn't configured on this deployment.";
    return { sent: false, reason };
  }
  const html = msg.html ?? layout(msg.text);
  try {
    if (transport === "smtp") return await sendSmtp({ ...msg, html });
    return await sendResend({ ...msg, html });
  } catch (err) {
    console.error("[mail]", err);
    return { sent: false, reason: (err as Error).message };
  }
}

// Un solo trasporto SMTP riusato tra gli invii (opzioni come ?pool=true si mettono nella URL).
let smtp: import("nodemailer").Transporter | null = null;
let smtpUrl = "";

async function sendSmtp(msg: { to: string; subject: string; text: string; html: string }): Promise<{ sent: boolean; reason?: string }> {
  const url = process.env.SMTP_URL!;
  if (!smtp || smtpUrl !== url) {
    // Import dinamico: nodemailer si carica solo sul server e solo se serve.
    const nodemailer = await import("nodemailer");
    smtp = nodemailer.createTransport(url);
    smtpUrl = url;
  }
  const info = await smtp.sendMail({ from: process.env.EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
  if (info.rejected && info.rejected.length > 0) {
    const reason = `Email server refused the recipient.`;
    console.error("[mail]", reason, info.response);
    return { sent: false, reason };
  }
  return { sent: true };
}

async function sendResend(msg: { to: string; subject: string; text: string; html: string }): Promise<{ sent: boolean; reason?: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
    cache: "no-store",
  });
  if (!res.ok) {
    const reason = `Email provider answered ${res.status}: ${(await res.text()).slice(0, 200)}`;
    console.error("[mail]", reason);
    return { sent: false, reason };
  }
  return { sent: true };
}

// Template minimale: testo con i link resi cliccabili.
function layout(text: string) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const linked = esc.replace(/(https?:\/\/\S+)/g, '<a href="$1" style="color:#FF7323">$1</a>').replace(/\n/g, "<br>");
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#141418;max-width:520px;margin:0 auto;padding:24px">
<div style="font-weight:600;font-size:18px;margin-bottom:16px">angar</div>${linked}
<div style="margin-top:24px;font-size:12px;color:#5F5F69">You received this email because of your account on angar.</div></div>`;
}

export function appOrigin(h?: Headers | { get(name: string): string | null }) {
  return process.env.APP_URL ?? (h ? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}` : "");
}
