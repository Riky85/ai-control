import { SCANNER_PY } from "@/lib/discovery/scanner-source";

export const dynamic = "force-dynamic";

// Lo script, con l'indirizzo di questo server già inserito. Nessun segreto:
// il token si passa a riga di comando.
export async function GET(req: Request) {
  const base = process.env.APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  return new Response(SCANNER_PY.replace("__ANGAR_SERVER__", base), {
    headers: { "Content-Type": "text/x-python; charset=utf-8", "Content-Disposition": 'inline; filename="angar-scan.py"' },
  });
}
