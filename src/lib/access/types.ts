/**
 * Accessi delle app di terze parti (consensi OAuth su Microsoft 365 / Google Workspace):
 * classificazione degli scope e riconoscimento delle app AI. Puro.
 */
import { AI_SERVICES } from "@/lib/discovery/catalog";
import { matchMerchant } from "@/lib/pricing/merchants";

export type GrantProvider = "MICROSOFT_365" | "GOOGLE_WORKSPACE";
export const GRANT_PROVIDERS: GrantProvider[] = ["MICROSOFT_365", "GOOGLE_WORKSPACE"];
export const PROVIDER_LABEL: Record<GrantProvider, string> = { MICROSOFT_365: "Microsoft 365", GOOGLE_WORKSPACE: "Google Workspace" };
export const isGrantProvider = (v: string): v is GrantProvider => v === "MICROSOFT_365" || v === "GOOGLE_WORKSPACE";

export type ScopeArea = "mail" | "files" | "calendar" | "contacts" | "chat" | "directory" | "signin" | "other";
export const AREA_LABEL: Record<ScopeArea, string> = {
  mail: "Mail",
  files: "Files",
  calendar: "Calendar",
  contacts: "Contacts",
  chat: "Chat",
  directory: "Directory",
  signin: "Sign-in only",
  other: "Other",
};
/** Aree sensibili: in evidenza nella tabella. */
export const SENSITIVE: ScopeArea[] = ["mail", "files", "calendar", "chat", "directory"];

/** Area di uno scope (Microsoft Graph "Mail.Read" o Google "https://www.googleapis.com/auth/gmail.readonly"). */
export function scopeArea(scope: string): ScopeArea {
  const s = scope.trim();
  if (/gmail|mail\.google\.com|^Mail\.|^IMAP\.|^POP\.|^SMTP\.|EAS\.AccessAsUser|MailboxSettings|Exchange/i.test(s)) return "mail";
  if (/\/auth\/drive|documents|spreadsheets|presentations|^Files\.|^Sites\.|^Notes\./i.test(s)) return "files";
  if (/calendar|^Calendars\./i.test(s)) return "calendar";
  if (/contacts|^Contacts\.|^People\.|directory\.readonly/i.test(s)) return "contacts";
  if (/^Chat|ChannelMessage|^Team|OnlineMeeting|chat\.|meetings/i.test(s)) return "chat";
  if (/^Directory\.|^User\.(Read|ReadWrite)\.All|^Group\.|admin\.directory|^RoleManagement|^Application\./i.test(s)) return "directory";
  if (/^(openid|profile|email|offline_access|User\.Read|User\.ReadBasic\.All)$/i.test(s) || /userinfo\.(email|profile)|\/auth\/plus\.me/i.test(s)) return "signin";
  return "other";
}

/** Aree distinte, nell'ordine di gravità. */
export function scopeAreas(scopes: string[]): ScopeArea[] {
  const order: ScopeArea[] = ["mail", "files", "calendar", "chat", "contacts", "directory", "other", "signin"];
  const got = new Set(scopes.map(scopeArea));
  const out = order.filter((a) => got.has(a));
  // "Sign-in only" solo se non c'è altro.
  return out.length > 1 ? out.filter((a) => a !== "signin") : out;
}

/** Scope che scrive (non solo legge): la revoca diventa più urgente. */
export const writes = (scopes: string[]) => scopes.some((s) => /ReadWrite|\.Send|Manage|FullControl|mail\.google\.com\/?$|\/auth\/drive$|\/auth\/calendar$|gmail\.(send|modify|compose)/i.test(s));

const AI_WORDS = /\b(ai|gpt|llm|genai|chatbot|copilot|assistant)\b|\.ai\b|openai|anthropic/i;

/** È un'app AI? Servizio del catalogo (se riconosciuto) o parole tipiche nel nome/editore. */
export function classifyApp(name: string, publisher?: string | null): { isAi: boolean; serviceId: string | null } {
  const text = `${name} ${publisher ?? ""}`;
  const svc = matchMerchant(text) ?? AI_SERVICES.find((s) => s.name.length > 3 && new RegExp(`\\b${s.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text))?.id ?? null;
  if (svc) return { isAi: true, serviceId: svc };
  return { isAi: AI_WORDS.test(text), serviceId: null };
}

export interface GrantCapability {
  connected: boolean;
  canRead: boolean;
  canRevoke: boolean;
  /** Perché non si può leggere o revocare (testo per l'interfaccia). */
  readWhy?: string;
  revokeWhy?: string;
}

export interface FetchedGrant {
  appId: string;
  appName: string;
  publisher: string | null;
  scopes: string[];
  userCount: number;
  userRefs: string[];
  adminConsent: boolean;
}
