"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole, requirePlatformAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { newEdgeToken } from "@/lib/edge/auth";
import { DEVICE_MODELS, normalizeSerial, placeholderTokenHash, type DeviceModel } from "@/lib/edge/device-id";
import { createDeviceBatch, MAX_BATCH, type NewDevice } from "@/lib/edge/devices";

const BACK = "/edge/sensors";
const KINDS = ["software", "cloud"] as const; // i sensori "device" nascono solo dal claim di un dispositivo
const FIELDS = ["dnsEnabled", "syslogEnabled", "blockEnabled", "scanLan"] as const;

const fail = (msg: string, back = BACK): never => redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);

/** Il sensore dev'essere di questo workspace (mai fidarsi dell'id nel modulo). */
async function ownSensor(orgId: string, id: unknown) {
  const sensor = typeof id === "string" && id ? await db.edgeSensor.findFirst({ where: { id, organizationId: orgId } }) : null;
  if (!sensor) fail("That sensor isn't in this workspace.");
  return sensor!;
}

const cleanName = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 60);

/** Nuovo sensore: il token si vede UNA volta sola (si salva solo l'hash). */
export async function createSensorAction(input: { name: string; kind: string }): Promise<{ id: string; name: string; kind: string; token: string } | { error: string }> {
  const s = await requireRole("ADMIN", BACK);
  const name = cleanName(input?.name);
  const kind = (KINDS as readonly string[]).includes(input?.kind) ? input.kind : "software";
  if (!name) return { error: "Give the sensor a name, e.g. Milan office." };
  if ((await db.edgeSensor.count({ where: { organizationId: s.orgId } })) >= 100) return { error: "This workspace already has 100 sensors — delete one first." };
  const t = newEdgeToken();
  const sensor = await db.edgeSensor.create({
    data: {
      organizationId: s.orgId,
      name,
      kind,
      tokenHash: t.hash,
      tokenHint: t.hint,
      createdBy: s.email,
      // Un push di log dal cloud non fa DNS né scansioni.
      ...(kind === "cloud" ? { dnsEnabled: false, syslogEnabled: true, scanLan: false } : {}),
    },
  });
  await audit("edge.sensor_created", sensor.id, { name, kind });
  revalidatePath(BACK);
  return { id: sensor.id, name, kind, token: t.token };
}

/** Nuovo token (se quello vecchio è perso): il precedente smette subito di funzionare. */
export async function rotateSensorTokenAction(sensorId: string): Promise<{ token: string } | { error: string }> {
  const s = await requireRole("ADMIN", BACK);
  const sensor = await db.edgeSensor.findFirst({ where: { id: String(sensorId), organizationId: s.orgId } });
  if (!sensor) return { error: "That sensor isn't in this workspace." };
  const t = newEdgeToken();
  await db.edgeSensor.update({ where: { id: sensor.id }, data: { tokenHash: t.hash, tokenHint: t.hint } });
  await audit("edge.sensor_token_rotated", sensor.id, { name: sensor.name });
  revalidatePath(BACK);
  return { token: t.token };
}

export async function toggleSensorAction(formData: FormData) {
  const s = await requireRole("ADMIN", BACK);
  const sensor = await ownSensor(s.orgId, formData.get("sensorId"));
  const field = String(formData.get("field") ?? "") as (typeof FIELDS)[number];
  if (!FIELDS.includes(field)) fail("Unknown setting.");
  const value = formData.get("value") === "on";
  await db.edgeSensor.update({ where: { id: sensor.id }, data: { [field]: value } });
  await audit("edge.sensor_setting", sensor.id, { name: sensor.name, [field]: value });
  revalidatePath(BACK);
}

export async function renameSensorAction(formData: FormData) {
  const s = await requireRole("ADMIN", BACK);
  const sensor = await ownSensor(s.orgId, formData.get("sensorId"));
  const name = cleanName(formData.get("name"));
  if (!name) fail("Enter a name.");
  await db.edgeSensor.update({ where: { id: sensor.id }, data: { name } });
  await audit("edge.sensor_renamed", sensor.id, { from: sensor.name, to: name });
  revalidatePath(BACK);
}

export async function deleteSensorAction(formData: FormData) {
  const s = await requireRole("ADMIN", BACK);
  const sensor = await ownSensor(s.orgId, formData.get("sensorId"));
  // Un dispositivo angar collegato torna "returned" (da rispedire); le chiamate di claim ricevono 410.
  const device = await db.edgeDevice.findUnique({ where: { sensorId: sensor.id }, select: { id: true, serial: true } });
  await db.$transaction([
    ...(device ? [db.edgeDevice.update({ where: { id: device.id }, data: { status: "returned", sensorId: null } })] : []),
    db.edgeSensor.delete({ where: { id: sensor.id } }), // i suoi EdgeEvent vanno via in cascata
  ]);
  await audit("edge.sensor_deleted", sensor.id, { name: sensor.name, ...(device ? { serial: device.serial } : {}) });
  revalidatePath(BACK);
  redirect(BACK);
}

/** Soglia dell'avviso "upload verso un'AI non approvata" (MB al giorno per dispositivo; 0 = spento). */
export async function setUploadAlertAction(formData: FormData) {
  const s = await requireRole("ADMIN", BACK);
  const n = Number(String(formData.get("uploadAlertMb") ?? "").trim());
  if (!Number.isInteger(n) || n < 0 || n > 100_000) fail("Enter a whole number of MB between 0 and 100000 (0 turns the alert off).");
  await db.organization.update({ where: { id: s.orgId }, data: { uploadAlertMb: n } });
  await audit("edge.upload_alert_set", undefined, { uploadAlertMb: n });
  revalidatePath(BACK);
}

// ---------- Dispositivi angar (box fisici): claim, sostituzione, reso ----------

const claimBack = (serial: string) => `/edge/claim?serial=${encodeURIComponent(serial)}`;
const done = (msg: string): never => redirect(`${BACK}?notice=${encodeURIComponent(msg)}`);

/** Il workspace corrente prende in carico un dispositivo in magazzino: nasce un sensore "device" in attesa. */
export async function claimDeviceAction(formData: FormData) {
  const raw = String(formData.get("serial") ?? "");
  const serial = normalizeSerial(raw);
  const back = claimBack(serial ?? raw.slice(0, 40));
  const s = await requireRole("ADMIN", back);
  if (!serial) fail("That isn't a valid serial — it looks like AE-XXXX-XXXX.", back);
  const name = cleanName(formData.get("name"));
  if (!name) fail("Give the site a name, e.g. Milan office.", back);
  const device = await db.edgeDevice.findUnique({ where: { serial: serial! } });
  if (!device) fail("We don't know that serial. Check the label on the device.", back);
  if (device!.status === "claimed") {
    if (device!.organizationId === s.orgId) done(`${device!.serial} is already linked to this workspace.`);
    fail("This device is already linked to another workspace. Ask whoever set it up to return it first.", back);
  }
  if (device!.status !== "stock") fail("This device has been retired and can't be linked. Contact angar support.", back);
  if ((await db.edgeSensor.count({ where: { organizationId: s.orgId } })) >= 100) fail("This workspace already has 100 sensors — delete one first.", back);

  const sensor = await db
    .$transaction(async (tx) => {
      const created = await tx.edgeSensor.create({
        data: { organizationId: s.orgId, name, kind: "device", tokenHash: placeholderTokenHash(), tokenHint: "waiting for device", createdBy: s.email },
      });
      // Condizionale: se due workspace provano insieme, vince uno solo.
      const linked = await tx.edgeDevice.updateMany({
        where: { id: device!.id, status: "stock" },
        data: { status: "claimed", organizationId: s.orgId, sensorId: created.id, claimedAt: new Date() },
      });
      if (!linked.count) throw new Error("taken");
      return created;
    })
    .catch(() => null);
  if (!sensor) fail("This device was just linked to another workspace.", back);
  await audit("edge.device_claimed", sensor!.id, { serial: device!.serial, model: device!.model, name });
  revalidatePath(BACK);
  done(`${name} is linked. Plug it in — it links itself within a minute.`);
}

/** Box guasto: il nuovo dispositivo prende il posto del vecchio sullo STESSO sensore (la storia resta). */
export async function replaceDeviceAction(formData: FormData) {
  const s = await requireRole("ADMIN", BACK);
  const sensor = await ownSensor(s.orgId, formData.get("sensorId"));
  if (sensor.kind !== "device") fail("Only angar device sensors can get a replacement box.");
  const serial = normalizeSerial(formData.get("serial"));
  if (!serial) fail("Enter the serial from the new device's label (AE-XXXX-XXXX).");
  const fresh = await db.edgeDevice.findUnique({ where: { serial: serial! } });
  if (!fresh) fail("We don't know that serial. Check the label on the new device.");
  if (fresh!.status !== "stock") fail(fresh!.status === "claimed" ? "That device is already linked to a site." : "That device has been retired and can't be used.");
  const old = await db.edgeDevice.findUnique({ where: { sensorId: sensor.id } });

  const ok = await db
    .$transaction(async (tx) => {
      // Prima si stacca il vecchio (sensorId è unico), poi si collega il nuovo.
      if (old) await tx.edgeDevice.update({ where: { id: old.id }, data: { status: "retired", sensorId: null } });
      const linked = await tx.edgeDevice.updateMany({
        where: { id: fresh!.id, status: "stock" },
        data: { status: "claimed", organizationId: s.orgId, sensorId: sensor.id, claimedAt: new Date() },
      });
      if (!linked.count) throw new Error("taken");
      // Il token del vecchio box smette subito di funzionare; il nuovo lo riceve alla prima chiamata.
      await tx.edgeSensor.update({ where: { id: sensor.id }, data: { tokenHash: placeholderTokenHash(), tokenHint: "waiting for device" } });
      return true;
    })
    .catch(() => false);
  if (!ok) fail("That device was just linked somewhere else.");
  await audit("edge.device_replaced", sensor.id, { name: sensor.name, from: old?.serial ?? null, to: fresh!.serial });
  revalidatePath(BACK);
  done(`${fresh!.serial} now runs ${sensor.name}. Plug it in — it links itself within a minute. Send the old box back to angar.`);
}

/** Reso (fine contratto): il box si stacca, il sensore resta con la sua storia ma non riceve più dati. */
export async function returnDeviceAction(formData: FormData) {
  const s = await requireRole("ADMIN", BACK);
  const sensor = await ownSensor(s.orgId, formData.get("sensorId"));
  const device = await db.edgeDevice.findUnique({ where: { sensorId: sensor.id } });
  if (!device) fail("No device is linked to this sensor.");
  await db.$transaction([
    db.edgeDevice.update({ where: { id: device!.id }, data: { status: "returned", sensorId: null } }),
    db.edgeSensor.update({ where: { id: sensor.id }, data: { tokenHash: placeholderTokenHash(), tokenHint: "device returned" } }),
  ]);
  await audit("edge.device_returned", sensor.id, { name: sensor.name, serial: device!.serial });
  revalidatePath(BACK);
  done(`${device!.serial} is unlinked. ${sensor.name} keeps its history; delete it when you no longer need it.`);
}

// ---------- Registro di fabbrica (/system, solo amministratori della piattaforma) ----------

/** Nuovo lotto: restituisce i segreti UNA volta sola (il client li scarica come CSV). */
export async function createDeviceBatchAction(input: { count: number; model: string; batch?: string }): Promise<{ devices: NewDevice[] } | { error: string }> {
  const s = await requirePlatformAdmin();
  const count = Number(input?.count);
  if (!Number.isInteger(count) || count < 1 || count > MAX_BATCH) return { error: `Enter a count between 1 and ${MAX_BATCH}.` };
  if (!(DEVICE_MODELS as readonly string[]).includes(input?.model)) return { error: "Pick a model." };
  const batch = String(input?.batch ?? "").trim().slice(0, 60) || null;
  const devices = await createDeviceBatch(count, input.model as DeviceModel, batch);
  await audit("edge.devices_created", batch ?? undefined, { count, model: input.model }, { orgId: null, actorEmail: s.email });
  revalidatePath("/system");
  return { devices };
}

/** Stato di un dispositivo dal registro: reso, ritirato, oppure di nuovo in magazzino (solo dopo un reso). */
export async function setDeviceStatusAction(formData: FormData) {
  const s = await requirePlatformAdmin();
  const back = "/system";
  const status = String(formData.get("status") ?? "");
  const id = String(formData.get("deviceId") ?? "");
  const device = id ? await db.edgeDevice.findUnique({ where: { id } }) : null;
  if (!device || !["returned", "retired", "stock"].includes(status)) redirect(back);
  if (status === "stock" && device!.status !== "returned") redirect(back);
  await db.$transaction([
    db.edgeDevice.update({
      where: { id: device!.id },
      data: status === "stock" ? { status, sensorId: null, organizationId: null, claimedAt: null, lastClaimCallAt: null } : { status, sensorId: null },
    }),
    // Il sensore collegato resta nel suo workspace ma il vecchio token del box non vale più.
    ...(device!.sensorId ? [db.edgeSensor.update({ where: { id: device!.sensorId }, data: { tokenHash: placeholderTokenHash(), tokenHint: "device returned" } })] : []),
  ]);
  await audit("edge.device_status", device!.serial, { from: device!.status, to: status }, { orgId: null, actorEmail: s.email });
  revalidatePath(back);
}

// ---------- AI bloccate sulla rete (pagina dell'asset) ----------

async function ownAsset(orgId: string, assetId: unknown, back: string) {
  const a = typeof assetId === "string" && assetId ? await db.aiAsset.findFirst({ where: { id: assetId, organizationId: orgId, deletedAt: null }, select: { id: true, name: true, blockOnNetwork: true, insteadAssetId: true } }) : null;
  if (!a) fail("That AI system isn't in this workspace.", back);
  return a!;
}

/** Blocca (o sblocca) un'AI sulla rete aziendale: i sensori angar Edge con il blocco attivo rispondono 0.0.0.0. */
export async function setNetworkBlockAction(formData: FormData) {
  const assetId = String(formData.get("assetId") ?? "");
  const back = `/assets/${encodeURIComponent(assetId)}`;
  const s = await requireRole("ADMIN", back);
  const asset = await ownAsset(s.orgId, assetId, back);
  const block = formData.get("block") === "on";
  await db.aiAsset.update({ where: { id: asset.id }, data: { blockOnNetwork: block } });
  if (asset.blockOnNetwork !== block) {
    await db.assetChange.create({ data: { aiAssetId: asset.id, field: "blockOnNetwork", oldValue: String(asset.blockOnNetwork), newValue: String(block) } });
  }
  await audit(block ? "asset.network_block" : "asset.network_unblock", asset.id, { name: asset.name });
  revalidatePath(back);
  revalidatePath(BACK);
}

/** L'AI approvata da suggerire al posto di questa (nel messaggio dell'app desktop e negli avvisi). */
export async function setInsteadAssetAction(formData: FormData) {
  const assetId = String(formData.get("assetId") ?? "");
  const back = `/assets/${encodeURIComponent(assetId)}`;
  const s = await requireRole("EDITOR", back);
  const asset = await ownAsset(s.orgId, assetId, back);
  const raw = String(formData.get("insteadAssetId") ?? "");
  let insteadAssetId: string | null = null;
  let insteadName: string | null = null;
  if (raw) {
    const alt = await db.aiAsset.findFirst({ where: { id: raw, organizationId: s.orgId, deletedAt: null, status: "APPROVED" }, select: { id: true, name: true } });
    if (!alt || alt.id === asset.id) fail("Pick an approved AI from this workspace.", back);
    insteadAssetId = alt!.id;
    insteadName = alt!.name;
  }
  await db.aiAsset.update({ where: { id: asset.id }, data: { insteadAssetId } });
  await audit("asset.set_instead", asset.id, { name: asset.name, instead: insteadName });
  revalidatePath(back);
}
