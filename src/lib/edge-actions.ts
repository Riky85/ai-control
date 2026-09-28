"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { newEdgeToken } from "@/lib/edge/auth";

const BACK = "/edge/sensors";
const KINDS = ["software", "cloud", "hardware"] as const;
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
  await db.edgeSensor.delete({ where: { id: sensor.id } }); // i suoi EdgeEvent vanno via in cascata
  await audit("edge.sensor_deleted", sensor.id, { name: sensor.name });
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
