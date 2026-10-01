/**
 * Catalogo dei mittenti email dei servizi AI (iscrizioni, accessi, ricevute).
 * Serve allo storico email dei connettori Microsoft 365 e Google Workspace
 * (connectors/email-history.ts): si cercano solo i messaggi di questi mittenti
 * e si legge l'oggetto SOLO in memoria per capire il tipo di messaggio.
 * Né l'oggetto né il testo vengono mai salvati.
 *
 * Modulo puro (niente database): si può provare senza server.
 */
import { AI_SERVICES } from "./catalog";

export type SignalKind = "signup" | "login" | "billing" | "other";
export const SIGNAL_KINDS: SignalKind[] = ["signup", "login", "billing", "other"];

export interface EmailSender {
  /** Servizio del catalogo (discovery/catalog.ts). */
  service: string;
  /** Dominio del mittente, per suffisso: "openai.com" copre "tm.openai.com". */
  domains: string[];
  /**
   * Domini condivisi da molti prodotti (github.com, microsoft.com, google.com):
   * conta solo se l'oggetto nomina il prodotto. `word` è la parola usata nella ricerca.
   */
  subject?: { word: string; re: RegExp };
  /** Oggetto → servizio più preciso (es. "API" → openai-api invece di chatgpt). */
  routes?: { re: RegExp; service: string }[];
}

export const EMAIL_SENDERS: EmailSender[] = [
  // Modelli e assistenti
  { service: "chatgpt", domains: ["openai.com", "tm.openai.com", "email.openai.com", "mail.openai.com", "chatgpt.com"], routes: [{ re: /\bAPI\b|platform|organi[sz]ation/i, service: "openai-api" }] },
  { service: "claude", domains: ["anthropic.com", "mail.anthropic.com", "claude.ai", "claude.com", "email.claude.com"], routes: [{ re: /claude code/i, service: "claude-code" }, { re: /\bAPI\b|console|credit balance/i, service: "anthropic-api" }] },
  { service: "gemini", domains: ["google.com"], subject: { word: "Gemini", re: /\bgemini\b/i }, routes: [{ re: /code assist/i, service: "gemini-code" }, { re: /gemini api|ai studio/i, service: "gemini-api" }] },
  { service: "copilot", domains: ["microsoft.com"], subject: { word: "Copilot", re: /\bcopilot\b/i } },
  { service: "github-copilot", domains: ["github.com"], subject: { word: "Copilot", re: /\bcopilot\b/i } },
  { service: "perplexity", domains: ["perplexity.ai", "perplexity.com"] },
  { service: "mistral", domains: ["mistral.ai"], routes: [{ re: /\bAPI\b|la plateforme|console/i, service: "mistral-api" }] },
  { service: "deepseek", domains: ["deepseek.com"] },
  { service: "grok", domains: ["x.ai"] },
  { service: "poe", domains: ["poe.com"] },
  { service: "character-ai", domains: ["character.ai"] },
  { service: "you", domains: ["you.com"] },
  { service: "pi", domains: ["pi.ai", "inflection.ai"] },
  { service: "kimi", domains: ["moonshot.ai", "moonshot.cn", "kimi.com"] },
  { service: "manus", domains: ["manus.im"] },
  { service: "genspark", domains: ["genspark.ai"] },
  { service: "chatpdf", domains: ["chatpdf.com"] },
  // Sviluppo
  { service: "cursor", domains: ["cursor.com", "cursor.sh", "mail.cursor.com"] },
  { service: "windsurf", domains: ["windsurf.com", "codeium.com"] },
  { service: "tabnine", domains: ["tabnine.com"] },
  { service: "lovable", domains: ["lovable.dev", "lovable.app"] },
  { service: "replit", domains: ["replit.com"] },
  { service: "bolt", domains: ["bolt.new", "stackblitz.com"] },
  { service: "v0", domains: ["vercel.com"], subject: { word: "v0", re: /\bv0\b/i } },
  { service: "devin", domains: ["cognition.ai", "devin.ai"] },
  { service: "augment", domains: ["augmentcode.com"] },
  { service: "phind", domains: ["phind.com"] },
  { service: "warp", domains: ["warp.dev"] },
  { service: "sourcegraph-cody", domains: ["sourcegraph.com"], subject: { word: "Cody", re: /\bcody\b/i } },
  // API
  { service: "openrouter", domains: ["openrouter.ai"] },
  { service: "together", domains: ["together.ai", "together.xyz"] },
  { service: "groq", domains: ["groq.com"] },
  { service: "cohere", domains: ["cohere.com"] },
  { service: "replicate", domains: ["replicate.com"] },
  { service: "huggingface", domains: ["huggingface.co"] },
  { service: "fireworks", domains: ["fireworks.ai"] },
  // Scrittura e presentazioni
  { service: "grammarly", domains: ["grammarly.com"] },
  { service: "jasper", domains: ["jasper.ai"] },
  { service: "notion-ai", domains: ["notion.so", "mail.notion.so", "makenotion.com"], subject: { word: "AI", re: /\bAI\b/ } },
  { service: "deepl", domains: ["deepl.com"] },
  { service: "quillbot", domains: ["quillbot.com"] },
  { service: "wordtune", domains: ["wordtune.com"] },
  { service: "writesonic", domains: ["writesonic.com"] },
  { service: "copy-ai", domains: ["copy.ai"] },
  { service: "rytr", domains: ["rytr.me"] },
  { service: "gamma", domains: ["gamma.app"] },
  { service: "tome", domains: ["tome.app"] },
  { service: "beautiful-ai", domains: ["beautiful.ai"] },
  { service: "napkin", domains: ["napkin.ai"] },
  // Immagini, video, voce, musica
  { service: "midjourney", domains: ["midjourney.com"] },
  { service: "elevenlabs", domains: ["elevenlabs.io"] },
  { service: "runway", domains: ["runwayml.com"] },
  { service: "leonardo", domains: ["leonardo.ai"] },
  { service: "ideogram", domains: ["ideogram.ai"] },
  { service: "krea", domains: ["krea.ai"] },
  { service: "firefly", domains: ["adobe.com"], subject: { word: "Firefly", re: /\bfirefly\b/i } },
  { service: "stability", domains: ["stability.ai"] },
  { service: "pika", domains: ["pika.art"] },
  { service: "luma", domains: ["lumalabs.ai"] },
  { service: "synthesia", domains: ["synthesia.io"] },
  { service: "heygen", domains: ["heygen.com"] },
  { service: "descript", domains: ["descript.com"] },
  { service: "suno", domains: ["suno.com"] },
  { service: "udio", domains: ["udio.com"] },
  // Riunioni
  { service: "otter", domains: ["otter.ai"] },
  { service: "fireflies", domains: ["fireflies.ai"] },
  { service: "tldv", domains: ["tldv.io"] },
  { service: "read-ai", domains: ["read.ai"] },
  { service: "fathom", domains: ["fathom.video"] },
  { service: "krisp", domains: ["krisp.ai"] },
];

const SERVICE_IDS = new Set(AI_SERVICES.map((s) => s.id));

/** Indirizzo del mittente da "Nome <a@b.c>" o "a@b.c" (minuscolo), null se non è un indirizzo. */
export function senderAddress(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim();
  const m = v.match(/<([^<>\s]+@[^<>\s]+)>/) ?? v.match(/([^\s<>"',;]+@[^\s<>"',;]+)/);
  return m ? m[1].toLowerCase().replace(/\.$/, "") : null;
}

const domainMatches = (host: string, d: string) => host === d || host.endsWith("." + d);

// Parti locali del mittente che dicono già il tipo di messaggio (prima dell'oggetto).
const LOCAL_BILLING = /(billing|invoice|receipt|payment|payments|charges|orders?|stripe|paddle|accounts-payable)/i;
const LOCAL_LOGIN = /(otp|login|signin|sign-in|verify|verification|auth|security|account-security|magic|passcode|2fa|mfa)/i;
const LOCAL_SIGNUP = /(welcome|onboarding|hello|getstarted|get-started)/i;

// Oggetto (solo in memoria): parole dei messaggi di iscrizione, accesso, fatturazione.
const SUBJ_BILLING_STRONG = /receipt|invoice|payment|billing|charged|refund|ricevuta|fattura|pagamento|rechnung|zahlung|facture|paiement|factura|pago/i;
const SUBJ_SIGNUP = /welcome|verify your email|confirm your (email|account)|activate your|get started|thanks for signing up|signing up|account (has been )?created|you['’]re in|joined|benvenut|willkommen|bienvenue|bienvenid/i;
const SUBJ_LOGIN = /sign[- ]?in|log[- ]?in|verification code|one[- ]time|login code|magic link|security code|\bOTP\b|your code|\bcode is\b|\b\d{6}\b|new device|password|codice di verifica|accesso|anmelde|connexion|inicio de sesi/i;
const SUBJ_BILLING_SOFT = /subscription|renew|trial (ends|ending|expires)|your plan|upgrade|order|abbonamento|abonnement|suscripci/i;

/** Tipo di messaggio: prima il mittente, poi l'oggetto (letto solo qui, mai salvato). */
export function classifyKind(address: string, subject?: string | null): SignalKind {
  const local = address.split("@")[0] ?? "";
  if (LOCAL_BILLING.test(local)) return "billing";
  if (LOCAL_LOGIN.test(local)) return "login";
  if (LOCAL_SIGNUP.test(local)) return "signup";
  const s = String(subject ?? "");
  if (SUBJ_BILLING_STRONG.test(s)) return "billing";
  if (SUBJ_SIGNUP.test(s)) return "signup";
  if (SUBJ_LOGIN.test(s)) return "login";
  if (SUBJ_BILLING_SOFT.test(s)) return "billing";
  return "other";
}

/**
 * Messaggio → servizio AI e tipo, oppure null se il mittente non è nel catalogo
 * (o il dominio è condiviso e l'oggetto non nomina il prodotto).
 */
export function classifyEmail(from: string | null | undefined, subject?: string | null): { service: string; kind: SignalKind } | null {
  const address = senderAddress(from);
  if (!address) return null;
  const host = address.split("@")[1] ?? "";
  // Il dominio più lungo vince: "mail.anthropic.com" prima di "anthropic.com".
  let best: { sender: EmailSender; len: number } | null = null;
  for (const sender of EMAIL_SENDERS) {
    if (sender.subject && !sender.subject.re.test(String(subject ?? ""))) continue;
    for (const d of sender.domains) {
      if (domainMatches(host, d) && (!best || d.length > best.len)) best = { sender, len: d.length };
    }
  }
  if (!best) return null;
  const s = String(subject ?? "");
  const routed = best.sender.routes?.find((r) => r.re.test(s))?.service;
  const service = routed && SERVICE_IDS.has(routed) ? routed : best.sender.service;
  if (!SERVICE_IDS.has(service)) return null;
  return { service, kind: classifyKind(address, subject) };
}

/** Termini di ricerca: un dominio, con la parola dell'oggetto se il dominio è condiviso. */
export interface SearchTerm {
  domain: string;
  word?: string;
}

export function searchTerms(): SearchTerm[] {
  const out: SearchTerm[] = [];
  const seen = new Set<string>();
  for (const s of EMAIL_SENDERS) {
    // Anche i sottodomini (tm.openai.com…): la ricerca di Microsoft non li copre sempre col dominio principale.
    for (const domain of s.domains) {
      const key = `${domain}|${s.subject?.word ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ domain, word: s.subject?.word });
    }
  }
  return out;
}

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Query KQL per Microsoft Graph ($search sui messaggi). Le date di KQL sono a
 * giorni: il filtro esatto sull'ora si fa poi in memoria su receivedDateTime.
 */
export function graphKql(terms: SearchTerm[], after: Date, until: Date): string {
  const from = terms.map((t) => (t.word ? `(from:${t.domain} AND subject:${t.word})` : `from:${t.domain}`)).join(" OR ");
  const end = new Date(until.getTime() + 86400000);
  return `(${from}) AND received>=${day(after)} AND received<=${day(end)}`;
}

/** Query Gmail (q): after/before in secondi, esatti. */
export function gmailQuery(terms: SearchTerm[], after: Date, until: Date): string {
  const from = terms.map((t) => (t.word ? `(from:${t.domain} subject:${t.word})` : `from:${t.domain}`)).join(" OR ");
  return `(${from}) after:${Math.floor(after.getTime() / 1000)} before:${Math.ceil(until.getTime() / 1000) + 1}`;
}
