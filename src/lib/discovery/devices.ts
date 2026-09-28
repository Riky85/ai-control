import { isIP } from "net";
import { cache } from "react";
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
  return deviceKey;
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
  /** Invia col vecchio token unico dell'azienda (non legato a una persona). */
  legacy: boolean;
};

/**
 * Computer registrati e quanti sono connessi ora: due count sull'indice
 * (organizationId, lastSeenAt), una volta sola per richiesta (layout + pagina).
 */
export const desktopDeviceCounts = cache(async (organizationId: string): Promise<{ total: number; online: number }> => {
  const [total, online] = await Promise.all([
    db.desktopDevice.count({ where: { organizationId } }),
    db.desktopDevice.count({ where: { organizationId, lastSeenAt: { gte: new Date(Date.now() - FRESH) } } }),
  ]);
  return { total, online };
});

/** Elenco completo (pagina Computers), una volta sola per richiesta. */
export const listDesktopDevices = cache(loadDesktopDevices);

async function loadDesktopDevices(organizationId: string): Promise<DeviceRow[]> {
  const now = Date.now();
  const map = new Map<string, DeviceRow>();

  // Ciò che il server ha registrato (host, OS, versione, ultimo contatto). Le attività
  // "desktop.active" non servono più: ogni invio registra il computer (DesktopDevice).
  const [devices, tokens] = await Promise.all([
    db.desktopDevice.findMany({ where: { organizationId }, orderBy: { lastSeenAt: "desc" }, take: 5000 }),
    db.desktopToken.findMany({ where: { organizationId, revokedAt: null, deviceKey: { not: null } }, select: { deviceKey: true } }),
  ]);
  const perDevice = new Set(tokens.map((t) => t.deviceKey));
  for (const d of devices) {
    const key = `${d.host.toLowerCase()}|${d.email ?? ""}`;
    map.set(key, { host: d.host, email: d.email, os: d.os, appVersion: d.appVersion, aiCount: d.aiCount, firstSeenAt: d.firstSeenAt, lastSeenAt: d.lastSeenAt, online: false, legacy: !perDevice.has(d.deviceKey) });
  }

  return [...map.values()].map((d) => ({ ...d, online: now - d.lastSeenAt.getTime() < FRESH })).sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
}
