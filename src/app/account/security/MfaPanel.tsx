"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { confirmMfaAction, regenerateRecoveryCodesAction, disableMfaAction, startMfaEnrolAction, cancelMfaEnrolAction, type MfaFormState } from "@/lib/auth-actions";

// Un solo componente per tutti gli stati: così i codici di recupero restano a
// schermo anche quando la pagina si aggiorna dopo l'attivazione.
export default function MfaPanel({
  enabled,
  setup,
  qrSvg,
  secret,
  recoveryLeft,
  canDisable,
}: {
  enabled: boolean;
  setup: boolean;
  qrSvg?: string;
  secret?: string;
  recoveryLeft: number;
  canDisable: boolean;
}) {
  const [confirmState, confirm] = useFormState<MfaFormState, FormData>(confirmMfaAction, {});
  const [regenState, regen] = useFormState<MfaFormState, FormData>(regenerateRecoveryCodesAction, {});
  const codes = confirmState.codes ?? regenState.codes;

  if (codes) return <RecoveryCodes codes={codes} />;

  if (enabled) {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-ink-100">
          <span className="inline-block h-2 w-2 rounded-full bg-steady mr-2" />
          On — you&apos;ll be asked for a code from your authenticator app after your password.
        </p>
        <p className="text-xs text-ink-400">{recoveryLeft} recovery code{recoveryLeft === 1 ? "" : "s"} left.</p>
        <form action={regen} className="flex flex-col gap-2 border-t border-line pt-4">
          <div className="text-sm font-medium text-ink-100">New recovery codes</div>
          <p className="text-xs text-ink-400">The old ones stop working.</p>
          <div className="flex gap-2">
            <input name="code" required autoComplete="one-time-code" inputMode="numeric" maxLength={8} placeholder="Current code" className="field w-40" />
            <Submit className="btn btn-secondary btn-sm">Create new codes</Submit>
          </div>
          {regenState.error && <p className="text-sm text-alarm">{regenState.error}</p>}
        </form>
        {canDisable ? (
          <form action={disableMfaAction} className="flex flex-col gap-2 border-t border-line pt-4">
            <div className="text-sm font-medium text-ink-100">Turn off</div>
            <div className="flex flex-wrap gap-2">
              <input name="password" type="password" required autoComplete="current-password" placeholder="Password" className="field w-48" />
              <input name="code" required autoComplete="one-time-code" inputMode="numeric" maxLength={8} placeholder="Current code" className="field w-40" />
              <Submit className="btn btn-danger btn-sm">Turn off</Submit>
            </div>
          </form>
        ) : (
          <p className="text-xs text-ink-400 border-t border-line pt-4">A workspace you belong to requires two-step verification, so it stays on.</p>
        )}
      </div>
    );
  }

  if (setup && qrSvg && secret) {
    return (
      <div className="flex flex-col gap-4">
        <ol className="text-sm text-ink-100 list-decimal pl-5 flex flex-col gap-1">
          <li>Open an authenticator app (Microsoft Authenticator, Google Authenticator, 1Password…).</li>
          <li>Scan the code, or type the key by hand.</li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
        <div className="flex flex-wrap items-start gap-5">
          <div className="rounded-lg overflow-hidden border border-line bg-white p-1 shrink-0" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div className="flex flex-col gap-3 min-w-0 flex-1">
            <div>
              <div className="eyebrow">Key</div>
              <code className="block font-mono text-sm text-ink-100 break-all select-all">{secret.match(/.{1,4}/g)?.join(" ")}</code>
            </div>
            <form action={confirm} className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input name="code" required autoFocus autoComplete="one-time-code" inputMode="numeric" maxLength={8} placeholder="123 456" className="field w-40 tracking-widest" />
                <Submit className="btn btn-primary btn-sm">Turn on</Submit>
              </div>
              {confirmState.error && <p className="text-sm text-alarm">{confirmState.error}</p>}
            </form>
            <form action={cancelMfaEnrolAction}>
              <button className="btn btn-ghost btn-sm">Cancel</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-400">Off. Add a code from your phone to every password sign-in, so a stolen password isn&apos;t enough.</p>
      <form action={startMfaEnrolAction}>
        <Submit className="btn btn-primary btn-sm">Set up two-step verification</Submit>
      </form>
    </div>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const text = codes.join("\n");
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-steady">Two-step verification is on.</p>
      <div>
        <div className="text-sm font-medium text-ink-100">Save your recovery codes</div>
        <p className="text-xs text-ink-400 mt-0.5">Each works once if you lose your phone. They won&apos;t be shown again.</p>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border border-line bg-sidebar px-4 py-3 font-mono text-sm text-ink-100 w-fit select-all">
        {codes.map((c) => <span key={c}>{c}</span>)}
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard?.writeText(text)}>Copy</button>
        <a className="btn btn-secondary btn-sm" download="angar-recovery-codes.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent(text + "\n")}`}>Download</a>
        <Link href="/account" className="btn btn-primary btn-sm">Done</Link>
      </div>
    </div>
  );
}

function Submit({ className, children }: { className: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending}>{children}</button>;
}
