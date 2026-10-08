import { currentOrgId } from "@/lib/org";
import { renewalCalendar } from "@/lib/renewals-calendar";
import RenewalsView from "@/components/renewals/RenewalsView";

export const dynamic = "force-dynamic";

// Calendario dei rinnovi: contratti (con preavviso) e rinnovi dagli addebiti, per mese.
export default async function RenewalsPage({ searchParams }: { searchParams: { error?: string } }) {
  const { months, stats } = await renewalCalendar(currentOrgId());
  return <RenewalsView months={months} stats={stats} error={searchParams.error} />;
}
