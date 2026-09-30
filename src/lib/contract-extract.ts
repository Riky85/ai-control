/**
 * Lettura di contratti, order form e fatture di AI (testo estratto dal PDF).
 *
 * Deterministico e prudente: regole multilingua (EN/IT/DE/FR) per fornitore,
 * piano, posti, prezzi, periodo di fatturazione, date di inizio/fine,
 * preavviso, tacito rinnovo e clausole sui dati. Nel dubbio il campo resta
 * vuoto: meglio chiedere che inventare. Claude (facoltativo, vedi
 * contract-actions.ts) può solo rifinire questo risultato, mai sostituirlo.
 * Funzioni pure: nessun database, si provano con testi di esempio.
 */
import { AI_SERVICES } from "@/lib/discovery/catalog";
import { PLANS, USD_TO_EUR } from "@/lib/pricing/catalog";
import { MERCHANT_RULES } from "@/lib/pricing/merchants";

export type DocKind = "contract" | "order" | "invoice";
export type Billing = "monthly" | "annual";

export interface DataClause {
  key: "dpa" | "gdpr" | "scc" | "residency" | "subprocessors" | "training" | "dpf";
  label: string;
  snippet: string;
}

export interface ContractFields {
  kind: DocKind | null;
  vendor: string | null;
  serviceId: string | null;
  plan: string | null;
  planId: string | null;
  seats: number | null;
  /** Prezzo di un posto, al mese, in EUR. */
  seatPriceEur: number | null;
  /** Totale del documento (netto IVA se indicato), in EUR. */
  totalEur: number | null;
  billing: Billing | null;
  /** Costo mensile ricavato (totale o posti × prezzo), in EUR. */
  monthlyEur: number | null;
  currency: "EUR" | "USD" | "GBP" | null;
  contractStart: string | null; // AAAA-MM-GG
  contractEnd: string | null;
  noticeDays: number | null;
  autoRenew: boolean | null;
  dataClauses: DataClause[];
}

export const EMPTY_FIELDS: ContractFields = {
  kind: null,
  vendor: null,
  serviceId: null,
  plan: null,
  planId: null,
  seats: null,
  seatPriceEur: null,
  totalEur: null,
  billing: null,
  monthlyEur: null,
  currency: null,
  contractStart: null,
  contractEnd: null,
  noticeDays: null,
  autoRenew: null,
  dataClauses: [],
};

// ── Testo ────────────────────────────────────────────────────────────────

/** Spazi normalizzati, trattini e apostrofi tipografici semplificati. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/ | | /g, " ")
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’´`]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

// ── Date ────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {};
const addMonths = (names: string[][]) => names.forEach((list, i) => list.forEach((n) => (MONTHS[n] = i + 1)));
addMonths([
  ["january", "jan", "gennaio", "gen", "januar", "jänner", "janvier", "janv"],
  ["february", "feb", "febbraio", "febr", "februar", "février", "fevrier", "févr", "fevr"],
  ["march", "mar", "marzo", "märz", "maerz", "mär", "mars"],
  ["april", "apr", "aprile", "avril", "avr"],
  ["may", "maggio", "mag", "mai"],
  ["june", "jun", "giugno", "giu", "juni", "juin"],
  ["july", "jul", "luglio", "lug", "juli", "juillet", "juil"],
  ["august", "aug", "agosto", "ago", "août", "aout"],
  ["september", "sep", "sept", "settembre", "set", "septembre"],
  ["october", "oct", "ottobre", "ott", "oktober", "okt", "octobre"],
  ["november", "nov", "novembre"],
  ["december", "dec", "dicembre", "dic", "dezember", "dez", "décembre", "decembre", "déc"],
]);
const MONTH_RE = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .map((m) => m.replace(/\./g, "\\."))
  .join("|");

const iso = (y: number, m: number, d: number) => {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // 31 febbraio
  return dt.toISOString().slice(0, 10);
};

export interface FoundDate {
  iso: string;
  index: number;
  end: number;
}

// "31/12/2026", "31.12.2026", "2026-12-31", "31 December 2026", "31 dicembre 2026", "31. Dezember 2026", "1er janvier 2026", "December 31, 2026", "Dec 31 2026".
const DATE_RES: { re: RegExp; parse: (m: RegExpExecArray) => string | null }[] = [
  { re: /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g, parse: (m) => iso(+m[1], +m[2], +m[3]) },
  {
    re: /\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2}|\d{2})\b/g,
    parse: (m) => {
      const a = +m[1];
      const b = +m[2];
      // Ordine europeo; se il "mese" supera 12 è una data americana (mm/dd).
      return b > 12 && a <= 12 ? iso(+m[3], a, b) : iso(+m[3], b, a);
    },
  },
  {
    re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th|er|\\.|º|°)?\\s*(?:of\\s+)?(${MONTH_RE})\\.?,?\\s+(20\\d{2})\\b`, "gi"),
    parse: (m) => iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]),
  },
  {
    re: new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`, "gi"),
    parse: (m) => iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]),
  },
];

export function findDates(text: string): FoundDate[] {
  const out: FoundDate[] = [];
  for (const { re, parse } of DATE_RES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const v = parse(m);
      if (!v) continue;
      const index = m.index;
      const end = m.index + m[0].length;
      // Niente doppioni sovrapposti (la prima forma che copre il testo vince).
      if (out.some((d) => index < d.end && end > d.index)) continue;
      out.push({ iso: v, index, end });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Una data scritta in una sola stringa (per i campi rifiniti da Claude o dal form). */
export function parseOneDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return iso(+t.slice(0, 4), +t.slice(5, 7), +t.slice(8, 10));
  return findDates(t)[0]?.iso ?? null;
}

const START_LABEL =
  /(start(?:ing)?\s*date|effective\s*(?:date|as\s*of|from)|commencement\s*date|subscription\s*start|term\s*start|start\s*of\s*(?:the\s*)?(?:term|subscription)|starts?\s*on|beginning\s*on|valid\s*from|data\s*(?:di\s*)?(?:inizio|decorrenza|attivazione)|decorrenza(?:\s*dal)?|a\s*partire\s*dal|inizio\s*(?:contratto|abbonamento)|vertragsbeginn|laufzeitbeginn|beginn(?:\s*der\s*laufzeit)?|gültig\s*ab|gueltig\s*ab|wirksam\s*ab|date\s*de\s*(?:début|debut|prise\s*d'effet|démarrage)|prise\s*d'effet|à\s*compter\s*du|a\s*compter\s*du|date\s*d'effet)\s*[:\-]?\s*(?:the\s*)?$/i;
const END_LABEL =
  /(end\s*date|expir(?:y|ation|es)(?:\s*date)?(?:\s*on)?|termination\s*date|term\s*end|end\s*of\s*(?:the\s*)?(?:initial\s*)?(?:term|subscription)|renewal\s*date|valid\s*(?:until|through|thru)|ends?\s*on|data\s*(?:di\s*)?(?:fine|scadenza|termine)|scadenza(?:\s*contratto)?|scade\s*il|fino\s*al|vertragsende|laufzeitende|ablauf(?:datum)?|endet\s*am|gültig\s*bis|gueltig\s*bis|date\s*de\s*(?:fin|(?:d')?expiration|(?:d')?échéance|renouvellement)|expire\s*le|jusqu'au)\s*[:\-]?\s*(?:the\s*)?$/i;
const RANGE_JOIN = /^\s*(?:-|to|until|through|thru|al|a|fino\s*al|bis(?:\s*zum)?|au|jusqu'au)\s*$/i;
const RANGE_FROM = /(?:from|dal|vom|du|period|periodo|zeitraum|période|periode|term|laufzeit|durata)\s*[:\-]?\s*$/i;

/** Mesi di durata ("12 months", "durata di 12 mesi", "Laufzeit von 12 Monaten", "durée de 12 mois", "one year"). */
function termMonths(t: string): number | null {
  const m =
    /(?:term|duration|period|durata|laufzeit|mindestlaufzeit|durée|duree|subscription)[^.\n]{0,40}?\b(\d{1,2})\s*(months?|mesi|monate?n?|mois|years?|anni|anno|jahre?n?|ans?)\b/i.exec(t) ??
    /\b(\d{1,2})[- ](month|year)\s*(?:term|subscription|commitment)/i.exec(t);
  if (m) {
    const n = +m[1];
    return /^(y|ann|jahr|an)/i.test(m[2]) ? n * 12 : n;
  }
  if (/\b(?:one|1)[- ]year\s*(?:term|subscription|commitment)|durata\s*annuale|laufzeit\s*von\s*einem\s*jahr|durée\s*d'un\s*an/i.test(t)) return 12;
  return null;
}

function addMonthsIso(isoDay: string, months: number): string {
  const d = new Date(isoDay + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  d.setUTCDate(d.getUTCDate() - 1); // "12 mesi dal 1/1" = fino al 31/12
  return d.toISOString().slice(0, 10);
}

function contractDates(t: string): { start: string | null; end: string | null } {
  const dates = findDates(t);
  let start: string | null = null;
  let end: string | null = null;
  // 1) etichette esplicite subito prima della data
  for (const d of dates) {
    const before = t.slice(Math.max(0, d.index - 60), d.index);
    if (!start && START_LABEL.test(before)) start = d.iso;
    else if (!end && END_LABEL.test(before)) end = d.iso;
  }
  // 2) intervalli "dal X al Y", "from X to Y", "X – Y"
  if (!start || !end) {
    for (let i = 0; i < dates.length - 1; i++) {
      const a = dates[i];
      const b = dates[i + 1];
      if (b.iso <= a.iso || !RANGE_JOIN.test(t.slice(a.end, b.index))) continue;
      const before = t.slice(Math.max(0, a.index - 40), a.index);
      // Un intervallo nudo vale solo se è l'unico o se preceduto da "periodo/term/from".
      if (!RANGE_FROM.test(before) && dates.length > 3) continue;
      start ??= a.iso;
      end ??= b.iso;
      break;
    }
  }
  // 3) inizio + durata
  if (start && !end) {
    const months = termMonths(t);
    if (months && months <= 120) end = addMonthsIso(start, months);
  }
  if (start && end && end <= start) end = null;
  return { start, end };
}

// ── Preavviso e rinnovo ─────────────────────────────────────────────────

const WORD_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, six: 6, twelve: 12, fifteen: 15, thirty: 30, sixty: 60, ninety: 90,
  uno: 1, un: 1, due: 2, tre: 3, sei: 6, quindici: 15, trenta: 30, sessanta: 60, novanta: 90,
  einem: 1, einen: 1, eins: 1, zwei: 2, drei: 3, sechs: 6, dreißig: 30, dreissig: 30, sechzig: 60, neunzig: 90,
  deux: 2, trois: 3, quinze: 15, trente: 30, soixante: 60, "quatre-vingt-dix": 90,
};
const NUM = `(\\d{1,3}|${Object.keys(WORD_NUM).sort((a, b) => b.length - a.length).join("|")})`;
const UNIT = `(days?|calendar\\s*days|business\\s*days|weeks?|months?|giorni|settimane|mesi|tage[n]?|wochen|monate[n]?|jours|semaines|mois)`;
const num = (s: string) => (/^\d+$/.test(s) ? +s : WORD_NUM[s.toLowerCase()] ?? NaN);
const toDays = (n: number, unit: string) => (/^(week|settiman|woche|semaine)/i.test(unit) ? n * 7 : /^(month|mes|monat|mois)/i.test(unit) ? n * 30 : n);

const NOTICE_RES: RegExp[] = [
  // "notice period of 30 days", "30 (thirty) days' prior written notice", "at least 30 days before the end of the term"
  new RegExp(`notice\\s*(?:period)?\\s*(?:of|is|shall\\s*be|:)?\\s*(?:at\\s*least|not\\s*less\\s*than|no\\s*less\\s*than|minimum)?\\s*${NUM}\\s*(?:\\(\\s*\\w+\\s*\\)\\s*)?${UNIT}`, "i"),
  new RegExp(`${NUM}\\s*(?:\\(\\s*\\w+\\s*\\)\\s*)?${UNIT}'?\\s*(?:prior\\s*|advance\\s*|written\\s*|prior\\s*written\\s*)*notice`, "i"),
  new RegExp(`(?:at\\s*least|no\\s*later\\s*than|not\\s*less\\s*than)\\s*${NUM}\\s*${UNIT}\\s*(?:before|prior\\s*to)\\s*(?:the\\s*)?(?:end|expir|renewal|term)`, "i"),
  // IT
  new RegExp(`preavviso\\s*(?:scritto\\s*)?(?:di|minimo\\s*di|pari\\s*a|:)?\\s*(?:almeno\\s*)?${NUM}\\s*${UNIT}`, "i"),
  new RegExp(`${NUM}\\s*${UNIT}\\s*(?:di\\s*)?preavviso`, "i"),
  new RegExp(`(?:almeno|entro)\\s*${NUM}\\s*${UNIT}\\s*prima\\s*(?:della|dalla)\\s*scadenza`, "i"),
  // DE
  new RegExp(`kündigungsfrist\\s*(?:von|beträgt|:)?\\s*${NUM}\\s*${UNIT}`, "i"),
  new RegExp(`(?:mit\\s*einer\\s*frist\\s*von|frist\\s*von)\\s*${NUM}\\s*${UNIT}`, "i"),
  new RegExp(`${NUM}\\s*${UNIT}\\s*(?:vor|zum)\\s*(?:ablauf|ende|vertragsende)`, "i"),
  // FR
  new RegExp(`préavis\\s*(?:écrit\\s*)?(?:de|d'au\\s*moins|minimum\\s*de|:)?\\s*${NUM}\\s*${UNIT}`, "i"),
  new RegExp(`${NUM}\\s*${UNIT}\\s*(?:de\\s*)?préavis`, "i"),
  new RegExp(`${NUM}\\s*${UNIT}\\s*avant\\s*(?:la\\s*)?(?:date\\s*d'|l')?(?:échéance|expiration|fin)`, "i"),
];

function noticeDays(t: string): number | null {
  for (const re of NOTICE_RES) {
    const m = re.exec(t);
    if (!m) continue;
    const n = num(m[1]);
    if (!Number.isFinite(n)) continue;
    const d = toDays(n, m[2]);
    if (d >= 0 && d <= 730) return d;
  }
  return null;
}

const RENEW_NO =
  /(?:will|shall|does)\s*not\s*(?:be\s*)?(?:auto(?:matically)?[- ]?)?renew|no\s*auto(?:matic)?[- ]?renew|not\s*(?:be\s*)?(?:subject\s*to\s*)?auto(?:matic)?[- ]?renew|auto[- ]?renew(?:al)?\s*[:\-]\s*(?:no|off|false|disabled)|senza\s*(?:tacito\s*)?rinnovo|escluso\s*(?:il\s*)?tacito\s*rinnovo|non\s*(?:si\s*)?rinnov|non\s*è\s*previsto\s*(?:il\s*)?(?:tacito\s*)?rinnovo|keine\s*(?:automatische|stillschweigende)\s*verlängerung|endet\s*automatisch|verlängert\s*sich\s*nicht|sans\s*(?:tacite\s*)?reconduction|pas\s*(?:de\s*)?(?:renouvellement|reconduction)\s*(?:automatique|tacite)|ne\s*(?:sera|se)\s*(?:pas\s*)?renouvel/i;
const RENEW_YES =
  /auto(?:matic(?:ally)?)?[- ]?renew|renews?\s*automatically|shall\s*(?:be\s*)?(?:automatically\s*)?renew(?:ed)?\s*for|successive\s*renewal\s*terms|evergreen|tacito\s*rinnovo|rinnovo\s*(?:tacito|automatico)|si\s*rinnova\s*(?:tacitamente|automaticamente)|tacitamente\s*rinnovat|stillschweigend\s*verlängert|verlängert\s*sich\s*(?:automatisch|stillschweigend|jeweils)|automatische\s*verlängerung|reconduction\s*tacite|tacitement\s*reconduit|renouvel(?:é|e|able)?\s*(?:automatiquement|tacitement)|renouvellement\s*automatique/i;

function autoRenew(t: string): boolean | null {
  if (RENEW_NO.test(t)) return false;
  if (RENEW_YES.test(t)) return true;
  return null;
}

// ── Importi ────────────────────────────────────────────────────────────

/** "1.234,56" / "1,234.56" / "1234" / "25,00" → numero. */
export function parseAmount(s: string): number | null {
  let x = s.replace(/[\s']/g, "");
  if (!/\d/.test(x)) return null;
  const lastDot = x.lastIndexOf(".");
  const lastComma = x.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    x = x.replace(dec === "." ? /,/g : /\./g, "").replace(",", ".");
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? "," : ".";
    const parts = x.split(sep);
    // Un solo separatore con 3 cifre dopo = migliaia ("1.200", "12,000"); altrimenti decimali.
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) x = parts.join("");
    else x = parts.join(".");
  }
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export interface FoundMoney {
  value: number;
  currency: "EUR" | "USD" | "GBP";
  index: number;
  end: number;
}

const CUR = (s: string): FoundMoney["currency"] => (/\$|usd/i.test(s) ? "USD" : /£|gbp/i.test(s) ? "GBP" : "EUR");
const AMT = `(\\d{1,3}(?:[.,' ]\\d{3})+(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)`;
const MONEY_RES = [
  new RegExp(`(€|eur|euro|\\$|usd|us\\$|£|gbp)\\s?${AMT}`, "gi"),
  new RegExp(`${AMT}\\s?(€|eur\\b|euro\\b|\\$|usd\\b|£|gbp\\b)`, "gi"),
];

export function findMoney(t: string): FoundMoney[] {
  const out: FoundMoney[] = [];
  MONEY_RES.forEach((re, k) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const cur = k === 0 ? m[1] : m[2];
      const amt = k === 0 ? m[2] : m[1];
      const value = parseAmount(amt);
      if (value == null || value <= 0 || value > 10_000_000) continue;
      const index = m.index;
      const end = m.index + m[0].length;
      if (out.some((x) => index < x.end && end > x.index)) continue;
      out.push({ value, currency: CUR(cur), index, end });
    }
  });
  return out.sort((a, b) => a.index - b.index);
}

const toEur = (m: FoundMoney) => (m.currency === "USD" ? m.value * USD_TO_EUR : m.currency === "GBP" ? m.value * 1.17 : m.value);
const round2 = (n: number) => Math.round(n * 100) / 100;

const SEAT_WORDS = `(?:seats?|licen[cs]es?|users?|members?|posti|postazioni|utenti|licenze|lizenzen|nutzer|benutzer|plätze|arbeitsplätze|sièges|sieges|licences|utilisateurs|postes)`;
const EACH =
  /(?:per|\/|a|each|pro|je|par|x|al|ogni|for\s*each)\s*(?:seat|user|licen[cs]e|member|posto|utente|licenza|persona|nutzer|lizenz|benutzer|platz|siège|siege|utilisateur|licence|poste)|unit\s*price|prezzo\s*unitario|einzelpreis|stückpreis|prix\s*unitaire|price\s*per\s*unit/i;
const PER_YEAR = /(?:per|\/|a|pro|par|all'|l'|al)\s*(?:year|yr|anno|jahr|an)\b|annual(?:ly)?|yearly|annuo|annuale|jährlich|annuel/i;
const PER_MONTH = /(?:per|\/|a|pro|par|al)\s*(?:month|mo|mese|monat|mois)\b|monthly|mensile|monatlich|mensuel/i;
const TOTAL_LABEL =
  /(grand\s*total|total\s*(?:amount|due|price|fees?|payable)?|amount\s*(?:due|payable)|totale(?:\s*(?:documento|fattura|da\s*pagare|dovuto))?|importo\s*(?:totale|dovuto)|gesamt(?:betrag|summe|preis)?|summe|rechnungsbetrag|endbetrag|montant\s*(?:total|dû|du)|total\s*(?:ttc|ht))\b/i;
const NET_LABEL = /(subtotal|sub-total|net\s*(?:amount|total)|total\s*(?:excl|before\s*tax|net)|imponibile|totale\s*imponibile|netto|nettobetrag|zwischensumme|summe\s*netto|total\s*ht|montant\s*ht|sous-total)\b/i;

function seatsOf(t: string): number | null {
  const labelled = new RegExp(`(?:number\\s*of\\s*${SEAT_WORDS}|quantity|qty|quantità|numero\\s*(?:di\\s*)?(?:posti|utenti|licenze)|anzahl(?:\\s*(?:der\\s*)?(?:lizenzen|nutzer))?|menge|quantité|nombre\\s*de\\s*(?:licences|utilisateurs|sièges))\\s*[:\\-]?\\s*(\\d{1,5})\\b`, "i").exec(t);
  if (labelled && +labelled[1] > 0) return +labelled[1];
  const re = new RegExp(`\\b(\\d{1,5})\\s*(?:x\\s*)?(?:[a-z]+\\s+)?${SEAT_WORDS}\\b`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const n = +m[1];
    const before = t.slice(Math.max(0, m.index - 20), m.index);
    // "up to 150 users", "max 5 utenti": limiti del piano, non posti comprati.
    if (/(?:up\s*to|max(?:imum)?|minimum|min\.?|fino\s*a|bis\s*zu|jusqu'à)\s*$/i.test(before)) continue;
    if (n > 0 && n <= 100000) return n;
  }
  return null;
}

// ── Fornitore e piano ───────────────────────────────────────────────────

// Nomi di piano usati nei contratti che nel listino hanno un altro nome.
const PLAN_ALIASES: [RegExp, string][] = [
  [/chatgpt\s*team\b/i, "chatgpt-business"],
  [/claude\s*(?:for\s*work\s*)?\(?team\s*(?:plan)?\)?/i, "claude-team"],
  [/github\s*copilot\s*for\s*business/i, "github-copilot-business"],
  [/microsoft\s*365\s*copilot(?!\s*business)/i, "copilot-m365"],
];

function planOf(t: string): { planId: string; plan: string; serviceId: string } | null {
  const lower = t.toLowerCase();
  const byLength = [...PLANS].sort((a, b) => b.name.length - a.name.length);
  for (const p of byLength) {
    const name = p.name.toLowerCase().replace(/\s*\(.*\)$/, "");
    const at = lower.indexOf(name);
    if (at < 0) continue;
    // Il posto "premium" solo se il testo lo dice.
    if (/premium/i.test(p.name) && !/premium/i.test(t.slice(at, at + name.length + 40))) continue;
    return { planId: p.id, plan: p.name, serviceId: p.service };
  }
  for (const [re, id] of PLAN_ALIASES) {
    if (re.test(t)) {
      const p = PLANS.find((x) => x.id === id)!;
      return { planId: p.id, plan: p.name, serviceId: p.service };
    }
  }
  return null;
}

function serviceOfText(t: string): string | null {
  if (/github/i.test(t) && /copilot/i.test(t)) return "github-copilot";
  let best: { id: string; n: number; order: number } | null = null;
  MERCHANT_RULES.forEach((r, order) => {
    const re = new RegExp(r.match.source, "gi");
    const n = (t.match(re) ?? []).length;
    if (n > 0 && (!best || n > best.n)) best = { id: r.service, n, order };
  });
  const b = best as { id: string; n: number } | null;
  if (!b) return null;
  // "OpenAI" compare in ogni contratto ChatGPT: se si parla di ChatGPT, è ChatGPT.
  if (b.id === "openai-api" && /chatgpt/i.test(t)) return "chatgpt";
  if (b.id === "anthropic-api" && /claude(?!\s*api)/i.test(t) && !/\bapi\b/i.test(t)) return "claude";
  return b.id;
}

function genericPlan(t: string, serviceName: string | null): string | null {
  if (!serviceName) return null;
  const esc = serviceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`${esc}\\s+(Team|Teams|Business|Enterprise|Pro|Plus|Max|Premium|Starter|Standard|Advanced)\\b`, "i").exec(t);
  return m ? `${serviceName} ${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()}` : null;
}

// ── Clausole sui dati ─────────────────────────────────────────────────

const CLAUSES: { key: DataClause["key"]; label: string; re: RegExp }[] = [
  { key: "dpa", label: "Data processing agreement (DPA)", re: /data\s*processing\s*(?:agreement|addendum|terms)|\bDPA\b|accordo\s*(?:sul|per\s*il)\s*trattamento\s*dei\s*dati|nomina\s*a\s*responsabile\s*del\s*trattamento|auftragsverarbeitungs(?:vertrag|vereinbarung)|\bAVV\b|accord\s*de\s*traitement\s*des\s*données|art(?:icle|\.)?\s*28/i },
  { key: "gdpr", label: "GDPR", re: /\bGDPR\b|\bRGPD\b|\bDSGVO\b|\bGDPR\b|general\s*data\s*protection\s*regulation|regolamento\s*(?:\(ue\)\s*)?2016\/679|regulation\s*\(eu\)\s*2016\/679/i },
  { key: "scc", label: "Standard contractual clauses", re: /standard\s*contractual\s*clauses|\bSCCs?\b|clausole\s*contrattuali\s*(?:tipo|standard)|standardvertragsklauseln|clauses\s*contractuelles\s*types/i },
  { key: "dpf", label: "EU-US Data Privacy Framework", re: /data\s*privacy\s*framework|\bDPF\b/i },
  { key: "residency", label: "Data location / EU residency", re: /data\s*residency|stored\s*(?:in|within)\s*the\s*(?:EU|European|EEA)|(?:EU|EEA)\s*data\s*(?:region|boundary|residency)|European\s*Economic\s*Area|dati\s*(?:conservati|archiviati|trattati)\s*(?:nell'|in\s*)(?:ue|unione\s*europea)|datenresidenz|speicherung\s*in\s*der\s*eu|hébergement\s*(?:des\s*données\s*)?(?:dans\s*l'|en\s*)(?:ue|union\s*européenne)|résidence\s*des\s*données/i },
  { key: "subprocessors", label: "Sub-processors", re: /sub-?processors?|sub-?responsabili|unterauftragsverarbeiter|sous-traitants?\s*ultérieurs?/i },
  { key: "training", label: "Use of your data for training", re: /(?:not|never)\s*(?:be\s*)?use[ds]?\s*(?:\w+\s*){0,6}to\s*(?:train|improve)|train(?:ing)?\s*(?:our|its|the)?\s*models?|model\s*training|addestra(?:re|mento)|trainieren|training\s*(?:der|von)\s*modell|entraîn(?:er|ement)/i },
];

function dataClauses(t: string): DataClause[] {
  const out: DataClause[] = [];
  for (const c of CLAUSES) {
    const m = c.re.exec(t);
    if (!m) continue;
    let from = Math.max(0, t.lastIndexOf("\n", m.index) + 1, m.index - 70);
    // Lo spezzone parte da una parola intera.
    if (from > 0 && /\S/.test(t[from - 1] ?? "")) from = Math.min(m.index, t.indexOf(" ", from) + 1 || m.index);
    const snippet = t.slice(from, Math.min(t.length, m.index + m[0].length + 70)).replace(/\s+/g, " ").trim();
    out.push({ key: c.key, label: c.label, snippet: snippet.length > 160 ? snippet.slice(0, 157) + "…" : snippet });
  }
  return out;
}

function kindOf(t: string): DocKind | null {
  const head = t.slice(0, 1500);
  if (/\b(invoice|fattura|rechnung|facture|receipt|ricevuta|quittung|reçu)\b/i.test(head)) return "invoice";
  if (/\b(order\s*form|purchase\s*order|quote|quotation|ordine|preventivo|offerta|bestellung|bestellformular|angebot|bon\s*de\s*commande|devis)\b/i.test(head)) return "order";
  if (/\b(agreement|contract|terms|contratto|accordo|condizioni|vertrag|vereinbarung|contrat|conditions)\b/i.test(t)) return "contract";
  return null;
}

// ── Prezzi ──────────────────────────────────────────────────────────────

function billingOf(t: string): Billing | null {
  const annualStrong = /billed\s*(?:annually|yearly)|annual\s*(?:billing|subscription|plan|commitment|fee)|fatturazione\s*annuale|abbonamento\s*annuale|jährliche\s*(?:abrechnung|zahlung)|jahresabo|facturation\s*annuelle|abonnement\s*annuel/i.test(t);
  const monthlyStrong = /billed\s*monthly|monthly\s*(?:billing|subscription|plan|fee)|fatturazione\s*mensile|abbonamento\s*mensile|monatliche\s*(?:abrechnung|zahlung)|facturation\s*mensuelle|abonnement\s*mensuel/i.test(t);
  if (annualStrong && !monthlyStrong) return "annual";
  if (monthlyStrong && !annualStrong) return "monthly";
  const a = (t.match(new RegExp(PER_YEAR.source, "gi")) ?? []).length;
  const m = (t.match(new RegExp(PER_MONTH.source, "gi")) ?? []).length;
  if (a > m) return "annual";
  if (m > a) return "monthly";
  return annualStrong ? "annual" : null;
}

function prices(t: string, seats: number | null, billing: Billing | null) {
  const money = findMoney(t);
  let seatPrice: { eur: number; perYear: boolean } | null = null;
  let total: number | null = null;
  let net: number | null = null;
  let currency: FoundMoney["currency"] | null = money[0]?.currency ?? null;
  for (const m of money) {
    const before = t.slice(Math.max(0, m.index - 50), m.index);
    const after = t.slice(m.end, m.end + 45);
    const lineStart = t.lastIndexOf("\n", m.index) + 1;
    const line = t.slice(lineStart, m.index);
    if (!seatPrice && (EACH.test(after.slice(0, 30)) || /(?:unit\s*price|prezzo\s*unitario|einzelpreis|prix\s*unitaire|price\s*per\s*(?:seat|user))\s*[:\-]?\s*$/i.test(before))) {
      const perYear = PER_YEAR.test(after) && !PER_MONTH.test(after);
      seatPrice = { eur: toEur(m), perYear: perYear || (!PER_MONTH.test(after) && billing === "annual" && /annual|year|anno|jahr|an\b/i.test(after)) };
      currency = m.currency;
      continue;
    }
    if (NET_LABEL.test(line) || NET_LABEL.test(before.slice(-30))) {
      net = toEur(m);
      currency = m.currency;
    } else if (TOTAL_LABEL.test(line) || TOTAL_LABEL.test(before.slice(-30))) {
      total = toEur(m); // l'ultimo "totale" del documento vince (di solito il totale finale)
      currency = m.currency;
    }
  }
  const docTotal = net ?? total;
  // Prezzo a posto ricavato dal totale quando manca.
  let seatMonthly = seatPrice ? (seatPrice.perYear ? seatPrice.eur / 12 : seatPrice.eur) : null;
  let monthly: number | null = null;
  let billed = billing;
  const near = (a: number, b: number) => Math.abs(a - b) / b <= 0.15;
  if (docTotal != null && seatMonthly != null && seats) {
    // Posti × prezzo al mese contro il totale: dice se il totale copre un mese o un anno.
    const expected = seatMonthly * seats;
    if (near(docTotal, expected * 12)) {
      monthly = docTotal / 12;
      billed = "annual";
    } else if (near(docTotal, expected)) monthly = docTotal;
    else monthly = expected;
  } else if (docTotal != null) monthly = billing === "annual" ? docTotal / 12 : docTotal;
  if (monthly == null && seatMonthly != null && seats) monthly = seatMonthly * seats;
  if (seatMonthly == null && monthly != null && seats && seats > 1) seatMonthly = monthly / seats;
  return {
    billing: billed,
    seatPriceEur: seatMonthly != null ? round2(seatMonthly) : null,
    totalEur: docTotal != null ? round2(docTotal) : null,
    monthlyEur: monthly != null ? round2(monthly) : null,
    currency,
  };
}

// ── Tutto insieme ────────────────────────────────────────────────────────

export function extractContract(raw: string): ContractFields {
  const t = normalizeText(raw);
  if (!t) return { ...EMPTY_FIELDS };
  const plan = planOf(t);
  const serviceId = plan?.serviceId ?? serviceOfText(t);
  const service = serviceId ? AI_SERVICES.find((s) => s.id === serviceId) : undefined;
  const seats = seatsOf(t);
  const billing = billingOf(t);
  const money = prices(t, seats, billing);
  const { start, end } = contractDates(t);
  return {
    kind: kindOf(t),
    vendor: service?.vendor ?? null,
    serviceId: serviceId ?? null,
    plan: plan?.plan ?? genericPlan(t, service?.name ?? null),
    planId: plan?.planId ?? null,
    seats,
    seatPriceEur: money.seatPriceEur,
    totalEur: money.totalEur,
    billing: money.billing,
    monthlyEur: money.monthlyEur,
    currency: money.currency,
    contractStart: start,
    contractEnd: end,
    noticeDays: noticeDays(t),
    autoRenew: autoRenew(t),
    dataClauses: dataClauses(t),
  };
}

// ── Abbinamento all'AI dell'azienda ────────────────────────────────────

export interface AssetRef {
  id: string;
  name: string;
  vendor: string | null;
  serviceId: string | null;
}

const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** L'AI dell'azienda a cui si riferisce il documento (servizio, poi fornitore, poi nome nel testo). */
export function matchAsset(fields: Pick<ContractFields, "serviceId" | "vendor">, assets: AssetRef[], text = "", serviceOf?: (a: AssetRef) => string | null): string | null {
  const body = clean(text).slice(0, 20000);
  let best: { id: string; score: number } | null = null;
  for (const a of assets) {
    let score = 0;
    const sid = a.serviceId ?? serviceOf?.(a) ?? null;
    if (fields.serviceId && sid === fields.serviceId) score += 10;
    else if (fields.serviceId && sid && sid.split("-")[0] === fields.serviceId.split("-")[0]) score += 5;
    const v = a.vendor ? clean(a.vendor) : "";
    const fv = fields.vendor ? clean(fields.vendor) : "";
    if (v && fv && (v === fv || v.includes(fv) || fv.includes(v))) score += 4;
    const n = clean(a.name);
    if (n.length >= 4 && body.includes(n)) score += 3;
    if (score > 0 && (!best || score > best.score)) best = { id: a.id, score };
  }
  return best?.id ?? null;
}
