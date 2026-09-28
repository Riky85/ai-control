import { EDGE_INSTALL_SCRIPT } from "@/lib/edge/install-script";

export const dynamic = "force-static";

// Installer a una riga: curl -fsSL <angar>/api/edge/install.sh | sudo sh -s -- ange_…
export function GET() {
  return new Response(EDGE_INSTALL_SCRIPT, {
    headers: { "Content-Type": "text/x-shellscript; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
