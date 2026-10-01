import { currentOrgId } from "@/lib/org";
import { fmtDate } from "@/lib/format";
import { remindInactiveAction } from "@/lib/spend-actions";
import { groupByDepartment, maskCount, orgPrivacyMode, MIN_GROUP } from "@/lib/privacy";
import { displayableRef } from "@/lib/discovery/pseudonym";
import PrivacyNotice from "@/components/PrivacyNotice";
import { Notice, Table, td } from "@/components/ui";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { seatRemovalSupport } from "@/lib/seat-removal";
import { setAutoRemoveSeatsAction } from "@/lib/savings-actions";
import SeatRemoveButton from "@/components/SeatRemoveButton";

const DAY = 86400000;

export interface AssetPeopleUsage {
  id: string;
  lastSeenAt: Date | null;
  externalUserRef: string | null;
  user: { name: string | null; email: string; department: string | null } | null;
}

/**
 * Scheda "People" del passaporto di un'AI, secondo la privacy dei dipendenti:
 * per persona (con promemoria sui posti), per reparto (gruppi ≥ 5) o solo totali.
 */
export default async function AssetPeople({
  asset,
  usages,
  reminded,
  error,
  removed,
}: {
  asset: { id: string; name: string };
  usages: AssetPeopleUsage[];
  reminded?: string;
  error?: string;
  removed?: string;
}) {
  const mode = await orgPrivacyMode(currentOrgId());
  const now = Date.now();
  const isActive = (u: AssetPeopleUsage) => !!u.lastSeenAt && now - u.lastSeenAt.getTime() <= 30 * DAY;
  const errorBox = error && <div data-keeps-url-error className="rounded-xl bg-alarm/10 px-4 py-3 text-sm text-alarm">{error}</div>;

  if (mode === "individual") {
    const inactive = usages.filter((u) => u.user?.email && !isActive(u)).map((u) => u.user!.email);
    const orgId = currentOrgId();
    const session = currentSession();
    const isAdmin = !!session && ["OWNER", "ADMIN"].includes(session.role);
    const [removedRows, support, org] = await Promise.all([
      db.seatReminder.findMany({ where: { organizationId: orgId, aiAssetId: asset.id, removedAt: { not: null } }, select: { email: true, removedAt: true } }),
      seatRemovalSupport(orgId, asset.id),
      db.organization.findUnique({ where: { id: orgId }, select: { autoRemoveSeats: true } }),
    ]);
    const removedAt = new Map(removedRows.map((r) => [r.email.toLowerCase(), r.removedAt!]));
    return (
      <>
        {inactive.length > 0 && (
          <div className="rounded-xl border border-line bg-panel px-5 py-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-ink-100">{inactive.length} {inactive.length === 1 ? "person hasn't" : "people haven't"} used {asset.name} in 30 days</div>
              <div className="text-sm text-ink-400">Ask if they still need the seat — the ones who don't reply can be removed.</div>
            </div>
            <a
              href={`mailto:?bcc=${encodeURIComponent(inactive.join(","))}&subject=${encodeURIComponent(`Do you still need your ${asset.name} seat?`)}&body=${encodeURIComponent(`Hi,\n\nyou have a company ${asset.name} seat but haven't used it in the last 30 days. If you still need it, just reply. Otherwise we'll free it up.\n\nThanks!`)}`}
              className="btn btn-secondary btn-sm"
            >
              Write the email yourself
            </a>
            <form action={remindInactiveAction}>
              <input type="hidden" name="assetId" value={asset.id} />
              <button className="btn btn-primary btn-sm">Ask them</button>
            </form>
          </div>
        )}
        {reminded && <div className="rounded-xl border border-line bg-panel dark:bg-ink px-4 py-3 text-sm text-ink-100">Sent to {reminded} {reminded === "1" ? "person" : "people"}.</div>}
        {removed && <Notice tone="success">{removed}</Notice>}
        {errorBox}
        {isAdmin && support?.mode === "api" && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-panel px-5 py-3">
            <div className="text-sm">
              <span className="text-ink-100">Remove seats automatically</span>
              <span className="block text-xs text-ink-400">When someone answers &ldquo;I don&apos;t need it&rdquo; or doesn&apos;t reply in 7 days, angar removes the seat via {support.label}. Applies to every AI angar can remove seats from.</span>
            </div>
            <form action={setAutoRemoveSeatsAction}>
              <input type="hidden" name="assetId" value={asset.id} />
              <input type="hidden" name="on" value={org?.autoRemoveSeats ? "0" : "1"} />
              <button
                type="submit"
                role="switch"
                aria-checked={!!org?.autoRemoveSeats}
                title={org?.autoRemoveSeats ? "Turn off" : "Turn on"}
                className={`relative h-5 w-9 rounded-full transition-colors ${org?.autoRemoveSeats ? "bg-steady" : "bg-ink-400/40"}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${org?.autoRemoveSeats ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </form>
          </div>
        )}
        <Table columns={["Person", "Department", "Last active", ""]} empty={usages.length === 0 ? "Nobody known yet — connect Microsoft 365, Google Workspace or an Admin key to see who uses it." : false}>
          {usages.map((u) => {
            const gone = u.user?.email ? removedAt.get(u.user.email.toLowerCase()) : undefined;
            return (
              <tr key={u.id}>
                <td className={`${td} text-ink-100`}>
                  {u.user?.name ?? displayableRef(u.user?.email) ?? displayableRef(u.externalUserRef) ?? (u.user?.email || u.externalUserRef ? "Anonymous person" : "Unknown")}
                  {u.user?.name && <span className="block text-xs text-ink-400">{u.user.email}</span>}
                </td>
                <td className={`${td} text-ink-400`}>{u.user?.department ?? "—"}</td>
                <td className={`${td} text-ink-400 tabular`}>{u.lastSeenAt ? fmtDate(u.lastSeenAt) : "—"}</td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  {gone ? (
                    <span className="text-xs text-ink-400">Seat removed {fmtDate(gone)}</span>
                  ) : u.user?.email && isAdmin && support?.mode === "api" ? (
                    <SeatRemoveButton assetId={asset.id} email={u.user.email} />
                  ) : null}
                </td>
              </tr>
            );
          })}
        </Table>
      </>
    );
  }

  const active = usages.filter(isActive).length;
  const idle = usages.length - active;
  return (
    <>
      <PrivacyNotice mode={mode} what="This tab" />
      {errorBox}
      <div className="grid grid-cols-3 gap-4">
        <Total label="People using it" value={maskCount(usages.length)} />
        <Total label="Active in 30 days" value={maskCount(active)} />
        <Total label="Not active in 30 days" value={maskCount(idle)} hint={idle ? "Seat reminders need the “By person” privacy mode" : undefined} />
      </div>
      {mode === "department" && (
        <Table columns={["Department", { label: "People", className: "text-right" }, { label: "Active in 30 days", className: "text-right" }]} empty={usages.length === 0 ? "Nobody known yet." : false}>
          {groupByDepartment(usages, (u) => u.user?.email ?? u.externalUserRef, (u) => u.user?.department).map((g) =>
            g.suppressed ? (
              <tr key="suppressed">
                <td className={`${td} text-ink-400`} colSpan={3}>Fewer than {MIN_GROUP} people use {asset.name} — nothing can be shown by department.</td>
              </tr>
            ) : (
              <tr key={g.department}>
                <td className={`${td} ${g.merged ? "text-ink-400" : "text-ink-100"}`}>{g.department}</td>
                <td className={`${td} text-right tabular text-ink-100`}>{g.people}</td>
                <td className={`${td} text-right tabular text-ink-400`}>{maskCount(g.rows.filter(isActive).length)}</td>
              </tr>
            ),
          )}
        </Table>
      )}
    </>
  );
}

function Total({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="text-sm text-ink-400">{label}</div>
      <div className="font-display text-2xl font-semibold tabular text-ink-100 mt-1">{value}</div>
      {hint && <div className="text-xs text-ink-400 mt-1">{hint}</div>}
    </div>
  );
}
