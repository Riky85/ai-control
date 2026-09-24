import { currentOrgId } from "@/lib/org";
import { NextRequest, NextResponse } from "next/server";
import { runConnectorSync } from "@/lib/connectors/sync";
import type { ConnectorProvider } from "@prisma/client";


export async function POST(
  _req: NextRequest,
  { params }: { params: { provider: string } }
) {
  const provider = params.provider.toUpperCase() as ConnectorProvider;
  const result = await runConnectorSync(currentOrgId(), provider);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
