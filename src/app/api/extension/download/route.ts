import { zipSync, strToU8 } from "fflate";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { extensionFiles } from "@/lib/extension/source";
import { ensureWorkspaceToken } from "@/lib/discovery/ingest";
import { appOrigin } from "@/lib/mail";

export const dynamic = "force-dynamic";

// Estensione già collegata al workspace: niente token da copiare.
export async function GET(req: Request) {
  const s = await requireRole("EDITOR", "/discover");
  const server = appOrigin(req.headers).replace(/\/$/, "");
  const { token } = await ensureWorkspaceToken(s.orgId);
  const org = await db.organization.findUnique({ where: { id: s.orgId } });
  const files = extensionFiles(server, { token, company: org?.name });
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([n, c]) => [`angar-extension/${n}`, strToU8(c)])));
  return new Response(Buffer.from(zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="angar-extension.zip"' } });
}
