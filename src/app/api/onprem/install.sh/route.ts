import { readFileSync } from "node:fs";
import { join } from "node:path";

// Letto in fase di build (pagina statica): la fonte è onprem/install.sh.
export const dynamic = "force-static";

// Installer a una riga dell'edizione on-premises: curl -fsSL <angar>/api/onprem/install.sh | sudo sh
export function GET() {
  const script = readFileSync(join(process.cwd(), "onprem", "install.sh"), "utf8");
  return new Response(script, {
    headers: { "Content-Type": "text/x-shellscript; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
