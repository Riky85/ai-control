"use server";

/**
 * Server actions — la UI chiama queste invece di fare fetch verso le API
 * route. Ogni azione tocca solo il database (mai un LLM) e poi invalida
 * le pagine interessate, così l'utente vede subito il risultato.
 */
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { runConnectorSync } from "@/lib/connectors/sync";
import type { ConnectorProvider, AiAssetStatus } from "@prisma/client";

const ORG_ID = "demo-org"; // MVP: single-tenant demo; sostituire con auth reale

export async function syncConnectorAction(formData: FormData) {
  const provider = formData.get("provider") as ConnectorProvider;
  await runConnectorSync(ORG_ID, provider);
  revalidatePath("/connectors");
  revalidatePath("/assets");
  revalidatePath("/evidence");
  revalidatePath("/");
}

export async function setAssetOwnerAction(formData: FormData) {
  const assetId = formData.get("assetId") as string;
  const ownerId = formData.get("ownerId") as string;
  await db.aiAsset.update({
    where: { id: assetId },
    data: { ownerId: ownerId || null },
  });
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
  revalidatePath("/");
}

export async function setAssetStatusAction(formData: FormData) {
  const assetId = formData.get("assetId") as string;
  const status = formData.get("status") as AiAssetStatus;
  await db.aiAsset.update({
    where: { id: assetId },
    data: { status },
  });
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
  revalidatePath("/");
}
