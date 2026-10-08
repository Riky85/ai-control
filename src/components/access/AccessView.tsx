import Link from "next/link";
import { EmptyState, Notice, PageHeader, StatCard, Table, Tabs, td } from "@/components/ui";
import { VendorBadge } from "@/components/VendorIcon";
import { fmtDate } from "@/lib/format";
import { aiHref } from "@/lib/links";
import { AREA_LABEL, PROVIDER_LABEL, SENSITIVE, scopeAreas, writes, type GrantCapability, type GrantProvider } from "@/lib/access/types";
import { refreshAccessAction, revokeAccessAction } from "@/lib/access/actions";
import NudgeButton from "./NudgeButton";

export interface AccessGrantRow {
  id: string;
  provider: string;
  appName: string;
  publisher: string | null;
  scopes: string[];
  userCount: number;
  adminConsent: boolean;
  isAi: boolean;
  serviceId: string | null;
  lastSeenAt: Date;
  asset: { id: string; name: string; status: string; nudgedAt: Date | null } | null;
}

export interface NotAllowedRow {
  id: string;
  name: string;
  vendor: string | null;
  users: number;
  nudgedAt: Date | null;
  alternative: string | null;
}

const CONNECT_URL: Record<GrantProvider, string> = { MICROSOFT_365: "/api/connectors/microsoft/connect", GOOGLE_WORKSPACE: "/api/connectors/google/connect" };
const STATUS_LABEL: Record<string, string> = { APPROVED: "Approved", UNAPPROVED: "Not allowed", UNREVIEWED: "To review", UNKNOWN: "To review" };

function AreaPills({ scopes }: { scopes: string[] }) {
  const areas = scopeAreas(scopes);
  if (!areas.length) return <span className="text-ink-400">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {areas.map((a) => (
        <span
          key={a}
          className={`inline-flex items-center rounded-[2px] border px-1.5 py-0.5 font-mono uppercase text-[10px] tracking-[0.05em] whitespace-nowrap ${SENSITIVE.includes(a) ? "border-accent/45 text-accent" : "border-line text-ink-400"}`}
        >
          {AREA_LABEL[a]}
        </span>
      ))}
    </span>
  );
}

function RevokeControl({ g, cap, isAdmin, back }: { g: AccessGrantRow; cap: GrantCapability | undefined; isAdmin: boolean; back: string }) {
  if (!isAdmin) return null;
  const why = !cap ? `${PROVIDER_LABEL[g.provider as GrantProvider] ?? g.provider} isn't connected` : !cap.canRevoke ? cap.revokeWhy ?? "Not allowed with the current permissions" : null;
  if (why)
    return (
      <button type="button" disabled className="btn btn-ghost btn-sm opacity-50 cursor-not-allowed" title={why}>
        Revoke
      </button>
    );
  return (
    <details className="relative inline-block text-left">
      <summary className="btn btn-ghost btn-sm list-none cursor-pointer select-none [&::-webkit-details-marker]:hidden">Revoke</summary>
      <div className="absolute right-0 z-30 mt-1.5 w-72 rounded-xl border border-line bg-panel p-4 shadow-lg flex flex-col gap-3 text-left whitespace-normal">
        <p className="text-sm text-ink-100">
          Revoke <span className="font-medium">{g.appName}</span> in {PROVIDER_LABEL[g.provider as GrantProvider]}?
        </p>
        <p className="text-xs text-ink-400">
          {g.provider === "MICROSOFT_365"
            ? "Removes every consent to this app, including the admin consent. People are asked again the next time they use it — block the app in Entra ID to stop that."
            : "Removes the app's access token for everyone who granted it. People can grant it again unless you block it in the Google Admin console."}
        </p>
        <form action={revokeAccessAction}>
          <input type="hidden" name="id" value={g.id} />
          <input type="hidden" name="confirm" value="yes" />
          <input type="hidden" name="back" value={back} />
          <button className="btn btn-danger btn-sm w-full">Yes, revoke access</button>
        </form>
      </div>
    </details>
  );
}

/**
 * App access (corpo): app di terze parti con consensi OAuth su Microsoft 365 / Google Workspace,
 * AI in evidenza. I dati arrivano già pronti (pagina reale o pagina di prova).
 */
export default function AccessView({
  connected,
  caps,
  grants,
  notAllowed,
  view,
  role,
  error,
  done,
}: {
  connected: GrantProvider[];
  caps: Partial<Record<GrantProvider, GrantCapability>>;
  grants: AccessGrantRow[];
  notAllowed: NotAllowedRow[];
  view: "ai" | "all";
  role: string;
  error?: string | null;
  done?: string | null;
}) {
  const isAdmin = role === "ADMIN" || role === "OWNER";
  const canRefresh = role !== "VIEWER";
  const back = view === "all" ? "/estate/access?view=all" : "/estate/access";
  const ai = grants.filter((g) => g.isAi);
  const shown = view === "all" ? grants : ai;
  const aiSensitive = ai.filter((g) => scopeAreas(g.scopes).some((a) => SENSITIVE.includes(a))).length;
  const people = grants.reduce((t, g) => t + g.userCount, 0);
  const orgWide = grants.filter((g) => g.adminConsent).length;
  const lastSeen = grants.reduce<Date | null>((m, g) => (!m || g.lastSeenAt > m ? g.lastSeenAt : m), null);
  const missing = connected.filter((p) => caps[p] && !caps[p]!.canRead);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="App access"
        subtitle="Third-party apps that can reach company mail, files and calendars"
        action={
          canRefresh && connected.length > 0 ? (
            <form action={refreshAccessAction}>
              <input type="hidden" name="back" value={back} />
              <button className="btn btn-secondary btn-sm">Refresh</button>
            </form>
          ) : undefined
        }
      />
      {error && <Notice tone="error">{error}</Notice>}
      {done && <Notice tone="success">{done}</Notice>}

      {connected.length === 0 ? (
        <EmptyState
          text="See which apps people have allowed into company accounts — and which of them are AI — by connecting your workplace accounts."
          action={<Link href="/connect" className="btn btn-secondary btn-go">Connect Microsoft 365 or Google Workspace</Link>}
        />
      ) : (
        <>
          {missing.map((p) => (
            <Notice key={p}>
              <span className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <span className="font-medium">{PROVIDER_LABEL[p]}:</span> {caps[p]!.readWhy}
                </span>
                {isAdmin && (
                  <a href={CONNECT_URL[p]} className="btn btn-secondary btn-sm btn-go">
                    Reconnect to grant access to app permissions
                  </a>
                )}
              </span>
            </Notice>
          ))}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <StatCard label="AI apps with access" value={String(ai.length)} hint={aiSensitive ? `${aiSensitive} can reach mail, files or calendars` : ai.length ? "Sign-in or low-risk access only" : "None found"} tone={aiSensitive > 0 ? "warn" : undefined} />
            <StatCard label="All third-party apps" value={String(grants.length)} hint={lastSeen ? `Checked ${fmtDate(lastSeen)}` : "Not checked yet"} />
            <StatCard label="Consents" value={String(people)} hint={orgWide ? `+ ${orgWide} approved for the whole company` : "Granted by individual people"} />
          </div>

          <Tabs
            active={view}
            items={[
              { key: "ai", label: "AI apps", href: "/estate/access", count: ai.length },
              { key: "all", label: "All apps", href: "/estate/access?view=all", count: grants.length },
            ]}
          />

          {shown.length === 0 ? (
            <EmptyState
              text={grants.length === 0 ? (missing.length ? "Nothing to show until the permission is granted." : "No app list yet — press Refresh to read it now.") : "No AI app has access to company accounts."}
              action={
                view === "ai" && grants.length > 0 ? (
                  <Link href="/estate/access?view=all" className="btn btn-secondary btn-sm">
                    See all apps
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <Table columns={["App", "Can reach", { label: "People", className: "text-right" }, "Account", "AI system", { label: "", className: "text-right" }]}>
              {shown.map((g) => {
                const sensitive = scopeAreas(g.scopes).some((a) => SENSITIVE.includes(a));
                const nudge = g.asset && g.asset.status === "UNAPPROVED" && g.userCount > 0;
                return (
                  <tr key={g.id}>
                    <td className={td}>
                      <span className="flex items-center gap-3 min-w-0">
                        <VendorBadge vendor={g.publisher ?? g.appName} name={g.appName} size={28} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="text-ink-100 font-medium truncate">{g.appName}</span>
                            {g.isAi && <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-ink-400 border border-line rounded-[2px] px-1 py-px">AI</span>}
                          </span>
                          <span className="block eyebrow mt-0.5 truncate">{g.publisher ?? "Unknown publisher"}</span>
                        </span>
                      </span>
                    </td>
                    <td className={td} title={g.scopes.join(" ")}>
                      <AreaPills scopes={g.scopes} />
                      {sensitive && writes(g.scopes) && <span className="block text-[11px] text-ink-400 mt-1">Can also change data</span>}
                    </td>
                    <td className={`${td} text-right tabular text-ink-100 whitespace-nowrap`}>
                      {g.adminConsent ? <span title="An administrator approved it for the whole company">Everyone</span> : g.userCount}
                    </td>
                    <td className={`${td} text-ink-400 whitespace-nowrap`}>{PROVIDER_LABEL[g.provider as GrantProvider] ?? g.provider}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {g.asset ? (
                        <Link href={aiHref(g.asset.id)} className="hover:underline">
                          <span className="text-ink-100">{g.asset.name}</span>
                          <span className={`block eyebrow mt-0.5 ${g.asset.status === "UNAPPROVED" ? "!text-accent" : ""}`}>{STATUS_LABEL[g.asset.status] ?? g.asset.status}</span>
                        </Link>
                      ) : g.isAi ? (
                        <span className="text-ink-400">Not in your estate</span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      <span className="inline-flex items-center gap-1.5">
                        {nudge && isAdmin && <NudgeButton assetId={g.asset!.id} nudgedAt={g.asset!.nudgedAt} back={back} />}
                        <RevokeControl g={g} cap={caps[g.provider as GrantProvider]} isAdmin={isAdmin} back={back} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </>
      )}

      {notAllowed.length > 0 && (
        <Table
          title="Not allowed, still in use"
          note="From usage, activity and app consents"
          columns={["AI system", { label: "People", className: "text-right" }, "Approved alternative", "Last nudge", { label: "", className: "text-right" }]}
        >
          {notAllowed.map((a) => (
            <tr key={a.id}>
              <td className={td}>
                <Link href={aiHref(a.id)} className="flex items-center gap-3 min-w-0 group">
                  <VendorBadge vendor={a.vendor ?? ""} name={a.name} size={28} />
                  <span className="text-ink-100 font-medium truncate group-hover:underline">{a.name}</span>
                </Link>
              </td>
              <td className={`${td} text-right tabular text-ink-100`}>{a.users}</td>
              <td className={`${td} text-ink-400`}>{a.alternative ?? "None set"}</td>
              <td className={`${td} text-ink-400 tabular whitespace-nowrap`}>{a.nudgedAt ? fmtDate(a.nudgedAt) : "Never"}</td>
              <td className={`${td} text-right`}>{isAdmin && <NudgeButton assetId={a.id} nudgedAt={a.nudgedAt} back={back} />}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
