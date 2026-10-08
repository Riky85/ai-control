import Link from "next/link";
import { db } from "@/lib/db";
import { Notice } from "@/components/ui";
import CopyField from "@/components/CopyField";
import CopyButton from "@/components/CopyButton";
import { AxisTrack } from "@/components/engine/ScoreCard";
import { Pill, Section, NextStep, Chevron } from "@/components/governance/parts";
import { policyAckStats, genericToken, ackLink } from "@/lib/policy-ack";
import { sendPolicyAckAction, publishPolicyAction, remindPolicyAckAction } from "@/lib/policy-ack-actions";
import { QUIZ_TOTAL } from "@/lib/literacy";
import { fmtDate } from "@/lib/format";

/**
 * Governance → AI literacy e conferme della policy: invio della policy AI ai
 * dipendenti con il mini-modulo di AI literacy (AI Act art. 4) e stato delle
 * conferme, come barre di avanzamento. Con la privacy per reparto / solo
 * totali niente link personali: un link generico e i conteggi.
 */
export default async function PolicyAckPanel({
  orgId,
  flash,
  training,
}: {
  orgId: string;
  flash?: { ack?: string; n?: string; error?: string };
  /** Ultima formazione AI literacy registrata (ultimi 12 mesi), se c'è. */
  training?: { date: Date; summary: string } | null;
}) {
  const [s, org] = await Promise.all([policyAckStats(orgId), db.organization.findUnique({ where: { id: orgId }, select: { employees: true } })]);
  const { emailEnabled } = await import("@/lib/mail");
  const emailOn = emailEnabled();
  const pct = s.total ? Math.round((s.acknowledged / s.total) * 100) : null;
  const reach = !s.personal && org?.employees ? Math.min(100, Math.round((s.generic / org.employees) * 100)) : null;
  const quizPct = s.avgScore == null ? null : Math.round((s.avgScore / QUIZ_TOTAL) * 100);
  const generic = s.version ? ackLink(genericToken(orgId, s.version)) : null;
  const n = Number(flash?.n ?? 0);
  const allLinks = s.rows.filter((r) => !r.acknowledgedAt).map((r) => `${r.email}\t${ackLink(r.token)}`).join("\n");

  const next = !s.version
    ? { label: s.personal ? "Send the AI policy to employees" : "Create the policy link", done: false }
    : s.changed
      ? { label: s.personal ? "Send the new policy version" : "Publish the new policy version", done: false }
      : s.personal && s.pending > 0
        ? { label: `${s.pending} ${s.pending === 1 ? "person has" : "people have"} not confirmed yet`, done: false }
        : !training
          ? { label: "Record AI literacy training", done: false, href: "/compliance" }
          : { label: "Up to date", done: true };

  return (
    <Section
      id="ack"
      title="AI literacy"
      meta={s.version ? `Policy ${s.version}` : undefined}
      action={
        <>
          {s.personal ? (
            <form action={sendPolicyAckAction}>
              <button className="btn btn-primary btn-sm">{s.version && !s.changed ? "Send to new people" : "Send to employees"}</button>
            </form>
          ) : (
            (!s.version || s.changed) && (
              <form action={publishPolicyAction}>
                <button className="btn btn-secondary btn-sm">{s.version ? "Publish new version" : "Create link"}</button>
              </form>
            )
          )}
          {s.personal && s.pending > 0 && emailOn && (
            <form action={remindPolicyAckAction}>
              <button className="btn btn-secondary btn-sm">Remind</button>
            </form>
          )}
        </>
      }
      footer={"href" in next && next.href ? <NextStep href={next.href} label={next.label} /> : undefined}
    >
      <div className="px-5 py-4 flex flex-col gap-4">
        {flash?.error && <Notice tone="error">{flash.error}</Notice>}
        {flash?.ack === "sent" && <Notice tone="success">Sent to {n} {n === 1 ? "person" : "people"}.</Notice>}
        {flash?.ack === "links" && <Notice>Created {n} personal link{n === 1 ? "" : "s"}. Email is off: copy them below.</Notice>}
        {flash?.ack === "reminded" && <Notice tone="success">Reminded {n} {n === 1 ? "person" : "people"}.</Notice>}
        {flash?.ack === "published" && <Notice tone="success">Policy published.</Notice>}
        {s.changed && <Notice>Your AI policy changed. {s.personal ? "Send it again." : "Publish the new version."}</Notice>}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4">
          {s.personal ? (
            <Meter
              label="Acknowledged"
              value={pct}
              big={pct == null ? "—" : `${pct}%`}
              hint={s.version ? `${s.acknowledged} of ${s.total}${s.pending ? ` · ${s.pending} pending` : ""}` : "Not sent"}
            />
          ) : (
            <Meter
              label="Completions"
              value={reach}
              big={s.version ? String(s.generic) : "—"}
              hint={!s.version ? "No link yet" : reach != null ? `≈ ${reach}% of ${org?.employees}` : "Anonymous"}
            />
          )}
          <Meter label="Literacy check" value={quizPct} big={s.avgScore == null ? "—" : `${s.avgScore}/${QUIZ_TOTAL}`} hint="Average" />
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="eyebrow">Training recorded</span>
              {training ? <Pill tone="steady">Yes</Pill> : <Pill tone="accent">Missing</Pill>}
            </div>
            <div className="font-display text-[24px] leading-tight font-light tracking-[-0.03em] tabular text-ink-100 mt-1">{training ? fmtDate(training.date) : "—"}</div>
            <div className="text-xs text-ink-400 mt-1 truncate" title={training?.summary}>
              {training ? training.summary : <Link href="/compliance" className="underline hover:text-ink-100">Record it</Link>}
            </div>
          </div>
        </div>

        {generic && (
          <div className="flex flex-col gap-1.5 border-t border-line pt-3">
            <div className="eyebrow">{s.personal ? "Generic link" : "Link for all employees"}</div>
            <CopyField value={generic} />
          </div>
        )}

        {s.personal && s.rows.length > 0 && (
          <details className="group border-t border-line pt-3">
            <summary className="cursor-pointer list-none text-sm text-ink-400 hover:text-ink-100 select-none inline-flex items-center gap-1.5">
              <Chevron /> People ({s.rows.length}){!emailOn && " — email is off: copy each personal link"}
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
                  {r.acknowledgedAt ? (
                    <Pill tone="steady">
                      Confirmed {fmtDate(r.acknowledgedAt)} · {r.quizScore ?? "—"}/{QUIZ_TOTAL}
                    </Pill>
                  ) : (
                    <Pill>{r.openedAt ? "Opened" : r.reminders ? `Reminded ×${r.reminders}` : "Sent"}</Pill>
                  )}
                  {!r.acknowledgedAt && <CopyButton text={ackLink(r.token)} label="Copy link" className="btn btn-ghost btn-sm" />}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </Section>
  );
}

/** Misura 0–100 con valore grande, barra dell'asse e una riga di contesto. */
function Meter({ label, value, big, hint }: { label: string; value: number | null; big: string; hint: string }) {
  return (
    <div className="min-w-0">
      <div className="eyebrow">{label}</div>
      <div className="font-display text-[24px] leading-tight font-light tracking-[-0.03em] tabular text-ink-100 mt-1">{big}</div>
      {value != null ? <AxisTrack value={value} className="mt-1.5" /> : <div className="relative h-3 mt-1.5" aria-hidden><div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" /></div>}
      <div className="text-xs text-ink-400 mt-1 truncate" title={hint}>
        {hint}
      </div>
    </div>
  );
}
