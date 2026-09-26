import { zipSync, strToU8 } from "fflate";
import { extensionFiles } from "@/lib/extension/source";

export const dynamic = "force-dynamic";

// Estensione pronta da caricare (nessun segreto: il token si inserisce dopo).
export async function GET(req: Request) {
  const server = process.env.APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  const files = extensionFiles(server);
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([n, c]) => [`angar-extension/${n}`, strToU8(c)])));
  return new Response(Buffer.from(zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="angar-extension.zip"' } });
}
