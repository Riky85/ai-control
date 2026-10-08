/**
 * angar Engine — Previsione della spesa AI e avvisi di anomalia.
 *
 * Deterministico, solo database, nessun LLM. Ogni numero ha un fatto dietro:
 * addebiti reali (SpendRecord), costi mensili delle AI (monthlyOf), rinnovi
 * annuali e contratti inseriti dall'utente, persone che usano ogni AI.
 *
 * Le funzioni pure (projectSpend, findAnomalies) non toccano il database:
 * si possono provare con dati finti. I caricatori (forecastSpend,
 * detectAnomalies, anomalyAlerts) leggono il database e le chiamano.
 */
import { db } from "@/lib/db";
import { createAlert, type AlertSeverity } from "@/lib/alerts";
import { loadAssets, monthlyOf, serviceOf } from "@/lib/savings";
import { listSeatEur } from "@/lib/engine/price-index";
import { fmtEur } from "@/lib/format";

const DAY = 86400000;

// ───────────────────────── utilità ─────────────────────────

/** Chiave del mese in UTC: "AAAA-MM". */
export const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/** Primo giorno (UTC) del mese spostato di `add` mesi. */
function monthStart(d: Date, add = 0) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + add, 1));
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const MONTH_NAME = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthLabel = (key: string) => `${MONTH_NAME[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

// ───────────────────────── previsione ─────────────────────────

/** Limiti della crescita mensile usata per proiettare (−5% … +8% al mese). */
export const GROWTH_MIN = -0.05;
export const GROWTH_MAX = 0.08;
/** Banda low–high: ~80% (z = 1,28) sulla volatilità dei rapporti mese su mese. */
const BAND_Z = 1.28;

export interface ForecastAsset {
  id: string;
  name: string;
  /** Costo mensile (equivalente) dell'AI; 0 se non pagata. */
  monthlyEur: number;
  annual: boolean;
  /** Ultimo addebito reale (serve per i rinnovi annuali). */
  lastCharge: { date: Date; eur: number } | null;
  createdAt: Date;
  contractEnd: Date | null;
  autoRenew: boolean | null;
}

export interface ForecastInput {
  now: Date;
  months: number;
  /** Spesa reale dei mesi COMPLETI, dal più vecchio (solo mesi con dati o tra mesi con dati). */
  history: { month: string; eur: number }[];
  assets: ForecastAsset[];
}

export interface SpendForecast {
  history: { month: string; eur: number }[];
  projection: { month: string; eur: number; low: number; high: number }[];
  /** Somma dei primi 12 mesi proiettati (dal mese in corso). */
  next12Eur: number;
  /** Spesa ricorrente tra 12 mesi rispetto a oggi, in % (crescita composta, contratti in scadenza inclusi). */
  growthPct: number;
  /** Crescita mensile usata (0.03 = +3% al mese). */
  monthlyGrowth: number;
  /** Da dove viene la crescita. */
  growthBasis: "history" | "new_ai" | "none";
  /** Spesa ricorrente mensile oggi (senza i rinnovi annuali). */
  runRateEur: number;
  drivers: string[];
}

/**
 * Proiezione mese per mese (il primo mese è quello in corso, k = 0):
 *   ricorrente_k = Σ costi mensili delle AI attive nel mese × (1 + g)^k
 *   eur_k        = ricorrente_k + rinnovi annuali che cadono nel mese k
 *   low/high     = ricorrente_k × e^(∓1,28 · σ · √(k+1)) + rinnovi
 * g: mediana dei rapporti mese su mese (ultimi 6, mesi con spesa > 0), limitata
 *    a [−5%, +8%] e ridotta verso 0 con pochi dati (× n/(n+2)); con meno di 2
 *    rapporti, metà del ritmo delle AI nuove (costo aggiunto in 90 giorni / 3 / run-rate).
 * σ: deviazione robusta (MAD × 1,4826) dei log-rapporti, tra 4% e 30%; 12% se pochi dati.
 * Le AI annuali con un addebito noto escono dal run-rate e pesano solo nel mese di rinnovo;
 * un contratto con disdetta (autoRenew = false) smette di pesare dopo la sua fine.
 */
export function projectSpend(input: ForecastInput): SpendForecast {
  const { now, months } = input;
  const history = input.history;
  const start = monthStart(now);
  const horizon = monthStart(now, months);

  // Rapporti mese su mese (solo coppie consecutive con spesa > 0), ultimi 6.
  const ratios: number[] = [];
  for (let i = 1; i < history.length; i++) if (history[i - 1].eur > 0 && history[i].eur > 0) ratios.push(history[i].eur / history[i - 1].eur);
  const recent = ratios.slice(-6);

  // Run-rate ricorrente e rinnovi annuali.
  type Line = { asset: ForecastAsset; until: Date | null };
  const recurring: Line[] = [];
  const renewals: { month: string; eur: number; name: string }[] = [];
  for (const a of input.assets) {
    if (a.monthlyEur <= 0 && !a.lastCharge) continue;
    const ends = a.contractEnd && a.autoRenew === false && a.contractEnd.getTime() >= start.getTime() ? a.contractEnd : null;
    if (a.contractEnd && a.autoRenew === false && a.contractEnd.getTime() < start.getTime()) continue; // contratto già finito
    if (a.annual && a.lastCharge && a.lastCharge.eur > 0) {
      const next = new Date(a.lastCharge.date);
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      while (next.getTime() < start.getTime()) next.setUTCFullYear(next.getUTCFullYear() + 1);
      while (next.getTime() < horizon.getTime()) {
        if (!ends || next.getTime() <= ends.getTime()) renewals.push({ month: monthKey(next), eur: a.lastCharge.eur, name: a.name });
        next.setUTCFullYear(next.getUTCFullYear() + 1);
      }
      continue;
    }
    if (a.monthlyEur > 0) recurring.push({ asset: a, until: ends });
  }
  let runRate = recurring.reduce((t, l) => t + l.asset.monthlyEur, 0);
  let fromHistory = false;
  if (runRate <= 0 && history.length) {
    // Nessun costo sulle AI: si parte dalla mediana degli ultimi 3 mesi reali.
    runRate = median(history.slice(-3).map((h) => h.eur));
    fromHistory = runRate > 0;
  }

  // Crescita.
  const newSince = now.getTime() - 90 * DAY;
  const fresh = input.assets.filter((a) => a.createdAt.getTime() >= newSince && a.monthlyEur > 0);
  const freshEur = fresh.reduce((t, a) => t + a.monthlyEur, 0);
  let g = 0;
  let basis: SpendForecast["growthBasis"] = "none";
  if (recent.length >= 2) {
    const n = recent.length;
    g = clamp(median(recent) - 1, GROWTH_MIN, GROWTH_MAX) * (n / (n + 2));
    basis = "history";
  } else if (freshEur > 0 && runRate > 0) {
    g = clamp((freshEur / 3 / runRate) * 0.5, 0, GROWTH_MAX);
    basis = "new_ai";
  }
  if (Math.abs(g) < 0.001) {
    g = 0;
    if (basis === "new_ai") basis = "none";
  }
  const logs = recent.map((r) => Math.log(r));
  const sigma = logs.length >= 3 ? clamp(median(logs.map((l) => Math.abs(l - median(logs)))) * 1.4826, 0.04, 0.3) : 0.12;

  const projection: SpendForecast["projection"] = [];
  let lastRecurring = runRate;
  for (let k = 0; k < months; k++) {
    const m0 = monthStart(now, k);
    const key = monthKey(m0);
    const base = fromHistory ? runRate : recurring.reduce((t, l) => t + (!l.until || m0.getTime() <= l.until.getTime() ? l.asset.monthlyEur : 0), 0);
    const rec = base * Math.pow(1 + g, k);
    const ren = renewals.filter((r) => r.month === key).reduce((t, r) => t + r.eur, 0);
    const spread = BAND_Z * sigma * Math.sqrt(k + 1);
    projection.push({ month: key, eur: round2(rec + ren), low: round2(rec * Math.exp(-spread) + ren), high: round2(rec * Math.exp(spread) + ren) });
    if (k === Math.min(11, months - 1)) lastRecurring = rec;
  }
  const next12Eur = round2(projection.slice(0, 12).reduce((t, p) => t + p.eur, 0));
  const growthPct = runRate > 0 ? Math.round((lastRecurring / runRate - 1) * 100) : 0;

  // Motivi (al massimo 3, dal più importante).
  const drivers: string[] = [];
  if (g !== 0) {
    const pct = Math.abs(g * 100);
    const txt = `${pct < 1 ? pct.toFixed(1) : Math.round(pct)}% a month`;
    drivers.push(basis === "history" ? `Spend ${g > 0 ? "rising" : "falling"} ${txt} (median of the last ${recent.length + 1} months)` : `New AI adds about ${txt}`);
  }
  const bigRenewal = [...renewals].sort((x, y) => y.eur - x.eur)[0];
  if (bigRenewal) drivers.push(`${bigRenewal.name} renews ${monthLabel(bigRenewal.month)} · ${fmtEur(bigRenewal.eur)}`);
  if (fresh.length && basis !== "new_ai") drivers.push(`${fresh.length} new AI in 90 days · +${fmtEur(freshEur)} a month`);
  const ending = recurring.filter((l) => l.until && l.until.getTime() < horizon.getTime()).sort((x, y) => y.asset.monthlyEur - x.asset.monthlyEur)[0];
  if (ending) drivers.push(`${ending.asset.name} contract ends ${monthLabel(monthKey(ending.until!))} · −${fmtEur(ending.asset.monthlyEur)} a month`);
  const top = [...recurring].sort((x, y) => y.asset.monthlyEur - x.asset.monthlyEur)[0];
  if (top && recurring.length > 1 && runRate > 0 && !fromHistory) drivers.push(`${top.asset.name} is ${Math.round((top.asset.monthlyEur / runRate) * 100)}% of spend`);

  return {
    history,
    projection,
    next12Eur,
    growthPct,
    monthlyGrowth: Math.round(g * 10000) / 10000,
    growthBasis: basis,
    runRateEur: round2(runRate),
    drivers: drivers.slice(0, 3),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Spesa reale per mese (mesi completi, ultimi 12) dagli addebiti: dal primo mese con dati, zeri inclusi. */
export function monthlyTotals(records: { date: Date; amountEur: number }[], now: Date, count = 12, includeCurrent = false) {
  const out: { month: string; eur: number }[] = [];
  const by = new Map<string, number>();
  for (const r of records) by.set(monthKey(r.date), (by.get(monthKey(r.date)) ?? 0) + r.amountEur);
  const last = includeCurrent ? 0 : -1;
  for (let k = last - count + 1; k <= last; k++) {
    const key = monthKey(monthStart(now, k));
    out.push({ month: key, eur: round2(by.get(key) ?? 0) });
  }
  const first = out.findIndex((m) => m.eur > 0);
  return first < 0 ? [] : out.slice(first);
}

/**
 * Ultimo rinnovo di un abbonamento annuale (addebiti in ordine di data): il mese più
 * recente con un addebito "da rinnovo" (almeno metà del più grande della finestra);
 * importo = l'addebito più grande di quel mese, non l'ultima riga (posti aggiunti, rimborsi).
 */
export function lastRenewal(charges: { date: Date; eur: number }[]): { date: Date; eur: number } {
  const max = Math.max(...charges.map((c) => c.eur));
  if (!(max > 0)) return charges[charges.length - 1];
  const big = charges.filter((c) => c.eur >= max / 2);
  const month = monthKey(big[big.length - 1].date);
  return charges.filter((c) => monthKey(c.date) === month).reduce((b, c) => (c.eur > b.eur ? c : b));
}

/** Previsione della spesa AI dell'azienda per i prossimi `months` mesi. */
export async function forecastSpend(orgId: string, months = 12): Promise<SpendForecast> {
  const now = new Date();
  const [assets, records] = await Promise.all([
    loadAssets(orgId),
    // 25 mesi: un abbonamento annuale ha sempre almeno un rinnovo nella finestra.
    db.spendRecord.findMany({
      where: { organizationId: orgId, date: { gte: monthStart(now, -25) } },
      select: { date: true, amountEur: true, aiAssetId: true },
      orderBy: { date: "asc" },
    }),
  ]);
  const annualIds = new Set(assets.filter((a) => a.cost?.annualBilling).map((a) => a.id));
  const byAsset = new Map<string, { date: Date; eur: number }[]>();
  for (const r of records) if (r.aiAssetId) byAsset.set(r.aiAssetId, [...(byAsset.get(r.aiAssetId) ?? []), { date: r.date, eur: r.amountEur }]);
  const lastCharge = new Map<string, { date: Date; eur: number }>();
  for (const [id, list] of byAsset) lastCharge.set(id, annualIds.has(id) ? lastRenewal(list) : list[list.length - 1]);
  return projectSpend({
    now,
    months: clamp(Math.round(months), 1, 36),
    history: monthlyTotals(records.filter((r) => r.date.getTime() >= monthStart(now, -12).getTime()), now),
    assets: assets.map((a) => ({
      id: a.id,
      name: a.name,
      monthlyEur: monthlyOf(a)?.eur ?? 0,
      annual: Boolean(a.cost?.annualBilling),
      lastCharge: lastCharge.get(a.id) ?? null,
      createdAt: a.createdAt,
      contractEnd: a.cost?.contractEnd ?? null,
      autoRenew: a.cost?.autoRenew ?? null,
    })),
  });
}

// ───────────────────────── anomalie ─────────────────────────

export type AnomalyKind = "price_increase" | "seat_creep" | "shadow_surge" | "spend_spike" | "new_expensive";

export interface Anomaly {
  /** Stabile: la stessa anomalia ha sempre la stessa chiave (dedupe degli avvisi). */
  key: string;
  kind: AnomalyKind;
  severity: AlertSeverity;
  title: string;
  body: string;
  href: string;
}

export interface AnomalyAsset {
  id: string;
  name: string;
  status: "APPROVED" | "UNREVIEWED" | "UNAPPROVED" | "UNKNOWN";
  createdAt: Date;
  monthlyEur: number | null;
  /** Prezzo di un posto (costo / posti, altrimenti listino); null se non è un'AI a posti. */
  seatEur: number | null;
  /** Addebiti reali, dal più vecchio. */
  charges: { date: Date; eur: number }[];
  /** Quando ogni persona nota ha iniziato a usarla. */
  firstSeen: Date[];
}

export interface AnomalyInput {
  now: Date;
  assets: AnomalyAsset[];
  /** Spesa per mese dal più vecchio, mese in corso INCLUSO (ultimo elemento, parziale). */
  months: { month: string; eur: number }[];
}

/** Soglie (documentate nel report). */
export const ANOMALY = {
  priceJump: 0.15, // +15% sulla mediana degli ultimi 3 addebiti
  priceMinEur: 5,
  recentChargeDays: 45,
  surgeDays: 14,
  surgeMinNew: 3, // almeno 3 persone nuove e almeno quante c'erano prima (utenti raddoppiati)
  spikeFactor: 1.5, // mese > 1,5 × mediana dei mesi precedenti
  spikeMinEur: 50,
  spikeMinMonths: 3,
  newDays: 30,
  newMinEur: 100,
} as const;

const SEV_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Regole deterministiche sulle anomalie (vedi ANOMALY per le soglie). */
export function findAnomalies(input: AnomalyInput): Anomaly[] {
  const { now, assets } = input;
  const t = now.getTime();
  const out: Anomaly[] = [];

  for (const a of assets) {
    const href = `/estate/${a.id}`;

    // 1. Aumento di prezzo / posti aggiunti: ultimo addebito vs mediana dei 3 precedenti.
    const c = a.charges;
    if (c.length >= 3) {
      const last = c[c.length - 1];
      const prev = c.slice(-4, -1);
      const ref = median(prev.map((x) => x.eur));
      const diff = last.eur - ref;
      if (t - last.date.getTime() <= ANOMALY.recentChargeDays * DAY && ref > 0 && diff / ref > ANOMALY.priceJump && diff >= ANOMALY.priceMinEur) {
        const pct = Math.round((diff / ref) * 100);
        const month = monthKey(last.date);
        // Se l'aumento è un numero intero di posti, sono posti aggiunti, non un rincaro.
        const added = a.seatEur && a.seatEur > 0 ? diff / a.seatEur : 0;
        const k = Math.round(added);
        if (k >= 1 && Math.abs(added - k) <= 0.2) {
          const since = c[c.length - 2].date.getTime();
          const newPeople = a.firstSeen.filter((d) => d.getTime() > since).length;
          if (k > newPeople) {
            out.push({
              key: `seat_creep:${a.id}:${month}`,
              kind: "seat_creep",
              severity: "warning",
              title: `${a.name}: ${k} seat${k === 1 ? "" : "s"} added`,
              body: `The last charge is ${fmtEur(diff)} higher (+${pct}%), but only ${newPeople} new ${newPeople === 1 ? "person" : "people"} started using it.`,
              href: `${href}?tab=people`,
            });
          }
        } else {
          out.push({
            key: `price_increase:${a.id}:${month}`,
            kind: "price_increase",
            severity: pct >= 50 || diff >= 500 ? "critical" : "warning",
            title: `${a.name} costs ${pct}% more`,
            body: `Last charge ${fmtEur(last.eur)} vs a usual ${fmtEur(ref)}. Check the invoice or the plan.`,
            href: `${href}?tab=spend`,
          });
        }
      }
    }

    // 2. AI non approvata che si diffonde in fretta.
    if (a.status !== "APPROVED") {
      const cutoff = t - ANOMALY.surgeDays * DAY;
      const fresh = a.firstSeen.filter((d) => d.getTime() >= cutoff).length;
      const before = a.firstSeen.length - fresh;
      if (fresh >= ANOMALY.surgeMinNew && fresh >= before) {
        out.push({
          key: `shadow_surge:${a.id}:${Math.floor(t / (ANOMALY.surgeDays * DAY))}`,
          kind: "shadow_surge",
          severity: a.status === "UNAPPROVED" || fresh >= 10 ? "critical" : "warning",
          title: `${a.name}: ${fresh} new people in 14 days`,
          body: `${a.status === "UNAPPROVED" ? "Not allowed" : "Not reviewed yet"} — ${a.firstSeen.length} people use it now.`,
          href: `${href}?tab=people`,
        });
      }
    }

    // 3. AI nuova e costosa.
    if (a.createdAt.getTime() >= t - ANOMALY.newDays * DAY && (a.monthlyEur ?? 0) >= ANOMALY.newMinEur) {
      out.push({
        key: `new_expensive:${a.id}`,
        kind: "new_expensive",
        severity: (a.monthlyEur ?? 0) >= 1000 ? "critical" : "warning",
        title: `New: ${a.name} at ${fmtEur(a.monthlyEur!)} a month`,
        body: `Found in the last ${ANOMALY.newDays} days · ${fmtEur(a.monthlyEur! * 12)} a year.`,
        href,
      });
    }
  }

  // 4. Mese con spesa anomala: ultimo mese completo, e il mese in corso se ha già superato la soglia.
  const m = input.months;
  const check = (i: number, partial: boolean) => {
    if (i < 0) return;
    const prev = m.slice(Math.max(0, i - 6), i).map((x) => x.eur).filter((v) => v > 0);
    if (prev.length < ANOMALY.spikeMinMonths) return;
    const ref = median(prev);
    const cur = m[i].eur;
    if (cur > ref * ANOMALY.spikeFactor && cur - ref >= ANOMALY.spikeMinEur) {
      out.push({
        key: `spend_spike:${m[i].month}`,
        kind: "spend_spike",
        severity: cur > ref * 2.5 ? "critical" : "warning",
        title: `AI spend ${partial ? "this month" : `in ${monthLabel(m[i].month)}`} is ${(cur / ref).toFixed(1)}× usual`,
        body: `${fmtEur(cur)}${partial ? " so far" : ""} vs a usual ${fmtEur(ref)} a month.`,
        href: "/budgets",
      });
    }
  };
  check(m.length - 2, false);
  check(m.length - 1, true);

  return out.sort((x, y) => SEV_ORDER[x.severity] - SEV_ORDER[y.severity] || x.kind.localeCompare(y.kind) || x.key.localeCompare(y.key));
}

/** Anomalie attuali dell'azienda. */
export async function detectAnomalies(orgId: string): Promise<Anomaly[]> {
  const now = new Date();
  const [assets, records, usages] = await Promise.all([
    loadAssets(orgId, { includeRejected: true }),
    db.spendRecord.findMany({
      where: { organizationId: orgId, date: { gte: monthStart(now, -12) } },
      select: { date: true, amountEur: true, aiAssetId: true },
      orderBy: { date: "asc" },
    }),
    db.aiAssetUsage.findMany({ where: { aiAsset: { organizationId: orgId, deletedAt: null } }, select: { aiAssetId: true, firstSeenAt: true } }),
  ]);
  const charges = new Map<string, { date: Date; eur: number }[]>();
  for (const r of records) if (r.aiAssetId && r.amountEur > 0) charges.set(r.aiAssetId, [...(charges.get(r.aiAssetId) ?? []), { date: r.date, eur: r.amountEur }]);
  const seen = new Map<string, Date[]>();
  for (const u of usages) seen.set(u.aiAssetId, [...(seen.get(u.aiAssetId) ?? []), u.firstSeenAt]);
  // I rinnovi annuali sono attesi: non contano per il picco del mese.
  const annual = new Set(assets.filter((a) => a.cost?.annualBilling).map((a) => a.id));
  return findAnomalies({
    now,
    months: monthlyTotals(records.filter((r) => !r.aiAssetId || !annual.has(r.aiAssetId)), now, 12, true),
    assets: assets.map((a) => {
      const m = monthlyOf(a);
      const seats = a.cost?.seats ?? 0;
      const svc = serviceOf(a);
      const seatEur = seats > 0 && m && m.eur > 0 ? m.eur / seats : seats > 0 && svc ? (listSeatEur(svc, a.cost?.planId, a.cost?.annualBilling)?.eur ?? null) : null;
      return {
        id: a.id,
        name: a.name,
        status: a.status,
        createdAt: a.createdAt,
        monthlyEur: m?.eur ?? null,
        seatEur,
        charges: charges.get(a.id) ?? [],
        firstSeen: seen.get(a.id) ?? [],
      };
    }),
  });
}

/** Crea un avviso per ogni anomalia nuova (una volta sola per chiave). Restituisce quante sono nuove. */
export async function anomalyAlerts(orgId: string): Promise<number> {
  let created = 0;
  for (const a of await detectAnomalies(orgId)) {
    if (await createAlert(orgId, { kind: "anomaly", severity: a.severity, title: a.title, body: a.body, href: a.href, dedupeKey: `anomaly:${a.key}` })) created++;
  }
  return created;
}
