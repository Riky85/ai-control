import { db } from "@/lib/db";
import { Notice } from "@/components/ui";
import { fmtDate, fmtAgo } from "@/lib/format";
import { appUrl } from "@/lib/alerts";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";
import { revokeApiKeyAction, toggleWebhookAction, deleteWebhookAction, testWebhookAction } from "@/lib/developers-actions";
import { NewApiKey, NewWebhook } from "@/components/DevelopersPanelClient";
import CopyButton from "@/components/CopyButton";
import { Row, Section } from "@/components/SettingsRows";

/** Settings → Developers: chiavi dell'API REST (sola lettura) e webhook in uscita. */
export default async function DevelopersPanel({ orgId, canEdit, webhookStatus }: { orgId: string; canEdit: boolean; webhookStatus?: string }) {
  const [keys, hooks] = await Promise.all([
    db.apiKey.findMany({ where: { organizationId: orgId, revokedAt: null }, orderBy: { createdAt: "desc" } }),
    db.webhook.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" } }),
  ]);
  const base = `${appUrl()}/api/v1`;
  const okStatus = (s: string | null) => !!s && /^2\d\d$/.test(s);

  return (
    <div className="flex flex-col gap-4">
      {webhookStatus && <Notice tone={okStatus(webhookStatus) ? "success" : "error"}>Test event: {okStatus(webhookStatus) ? `delivered (HTTP ${webhookStatus})` : webhookStatus}</Notice>}
      <Section id="developers" title="Developers" action={!canEdit ? <span className="text-xs text-ink-400">Admins only</span> : undefined}>
        <Row title="REST API" hint={<span className="font-mono">/ai · /spend · /alerts · /savings</span>}>
          <code className="min-w-0 truncate rounded-lg border border-line bg-ink px-3 py-1.5 text-xs text-ink-400">{base}</code>
          <CopyButton text={base} />
        </Row>
        <Row title="API keys" hint="Read-only, Bearer token. 120 requests a minute.">
          <div className="w-full max-w-md">
            <NewApiKey disabled={!canEdit} />
          </div>
        </Row>
        {keys.map((k) => (
          <Row key={k.id} title={<span className="font-normal">{k.name}</span>} hint={<span className="font-mono">{k.hint} · {k.lastUsedAt ? `used ${fmtAgo(k.lastUsedAt)}` : `created ${fmtDate(k.createdAt)}`}</span>}>
            {canEdit && (
              <form action={revokeApiKeyAction}>
                <input type="hidden" name="id" value={k.id} />
                <button className="btn btn-ghost btn-sm">Revoke</button>
              </form>
            )}
          </Row>
        ))}
        <Row title="Webhooks" hint={<>Signed JSON POST (<span className="font-mono">X-Angar-Signature</span>), no retries.</>}>
          <div className="w-full max-w-md">
            <NewWebhook events={WEBHOOK_EVENTS} disabled={!canEdit} />
          </div>
        </Row>
        {hooks.map((h) => (
          <Row
            key={h.id}
            title={<span className={`block truncate font-mono text-xs font-normal ${h.active ? "" : "text-ink-400 line-through"}`}>{h.url}</span>}
            hint={
              <span className="block truncate">
                {h.events.join(", ")}
                {h.lastStatus && <> · last: <span className={okStatus(h.lastStatus) ? "text-steady" : "text-alarm"}>{h.lastStatus}</span>{h.lastSentAt ? ` ${fmtAgo(h.lastSentAt)}` : ""}</>}
              </span>
            }
          >
            {canEdit && (
              <>
                <form action={testWebhookAction}><input type="hidden" name="id" value={h.id} /><button className="btn btn-secondary btn-sm">Send test</button></form>
                <form action={toggleWebhookAction}><input type="hidden" name="id" value={h.id} /><button className="btn btn-ghost btn-sm">{h.active ? "Pause" : "Resume"}</button></form>
                <form action={deleteWebhookAction}><input type="hidden" name="id" value={h.id} /><button className="btn btn-ghost btn-sm">Delete</button></form>
              </>
            )}
          </Row>
        ))}
      </Section>
    </div>
  );
}
