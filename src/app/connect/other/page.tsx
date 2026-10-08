import { headers } from "next/headers";
import { currentSession } from "@/lib/auth";
import { ensureWorkspaceToken } from "@/lib/discovery/ingest";
import { Notice, PageHeader } from "@/components/ui";
import OtherWaysView from "@/components/connect/OtherWaysView";

export const dynamic = "force-dynamic";

// Altri modi di trovare le AI (estensione, scansione, log di rete, Edge): prima scheda "Other ways"
// di /download, ora sotto Connect così /download resta solo l'app desktop.
export default async function OtherWaysPage({ searchParams }: { searchParams: { error?: string; logerror?: string } }) {
  const s = currentSession()!;
  const h = headers();
  const base = process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const { joinCode, token } = await ensureWorkspaceToken(s.orgId);
  const error = searchParams.error ?? searchParams.logerror;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader crumbs={[{ label: "Connect", href: "/connect" }]} title="Other ways to find AI" subtitle="Browser extension, one-off scan, network logs" />
      {error && <Notice tone="error">{error}</Notice>}
      <OtherWaysView orgId={s.orgId} base={base} token={token} joinUrl={`${base}/join/${joinCode}`} canEdit={s.role !== "VIEWER"} canAdmin={s.role === "ADMIN" || s.role === "OWNER"} />
    </div>
  );
}
