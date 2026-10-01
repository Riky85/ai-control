/**
 * angar Gateway: /api/gateway/openai/v1/* e /api/gateway/anthropic/v1/*.
 * Pubblico per il middleware: l'autenticazione è solo la chiave virtuale agk_….
 */
import { handleGateway } from "@/lib/gateway/proxy";
import { prismaGatewayStore } from "@/lib/gateway/store";
import { scheduleGatewayRollup } from "@/lib/gateway/spend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { provider: string; path: string[] } };

function handle(req: Request, { params }: Ctx) {
  return handleGateway(req, params.provider, params.path ?? [], {
    store: prismaGatewayStore,
    onLogged: (e) => {
      if (e.costEur > 0) scheduleGatewayRollup(e.organizationId);
    },
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
