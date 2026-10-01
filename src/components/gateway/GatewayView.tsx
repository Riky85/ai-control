import Link from "next/link";
import { Notice, PageHeader, Tabs } from "@/components/ui";
import { LockedNote } from "@/components/LockedFeature";
import type { GwKeyRow, GwOverview, GwPolicyView, GwRequestRow } from "@/lib/gateway/data";
import GatewayOverview from "./Overview";
import PoliciesTab from "./PoliciesTab";
import KeysTab from "./KeysTab";
import RequestsTable from "./RequestsTable";
import { fmtInt } from "./shared";
import { USAGE_RETENTION_MONTHS } from "@/lib/jobs";

export type GatewayTab = "overview" | "policies" | "keys" | "logs";

export interface GatewayViewProps {
  tab: GatewayTab;
  canEdit: boolean;
  planOk: boolean;
  counts: { rules: number; keys: number };
  openaiUrl: string;
  anthropicUrl: string;
  endpointHost: string;
  notice?: { tone: "error" | "success"; text: string } | null;
  overview?: GwOverview;
  policy?: GwPolicyView;
  keys?: { rows: GwKeyRow[]; teams: string[] };
  logs?: { rows: GwRequestRow[]; total: number; page: number; pages: number; result?: string; openId?: string };
}

const RESULTS = ["allowed", "redacted", "blocked", "error"];

/** Pagina /gateway (dati già caricati): intestazione, schede, contenuto della scheda. */
export default function GatewayView(p: GatewayViewProps) {
  const editable = p.canEdit && p.planOk;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Gateway"
        subtitle="Every AI call from your apps, measured and checked."
        action={
          <>
            <Link href="/gateway?tab=policies#connect" className="btn btn-secondary">
              Connection guide
            </Link>
            {editable && (
              <Link href="/gateway?tab=keys#new-key" className="btn btn-primary">
                <span aria-hidden>+</span> Create key
              </Link>
            )}
          </>
        }
      />
      {!p.planOk && (
        <Notice>
          <span className="inline-flex flex-wrap items-center gap-x-2">
            angar Gateway is part of the Govern plan. You can look around; keys and rules can be changed after upgrading. <LockedNote feature="gateway" />
          </span>
        </Notice>
      )}
      {p.notice && <Notice tone={p.notice.tone}>{p.notice.text}</Notice>}
      <Tabs
        active={p.tab}
        items={[
          { key: "overview", label: "Overview", href: "/gateway" },
          { key: "policies", label: "Policies", href: "/gateway?tab=policies", count: p.counts.rules },
          { key: "keys", label: "Keys", href: "/gateway?tab=keys", count: p.counts.keys },
          { key: "logs", label: "Logs", href: "/gateway?tab=logs" },
        ]}
      />
      {p.tab === "overview" && p.overview && <GatewayOverview data={p.overview} endpointHost={p.endpointHost} />}
      {p.tab === "policies" && p.policy && <PoliciesTab view={p.policy} canEdit={editable} openaiUrl={p.openaiUrl} anthropicUrl={p.anthropicUrl} endpointHost={p.endpointHost} />}
      {p.tab === "keys" && p.keys && <KeysTab keys={p.keys.rows} teams={p.keys.teams} canEdit={editable} />}
      {p.tab === "logs" && p.logs && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {[undefined, ...RESULTS].map((r) => (
              <Link
                key={r ?? "all"}
                href={r ? `/gateway?tab=logs&result=${r}` : "/gateway?tab=logs"}
                className={`btn btn-sm ${p.logs!.result === r ? "btn-secondary border-ink-400" : "btn-ghost"}`}
              >
                {r ? r[0].toUpperCase() + r.slice(1) : "All"}
              </Link>
            ))}
          </div>
          <RequestsTable
            rows={p.logs.rows}
            showDay
            initialId={p.logs.openId}
            empty="No requests match."
            footer={
              <div className="flex w-full flex-wrap items-center justify-between gap-3">
                <span>
                  {fmtInt(p.logs.total)} request{p.logs.total === 1 ? "" : "s"} · metadata only, kept {USAGE_RETENTION_MONTHS} months
                </span>
                <span className="flex items-center gap-2">
                  {p.logs.page > 1 && (
                    <Link className="btn btn-secondary btn-sm" href={`/gateway?tab=logs&page=${p.logs.page - 1}${p.logs.result ? `&result=${p.logs.result}` : ""}`}>
                      ← Newer
                    </Link>
                  )}
                  <span className="tabular">
                    Page {p.logs.page} of {p.logs.pages}
                  </span>
                  {p.logs.page < p.logs.pages && (
                    <Link className="btn btn-secondary btn-sm" href={`/gateway?tab=logs&page=${p.logs.page + 1}${p.logs.result ? `&result=${p.logs.result}` : ""}`}>
                      Older →
                    </Link>
                  )}
                </span>
              </div>
            }
          />
        </div>
      )}
    </div>
  );
}
