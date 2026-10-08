import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import SubscriptionForm from "@/components/SubscriptionForm";
import { catalogOptions, manualSourceLabel, SUBSCRIPTION_CURRENCIES, type ManualSubscriptionPayload } from "@/lib/pricing/manual";
import { deriveSubscription } from "@/lib/pricing/subscriptions";
import { toEur } from "@/lib/spend/fx";
import { countActive } from "@/lib/seats";

export const dynamic = "force-dynamic";

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const r2 = (n: number) => Math.round(n * 100) / 100;

// Editor dell'abbonamento inserito a mano di un'AI (solo amministratori).
// Nuovo: precompilato da quello ricavato (piano, posti, ciclo, date). Esistente: i suoi valori.
export default async function SubscriptionEditorPage({ params }: { params: { id: string } }) {
  const s = await requireRole("ADMIN", `/estate/${encodeURIComponent(params.id)}`);
  const asset = await db.aiAsset.findFirst({
    where: { id: params.id, organizationId: s.orgId, deletedAt: null },
    include: {
      cost: true,
      usages: { select: { lastSeenAt: true } },
      subscriptions: { where: { origin: "manual" }, orderBy: { updatedAt: "desc" }, take: 1, include: { seatLines: true } },
    },
  });
  if (!asset) notFound();

  const manual = asset.subscriptions[0] ?? null;
  const observedActive = asset.usages.length ? countActive(asset.usages) : null;
  let initial: ManualSubscriptionPayload;
  if (manual) {
    // I prezzi di contratto sono salvati al mese: si rimostrano nel periodo in cui erano stati inseriti.
    const k = manual.contractPeriod === "year" ? 12 : 1;
    const linesPriced = manual.seatLines.some((l) => l.unitContractPrice != null);
    initial = {
      assetId: asset.id,
      productId: manual.productId,
      planId: manual.planId,
      productName: manual.productName,
      planName: manual.planName,
      cycle: manual.billingCycle === "annual" ? "annual" : "monthly",
      contractStart: iso(manual.contractStart),
      renewalDate: iso(manual.renewalDate),
      currency: manual.currency,
      contractPeriod: manual.contractPeriod === "year" ? "year" : "month",
      priceMode: linesPriced ? "lines" : manual.contractMonthly != null ? "total" : "none",
      contractTotal: !linesPriced && manual.contractMonthly != null ? r2(manual.contractMonthly * k) : null,
      billedAmount: manual.billedAmount,
      billedPeriod: manual.billedPeriod === "year" ? "year" : manual.billedPeriod === "quarter" ? "quarter" : "month",
      note: manual.note,
      lines: manual.seatLines.map((l) => ({
        seatTypeId: l.seatTypeId,
        label: l.seatTypeId ? null : l.label,
        paidSeats: l.paidSeats,
        activeSeats: l.activeSeats,
        contractUnit: l.unitContractPrice != null ? r2(l.unitContractPrice * k) : null,
      })),
    };
  } else {
    const d = deriveSubscription(asset);
    initial = {
      assetId: asset.id,
      productId: d?.productId ?? null,
      planId: d?.planId ?? null,
      productName: null,
      planName: null,
      cycle: d?.billingCycle === "annual" ? "annual" : "monthly",
      contractStart: iso(d?.contractStart),
      renewalDate: iso(d?.renewalDate),
      currency: "EUR",
      contractPeriod: "month",
      priceMode: "none",
      contractTotal: null,
      billedAmount: null,
      billedPeriod: "month",
      note: null,
      lines: d?.seatLines.length
        ? d.seatLines.map((l) => ({ seatTypeId: l.seatTypeId, label: l.seatTypeId ? null : l.label, paidSeats: l.paidSeats, activeSeats: null, contractUnit: null }))
        : [{ seatTypeId: null, label: null, paidSeats: 1, activeSeats: null, contractUnit: null }],
    };
  }

  const eurPerUnit: Record<string, number> = {};
  for (const c of SUBSCRIPTION_CURRENCIES) eurPerUnit[c] = toEur(1, c).eur;

  return (
    <div className="flex flex-col gap-6 [&>*:not(.page-bar)]:max-w-4xl">
      <PageHeader
        crumbs={[{ label: "AI Estate", href: "/estate" }, { label: asset.name, href: `/estate/${asset.id}` }]}
        title={manual ? "Edit subscription" : "Add subscription"}
        subtitle={
          manual
            ? manualSourceLabel(manual.enteredByName ?? manual.enteredByEmail, manual.enteredAt)
            : "The real cost, never overwritten by the daily job"
        }
      />
      <SubscriptionForm assetId={asset.id} options={catalogOptions()} currencies={SUBSCRIPTION_CURRENCIES} eurPerUnit={eurPerUnit} initial={initial} editing={!!manual} observedActive={observedActive} />
    </div>
  );
}
