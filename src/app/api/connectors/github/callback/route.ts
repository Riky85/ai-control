import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { verifyState } from "@/lib/oauth-state";
import { appOrigin } from "@/lib/mail";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// GitHub reindirizza qui dopo che il cliente ha scelto la propria
// organizzazione e confermato l'installazione — installation_id è tutto
// ciò che serve, salvato per-organizzazione. Nessuna credenziale del
// cliente passa mai da qui: solo un identificatore di installazione.
export async function GET(request: Request) {
  const origin = appOrigin(request.headers);
  const { searchParams } = new URL(request.url);
  const s = await requireRole("ADMIN", "/connectors");
  // Lo state firmato deve essere stato creato da questo stesso utente in questo workspace.
  const state = verifyState(searchParams.get("state"));
  if (!state || state.orgId !== s.orgId || state.email !== s.email) {
    return NextResponse.redirect(`${origin}/connectors?error=${encodeURIComponent("The GitHub connection expired or didn't match your session — try again.")}`);
  }
  const installationId = searchParams.get("installation_id");
  if (!installationId || !/^\d{1,20}$/.test(installationId)) {
    return NextResponse.redirect(`${origin}/connectors?error=missing_installation_id`);
  }
  const organizationId = s.orgId;

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
  await audit("connector.connect", "GITHUB");

  return NextResponse.redirect(`${origin}/connectors?connected=github`);
}
