import Link from "next/link";
import { db } from "@/lib/db";
import { desktopDeviceCounts } from "@/lib/discovery/devices";
import { GATEWAY_SERVICE_ID } from "@/lib/gateway/policy";

const GATEWAY_SERVICES = new Set(Object.values(GATEWAY_SERVICE_ID));

/**
 * Una riga: cosa fa davvero "Not allowed" in questo workspace. Avviso dell'app desktop se ci sono
 * computer collegati, blocco di rete se angar Edge blocca, blocco al Gateway se ci sono chiavi attive
 * (solo per le AI dei provider del Gateway). Con asset: la riga è per quell'AI; senza: per la coda.
 */
export default async function NotAllowedEnforcement({ orgId, asset }: { orgId: string; asset?: { serviceId: string | null; blockOnNetwork: boolean } }) {
  const [devices, edge, gatewayKeys] = await Promise.all([
    desktopDeviceCounts(orgId),
    db.edgeSensor.count({ where: { organizationId: orgId, kind: { not: "import" }, blockEnabled: true } }),
    db.gatewayKey.count({ where: { organizationId: orgId, revokedAt: null } }),
  ]);
  const parts: string[] = [];
  if (devices.total > 0) parts.push("Desktop notice");
  if (edge > 0 && (!asset || asset.blockOnNetwork)) parts.push(asset ? "Blocked on the network" : "Blocked on the network where turned on");
  if (gatewayKeys > 0 && (!asset || (asset.serviceId && GATEWAY_SERVICES.has(asset.serviceId)))) parts.push(asset ? "Blocked at the Gateway" : "Blocked at the Gateway for OpenAI and Anthropic APIs");

  return (
    <p className="text-xs text-ink-400">
      <span className="text-ink-100">Not allowed</span>
      {parts.length ? (
        <> in this workspace: {parts.join(" · ")}.</>
      ) : (
        <>
          {" "}is recorded only: nothing enforces it yet.{" "}
          <Link href="/connect" className="underline hover:text-ink-100">
            Add the desktop app, angar Edge or the Gateway
          </Link>
        </>
      )}
    </p>
  );
}
