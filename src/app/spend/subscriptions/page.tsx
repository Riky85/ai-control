import { currentOrgId } from "@/lib/org";
import { PageHeader } from "@/components/ui";
import { subscriptionRows } from "@/lib/pricing/subscriptions";
import { Subscriptions } from "@/components/opportunities/SavingsViews";

export const dynamic = "force-dynamic";

// Abbonamenti (una riga per AI, quello inserito a mano vince): la stessa vista della scheda in Opportunities.
export default async function SpendSubscriptionsPage() {
  const rows = await subscriptionRows(currentOrgId());
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Subscriptions" subtitle="Plans, seats and renewals" />
      <Subscriptions rows={rows} />
    </div>
  );
}
