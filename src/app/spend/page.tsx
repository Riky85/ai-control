import { currentOrgId } from "@/lib/org";
import { loadSpendOverview } from "@/lib/spend-overview";
import { loadForecastCard } from "@/components/engine/ForecastCard";
import { loadAnomalyList } from "@/components/engine/AnomalyList";
import { loadMarketFeed } from "@/lib/market/service";
import { changeHeadline, impactLine, simulateHref } from "@/lib/market/format";
import SpendView from "@/components/spend/SpendView";

export const dynamic = "force-dynamic";

// Spend: totale, per fornitore / modello / AI / team, fisso vs a consumo, reale vs stimato,
// andamento e previsione, anomalie, effetto dei cambi di prezzo. Riusa i motori esistenti.
export default async function SpendPage() {
  const orgId = currentOrgId();
  const now = new Date();
  const s = await loadSpendOverview(orgId);
  const [forecast, anomalies, feed] = await Promise.all([
    s.total > 0 ? loadForecastCard(orgId) : null,
    s.total > 0 ? loadAnomalyList(orgId).then((x) => x.anomalies).catch(() => []) : [],
    loadMarketFeed(orgId, { now }).catch(() => []),
  ]);
  const priceChanges = feed
    .filter((r) => r.change.changeType === "price_change")
    .map((r) => {
      const h = changeHeadline(r.change, now);
      return { id: r.change.id, title: `${h.provider} · ${h.subject} · ${h.change}`, impact: impactLine(r), annualDeltaEur: r.annualDeltaEur, simulateHref: simulateHref(r.change) };
    });
  return <SpendView s={s} forecast={forecast} anomalies={anomalies} priceChanges={priceChanges} />;
}
