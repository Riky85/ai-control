/**
 * AI Market Change engine — rilevamento (puro, nessun database).
 *
 * "Il mercato AI è cambiato: ci riguarda?" Qui si risponde alla prima metà: COSA è cambiato.
 * Ogni cambiamento è ricavato SOLO da dati versionati del catalogo che hanno una fonte:
 * - coppie di versioni di una voce di prezzo (AiPricingComponent: vecchia → nuova) → price_change;
 * - date del ciclo di vita del modello (deprecatedAt, retiresAt, releasedAt) → deprecation / retirement / new_model;
 * - una regola, una regione o un livello di servizio che compaiono DOPO l'inizio dei prezzi del modello
 *   → new_deployment / new_region / pricing_tier;
 * - differenze viste alla sincronizzazione (stato prima / dopo) → capability_change, ciclo di vita, regioni.
 * Mai inventare: niente fonte (URL) o solo stima angar = nessun cambiamento.
 *
 * Ogni cambiamento ha una chiave deterministica: rilevare due volte non duplica nulla.
 */

export type ChangeType = "price_change" | "new_model" | "deprecation" | "retirement" | "capability_change" | "new_deployment" | "new_region" | "pricing_tier";
export const CHANGE_TYPES: ChangeType[] = ["price_change", "new_model", "deprecation", "retirement", "capability_change", "new_deployment", "new_region", "pricing_tier"];

type Conf = "HIGH" | "MEDIUM" | "LOW";

export interface CompRow {
  ruleId: string;
  kind: string;
  unit: string;
  price: number;
  currency: string;
  region: string;
  serviceTier: string;
  contextAbove: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  sourceUrl: string | null;
  sourceType: string;
  confidence: string;
  detectedAt?: Date | null;
  note?: string | null;
}

export interface RuleRow {
  id: string;
  modelId: string | null;
  productId: string | null;
  planId: string | null;
  seatTypeId: string | null;
  deploymentId: string | null;
}

export interface ModelRow {
  id: string;
  providerId: string;
  name: string;
  family: string;
  tier: string | null;
  lifecycle: string;
  releasedAt: Date | null;
  deprecatedAt: Date | null;
  retiresAt: Date | null;
  replacementId: string | null;
  contextWindow: number | null;
  maxOutput: number | null;
  modalitiesIn: string[];
  modalitiesOut: string[];
  capabilities: unknown;
  sourceUrl: string | null;
  sourceType: string;
  confidence: string;
}

export interface Snapshot {
  components: CompRow[];
  rules: RuleRow[];
  models: ModelRow[];
  /** prodotto → fornitore (per i posti). */
  productProvider: Record<string, string>;
  /** deployment → fornitore che lo ospita. */
  deploymentHost?: Record<string, string>;
}

export interface ChangeDraft {
  key: string;
  changeType: ChangeType;
  providerId: string | null;
  modelId: string | null;
  productId: string | null;
  planId: string | null;
  ruleId: string | null;
  deploymentId: string | null;
  oldState: Record<string, unknown> | null;
  newState: Record<string, unknown>;
  announcedAt: Date | null;
  effectiveAt: Date | null;
  sourceUrl: string;
  sourceType: string;
  confidence: Conf;
  detectedAt: Date;
  summary: string;
  origin: "catalog" | "sync" | "admin";
}

const DAY = 86_400_000;
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
const CONF_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const lowerConf = (a: string, b: string): Conf => ((CONF_RANK[a] ?? 0) <= (CONF_RANK[b] ?? 0) ? a : b) as Conf;
/** Una fonte vale solo se ha un URL e non è una stima di angar. */
export const hasSource = (r: { sourceUrl: string | null; sourceType: string }) => !!r.sourceUrl && r.sourceType !== "angar_estimate";
const round = (n: number, d = 6) => Math.round(n * 10 ** d) / 10 ** d;
const pctOf = (o: number, n: number) => (o > 0 ? round(((n - o) / o) * 100, 1) : null);

/** Finestra dei "nuovi modelli" nel backfill: più vecchi non sono una novità del mercato. */
export const NEW_MODEL_WINDOW_DAYS = 120;

/** Voci che riassumono un cambio di prezzo, in ordine di importanza. */
const HEADLINE_KINDS = ["input", "output", "cached_input", "seat_monthly", "seat_annual", "cache_write", "cache_write_1h", "search", "credit", "embedding", "audio_input"];

export interface PriceItem {
  kind: string;
  region: string;
  serviceTier: string;
  contextAbove: number;
  unit: string;
  currency: string;
  old: number;
  new: number;
  pct: number | null;
}

/** Variazione "pesata" input:output = 3:1 (stessa regola di blendedPrice nel servizio prezzi). */
export function blendedPct(items: PriceItem[]): number | null {
  const head = items.filter((i) => i.region === "global" && i.serviceTier === "standard" && i.contextAbove === 0);
  const g = (k: string) => head.find((i) => i.kind === k);
  const inp = g("input");
  const out = g("output");
  if (inp && out) {
    const o = (inp.old * 3 + out.old) / 4;
    const n = (inp.new * 3 + out.new) / 4;
    return pctOf(o, n);
  }
  const one = g("seat_monthly") ?? g("seat_annual") ?? inp ?? out ?? head[0] ?? items[0];
  return one ? one.pct : null;
}

function ruleProvider(rule: RuleRow | undefined, models: Map<string, ModelRow>, snap: Snapshot): string | null {
  if (!rule) return null;
  if (rule.modelId) return models.get(rule.modelId)?.providerId ?? null;
  if (rule.productId) return snap.productProvider[rule.productId] ?? null;
  return null;
}

// ───────────────────────── prezzi ─────────────────────────

function priceChanges(snap: Snapshot, models: Map<string, ModelRow>, rules: Map<string, RuleRow>, now: Date): ChangeDraft[] {
  // Serie = stessa regola, voce, regione, livello, fascia di contesto; versioni in ordine di data.
  const series = new Map<string, CompRow[]>();
  for (const c of snap.components) {
    const k = [c.ruleId, c.kind, c.region, c.serviceTier, c.contextAbove].join("|");
    series.set(k, [...(series.get(k) ?? []), c]);
  }
  // Evento = regola + data della nuova versione (input, output, cache… cambiano insieme).
  const events = new Map<string, { ruleId: string; from: Date; pairs: [CompRow, CompRow][] }>();
  for (const list of series.values()) {
    list.sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const next = list[i];
      if (Math.abs(prev.price - next.price) < 1e-9 && prev.currency === next.currency) continue;
      const ek = `${next.ruleId}|${ymd(next.effectiveFrom)}`;
      const e = events.get(ek) ?? { ruleId: next.ruleId, from: next.effectiveFrom, pairs: [] };
      e.pairs.push([prev, next]);
      events.set(ek, e);
    }
  }
  const out: ChangeDraft[] = [];
  for (const e of events.values()) {
    const items: PriceItem[] = e.pairs.map(([o, n]) => ({ kind: n.kind, region: n.region, serviceTier: n.serviceTier, contextAbove: n.contextAbove, unit: n.unit, currency: n.currency, old: o.price, new: n.price, pct: o.currency === n.currency ? pctOf(o.price, n.price) : null }));
    // Voce principale: globale, standard, contesto 0, nell'ordine di HEADLINE_KINDS.
    const rank = (p: [CompRow, CompRow]) => {
      const n = p[1];
      const base = n.region === "global" && n.serviceTier === "standard" && n.contextAbove === 0 ? 0 : 100;
      const ki = HEADLINE_KINDS.indexOf(n.kind);
      return base + (ki < 0 ? 50 : ki);
    };
    const head = [...e.pairs].sort((a, b) => rank(a) - rank(b))[0];
    const [o, n] = head;
    // Mai inventare: la nuova versione deve avere una fonte vera.
    if (!hasSource(n)) continue;
    const rule = rules.get(e.ruleId);
    const providerId = ruleProvider(rule, models, snap);
    const model = rule?.modelId ? models.get(rule.modelId) : null;
    const headItems = items.filter((i) => i.region === "global" && i.serviceTier === "standard" && i.contextAbove === 0);
    const show = (headItems.length ? headItems : items).sort((a, b) => HEADLINE_KINDS.indexOf(a.kind) - HEADLINE_KINDS.indexOf(b.kind));
    const blended = blendedPct(items);
    const prices = (side: "old" | "new") => Object.fromEntries(show.map((i) => [i.kind, i[side]]));
    out.push({
      key: `price:${e.ruleId}:${ymd(e.from)}`,
      changeType: "price_change",
      providerId,
      modelId: rule?.modelId ?? null,
      productId: rule?.productId ?? null,
      planId: rule?.planId ?? null,
      ruleId: e.ruleId,
      deploymentId: rule?.deploymentId ?? null,
      oldState: { prices: prices("old"), currency: o.currency, unit: o.unit, effectiveFrom: ymd(o.effectiveFrom), sourceUrl: o.sourceUrl, confidence: o.confidence },
      newState: { prices: prices("new"), currency: n.currency, unit: n.unit, effectiveFrom: ymd(n.effectiveFrom), effectiveUntil: n.effectiveUntil ? ymd(n.effectiveUntil) : null, blendedPct: blended, items, note: n.note ?? null },
      announcedAt: null,
      effectiveAt: e.from,
      sourceUrl: n.sourceUrl!,
      sourceType: n.sourceType,
      confidence: lowerConf(o.confidence, n.confidence),
      detectedAt: n.detectedAt ?? now,
      summary: `${model?.name ?? rule?.planId ?? e.ruleId}: ${show.map((i) => `${i.kind.replace(/_/g, " ")} ${i.pct != null ? `${i.pct > 0 ? "+" : ""}${i.pct}%` : "changed"}`).join(", ")}`,
      origin: n.note?.startsWith("Entered by ") ? "admin" : "catalog",
    });
  }
  return out;
}

// ───────────────────────── deployment, regioni, livelli ─────────────────────────

function structuralChanges(snap: Snapshot, models: Map<string, ModelRow>, rules: Map<string, RuleRow>, now: Date): ChangeDraft[] {
  const out: ChangeDraft[] = [];
  const byRule = new Map<string, CompRow[]>();
  for (const c of snap.components) byRule.set(c.ruleId, [...(byRule.get(c.ruleId) ?? []), c]);
  const first = (l: CompRow[]) => l.reduce((m, c) => (c.effectiveFrom < m.effectiveFrom ? c : m), l[0]);
  // Inizio dei prezzi di ogni modello (tutte le regole).
  const modelStart = new Map<string, Date>();
  for (const [ruleId, list] of byRule) {
    const r = rules.get(ruleId);
    if (!r?.modelId) continue;
    const f = first(list).effectiveFrom;
    const cur = modelStart.get(r.modelId);
    if (!cur || f < cur) modelStart.set(r.modelId, f);
  }
  for (const [ruleId, list] of byRule) {
    const r = rules.get(ruleId);
    if (!r) continue;
    const providerId = ruleProvider(r, models, snap);
    const model = r.modelId ? models.get(r.modelId) : null;
    const ruleFirst = first(list);
    const base = { providerId, modelId: r.modelId, productId: r.productId, planId: r.planId, ruleId, deploymentId: r.deploymentId, announcedAt: null, origin: "catalog" as const };
    // Nuovo deployment: la regola comincia dopo il primo prezzo del modello.
    if (r.modelId && r.deploymentId) {
      const ms = modelStart.get(r.modelId);
      if (ms && ruleFirst.effectiveFrom > ms && hasSource(ruleFirst)) {
        out.push({ ...base, key: `deployment:${ruleId}`, changeType: "new_deployment", oldState: null, newState: { deploymentId: r.deploymentId, from: ymd(ruleFirst.effectiveFrom) }, effectiveAt: ruleFirst.effectiveFrom, sourceUrl: ruleFirst.sourceUrl!, sourceType: ruleFirst.sourceType, confidence: ruleFirst.confidence as Conf, detectedAt: ruleFirst.detectedAt ?? now, summary: `${model?.name ?? r.modelId} available on ${r.deploymentId}` });
      }
    }
    // Nuova regione / nuovo livello: compaiono dopo l'inizio della regola.
    for (const [field, type, prefix] of [["region", "new_region", "region"], ["serviceTier", "pricing_tier", "tier"]] as const) {
      const groups = new Map<string, CompRow[]>();
      for (const c of list) groups.set(c[field], [...(groups.get(c[field]) ?? []), c]);
      for (const [val, g] of groups) {
        // Solo valori nuovi rispetto alla base (regione globale, livello standard): la base non "compare".
        if (val === (field === "region" ? "global" : "standard")) continue;
        const f = first(g);
        if (f.effectiveFrom <= ruleFirst.effectiveFrom || !hasSource(f)) continue;
        out.push({ ...base, key: `${prefix}:${ruleId}:${val}`, changeType: type, oldState: null, newState: { [field]: val, from: ymd(f.effectiveFrom) }, effectiveAt: f.effectiveFrom, sourceUrl: f.sourceUrl!, sourceType: f.sourceType, confidence: f.confidence as Conf, detectedAt: f.detectedAt ?? now, summary: `${model?.name ?? r.planId ?? ruleId}: new ${field === "region" ? "region" : "tier"} ${val}` });
      }
    }
  }
  return out;
}

// ───────────────────────── ciclo di vita ─────────────────────────

const lifeState = (m: ModelRow) => ({ lifecycle: m.lifecycle, deprecatedAt: m.deprecatedAt ? ymd(m.deprecatedAt) : null, retiresAt: m.retiresAt ? ymd(m.retiresAt) : null, replacementId: m.replacementId });

function lifecycleChanges(snap: Snapshot, now: Date): ChangeDraft[] {
  const out: ChangeDraft[] = [];
  for (const m of snap.models) {
    if (!hasSource(m)) continue;
    const base = { providerId: m.providerId, modelId: m.id, productId: null, planId: null, ruleId: null, deploymentId: null, announcedAt: null, sourceUrl: m.sourceUrl!, sourceType: m.sourceType, confidence: m.confidence as Conf, detectedAt: now, origin: "catalog" as const };
    if (m.lifecycle === "deprecated" || m.lifecycle === "sunset" || m.deprecatedAt) {
      out.push({ ...base, key: deprecationKey(m), changeType: "deprecation", oldState: null, newState: lifeState(m), effectiveAt: m.deprecatedAt, summary: `${m.name} deprecated${m.retiresAt ? `, retires ${ymd(m.retiresAt)}` : ""}` });
    }
    if (m.retiresAt) {
      out.push({ ...base, key: retirementKey(m), changeType: "retirement", oldState: null, newState: lifeState(m), effectiveAt: m.retiresAt, summary: `${m.name} retires ${ymd(m.retiresAt)}` });
    }
    if (m.releasedAt && now.getTime() - m.releasedAt.getTime() <= NEW_MODEL_WINDOW_DAYS * DAY && m.providerId !== "angar") {
      out.push({ ...base, key: `new_model:${m.id}`, changeType: "new_model", oldState: null, newState: { ...lifeState(m), name: m.name, family: m.family, tier: m.tier, releasedAt: ymd(m.releasedAt) }, effectiveAt: m.releasedAt, summary: `${m.name} released` });
    }
  }
  return out;
}

export const deprecationKey = (m: Pick<ModelRow, "id" | "deprecatedAt">) => `deprecation:${m.id}:${m.deprecatedAt ? ymd(m.deprecatedAt) : "undated"}`;
export const retirementKey = (m: Pick<ModelRow, "id" | "retiresAt">) => `retirement:${m.id}:${m.retiresAt ? ymd(m.retiresAt) : "undated"}`;

/** Tutti i cambiamenti ricavabili dallo stato salvato (catalogo + versioni nel database). */
export function deriveChanges(snap: Snapshot, now = new Date()): ChangeDraft[] {
  const models = new Map(snap.models.map((m) => [m.id, m]));
  const rules = new Map(snap.rules.map((r) => [r.id, r]));
  const all = [...priceChanges(snap, models, rules, now), ...structuralChanges(snap, models, rules, now), ...lifecycleChanges(snap, now)];
  const seen = new Set<string>();
  return all.filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)));
}

// ───────────────────────── differenze alla sincronizzazione ─────────────────────────

/** Hash FNV-1a breve (chiavi deterministiche dei cambi di capacità). */
function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

const sortKeys = (o: unknown): unknown => (o && typeof o === "object" && !Array.isArray(o) ? Object.fromEntries(Object.entries(o as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : o);
const capState = (m: ModelRow) => ({ capabilities: sortKeys(m.capabilities ?? {}), contextWindow: m.contextWindow, maxOutput: m.maxOutput, modalitiesIn: [...m.modalitiesIn].sort(), modalitiesOut: [...m.modalitiesOut].sort() });

/**
 * Differenze tra lo stato dei modelli PRIMA della sincronizzazione (database) e DOPO (catalogo):
 * cambi di ciclo di vita senza data, capacità, modelli nuovi, regioni nuove dei deployment.
 * Con `before` vuoto (primo caricamento) non si segnala nulla: non è un cambiamento del mercato.
 */
export function diffModels(before: ModelRow[], after: ModelRow[], now = new Date(), deps?: { before: { id: string; regions: string[]; hostProviderId: string }[]; after: { id: string; regions: string[]; hostProviderId: string; sourceUrl?: string | null }[] }): ChangeDraft[] {
  const out: ChangeDraft[] = [];
  if (!before.length) return out;
  const prev = new Map(before.map((m) => [m.id, m]));
  for (const m of after) {
    if (!hasSource(m)) continue;
    const base = { providerId: m.providerId, modelId: m.id, productId: null, planId: null, ruleId: null, deploymentId: null, announcedAt: null, sourceUrl: m.sourceUrl!, sourceType: m.sourceType, confidence: m.confidence as Conf, detectedAt: now, origin: "sync" as const };
    const p = prev.get(m.id);
    if (!p) {
      out.push({ ...base, key: `new_model:${m.id}`, changeType: "new_model", oldState: null, newState: { ...lifeState(m), name: m.name, family: m.family, tier: m.tier, releasedAt: m.releasedAt ? ymd(m.releasedAt) : null }, effectiveAt: m.releasedAt ?? now, summary: `${m.name} added to the catalog` });
      continue;
    }
    if (p.lifecycle !== m.lifecycle) {
      const old = lifeState(p);
      if (m.lifecycle === "deprecated" || m.lifecycle === "sunset") out.push({ ...base, key: deprecationKey(m), changeType: "deprecation", oldState: old, newState: lifeState(m), effectiveAt: m.deprecatedAt ?? now, summary: `${m.name}: ${p.lifecycle} → ${m.lifecycle}` });
      else if (m.lifecycle === "retired") out.push({ ...base, key: retirementKey(m), changeType: "retirement", oldState: old, newState: lifeState(m), effectiveAt: m.retiresAt ?? now, summary: `${m.name}: ${p.lifecycle} → retired` });
      else if (p.lifecycle === "preview" && m.lifecycle === "active") out.push({ ...base, key: `ga:${m.id}`, changeType: "new_model", oldState: old, newState: { ...lifeState(m), name: m.name, family: m.family, tier: m.tier, generallyAvailable: true }, effectiveAt: now, summary: `${m.name} generally available` });
    }
    const a = capState(p);
    const b = capState(m);
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.push({ ...base, key: `capability:${m.id}:${fnv(JSON.stringify(b))}`, changeType: "capability_change", oldState: a as Record<string, unknown>, newState: b as Record<string, unknown>, effectiveAt: now, summary: `${m.name}: capabilities changed` });
    }
  }
  if (deps && deps.before.length) {
    const pd = new Map(deps.before.map((d) => [d.id, d]));
    for (const d of deps.after) {
      const p = pd.get(d.id);
      if (!p || !d.sourceUrl) continue;
      for (const r of d.regions.filter((x) => !p.regions.includes(x))) {
        out.push({ key: `region:${d.id}:${r}`, changeType: "new_region", providerId: d.hostProviderId, modelId: null, productId: null, planId: null, ruleId: null, deploymentId: d.id, oldState: { regions: p.regions }, newState: { regions: d.regions, region: r }, announcedAt: null, effectiveAt: now, sourceUrl: d.sourceUrl, sourceType: "official", confidence: "MEDIUM", detectedAt: now, summary: `${d.id}: new region ${r}`, origin: "sync" });
      }
    }
  }
  return out;
}
