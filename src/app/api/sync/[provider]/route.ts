import { NextRequest, NextResponse } from "next/server";
import { runConnectorSync } from "@/lib/connectors/sync";
import { requireRole } from "@/lib/auth";
import { ConnectorProvider } from "@prisma/client";

// Sincronizza un collegamento: solo Editor o superiori, solo provider validi.
export async function POST(_req: NextRequest, { params }: { params: { provider: string } }) {
  const session = await requireRole("EDITOR", "/sources");
  const provider = params.provider.toUpperCase();
  if (!(Object.values(ConnectorProvider) as string[]).includes(provider)) return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  const result = await runConnectorSync(session.orgId, provider as ConnectorProvider);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
