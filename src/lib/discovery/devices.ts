import { isIP } from "net";
import { db } from "@/lib/db";

/** Fino a 8 IPv4/IPv6 validi, in forma canonica, senza doppioni. */
export function cleanIps(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v.slice(0, 32)) {
    if (typeof x !== "string" || x.length > 45) continue;
    let ip = x.trim();
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (m) ip = m[1];
    if (!isIP(ip)) continue;
    ip = ip.toLowerCase();
    if (ip === "127.0.0.1" || ip === "::1" || ip === "0.0.0.0" || ip === "::" || out.includes(ip)) continue;
    out.push(ip);
    if (out.length >= 8) break;
  }
  return out;
}

// Un computer con l'app desktop, identificato da host + email (una persona può
// avere due PC; due persone possono condividerne uno raro). "device" arriva
// come "Desktop app · <host>": si estrae l'host.
function hostFrom(device: string): string {
  const i = device.indexOf("·");
  return (i >= 0 ? device.slice(i + 1) : device).trim().slice(0, 120) || "computer";
}

export async function recordDesktopDevice(
  organizationId: string,
  { device, email, os, version, aiCount, ips }: { device: string; email: string | null; os?: string; version?: string; aiCount: number; ips?: string[] }
) {
  const host = hostFrom(device);
  const deviceKey = `${host.toLowerCase()}|${email ?? ""}`.slice(0, 220);
  const data = {
    host,
    email,
    os: typeof os === "string" ? os.slice(0, 40) : undefined,
    appVersion: typeof version === "string" ? version.slice(0, 40) : undefined,
    aiCount,
    // IP locali (angar Edge): solo se l'app li manda (le versioni vecchie no).
    ...(ips ? { ips: cleanIps(ips) } : {}),
    lastSeenAt: new Date(),
  };
  await db.desktopDevice.upsert({
    where: { organizationId_deviceKey: { organizationId, deviceKey } },
    create: { organizationId, deviceKey, ...data, syncCount: 1 },
    update: { ...data, syncCount: { increment: 1 } },
  });
}

const FRESH = 70 * 60 * 1000; // due sync mancati = "silenzioso"

export type DeviceRow = {
  host: string;
  email: string | null;
  os: string | null;
  appVersion: string | null;
  aiCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  online: boolean;
};

export async function listDesktopDevices(organizationId: string): Promise<DeviceRow[]> {
  const now = Date.now();
  const map = new Map<string, DeviceRow>();

  // Ciò che l'app ha già inviato (attività "desktop.active"), così il computer
  // compare subito anche prima che la nuova versione del server registri il device.
  const activities = await db.aiAssetActivity.findMany({
    where: { eventType: "desktop.active", aiAsset: { organizationId, deletedAt: null } },
    orderBy: { occurredAt: "desc" },
    take: 5000,
    select: { actorRef: true, occurredAt: true, aiAssetId: true, payload: true },
  });
  const ais = new Map<string, Set<string>>(); // deviceKey → set di AI viste
  for (const a of activities) {
    const email = (a.actorRef ?? "").includes("@") ? a.actorRef!.toLowerCase() : null;
    const host = hostFrom(String((a.payload as { device?: string } | null)?.device ?? "Desktop app"));
    const key = `${host.toLowerCase()}|${email ?? ""}`;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { host, email, os: null, appVersion: null, aiCount: 0, firstSeenAt: a.occurredAt, lastSeenAt: a.occurredAt, online: false });
      ais.set(key, new Set());
    } else if (a.occurredAt < cur.firstSeenAt) cur.firstSeenAt = a.occurredAt;
    ais.get(key)!.add(a.aiAssetId);
  }
  for (const [key, set] of ais) map.get(key)!.aiCount = set.size;

  // Ciò che il server ha registrato (host, OS, versione, ultimo contatto): ha la precedenza.
  const devices = await db.desktopDevice.findMany({ where: { organizationId }, orderBy: { lastSeenAt: "desc" } });
  for (const d of devices) {
    const key = `${d.host.toLowerCase()}|${d.email ?? ""}`;
    map.set(key, { host: d.host, email: d.email, os: d.os, appVersion: d.appVersion, aiCount: d.aiCount, firstSeenAt: d.firstSeenAt, lastSeenAt: d.lastSeenAt, online: false });
  }

  return [...map.values()].map((d) => ({ ...d, online: now - d.lastSeenAt.getTime() < FRESH })).sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
}
