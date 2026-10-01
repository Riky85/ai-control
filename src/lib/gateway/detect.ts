/**
 * angar Gateway — rilevatori di dati sensibili (puri, niente database).
 *
 * - Redazione: IBAN (controllo mod-97), codice fiscale italiano (carattere di
 *   controllo), email, carte di pagamento (Luhn) e numeri di telefono, sostituiti
 *   con [IBAN], [TAX_CODE], [EMAIL], [CARD], [PHONE] prima di inoltrare.
 * - Dati sanitari: elenco prudente di parole chiave in EN/IT/DE/FR/ES. Si
 *   preferisce perdere un caso che bloccare richieste normali: solo termini
 *   chiaramente medici, niente parole ambigue ("diagnosi" da sola, "Rezept"...).
 *
 * Il testo serve solo in memoria: qui si contano i tipi, mai i valori.
 */

export const REDACT_KINDS = ["IBAN", "TAX_CODE", "EMAIL", "CARD", "PHONE"] as const;
export type RedactKind = (typeof REDACT_KINDS)[number];
export type RedactCounts = Partial<Record<RedactKind, number>>;

export const REDACT_LABEL: Record<RedactKind, string> = {
  IBAN: "IBAN",
  TAX_CODE: "Tax code",
  EMAIL: "Email",
  CARD: "Card number",
  PHONE: "Phone number",
};

export const isRedactKind = (k: string): k is RedactKind => (REDACT_KINDS as readonly string[]).includes(k);

// ── IBAN ──────────────────────────────────────────────────────────────────

/** Controllo mod-97 (ISO 13616) su un IBAN compatto e maiuscolo. */
export function ibanValid(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const code = ch.charCodeAt(0);
    const digits = code >= 65 ? String(code - 55) : ch;
    for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

/**
 * Candidati IBAN: due lettere, due cifre, poi caratteri alfanumerici con spazi
 * singoli opzionali. Il candidato può "mangiare" parole che seguono (es. "… 456 and"):
 * si accorcia dalla fine finché il mod-97 torna.
 */
function redactIban(text: string, count: (k: RedactKind) => void): string {
  const re = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}/gi;
  let out = "";
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const cand = m[0];
    // posizioni nel candidato dei caratteri non-spazio
    const idx: number[] = [];
    for (let i = 0; i < cand.length; i++) if (cand[i] !== " ") idx.push(i);
    let found = -1;
    for (let n = Math.min(idx.length, 34); n >= 15; n--) {
      const compact = idx.slice(0, n).map((i) => cand[i]).join("");
      // l'IBAN deve finire a fine parola
      const endPos = m.index + idx[n - 1] + 1;
      if (endPos < text.length && /[A-Za-z0-9]/.test(text[endPos])) continue;
      if (/^[A-Z]{2}/.test(compact) && ibanValid(compact)) {
        found = idx[n - 1] + 1;
        break;
      }
    }
    if (found < 0) {
      re.lastIndex = m.index + 1;
      continue;
    }
    out += text.slice(last, m.index) + "[IBAN]";
    last = m.index + found;
    re.lastIndex = last;
    count("IBAN");
  }
  return out + text.slice(last);
}

// ── Codice fiscale ───────────────────────────────────────────────────────

const CF_ODD: Record<string, number> = {
  "0": 1, "1": 0, "2": 5, "3": 7, "4": 9, "5": 13, "6": 15, "7": 17, "8": 19, "9": 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};

/** Carattere di controllo del codice fiscale (16 caratteri, anche con omocodia). */
export function codiceFiscaleValid(raw: string): boolean {
  const cf = raw.toUpperCase();
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const c = cf[i];
    if ((i + 1) % 2 === 1) sum += CF_ODD[c];
    else sum += /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 65;
  }
  return String.fromCharCode(65 + (sum % 26)) === cf[15];
}

// ── Carte (Luhn) ─────────────────────────────────────────────────────────

export function luhnValid(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

// Prefissi dei circuiti principali (Visa 4, Mastercard 51-55 / 2221-2720, Amex 34/37, Discover 6, JCB 35, Diners 36/38/30).
const CARD_PREFIX = /^(4|5[1-5]|2[2-7]|3[0478]|35|6)/;

// ── Telefono ─────────────────────────────────────────────────────────────

/**
 * Prudente: solo numeri in formato internazionale (+39 / 0039 …) o formati locali
 * chiaramente telefonici con separatori (fisso con 0, cellulare italiano 3xx,
 * (555) 123-4567). Un numero d'ordine, un importo o una data non corrispondono.
 */
const PHONE_RES: RegExp[] = [
  /(?<![\w+])(?:\+|00)[1-9]\d{0,2}[\s.-]?(?:\(\d{1,4}\)[\s.-]?)?\d{2,4}(?:[\s.-]?\d{2,4}){1,4}(?!\w)/g,
  /(?<![\w/.-])0\d{1,4}[\s/-]\d{3,4}[\s-]?\d{3,4}(?![\w/.-])/g,
  /(?<![\w/.-])3\d{2}[\s.-]\d{3}[\s.-]?\d{3,4}(?![\w/.-])/g,
  /(?<![\w])\(\d{3}\)\s?\d{3}-\d{4}(?!\w)/g,
];

// ── Redazione ────────────────────────────────────────────────────────────

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}/g;
const CF_RE = /\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b/gi;
const CARD_RE = /(?<![\d+-])\d(?:[ -]?\d){12,18}(?![\d-])/g;

/**
 * Sostituisce i valori dei tipi scelti. Ordine: IBAN, codice fiscale, email,
 * carta, telefono (un IBAN già sostituito non diventa una carta o un telefono).
 */
export function redactText(text: string, kinds: readonly RedactKind[] = REDACT_KINDS, counts: RedactCounts = {}): { text: string; counts: RedactCounts } {
  const on = new Set(kinds);
  const count = (k: RedactKind) => {
    counts[k] = (counts[k] ?? 0) + 1;
  };
  let t = text;
  if (on.has("IBAN")) t = redactIban(t, count);
  if (on.has("TAX_CODE"))
    t = t.replace(CF_RE, (m) => {
      if (!codiceFiscaleValid(m)) return m;
      count("TAX_CODE");
      return "[TAX_CODE]";
    });
  if (on.has("EMAIL"))
    t = t.replace(EMAIL_RE, () => {
      count("EMAIL");
      return "[EMAIL]";
    });
  if (on.has("CARD"))
    t = t.replace(CARD_RE, (m) => {
      const digits = m.replace(/\D/g, "");
      if (!CARD_PREFIX.test(digits) || !luhnValid(digits)) return m;
      count("CARD");
      return "[CARD]";
    });
  if (on.has("PHONE"))
    for (const re of PHONE_RES)
      t = t.replace(re, (m) => {
        const n = m.replace(/\D/g, "").length;
        if (n < 8 || n > 15) return m;
        count("PHONE");
        return "[PHONE]";
      });
  return { text: t, counts };
}

export const totalRedactions = (c: RedactCounts | null | undefined) => Object.values(c ?? {}).reduce((s, n) => s + (n ?? 0), 0);

// ── Dati sanitari ────────────────────────────────────────────────────────

/** Termini (già senza accenti, minuscoli). Solo termini medici non ambigui. */
export const HEALTH_TERMS: Record<"en" | "it" | "de" | "fr" | "es", string[]> = {
  en: ["diagnosed with", "medical diagnosis", "psychiatric diagnosis", "medical record", "medical records", "medical history", "health record", "patient record", "patient file", "prescribed medication", "prescription drug", "chemotherapy", "antidepressant", "antidepressants", "hiv positive", "hiv-positive", "blood test results", "sick note", "mental health condition"],
  it: ["diagnosi medica", "cartella clinica", "referto medico", "referti medici", "anamnesi", "prescrizione medica", "ricetta medica", "chemioterapia", "antidepressivo", "antidepressivi", "sieropositivo", "sieropositiva", "certificato medico", "esami del sangue", "malattia cronica"],
  de: ["arztliche diagnose", "diagnostiziert", "krankenakte", "patientenakte", "arztbrief", "befundbericht", "arztliches attest", "krankschreibung", "arbeitsunfahigkeitsbescheinigung", "chemotherapie", "antidepressiva", "hiv-positiv", "blutwerte"],
  fr: ["diagnostic medical", "diagnostique avec", "dossier medical", "dossier patient", "ordonnance medicale", "certificat medical", "arret maladie", "chimiotherapie", "antidepresseur", "antidepresseurs", "seropositif", "seropositive", "analyses de sang"],
  es: ["diagnostico medico", "diagnosticado con", "diagnosticada con", "historia clinica", "historial medico", "expediente medico", "receta medica", "certificado medico", "baja medica", "quimioterapia", "antidepresivo", "antidepresivos", "seropositivo", "seropositiva", "analisis de sangre"],
};

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const HEALTH_RE = new RegExp(`(?<![a-z0-9])(?:${Object.values(HEALTH_TERMS).flat().map(escape).join("|")})(?![a-z0-9])`);

/** true se il testo contiene un termine sanitario dell'elenco. */
export function mentionsHealthData(text: string): boolean {
  return HEALTH_RE.test(fold(text));
}
