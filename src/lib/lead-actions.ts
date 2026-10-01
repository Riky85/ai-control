"use server";

import { headers } from "next/headers";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/mail";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { LEAD_COUNTRIES, EMPLOYEE_RANGES } from "@/lib/i18n-partners";

export type LeadFormResult = { ok: true } | { ok: false; code: "required" | "email" | "rate" | "server" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const str = (fd: FormData, k: string, max: number) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
};

/**
 * Candidature pubbliche da /partners (commercialisti, MSP) e /pilot (aziende
 * pilota): un Lead con kind "partner" o "pilot", poi un avviso a vendite e
 * amministratori della piattaforma (se l'email è configurata). Campo esca
 * ("website") contro i bot e al massimo 5 invii all'ora per IP.
 */
export async function submitLeadAction(formData: FormData): Promise<LeadFormResult> {
  const kind = str(formData, "kind", 10) === "pilot" ? "pilot" : "partner";
  // Esca compilata = bot: si risponde "ok" senza salvare nulla.
  if (str(formData, "website", 200)) return { ok: true };
  if (!rateLimit(`lead-form:${clientIp(headers())}`, 5, 3_600_000)) return { ok: false, code: "rate" };

  const name = str(formData, "name", 120);
  const company = str(formData, "company", 160);
  const email = str(formData, "email", 200).toLowerCase();
  const countryCode = str(formData, "country", 2).toUpperCase();
  const country = LEAD_COUNTRIES.includes(countryCode) ? countryCode : null;
  const phone = str(formData, "phone", 40).replace(/[^\d+()\-.\s]/g, "") || null;
  const note = str(formData, "message", 2000);
  const lang = str(formData, "lang", 5) || "en";
  const clientsRaw = Number(str(formData, "clients", 7));
  const clients = kind === "partner" && Number.isFinite(clientsRaw) && clientsRaw >= 0 ? Math.min(100_000, Math.round(clientsRaw)) : null;
  const employeesRaw = str(formData, "employees", 20);
  const employees = kind === "pilot" && EMPLOYEE_RANGES.includes(employeesRaw) ? employeesRaw : null;

  if (!name || !company || !country) return { ok: false, code: "required" };
  if (!EMAIL_RE.test(email)) return { ok: false, code: "email" };
  if (kind === "partner" && clients === null) return { ok: false, code: "required" };

  // Pilota: i dipendenti vanno nel messaggio (il modello non ha un campo apposito).
  const message = [employees ? `Employees: ${employees}` : null, note || null].filter(Boolean).join("\n") || null;

  try {
    // Stessa email e stesso tipo negli ultimi 10 minuti: doppio clic, niente duplicati.
    const recent = await db.lead.findFirst({ where: { email, kind, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } }, select: { id: true } });
    if (recent) return { ok: true };
    await db.lead.create({
      data: { kind, email, name, company, country, phone, message, clients, summary: { source: kind === "partner" ? "partners-page" : "pilot-page", lang } },
    });
  } catch (err) {
    console.error("[lead]", err);
    return { ok: false, code: "server" };
  }

  // Avviso interno: mai bloccante per chi compila il modulo.
  const to = Array.from(new Set([process.env.SALES_EMAIL, ...(process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",")].map((e) => e?.trim().toLowerCase()).filter((e): e is string => !!e && e.includes("@"))));
  const label = kind === "partner" ? "Partner application" : "Pilot application";
  const text = [
    `${label} from ${name} (${company}).`,
    "",
    `Email: ${email}`,
    `Country: ${country}`,
    clients !== null ? `Client companies: ${clients}` : null,
    employees ? `Employees: ${employees}` : null,
    phone ? `Phone: ${phone}` : null,
    `Page language: ${lang}`,
    note ? `\nMessage:\n${note}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");
  await Promise.all(to.map((addr) => sendEmail({ to: addr, subject: `angar — ${label.toLowerCase()}: ${company}`, text }).catch(() => undefined)));
  return { ok: true };
}
