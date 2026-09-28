import { currentSession, isPlatformAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Sidebar, { type SidebarWorkspaceProps } from "@/components/Sidebar";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import AskDocs from "@/components/AskDocs";
import SearchPalette from "@/components/SearchPalette";
import ConnectedIndicator from "@/components/ConnectedIndicator";
import AlertsBell from "@/components/AlertsBell";
import ScrollReset from "@/components/ScrollReset";
import { listDesktopDevices } from "@/lib/discovery/devices";
import DocsButton from "@/components/DocsButton";
import { DOCS } from "@/lib/docs";
import { planById } from "@/lib/plans";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { THEME_COOKIE, THEME_SCRIPT, parseTheme } from "@/lib/theme";

// Testo in Hanken Grotesk; il nome "angar" in Space Grotesk, distinto dal
// serif della Claude Console.
const sans = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const brand = Space_Grotesk({ subsets: ["latin"], weight: ["600"], variable: "--font-brand" });

export const metadata: Metadata = {
  title: "angar",
  description: "Discover every AI in your company. Understand what it can access. Control what it can do.",
  // App installabile (Android / iPhone): a tutto schermo, barra di stato scura.
  appleWebApp: { capable: true, title: "angar", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#1A1C1D",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = currentSession();
  const theme = parseTheme(cookies().get(THEME_COOKIE)?.value);
  const htmlClass = `${sans.variable} ${brand.variable}${theme === "dark" ? " dark" : ""}`;
  const head = (
    <head>
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
    </head>
  );

  // Senza sessione (login, registrazione, dashboard condivise): pagina piena, niente sidebar.
  if (!session) {
    return (
      <html lang="en" className={htmlClass} suppressHydrationWarning>
        {head}
        <body className="min-h-screen bg-panel text-ink-100 font-body">
          <main className="w-full">{children}</main>
        </body>
      </html>
    );
  }

  // Il ruolo nel token potrebbe essere vecchio: l'appartenenza al workspace si verifica sempre nel database.
  const member = await db.workspaceMember.findUnique({ where: { organizationId_email: { organizationId: session.orgId, email: session.email } } });
  if (!member || member.status !== "active") redirect("/api/auth/signout?reason=" + encodeURIComponent("You no longer have access to that workspace."));

  const org = await db.organization.findUnique({ where: { id: session.orgId } });
  const connectedComputers = (await listDesktopDevices(session.orgId)).filter((d) => d.online).length;
  const memberships = await db.workspaceMember.findMany({ where: { email: session.email, status: "active" }, include: { organization: { select: { id: true, name: true } } }, orderBy: { invitedAt: "asc" } });
  const plan = planById(org?.plan ?? "STARTER");
  const workspace: SidebarWorkspaceProps = {
    current: org ? { id: org.id, name: org.name } : null,
    workspaces: memberships.map((m) => m.organization),
    canCreate: plan.limits.workspaces === null || memberships.length < plan.limits.workspaces,
    planName: plan.name,
    limit: plan.limits.workspaces,
  };

  return (
    <html lang="en" className={htmlClass} suppressHydrationWarning>
        {head}
      <body className={`flex h-screen overflow-hidden bg-sidebar text-ink-100 font-body`}>
        <SearchPalette />
        <Sidebar initialCollapsed={cookies().get(SIDEBAR_COOKIE)?.value === "1"} orgName={org?.name} workspace={workspace} userName={session.name ?? member.name ?? undefined} userEmail={session.email} platformAdmin={await isPlatformAdmin(session.email)} connectedComputers={connectedComputers} reviewCount={await db.aiAsset.count({ where: { organizationId: session.orgId, deletedAt: null, status: { in: ["UNKNOWN", "UNREVIEWED"] } } })} />
        <div id="app-scroll" className="flex-1 flex flex-col min-w-0 bg-panel overflow-y-auto [scrollbar-gutter:stable]">
          <ScrollReset targetId="app-scroll" />
          <main className="relative flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 pt-12 pb-24">
            {/* Sempre nello stesso punto, in ogni pagina. */}
            <div className="absolute top-12 right-4 sm:right-6 lg:right-10 z-30 print:hidden flex items-center gap-2">
              <AlertsBell organizationId={session.orgId} />
              <ConnectedIndicator organizationId={session.orgId} />
              <DocsButton />
            </div>
            {children}
          </main>
          <AskDocs docs={DOCS.map(({ slug, title, section, summary }) => ({ slug, title, section, summary }))} />
        </div>
      </body>
    </html>
  );
}
