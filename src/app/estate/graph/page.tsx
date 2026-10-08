import { currentOrgId } from "@/lib/org";
import { PageHeader } from "@/components/ui";
import EstateView from "@/components/estate/EstateView";

export const dynamic = "force-dynamic";

// AI Estate → Graph: metriche di dipendenza, grafo e collegamenti da confermare (prima "Your AI → Graph" nell'Overview).
export default function EstateGraphPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="AI Estate" subtitle="How your AI connects, and what depends on what" />
      <EstateView orgId={currentOrgId()} />
    </div>
  );
}
