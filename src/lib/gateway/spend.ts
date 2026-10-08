/**
 * angar Gateway → spesa. Ogni giorno e provider diventa una riga SpendRecord
 * (source "gateway") con impronta stabile gateway:giorno:hash(provider), SENZA
 * importo: ricalcolare aggiorna l'importo, non duplica (stesso schema di
 * connectors/cloud-ai.ts). Così Savings, Budgets e la previsione la vedono.
 *
 * Se esiste il connettore del provider (chiave admin OpenAI / Anthropic, in
 * qualsiasi stato) o se nel mese c'è già spesa reale di quel provider da
 * un'altra fonte (connettore, estratto conto, fattura), quella spesa contiene
 * già queste chiamate: niente righe del Gateway per quel provider e mese
 * (sarebbe spesa contata due volte; quelle già scritte nel mese si tolgono).
 */
import { db } from "@/lib/db";
import { spendFingerprint, isoDay } from "@/lib/connectors/cloud-ai";
import { fmtEur } from "@/lib/format";
import { PROVIDER_LABEL } from "./upstream";
import type { GatewayProvider } from "./usage";

const DAY = 86_400_000;
const SERVICE: Record<GatewayProvider, { serviceId: string; connector: "OPENAI" | "ANTHROPIC" }> = {
  openai: { serviceId: "openai-api", connector: "OPENAI" },
  anthropic: { serviceId: "anthropic-api", connector: "ANTHROPIC" },
};

/** Ricalcola le righe di spesa del Gateway per un giorno (UTC, AAAA-MM-GG). */
export async function rollupGatewaySpend(orgId: string, day: string) {
  const from = new Date(`${day}T00:00:00Z`);
  const to = new Date(from.getTime() + DAY);
  // Mese (UTC) del giorno: la spesa reale si confronta mese per mese.
  const monthFrom = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const monthTo = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const groups = await db.gatewayRequest.groupBy({
    by: ["provider"],
    where: { organizationId: orgId, createdAt: { gte: from, lt: to }, costEur: { gt: 0 } },
    _sum: { costEur: true, inputTokens: true, outputTokens: true },
    _count: { _all: true },
  });
  let written = 0;
  for (const g of groups) {
    const provider = g.provider as GatewayProvider;
    const svc = SERVICE[provider];
    if (!svc) continue;
    // Spesa reale del provider: connettore admin (qualsiasi stato) o addebiti del mese da altre fonti.
    const billed =
      (await db.connector.findFirst({ where: { organizationId: orgId, provider: svc.connector }, select: { id: true } })) ??
      (await db.spendRecord.findFirst({
        where: { organizationId: orgId, source: { not: "gateway" }, date: { gte: monthFrom, lt: monthTo }, OR: [{ service: svc.serviceId }, { aiAsset: { serviceId: svc.serviceId } }] },
        select: { id: true },
      }));
    if (billed) {
      // Le righe a listino del Gateway già scritte in questo mese andrebbero contate due volte: si tolgono.
      const gone = await db.spendRecord.deleteMany({ where: { organizationId: orgId, source: "gateway", service: svc.serviceId, date: { gte: monthFrom, lt: monthTo } } });
      written += gone.count;
      continue;
    }
    const amountEur = Math.round((g._sum.costEur ?? 0) * 100) / 100;
    const tokens = (g._sum.inputTokens ?? 0) + (g._sum.outputTokens ?? 0);
    const description = `${PROVIDER_LABEL[provider]} via angar Gateway — ${g._count._all.toLocaleString("en-GB")} requests, ${tokens.toLocaleString("en-GB")} tokens (list price, ${fmtEur(amountEur, { decimals: true })})`.slice(0, 180);
    const fingerprint = spendFingerprint("gateway", day, provider);
    const asset = await db.aiAsset.findFirst({ where: { organizationId: orgId, deletedAt: null, serviceId: svc.serviceId }, orderBy: { createdAt: "asc" }, select: { id: true } });
    const existing = await db.spendRecord.findUnique({ where: { organizationId_fingerprint: { organizationId: orgId, fingerprint } } });
    if (!existing) {
      await db.spendRecord.create({ data: { organizationId: orgId, aiAssetId: asset?.id ?? null, service: svc.serviceId, source: "gateway", date: from, amountEur, description, fingerprint } });
      written++;
    } else if (Math.abs(existing.amountEur - amountEur) >= 0.005 || existing.description !== description || existing.aiAssetId !== (asset?.id ?? null)) {
      await db.spendRecord.update({ where: { id: existing.id }, data: { amountEur, description, aiAssetId: asset?.id ?? null } });
      written++;
    }
  }
  return written;
}

/** Lavoro giornaliero: ieri e oggi per le aziende con traffico del Gateway. */
export async function gatewaySpendJob(now = new Date()) {
  const since = new Date(now.getTime() - 2 * DAY);
  const orgs = await db.gatewayRequest.groupBy({ by: ["organizationId"], where: { createdAt: { gte: since } } });
  let n = 0;
  for (const o of orgs) {
    for (const day of [isoDay(new Date(now.getTime() - DAY)), isoDay(now)]) n += await rollupGatewaySpend(o.organizationId, day).catch(() => 0);
  }
  return n;
}

// Dopo il traffico: un ricalcolo di oggi al massimo ogni 5 minuti per azienda.
const pending = new Set<string>();
export function scheduleGatewayRollup(orgId: string) {
  if (pending.has(orgId)) return;
  pending.add(orgId);
  const t = setTimeout(() => {
    pending.delete(orgId);
    void rollupGatewaySpend(orgId, isoDay(new Date())).catch((err) => console.error("[gateway] spend rollup failed", orgId, err));
  }, 5 * 60_000);
  t.unref?.();
}
