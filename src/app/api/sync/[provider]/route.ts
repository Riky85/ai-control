import { NextRequest, NextResponse } from "next/server";
import { runConnectorSync } from "@/lib/connectors/sync";
import type { ConnectorProvider } from "@prisma/client";

const ORG_ID = "demo-org"; // MVP: single-tenant demo; sostituire con auth reale

export async function POST(
  _req: NextRequest,
  { params }: { params: { provider: string } }
) {
  const provider = params.provider.toUpperCase() as ConnectorProvider;
  const result = await runConnectorSync(ORG_ID, provider);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
