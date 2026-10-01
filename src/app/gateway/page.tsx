import { currentSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { featureEnabled } from "@/lib/plan-gate";
import { gatewayCounts, gatewayEndpoint, gatewayKeys, gatewayLogs, gatewayOverview, gatewayPolicyView } from "@/lib/gateway/data";
import { isRedactKind } from "@/lib/gateway/detect";
import GatewayView, { type GatewayTab, type GatewayViewProps } from "@/components/gateway/GatewayView";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const TABS: GatewayTab[] = ["overview", "policies", "keys", "logs"];

export default async function GatewayPage({ searchParams }: { searchParams: { tab?: string; page?: string; result?: string; id?: string; error?: string; saved?: string; revoked?: string } }) {
  const s = currentSession();
  if (!s) redirect("/login");
  const orgId = s.orgId;
  const tab = (TABS.includes(searchParams.tab as GatewayTab) ? searchParams.tab : "overview") as GatewayTab;
  const canEdit = s.role === "ADMIN" || s.role === "OWNER";
  const openaiUrl = gatewayEndpoint("openai");
  const [planOk, counts] = await Promise.all([featureEnabled(orgId, "gateway"), gatewayCounts(orgId)]);

  const props: GatewayViewProps = {
    tab,
    canEdit,
    planOk,
    counts,
    openaiUrl,
    anthropicUrl: gatewayEndpoint("anthropic"),
    endpointHost: openaiUrl.replace(/^https?:\/\//, "").replace(/\/openai\/v1$/, ""),
    notice: searchParams.error ? { tone: "error", text: searchParams.error } : searchParams.saved ? { tone: "success", text: "Saved. The gateway applies it within 30 seconds." } : searchParams.revoked ? { tone: "success", text: "Key revoked." } : null,
  };

  if (tab === "overview") props.overview = await gatewayOverview(orgId);
  if (tab === "policies") props.policy = await gatewayPolicyView(orgId);
  if (tab === "keys") {
    const rows = await gatewayKeys(orgId);
    props.keys = { rows, teams: Array.from(new Set(rows.map((k) => k.team).filter(Boolean))).sort() };
  }
  if (tab === "logs") {
    const page = Math.max(1, Math.min(10_000, Number(searchParams.page) || 1));
    const result = searchParams.result && ["allowed", "redacted", "blocked", "error"].includes(searchParams.result) ? searchParams.result : undefined;
    const logs = await gatewayLogs(orgId, page, result);
    // "Open in logs" dal pannello: la richiesta si apre anche se non è in questa pagina.
    let openId: string | undefined;
    if (searchParams.id) {
      const one = await db.gatewayRequest.findFirst({ where: { id: searchParams.id, organizationId: orgId } });
      if (one) {
        openId = one.id;
        if (!logs.rows.some((r) => r.id === one.id)) {
          logs.rows.unshift({
            id: one.id,
            at: one.createdAt.toISOString(),
            keyName: one.keyName,
            keyLast4: one.keyLast4,
            team: one.team,
            provider: one.provider,
            endpoint: one.endpoint,
            model: one.model,
            stream: one.stream,
            inputTokens: one.inputTokens,
            outputTokens: one.outputTokens,
            costEur: one.costEur,
            latencyMs: one.latencyMs,
            overheadMs: one.overheadMs,
            status: one.status,
            result: one.result,
            reason: one.reason,
            redactions: one.redactions && typeof one.redactions === "object" ? Object.fromEntries(Object.entries(one.redactions as Record<string, number>).filter(([k]) => isRedactKind(k))) : null,
          });
        }
      }
    }
    props.logs = { ...logs, page, result, openId };
  }

  return <GatewayView {...props} />;
}
