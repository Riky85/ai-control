import Link from "next/link";
import { currentOrgId } from "@/lib/org";
import { PageHeader } from "@/components/ui";
import DesktopDevices from "@/components/DesktopDevices";

export const dynamic = "force-dynamic";

// Elenco dei computer con l'app desktop, con lo stato di connessione.
export default function ComputersPage() {
  const orgId = currentOrgId();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        crumbs={[{ label: "Sources", href: "/sources" }]}
        title="Connected computers"
        subtitle="Every computer running the angar desktop app, and whether it's sending data right now."
        action={<Link href="/download" className="btn btn-primary">Get the app</Link>}
      />
      <DesktopDevices organizationId={orgId} />
    </div>
  );
}
