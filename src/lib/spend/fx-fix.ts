/**
 * Correzione una tantum: costi OpenAI / Anthropic salvati in USD.
 *
 * Fino a questa versione i connettori Admin di OpenAI e Anthropic salvavano in
 * AiSystemCost.monthlyCostEstimate la spesa degli ultimi 30 giorni in USD,
 * mentre tutta l'app la mostra e la somma come EUR. Ora la conversione avviene
 * all'ingest (connectors/openai.ts, anthropic.ts); qui si correggono le righe
 * già salvate.
 *
 * Perché una riscrittura nel database e non un nuovo sync: questi due
 * connettori NON sono nel sync giornaliero (jobs.ts sincronizza solo banca,
 * contabilità e cloud), quindi una riga vecchia resta in USD finché qualcuno
 * non preme "Sync" — anche per sempre, se la chiave è stata revocata. Inoltre
 * non salvano SpendRecord: l'unico dato da correggere è il costo mensile.
 *
 * Mai doppia conversione: il marcatore è sulla riga stessa. Si toccano solo le
 * righe con basis "billing_connector" e nota ESATTAMENTE uguale a quella vecchia
 * ("USD, last 30 days, from … billing"); la riga corretta riceve la nota nuova
 * ("EUR, last 30 days, from … billing (USD x converted)"), quindi un secondo
 * passaggio non la trova più. L'aggiornamento è condizionato a nota e importo
 * letti (updateMany), così un sync che scrive nel frattempo l'importo in EUR
 * non viene riconvertito. In più jobs.ts la esegue una sola volta (JobRun).
 */
import { db } from "@/lib/db";
import { toEur, billingCostNote } from "./fx";

/** Note scritte dalle versioni precedenti (gli unici due testi mai usati) → fonte. */
export const LEGACY_USD_NOTES: Record<string, string> = {
  "USD, last 30 days, from OpenAI billing": "OpenAI billing",
  "USD, last 30 days, from Anthropic billing": "Anthropic billing",
};

export interface LegacyCostRow {
  id: string;
  monthlyCostEstimate: number | null;
  basis: string;
  notes: string | null;
}

/** Cosa riscrivere: pura, così si prova senza database. */
export function planLegacyUsdFix(rows: LegacyCostRow[]) {
  const out: { id: string; fromUsd: number; fromNote: string; monthlyCostEstimate: number; notes: string }[] = [];
  for (const r of rows) {
    if (r.basis !== "billing_connector" || !r.notes || r.monthlyCostEstimate == null) continue;
    const source = LEGACY_USD_NOTES[r.notes];
    if (!source) continue;
    const usd = r.monthlyCostEstimate;
    out.push({
      id: r.id,
      fromUsd: usd,
      fromNote: r.notes,
      monthlyCostEstimate: Math.round(toEur(usd, "USD").eur * 100) / 100,
      notes: billingCostNote(source, `USD ${usd.toFixed(2)}`),
    });
  }
  return out;
}

/** Converte in EUR le righe ancora in USD. Idempotente: restituisce quante ne ha corrette. */
export async function fixLegacyUsdBillingCosts() {
  const rows = await db.aiSystemCost.findMany({
    where: { basis: "billing_connector", notes: { in: Object.keys(LEGACY_USD_NOTES) } },
    select: { id: true, monthlyCostEstimate: true, basis: true, notes: true },
  });
  let fixed = 0;
  for (const u of planLegacyUsdFix(rows)) {
    const r = await db.aiSystemCost.updateMany({
      where: { id: u.id, basis: "billing_connector", notes: u.fromNote, monthlyCostEstimate: u.fromUsd },
      data: { monthlyCostEstimate: u.monthlyCostEstimate, notes: u.notes },
    });
    fixed += r.count;
  }
  return fixed;
}
