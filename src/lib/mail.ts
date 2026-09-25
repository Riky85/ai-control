/**
 * Invio email via Resend (REST, nessuna dipendenza). Si attiva impostando
 * RESEND_API_KEY ed EMAIL_FROM (es. "angar <noreply@tuodominio.it>").
 * Senza configurazione non fallisce: restituisce sent=false e l'interfaccia
 * mostra il link da copiare a mano.
 */
export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

export async function sendEmail(msg: { to: string; subject: string; text: string; html?: string }): Promise<{ sent: boolean; reason?: string }> {
  if (!emailEnabled()) return { sent: false, reason: "Email isn't configured on this deployment." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html ?? layout(msg.text) }),
      cache: "no-store",
    });
    if (!res.ok) {
      const reason = `Email provider answered ${res.status}: ${(await res.text()).slice(0, 200)}`;
      console.error("[mail]", reason);
      return { sent: false, reason };
    }
    return { sent: true };
  } catch (err) {
    console.error("[mail]", err);
    return { sent: false, reason: (err as Error).message };
  }
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
