import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { PageHeader } from "@/components/ui";
import SimulatorClient from "@/components/engine/SimulatorClient";
import { loadSimModel } from "./model";

export const dynamic = "force-dynamic";

// Simulatore "e se…": parte dai numeri reali di oggi, gli scenari si ricalcolano nel browser.
export default async function SimulatePage() {
  const model = await loadSimModel(currentOrgId());
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        crumbs={[{ label: "Savings", href: "/savings" }, { label: "Simulator" }]}
        title="What if…"
        subtitle="Nothing is applied."
        action={
          <Link href="/score" className="btn btn-ghost btn-sm">
            angar Score
          </Link>
        }
      />
      <SimulatorClient model={model} />
    </div>
  );
}
