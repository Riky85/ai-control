/**
 * Modelli di documento del Trust Center: blocchi semplici, resi da
 * /trust/docs/[slug] e stampabili (o salvabili in PDF). I segnaposto
 * [[…]] sono le parti che il cliente deve completare.
 */
export type DocBlock =
  | { h: string }
  | { h3: string }
  | { p: string }
  | { ul: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { sign: string[] };

export interface TrustDoc {
  title: string;
  subtitle?: string;
  blocks: DocBlock[];
}

export interface DocVersion {
  /** Codice lingua (attributo lang della pagina) e chiave nell'URL (?v=). */
  id: string;
  lang: string;
  label: string;
}

export interface TrustDocMeta {
  slug: string;
  title: string;
  summary: string;
  kind: string;
  versions: DocVersion[];
  /** Modello da far rivedere a un legale (mostra l'avviso). */
  template: boolean;
  build: (version: string) => TrustDoc;
}

/** Avviso "non è consulenza legale", nella lingua del documento. */
export const DISCLAIMER: Record<string, string> = {
  en: "Template — not legal advice. Have it reviewed by your labour lawyer or data protection adviser before use.",
  it: "Modello — non costituisce consulenza legale. Fallo verificare dal tuo consulente del lavoro o legale prima di usarlo.",
  de: "Muster — keine Rechtsberatung. Lassen Sie es vor der Verwendung von Ihrer Fachanwältin oder Ihrem Fachanwalt für Arbeitsrecht prüfen.",
  fr: "Modèle — ne constitue pas un conseil juridique. Faites-le relire par votre avocat en droit du travail avant toute utilisation.",
  es: "Plantilla — no constituye asesoramiento jurídico. Haz que la revise tu abogado laboralista antes de usarla.",
};
