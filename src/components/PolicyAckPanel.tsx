import { db } from "@/lib/db";
import { StatCard, Notice } from "@/components/ui";
import CopyField from "@/components/CopyField";
import CopyButton from "@/components/CopyButton";
import { policyAckStats, genericToken, ackLink, MAX_REMINDERS } from "@/lib/policy-ack";
import { sendPolicyAckAction, publishPolicyAction, remindPolicyAckAction } from "@/lib/policy-ack-actions";
import { QUIZ_TOTAL } from "@/lib/literacy";
import { fmtDate } from "@/lib/format";

/**
 * Governance → Policies: invio della policy AI ai dipendenti con il mini-modulo
 * di AI literacy (AI Act art. 4) e stato delle conferme. Con la privacy per
 * reparto / solo totali niente link personali: un link generico e i conteggi.
 */
export default async function PolicyAckPanel({ orgId, flash }: { orgId: string; flash?: { ack?: string; n?: string; error?: string } }) {
  const [s, org] = await Promise.all([policyAckStats(orgId), db.organization.findUnique({ where: { id: orgId }, select: { employees: true } })]);
  const { emailEnabled } = await import("@/lib/mail");
  const emailOn = emailEnabled();
  const pct = s.total ? Math.round((s.acknowledged / s.total) * 100) : null;
  const generic = s.version ? ackLink(genericToken(orgId, s.version)) : null;
  const n = Number(flash?.n ?? 0);
  const allLinks = s.rows.filter((r) => !r.acknowledgedAt).map((r) => `${r.email}\t${ackLink(r.token)}`).join("\n");

  return (
    <div id="ack" className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4 scroll-mt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-ink-100">Employee acknowledgement &amp; AI literacy</h2>
          <p className="text-sm text-ink-400 mt-0.5">
            Send your AI policy (allowed and not-allowed AI + the active policies below) with a {QUIZ_TOTAL}-question AI literacy check in English, Italian or German. Each confirmation is recorded as AI Act art. 4 evidence.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {s.personal ? (
            <form action={sendPolicyAckAction}>
              <button className="btn btn-primary btn-sm">{s.version && !s.changed ? "Send to new people" : "Send to employees"}</button>
            </form>
          ) : (
            (!s.version || s.changed) && (
              <form action={publishPolicyAction}>
                <button className="btn btn-primary btn-sm">{s.version ? "Publish new version" : "Create link"}</button>
              </form>
            )
          )}
          {s.personal && s.pending > 0 && emailOn && (
            <form action={remindPolicyAckAction}>
              <button className="btn btn-secondary btn-sm">Remind</button>
            </form>
          )}
        </div>
      </div>

      {flash?.error && <Notice tone="error">{flash.error}</Notice>}
      {flash?.ack === "sent" && <Notice tone="success">Sent to {n} {n === 1 ? "person" : "people"}. Reminders go out automatically after 7 days (max {MAX_REMINDERS}).</Notice>}
      {flash?.ack === "links" && <Notice>Created {n} personal link{n === 1 ? "" : "s"}. Email isn&apos;t configured on this deployment — copy the links below and send them yourself.</Notice>}
      {flash?.ack === "reminded" && <Notice tone="success">Reminded {n} {n === 1 ? "person" : "people"}.</Notice>}
      {flash?.ack === "published" && <Notice tone="success">Policy published — share the link below.</Notice>}
      {s.changed && <Notice>Your AI policy changed since it was last sent (allowed AI or policies). {s.personal ? "Send it again to collect confirmations for the new version." : "Publish the new version and share the new link."}</Notice>}

      {s.version && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {s.personal ? (
            <>
              <StatCard label="Acknowledged" value={pct == null ? "—" : `${pct}%`} hint={`${s.acknowledged} of ${s.total} people`} tone={pct != null && pct < 80 ? "signal" : undefined} />
              <StatCard label="Pending" value={String(s.pending)} hint={`${s.opened - s.acknowledged > 0 ? `${s.opened - s.acknowledged} opened, ` : ""}${s.reminded} reminded`} tone={s.pending ? "signal" : undefined} />
            </>
          ) : (
            <>
              <StatCard label="Completions" value={String(s.generic)} hint={org?.employees ? `≈ ${Math.min(100, Math.round((s.generic / org.employees) * 100))}% of ${org.employees} employees` : "Anonymous — set employees in Settings for a %"} />
              <StatCard label="Tracking" value="Anonymous" hint="Employee privacy: no per-person links" />
            </>
          )}
          <StatCard label="Literacy check" value={s.avgScore == null ? "—" : `${s.avgScore}/${QUIZ_TOTAL}`} hint="Average score" />
          <StatCard label="Policy version" value={s.version} hint={s.publishedAt ? `Published ${fmtDate(new Date(s.publishedAt))}` : undefined} />
        </div>
      )}

      {generic && (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs text-ink-400">{s.personal ? "Generic link (no per-person tracking — for intranet or people without email)" : "Share this link with all employees (intranet, email, Teams). Only totals are recorded."}</div>
          <CopyField value={generic} />
        </div>
      )}

      {s.personal && s.rows.length > 0 && (
        <details>
          <summary className="cursor-pointer list-none text-sm text-ink-400 hover:text-ink-100 select-none">
            People ({s.rows.length}){!emailOn && " — email is off: copy each personal link"}
          </summary>
          {!emailOn && allLinks && (
            <div className="mt-3">
              <CopyButton text={allLinks} label="Copy all pending links" />
            </div>
          )}
          <div className="mt-3 max-h-80 overflow-y-auto divide-y divide-line border-y border-line -mx-5">
            {s.rows.map((r) => (
              <div key={r.token} className="px-5 py-2 flex items-center gap-3 text-sm">
                <span className="flex-1 min-w-0 truncate text-ink-100">{r.email}</span>
                <span className={`text-xs ${r.acknowledgedAt ? "text-steady" : "text-ink-400"}`}>
                  {r.acknowledgedAt ? `Confirmed ${fmtDate(r.acknowledgedAt)} · ${r.quizScore ?? "—"}/${QUIZ_TOTAL}` : r.openedAt ? "Opened" : r.reminders ? `Reminded ×${r.reminders}` : "Sent"}
                </span>
                {!r.acknowledgedAt && <CopyButton text={ackLink(r.token)} label="Copy link" className="btn btn-ghost btn-sm" />}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
