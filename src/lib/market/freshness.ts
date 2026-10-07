/**
 * Freschezza del catalogo globale: quali fonti (pagine ufficiali dei fornitori) vanno
 * ricontrollate a mano. Niente scraping: le pagine ufficiali sono la fonte primaria e
 * per ora le verifica una persona del team della piattaforma (spec "Data trust").
 *
 * Progetto del "lavoro di verifica":
 * 1. le fonti si ricavano dal catalogo (catalog-data: URL di ogni voce di prezzo e di ogni modello),
 *    per area: prezzi (7 giorni), ciclo di vita (7), capacità (30);
 * 2. ultima verifica = la più recente tra la data scritta nel codice (la più vecchia delle voci
 *    di quella fonte) e quella registrata in AiCatalogSource da un admin ("Verified today");
 * 3. /system/catalog elenca le fonti scadute; il job giornaliero ne scrive il numero nel log;
 * 4. un prezzo nuovo si inserisce da /system/catalog: nuova versione in AiPricingComponent
 *    (la vecchia si chiude, mai sovrascritta) e cambiamento del mercato dallo stesso percorso.
 */
import type { Catalog } from "@/lib/pricing/catalog-data";

export type SourceArea = "pricing" | "lifecycle" | "capabilities";
export const STALE_DAYS: Record<SourceArea, number> = { pricing: 7, lifecycle: 7, capabilities: 30 };
const DAY = 86_400_000;

export interface CatalogSource {
  id: string;
  area: SourceArea;
  url: string | null;
  providerId: string | null;
  /** Voci del catalogo che vengono da questa fonte. */
  items: number;
  /** Data di verifica scritta nel codice (la più vecchia tra le voci). */
  codeVerifiedAt: Date;
  sourceTypes: string[];
}

export const sourceId = (area: SourceArea, url: string | null, providerId: string | null) => `${area}|${url ?? `no-url:${providerId ?? "?"}`}`;

/** Fonti del catalogo in codice, per area. */
export function catalogSources(cat: Catalog): CatalogSource[] {
  const map = new Map<string, CatalogSource>();
  const add = (area: SourceArea, url: string | null, providerId: string | null, verified: Date, type: string) => {
    if (type === "angar_estimate") return; // stime di angar: nessuna pagina da ricontrollare
    const id = sourceId(area, url, providerId);
    const s = map.get(id) ?? { id, area, url, providerId, items: 0, codeVerifiedAt: verified, sourceTypes: [] };
    s.items++;
    if (verified < s.codeVerifiedAt) s.codeVerifiedAt = verified;
    if (!s.sourceTypes.includes(type)) s.sourceTypes.push(type);
    map.set(id, s);
  };
  const ruleProvider = new Map<string, string | null>();
  const modelProvider = new Map(cat.models.map((m) => [m.id, m.providerId]));
  const productProvider = new Map(cat.products.map((p) => [p.id, p.providerId]));
  for (const r of cat.rules) ruleProvider.set(r.id, r.modelId ? modelProvider.get(r.modelId) ?? null : r.productId ? productProvider.get(r.productId) ?? null : null);
  for (const c of cat.components) add("pricing", c.sourceUrl, ruleProvider.get(c.ruleId) ?? null, c.lastVerifiedAt, c.sourceType);
  for (const m of cat.models) {
    add("lifecycle", m.sourceUrl, m.providerId, m.lastVerifiedAt, m.sourceType);
    add("capabilities", m.sourceUrl, m.providerId, m.lastVerifiedAt, m.sourceType);
  }
  return [...map.values()];
}

export interface SourceFreshness extends CatalogSource {
  lastVerifiedAt: Date;
  verifiedBy: string | null;
  ageDays: number;
  stale: boolean;
}

/** Stato di ogni fonte: ultima verifica (codice o admin), età, scaduta sì/no. */
export function freshness(sources: CatalogSource[], recorded: { id: string; lastVerifiedAt: Date; verifiedBy: string | null }[], now = new Date()): SourceFreshness[] {
  const rec = new Map(recorded.map((r) => [r.id, r]));
  return sources
    .map((s) => {
      const r = rec.get(s.id);
      const last = r && r.lastVerifiedAt > s.codeVerifiedAt ? r.lastVerifiedAt : s.codeVerifiedAt;
      const ageDays = Math.floor((now.getTime() - last.getTime()) / DAY);
      return { ...s, lastVerifiedAt: last, verifiedBy: r && r.lastVerifiedAt > s.codeVerifiedAt ? r.verifiedBy : null, ageDays, stale: !s.url || ageDays > STALE_DAYS[s.area] };
    })
    .sort((a, b) => Number(b.stale) - Number(a.stale) || b.ageDays - a.ageDays || a.id.localeCompare(b.id));
}

/** Dal database: fonti scadute e tutte le altre (per /system/catalog e per il job). */
export async function freshnessReport(now = new Date()) {
  const [{ db }, { catalog }] = await Promise.all([import("@/lib/db"), import("@/lib/pricing/service")]);
  const recorded = await db.aiCatalogSource.findMany({ select: { id: true, lastVerifiedAt: true, verifiedBy: true } });
  return freshness(catalogSources(catalog()), recorded, now);
}
