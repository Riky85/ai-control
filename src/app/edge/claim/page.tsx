import Link from "next/link";
import { currentSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeSerial, MODEL_LABEL } from "@/lib/edge/device-id";
import { PageHeader, Notice } from "@/components/ui";
import { claimDeviceAction } from "@/lib/edge-actions";

export const dynamic = "force-dynamic";

// Pagina del QR sull'etichetta: collega un dispositivo angar al workspace corrente.
export default async function ClaimDevicePage({ searchParams }: { searchParams: { serial?: string; error?: string } }) {
  const s = currentSession()!;
  const serial = normalizeSerial(searchParams.serial ?? "");
  const canEdit = s.role === "ADMIN" || s.role === "OWNER";
  const [org, workspaces, device] = await Promise.all([
    db.organization.findUnique({ where: { id: s.orgId }, select: { name: true } }),
    db.workspaceMember.count({ where: { email: s.email } }),
    serial ? db.edgeDevice.findUnique({ where: { serial }, select: { serial: true, model: true, status: true, organizationId: true } }) : null,
  ]);
  const ws = org?.name ?? "this workspace";

  let problem: string | null = null;
  if (searchParams.serial && !serial) problem = "That isn't a valid serial — it looks like AE-XXXX-XXXX.";
  else if (serial && !device) problem = "We don't know that serial. Check the label on the device.";
  else if (device?.status === "claimed" && device.organizationId !== s.orgId) problem = "This device is already linked to another workspace. Ask whoever set it up to return it first.";
  else if (device && device.status !== "stock" && device.status !== "claimed") problem = "This device has been retired and can't be linked. Contact angar support.";
  const mine = device?.status === "claimed" && device.organizationId === s.orgId;

  return (
    <div className="flex flex-col gap-6 [&>*:not(.page-bar)]:max-w-xl">
      <PageHeader
        crumbs={[{ label: "angar Edge", href: "/edge" }, { label: "Sensors", href: "/edge/sensors" }, { label: "Link a device" }]}
        title="Link an angar device"
        subtitle="The box starts reporting to this workspace as soon as it's plugged into your network."
      />
      {problem && <Notice tone="error">{problem}</Notice>}

      {!serial || problem ? (
        <form action="/edge/claim" method="get" className="rounded-xl border border-line bg-panel p-5 flex flex-wrap items-center gap-2">
          <input name="serial" defaultValue={searchParams.serial ?? ""} placeholder="AE-XXXX-XXXX" className="field w-48 font-mono uppercase" maxLength={20} required aria-label="Device serial" />
          <button className="btn btn-primary btn-sm">Continue</button>
          <span className="-mx-5 -mb-5 mt-3 w-[calc(100%+2.5rem)] bg-ink border-t border-line rounded-b-xl px-5 py-3 text-xs text-ink-400 bar-foot">The serial is on the label under the device, next to the QR code.</span>
        </form>
      ) : mine ? (
        <Notice tone="success">
          {device!.serial} is already linked to {ws}. <Link href="/edge/sensors" className="underline">See your sensors</Link>
        </Notice>
      ) : (
        <form action={claimDeviceAction} className="rounded-xl border border-line bg-panel p-5 flex flex-col gap-4">
          <input type="hidden" name="serial" value={device!.serial} />
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <div className="eyebrow">Device</div>
              <div className="font-mono text-ink-100">{device!.serial}</div>
            </div>
            <div className="text-right">
              <div className="eyebrow">Model</div>
              <div className="text-ink-100">{MODEL_LABEL[device!.model] ?? device!.model}</div>
            </div>
          </div>
          <input name="name" placeholder="Site name, e.g. Milan office" className="field" maxLength={60} required disabled={!canEdit} aria-label="Site name" />
          {workspaces > 1 && (
            <p className="text-xs text-ink-400">
              It links to the workspace you&apos;re in now, <span className="text-ink-100">{ws}</span>. Wrong one?{" "}
              <Link href="/workspace?tab=workspaces" className="underline hover:text-ink-100">Switch workspace</Link>, then scan the QR code again.
            </p>
          )}
          <div className="-mx-5 -mb-5 flex items-center gap-3 bg-ink border-t border-line rounded-b-xl px-5 py-3 bar-foot">
            <button className="btn btn-primary btn-sm" disabled={!canEdit}>Link to {ws}</button>
            {!canEdit && <span className="text-xs text-ink-400">Only admins of {ws} can link devices.</span>}
          </div>
        </form>
      )}
    </div>
  );
}
