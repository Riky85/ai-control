import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GitHub reindirizza qui dopo che il cliente ha scelto la propria
// organizzazione e confermato l'installazione — installation_id è tutto
// ciò che serve, salvato per-organizzazione. Nessuna credenziale del
// cliente passa mai da qui: solo un identificatore di installazione.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const installationId = searchParams.get("installation_id");
  const organizationId = searchParams.get("state") || "demo-org";

  if (!installationId) {
    return NextResponse.redirect(`${origin}/connectors?error=missing_installation_id`);
  }

  // credentialsEncrypted non è ancora davvero cifrato a riposo (nessuna
  // infrastruttura di cifratura oggi) — è dichiarato onestamente qui
  // piuttosto che nel nome del campo, che resta quello storico dello schema.
  await db.connector.upsert({
    where: { organizationId_provider: { organizationId, provider: "GITHUB" } },
    update: { credentialsEncrypted: JSON.stringify({ installationId }), status: "SYNCING" },
    create: {
      organizationId,
      provider: "GITHUB",
      status: "SYNCING",
      scopes: [],
      credentialsEncrypted: JSON.stringify({ installationId }),
    },
  });

  return NextResponse.redirect(`${origin}/connectors?connected=github`);
}
