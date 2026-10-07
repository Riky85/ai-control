import { redirect } from "next/navigation";
import { MODEL_LABEL } from "@/lib/edge/device-id";
import { currentSession } from "@/lib/auth";
import { featureEnabled } from "@/lib/plan-gate";
import { LockedNote } from "@/components/LockedFeature";
import Link from "next/link";
import { partnerClients, partnerFleet, partnerEconomics } from "@/lib/partner";
import { planById, EDGE } from "@/lib/plans";
import { PRIVACY_MODES } from "@/lib/privacy";
import { fmtEur, fmtAgo } from "@/lib/format";
import { switchWorkspaceAction, createWorkspaceAction } from "@/lib/workspace-actions";
import { setManagedByMeAction } from "@/lib/partner-actions";
import { Notice, PageHeader, StatCard, Table, Tabs, td } from "@/components/ui";
import Badge from "@/components/Badge";

export const dynamic = "force-dynamic";

// Console partner: tutti i workspace cliente dell'utente (solo quelli di cui è membro).
export default async function PartnerPage({ searchParams }: { searchParams: { error?: string; view?: string } }) {
  const s = currentSession();
  if (!s) redirect("/login");
  const view = searchParams.view === "fleet" ? "fleet" : "clients";
  const [clients, fleet] = await Promise.all([partnerClients(s.email, s.orgId), partnerFleet(s.email, s.orgId)]);
  const econ = partnerEconomics(clients);
  const fleetOnline = fleet.filter((f) => f.online).length;
  const totals = clients.reduce(
    (t, c) => ({
      spend: t.spend + c.monthlySpend,
      save: t.save + c.canSave,
      review: t.review + c.toReview,
    }),
    { spend: 0, save: 0, review: 0 }
  );
  const onlyOwn = clients.length <= 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Partner console"
        subtitle="All your client workspaces in one place"
        action={
          <form action={createWorkspaceAction} className="flex flex-wrap items-center gap-2">
            <input name="name" required placeholder="Client company name" aria-label="Client company name" className="field py-1.5 w-full sm:w-52" />
            <button className="btn btn-primary">New client workspace</button>
          </form>
        }
      />
      {!(await featureEnabled(s.orgId, "partnerConsole")) && <Notice><span className="inline-flex flex-wrap items-center gap-x-2">The partner console is read-only on your plan. <LockedNote feature="partnerConsole" /></span></Notice>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Clients" value={String(clients.length)} hint={onlyOwn ? "Add your first client workspace" : "Workspaces you're a member of"} tone="accent" />
        <StatCard
          label="Total AI spend"
          value={totals.spend ? `${fmtEur(totals.spend)}/mo` : "—"}
          hint={totals.spend ? `${fmtEur(totals.spend * 12)} a year` : "No costs yet"}
        />
        <StatCard
          label="Total possible savings"
          value={totals.save ? `${fmtEur(totals.save)}/mo` : "—"}
          hint={totals.save ? `${fmtEur(totals.save * 12)} a year across clients` : "Nothing found yet"}
        />
        <StatCard
          label="Items to review"
          value={String(totals.review)}
          hint={totals.review ? "AI found by scans, not yet decided" : "All clear"}
          tone={totals.review ? "signal" : undefined}
        />
      </div>

      {onlyOwn && (
        <div className="rounded-xl border border-dashed border-line bg-panel p-8 flex flex-col gap-3 animate-rise">
          <h2 className="text-base font-bold text-ink-100">Manage AI spend for all your clients</h2>
          <p className="text-sm text-ink-400 max-w-2xl">
            Accountants, consultants and MSPs use angar to look after AI spend for many client companies at once. Create one workspace for each client, drop their bank
            statement or invite them, and this console shows every client side by side — spend, possible savings, AI to review and alerts — sorted by where you can save
            the most.
          </p>
          <ol className="text-sm text-ink-100 list-decimal pl-5 flex flex-col gap-1">
            <li>Create a client workspace with the button above.</li>
            <li>Add their costs (bank statement, invoices or a connected bank) from Sources.</li>
            <li>Invite the client from Workspace → Members, if they should see it too.</li>
          </ol>
          <p className="text-xs text-ink-400">Each workspace stays separate: clients never see each other, and you only see workspaces you&apos;re a member of.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          active={view}
          items={[
            {
              key: "clients",
              label: "Clients",
              href: "/partner?view=clients",
              count: clients.length,
            },
            {
              key: "fleet",
              label: "Edge fleet",
              href: "/partner?view=fleet",
              count: fleet.length,
            },
          ]}
        />
        <span className="text-xs text-ink-400">
          {view === "fleet"
            ? `${fleetOnline} of ${fleet.length} sensors online · online = check-in within ${EDGE.onlineMinutes} min`
            : `Sorted by possible savings · Edge: last ${EDGE.onlineMinutes} min online, 7-day totals`}
        </span>
      </div>

      {view === "clients" ? (
        <>
          <Table
            columns={[
              "Client",
              "Plan",
              { label: "AI", className: "text-right" },
              { label: "AI spend", className: "text-right" },
              { label: "Possible savings", className: "text-right" },
              { label: "To review", className: "text-right" },
              { label: "Computers", className: "text-right" },
              { label: "Edge", className: "text-right" },
              { label: "Alerts", className: "text-right" },
              { label: "Managed", className: "text-right" },
            ]}
          >
            {clients.map((c) => (
              <tr key={c.id}>
                <td className={td}>
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-ink-100">{c.name}</span>
                    {c.current && <Badge>CURRENT</Badge>}
                  </span>
                  <span className="block text-xs text-ink-400 whitespace-nowrap">
                    {c.role.charAt(0) + c.role.slice(1).toLowerCase()} · {PRIVACY_MODES.find((m) => m.id === c.privacyMode)?.label}
                  </span>
                </td>
                <td className={`${td} text-ink-400`}>{planById(c.plan as Parameters<typeof planById>[0]).displayName}</td>
                <td className={`${td} text-right tabular text-ink-100`}>{c.aiCount}</td>
                <td className={`${td} text-right tabular text-ink-100`}>{c.monthlySpend ? `${fmtEur(c.monthlySpend)}/mo` : "—"}</td>
                <td className={`${td} text-right tabular ${c.canSave ? "text-steady font-medium" : "text-ink-400"}`}>{c.canSave ? `${fmtEur(c.canSave)}/mo` : "—"}</td>
                <td className={`${td} text-right tabular ${c.toReview ? "text-signal" : "text-ink-400"}`}>{c.toReview}</td>
                <td className={`${td} text-right tabular text-ink-100`}>
                  <span className="inline-flex items-center gap-1.5">
                    {c.computersOnline > 0 && <span className="h-2 w-2 rounded-full bg-steady" />}
                    {c.computersOnline}
                  </span>
                </td>
                <td className={`${td} text-right tabular`}>
                  {c.edgeSensors ? (
                    <>
                      <span className={`inline-flex items-center gap-1.5 ${c.edgeOnline < c.edgeSensors ? "text-alarm" : "text-ink-100"}`}>
                        {c.edgeOnline > 0 && <span className="h-2 w-2 rounded-full bg-steady" />}
                        {c.edgeOnline}/{c.edgeSensors}
                      </span>
                      <span className="block text-xs text-ink-400 whitespace-nowrap">
                        {c.edgeAiQueries7d.toLocaleString("en-GB")} AI · {c.edgeBlocked7d.toLocaleString("en-GB")} blocked
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-400">—</span>
                  )}
                </td>
                <td className={`${td} text-right tabular ${c.unreadAlerts ? "text-alarm" : "text-ink-400"}`}>{c.unreadAlerts}</td>
                <td className={`${td} text-right`}>
                  <div className="flex items-center justify-end gap-3">
                    {c.current ? (
                      <span className="text-xs text-ink-400">Partner</span>
                    ) : c.managedByOther ? (
                      <span className="text-xs text-ink-400">Other partner</span>
                    ) : c.role === "OWNER" || c.role === "ADMIN" ? (
                      <form action={setManagedByMeAction}>
                        <input type="hidden" name="orgId" value={c.id} />
                        <input type="hidden" name="managed" value={c.managedByMe ? "0" : "1"} />
                        <button
                          className={`text-xs whitespace-nowrap ${c.managedByMe ? "text-steady hover:text-alarm" : "text-ink-400 hover:text-ink-100 underline"}`}
                          title={c.managedByMe ? "Stop managing this client" : "Mark as managed by this partner workspace"}
                        >
                          {c.managedByMe ? "✓ By me" : "Mark"}
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-ink-400">{c.managedByMe ? "✓ By me" : "—"}</span>
                    )}
                    <form action={switchWorkspaceAction}>
                      <input type="hidden" name="orgId" value={c.id} />
                      <button className="btn btn-secondary btn-sm">Open</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </Table>

          {/* Economia partner: stima, solo clienti gestiti. */}
          <section className="rounded-xl border border-line bg-panel p-4 flex flex-col gap-3">
            <div className="-mx-4 -mt-4 flex flex-wrap items-baseline justify-between gap-2 bg-ink border-b border-line rounded-t-xl px-4 py-3 bar-head">
              <h2 className="text-sm font-bold text-ink-100">
                Partner economics <span className="font-normal text-ink-400">· estimate</span>
              </h2>
              <span className="text-xs text-ink-400">
                List prices minus your {EDGE.partnerDiscountPct}% partner discount · Edge software free on {planById(EDGE.softwareFromPlan).displayName}+
              </span>
            </div>
            {econ.rows.length === 0 ? (
              <p className="text-sm text-ink-400">
                Mark client workspaces as <span className="text-ink-100">managed by me</span> to see your monthly recurring revenue from angar plans and Edge devices.
              </p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-start">
                <div className="grid grid-cols-3 gap-4 lg:w-[26rem]">
                  <Figure label="Clients pay" value={`${fmtEur(econ.total.list)}/mo`} />
                  <Figure label="Your cost" value={`${fmtEur(econ.total.cost)}/mo`} />
                  <Figure label="Your margin" value={`${fmtEur(econ.total.margin)}/mo`} hint={`${fmtEur(econ.total.margin * 12)} a year`} accent />
                </div>
                <div className="text-xs divide-y divide-line border border-line rounded-lg">
                  {econ.rows.map((r) => (
                    <div key={r.clientId} className="flex items-center gap-3 px-3 py-1.5">
                      <span className="flex-1 truncate text-ink-100">{r.clientName}</span>
                      <span className="text-ink-400 whitespace-nowrap">
                        {planById(r.plan as Parameters<typeof planById>[0]).displayName}
                        {r.planList === null && " (custom)"}
                        {r.edgeDevices > 0 && ` + ${r.edgeDevices} device${r.edgeDevices > 1 ? "s" : ""}`}
                      </span>
                      <span className="w-20 text-right tabular text-ink-400">{fmtEur(r.list)}</span>
                      <span className="w-20 text-right tabular text-steady font-medium">+{fmtEur(r.margin)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      ) : (
        <Table
          columns={["Client", "Sensor", "Kind", "Status", "Version", { label: "Last seen", className: "text-right" }, ""]}
          empty={
            fleet.length > 0
              ? false
              : clients.length > 1
                ? "No Edge sensors in your client workspaces yet. Open a client and set one up in Edge → Sensors."
                : "No Edge sensors yet. Create client workspaces, then set up a sensor in each."
          }
        >
          {fleet.map((f) => (
            <tr key={f.id}>
              <td className={`${td} text-ink-100`}>{f.clientName}</td>
              <td className={`${td} font-medium text-ink-100`}>
                {f.name}
                {f.blockEnabled && <span className="ml-2 text-[11px] text-ink-400">blocking</span>}
              </td>
              <td className={`${td} text-ink-400`}>
                {KIND_LABEL[f.kind] ?? f.kind}
                {f.device ? (
                  <div className="text-xs">
                    <span className="font-mono">{f.device.serial}</span> · {MODEL_LABEL[f.device.model] ?? f.device.model}
                  </div>
                ) : f.kind === "device" ? (
                  <div className="text-xs">returned</div>
                ) : null}
              </td>
              <td className={td}>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${f.online ? "text-steady" : "text-alarm"}`}>
                  <span className={`h-2 w-2 rounded-full ${f.online ? "bg-steady" : "bg-alarm"}`} />
                  {f.online ? "Online" : f.lastSeenAt ? "Offline" : "Never connected"}
                </span>
              </td>
              <td className={`${td} text-ink-400 tabular`}>{f.version ?? "—"}</td>
              <td className={`${td} text-right text-ink-400 whitespace-nowrap`}>{f.lastSeenAt ? fmtAgo(f.lastSeenAt) : "—"}</td>
              <td className={`${td} text-right`}>
                <form action={switchWorkspaceAction}>
                  <input type="hidden" name="orgId" value={f.clientId} />
                  <button className="btn btn-secondary btn-sm">Open</button>
                </form>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <p className="text-xs text-ink-400">
        Only workspaces you&apos;re an active member of. Selling angar Edge to your clients? See{" "}
        <Link href="/edge" className="underline hover:text-ink-100">
          angar Edge
        </Link>
        .
      </p>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  software: "Software",
  cloud: "Cloud logs",
  device: "angar device",
};

function Figure({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs text-ink-400">{label}</div>
      <div className={`text-lg font-semibold tabular ${accent ? "text-steady" : "text-ink-100"}`}>{value}</div>
      {hint && <div className="text-xs text-ink-400">{hint}</div>}
    </div>
  );
}
