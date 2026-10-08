import Link from "next/link";
import { Notice, PageHeader } from "@/components/ui";
import RequestForm from "@/components/requests/RequestForm";

export const dynamic = "force-dynamic";

// Link da condividere con i dipendenti: chiunque nel workspace (anche viewer) chiede una nuova AI.
export default function NewRequestPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Request an AI system"
        subtitle="Ask before you sign up, so company data stays safe"
        crumbs={[{ label: "Requests", href: "/estate/requests" }, { label: "New" }]}
        action={<Link href="/estate/requests" className="btn btn-ghost btn-sm">Your requests</Link>}
      />
      {searchParams.error && <Notice tone="error">{searchParams.error.slice(0, 300)}</Notice>}
      <RequestForm />
    </div>
  );
}
