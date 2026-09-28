import { db } from "@/lib/db";
import { Panel, Notice } from "@/components/ui";
import { fmtDate, fmtAgo } from "@/lib/format";
import { appUrl } from "@/lib/alerts";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";
import { revokeApiKeyAction, toggleWebhookAction, deleteWebhookAction, testWebhookAction } from "@/lib/developers-actions";
import { NewApiKey, NewWebhook } from "@/components/DevelopersPanelClient";

/** Settings → Developers: chiavi dell'API REST (sola lettura) e webhook in uscita. */
export default async function DevelopersPanel({ orgId, canEdit, webhookStatus }: { orgId: string; canEdit: boolean; webhookStatus?: string }) {
  const [keys, hooks] = await Promise.all([
    db.apiKey.findMany({ where: { organizationId: orgId, revokedAt: null }, orderBy: { createdAt: "desc" } }),
    db.webhook.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" } }),
  ]);
  const base = `${appUrl()}/api/v1`;
  const okStatus = (s: string | null) => !!s && /^2\d\d$/.test(s);

  return (
    <div id="developers" className="scroll-mt-6">
      <Panel title="Developers" subtitle="Read-only REST API and signed webhooks — for BI tools, SIEM or your own automations.">
        {!canEdit && <div className="mb-3"><Notice>Only admins and owners can create keys and webhooks.</Notice></div>}
        {webhookStatus && <div className="mb-3"><Notice tone={okStatus(webhookStatus) ? "success" : "error"}>Test event: {okStatus(webhookStatus) ? `delivered (HTTP ${webhookStatus})` : webhookStatus}</Notice></div>}

        <h3 className="text-sm font-semibold text-ink-100">API keys</h3>
        <p className="text-xs text-ink-400 mt-0.5 mb-2">
          <span className="font-mono">GET {base}/ai · /spend · /alerts · /savings</span> with <span className="font-mono">Authorization: Bearer angk_…</span> — 120 requests/minute, follows employee privacy.
        </p>
        {keys.length > 0 && (
          <div className="divide-y divide-line border-y border-line -mx-5 mb-3">
            {keys.map((k) => (
              <div key={k.id} className="px-5 py-2 flex items-center gap-3 text-sm">
                <span className="flex-1 min-w-0">
                  <span className="block text-ink-100 truncate">{k.name}</span>
                  <span className="block text-xs text-ink-400 font-mono">{k.hint} · {k.lastUsedAt ? `used ${fmtAgo(k.lastUsedAt)}` : `created ${fmtDate(k.createdAt)}`}</span>
                </span>
                {canEdit && (
                  <form action={revokeApiKeyAction}>
                    <input type="hidden" name="id" value={k.id} />
                    <button className="btn btn-ghost btn-sm">Revoke</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
        <NewApiKey disabled={!canEdit} />

        <h3 className="text-sm font-semibold text-ink-100 mt-5 pt-4 border-t border-line">Webhooks</h3>
        <p className="text-xs text-ink-400 mt-0.5 mb-2">POST JSON to your https URL, signed in <span className="font-mono">X-Angar-Signature</span>. 5-second timeout, no retries.</p>
        {hooks.length > 0 && (
          <div className="divide-y divide-line border-y border-line -mx-5 mb-3">
            {hooks.map((h) => (
              <div key={h.id} className="px-5 py-2 flex items-center gap-3 text-sm">
                <span className="flex-1 min-w-0">
                  <span className={`block truncate font-mono text-xs ${h.active ? "text-ink-100" : "text-ink-400 line-through"}`}>{h.url}</span>
                  <span className="block text-xs text-ink-400 truncate">
                    {h.events.join(", ")}
                    {h.lastStatus && <> · last: <span className={okStatus(h.lastStatus) ? "text-steady" : "text-alarm"}>{h.lastStatus}</span>{h.lastSentAt ? ` ${fmtAgo(h.lastSentAt)}` : ""}</>}
                  </span>
                </span>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <form action={testWebhookAction}><input type="hidden" name="id" value={h.id} /><button className="btn btn-secondary btn-sm">Send test</button></form>
                    <form action={toggleWebhookAction}><input type="hidden" name="id" value={h.id} /><button className="btn btn-ghost btn-sm">{h.active ? "Pause" : "Resume"}</button></form>
                    <form action={deleteWebhookAction}><input type="hidden" name="id" value={h.id} /><button className="btn btn-ghost btn-sm">Delete</button></form>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <NewWebhook events={WEBHOOK_EVENTS} disabled={!canEdit} />
      </Panel>
    </div>
  );
}
