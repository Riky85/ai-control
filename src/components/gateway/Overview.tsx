import Link from "next/link";
import { StatCard } from "@/components/ui";
import { fmtEur } from "@/lib/format";
import type { RedactKind } from "@/lib/gateway/detect";
import type { GwOverview, TeamSpend } from "@/lib/gateway/data";
import RequestsTable from "./RequestsTable";
import { fmtInt } from "./shared";

const KIND_PLURAL: Record<RedactKind, string> = { IBAN: "IBANs", TAX_CODE: "tax codes", EMAIL: "emails", CARD: "card numbers", PHONE: "phone numbers" };
const REASON_SHORT: Record<string, string> = { health_data: "Health data", model_not_allowed: "unlisted models", cap_exceeded: "caps reached", eu_only: "non-EU endpoints", rate_limited: "rate limit" };

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** Overview del Gateway: 4 numeri, spesa dei team con i tetti, richieste dal vivo. */
export default function GatewayOverview({ data, endpointHost }: { data: GwOverview; endpointHost: string }) {
  const delta = data.requestsYesterday > 0 ? Math.round(((data.requestsToday - data.requestsYesterday) / data.requestsYesterday) * 100) : null;
  const kinds = data.redactedKinds.slice(0, 3).map((k) => KIND_PLURAL[k]);
  const reasons = data.blockedReasons.slice(0, 2).map((r) => REASON_SHORT[r] ?? r.replace(/_/g, " "));
  const capped = data.teams.filter((t) => t.capEur).reduce((s, t) => s + t.eur, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Requests today" value={fmtInt(data.requestsToday)} hint={delta === null ? undefined : `${delta >= 0 ? "+" : ""}${delta}% vs yesterday`} />
        <StatCard
          label="Spend this month"
          value={fmtEur(data.spendMonthEur)}
          hint={data.capsTotalEur > 0 ? `${pct(capped, data.capsTotalEur)}% of caps` : undefined}
        />
        <StatCard label="Redacted" tone={data.redactedMonth ? "signal" : undefined} value={fmtInt(data.redactedMonth)} hint={kinds.length ? kinds.join(", ") : "This month"} />
        <StatCard label="Blocked" tone={data.blockedMonth ? "alarm" : undefined} value={fmtInt(data.blockedMonth)} hint={reasons.length ? reasons.join(", ") : "This month"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-4 items-start">
        <TeamSpendPanel teams={data.teams} endpointHost={endpointHost} />
        <RequestsTable
          rows={data.live}
          title="Live requests"
          footer={
            <>
              <span>
                {fmtInt(data.live.length)} of {fmtInt(data.requestsToday)} today ·{" "}
                <Link href="/gateway?tab=logs" className="font-medium text-ink-100 hover:underline">
                  Open logs →
                </Link>
              </span>
            </>
          }
        />
      </div>
    </div>
  );
}

function TeamSpendPanel({ teams, endpointHost }: { teams: TeamSpend[]; endpointHost: string }) {
  const max = Math.max(1, ...teams.map((t) => Math.max(t.eur, t.capEur ?? 0)));
  return (
    <section className="rounded-xl border border-line bg-panel animate-rise">
      <div className="bar-head rounded-t-xl border-b border-line px-5 py-3 flex items-center justify-between gap-4">
        <h2 className="text-sm font-bold text-ink-100">Spend by team</h2>
        <span className="text-xs text-ink-400">This month</span>
      </div>
      <div className="px-5 py-4 flex flex-col gap-4">
        {teams.length === 0 && <p className="text-sm text-ink-400 py-4 text-center">No spend yet.</p>}
        {teams.map((t) => {
          const used = t.capEur ? pct(t.eur, t.capEur) : null;
          const over = used !== null && used >= 100;
          return (
            <div key={t.team || "(none)"}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium text-ink-100 truncate">{t.team || "No team"}</span>
                <span className="font-medium tabular text-ink-100">{fmtEur(t.eur)}</span>
              </div>
              <div className="relative mt-2 h-1.5 rounded-full bg-ink-100/[0.08]">
                <div className={`absolute inset-y-0 left-0 rounded-full ${over ? "bg-alarm" : "bg-ink-400"}`} style={{ width: `${Math.min(100, (t.eur / max) * 100)}%` }} />
                {t.capEur && <div className="absolute -top-1 -bottom-1 w-px bg-ink-100" style={{ left: `${Math.min(100, (t.capEur / max) * 100)}%` }} title={`Cap ${fmtEur(t.capEur)}`} />}
              </div>
              <div className={`text-xs mt-1.5 ${over ? "text-alarm" : "text-ink-400"}`}>
                {t.capEur ? `${fmtEur(t.eur)} of ${fmtEur(t.capEur)} cap · ${used}% used` : `${t.keys} key${t.keys === 1 ? "" : "s"}`}
              </div>
            </div>
          );
        })}
      </div>
      <div className="bar-foot rounded-b-xl border-t border-line px-5 py-3 text-sm text-ink-400 break-words">
        Endpoint <span className="font-medium text-ink-100">{endpointHost}</span>
      </div>
    </section>
  );
}
