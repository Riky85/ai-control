import { db } from "@/lib/db";
import { appUrl } from "@/lib/alerts";
import { newClaimSecret, newSerial, sha256Hex, type DeviceModel } from "./device-id";

export const MAX_BATCH = 500;

export const claimUrlFor = (serial: string) => `${appUrl()}/edge/claim?serial=${serial}`;

export type NewDevice = { serial: string; secret: string; model: string; claimUrl: string };

/**
 * Nuovo lotto di dispositivi in magazzino (status "stock"). I segreti tornano
 * UNA volta sola: nel database resta solo lo SHA-256.
 */
export async function createDeviceBatch(count: number, model: DeviceModel, batch: string | null): Promise<NewDevice[]> {
  const serials = new Set<string>();
  while (serials.size < count) serials.add(newSerial());
  // 40 bit per seriale: le collisioni sono rarissime, ma vanno comunque evitate.
  for (let i = 0; i < 5; i++) {
    const taken = await db.edgeDevice.findMany({ where: { serial: { in: [...serials] } }, select: { serial: true } });
    if (!taken.length) break;
    for (const t of taken) serials.delete(t.serial);
    while (serials.size < count) serials.add(newSerial());
  }
  const out = [...serials].map((serial) => ({ serial, secret: newClaimSecret(), model, claimUrl: claimUrlFor(serial) }));
  await db.edgeDevice.createMany({
    data: out.map((d) => ({ serial: d.serial, claimSecretHash: sha256Hex(d.secret), model, batch })),
  });
  return out;
}
