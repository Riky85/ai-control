import type { Connector } from "@prisma/client";
import { VendorBadge } from "@/components/VendorIcon";
import { syncConnectorAction, disconnectConnectorAction } from "@/lib/actions";
import { connectOktaAction } from "@/lib/connectors/okta-actions";
import { decryptJson } from "@/lib/crypto";
import { fmtDateTime } from "@/lib/format";
import SubmitButton from "@/components/SubmitButton";
import ConfirmAction from "@/components/ConfirmAction";

// Okta: una riga come GitHub; il modulo (dominio + API token) si apre solo quando serve.
export const oktaConnected = (row?: Connector) => row?.status !== "DISCONNECTED" && Boolean(row?.credentialsEncrypted);

export default function OktaConnectCard({ row, error }: { row?: Connector; error?: string }) {
  const connected = oktaConnected(row);
  const domain = decryptJson<{ domain?: string }>(row?.credentialsEncrypted)?.domain;
  return (
    <section id="OKTA" className="scroll-mt-6">
      <div className="rounded-xl border border-line bg-panel overflow-hidden animate-rise">
        <h2 className="bg-ink border-b border-line px-4 py-3 text-sm font-bold text-ink-100 bar-head">Identity</h2>
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <VendorBadge vendor="Okta" name="Okta" size={32} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink-100">Okta</span>
              {connected && <span className="font-mono uppercase text-[10px] tracking-[0.05em] text-steady">✓ Connected</span>}
            </div>
            <div className="text-xs text-ink-400 truncate">
              {connected
                ? `${domain ?? "Okta"}${row?.lastSyncedAt ? ` · synced ${fmtDateTime(row.lastSyncedAt)}` : ""}`
                : "AI apps and sign-ins. Read-only."}
            </div>
          </div>
          {connected && (
            <div className="flex items-center gap-2">
              <form action={syncConnectorAction}>
                <input type="hidden" name="provider" value="OKTA" />
                <SubmitButton className="btn btn-secondary btn-sm" pendingLabel="Syncing…">Sync now</SubmitButton>
              </form>
              <ConfirmAction
                label="Disconnect"
                question="Disconnect Okta?"
                detail="The stored API token is removed and syncing stops. Data already imported stays."
                confirmLabel="Yes, disconnect"
                pendingLabel="Disconnecting…"
                action={disconnectConnectorAction}
                fields={{ provider: "OKTA" }}
                triggerClassName="btn btn-ghost btn-sm"
              />
            </div>
          )}
        </div>
        {connected && row?.lastSyncError && <p className="px-4 pb-3 text-xs text-alarm">{row.lastSyncError}</p>}
        {!connected && (
          <details className="group border-t border-line" open={Boolean(error)}>
            <summary className="cursor-pointer list-none px-4 py-2.5 text-xs text-ink-400 hover:text-ink-100 select-none">
              Connect with an API token <span className="inline-block transition-transform group-open:rotate-90">›</span>
            </summary>
            <form action={connectOktaAction} className="px-4 pb-4 flex flex-col gap-2">
              <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr_auto] gap-2">
                <input name="domain" required autoComplete="off" spellCheck={false} placeholder="acme.okta.com" className="field w-full" />
                <input name="apiToken" type="password" required autoComplete="off" placeholder="API token" className="field w-full" />
                <SubmitButton className="btn btn-secondary btn-sm" pendingLabel="Testing…">Test &amp; connect</SubmitButton>
              </div>
              <p className="text-xs text-ink-400">
                Signed in as a Read-Only Administrator, open Security → API → Tokens in the Okta Admin Console and create a token.
              </p>
              {error && <p className="text-xs text-alarm">{error}</p>}
            </form>
          </details>
        )}
      </div>
    </section>
  );
}
