import { currentSession, isPlatformAdmin, sessionCurrent } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import localFont from "next/font/local";
import "./globals.css";
import Sidebar, { type SidebarWorkspaceProps } from "@/components/Sidebar";
import AskDocs from "@/components/AskDocs";
import SearchPalette from "@/components/SearchPalette";
import ConnectedIndicator from "@/components/ConnectedIndicator";
import AlertsBell from "@/components/AlertsBell";
import ScrollReset from "@/components/ScrollReset";
import { desktopDeviceCounts } from "@/lib/discovery/devices";
import UrlNotice from "@/components/UrlNotice";
import { TRIAL_DAYS } from "@/lib/plans";
import { fmtDate } from "@/lib/format";
import { getPlanState } from "@/lib/plan-gate";
import { orgSetupState } from "@/lib/layout-data";
import VerifyEmailBanner from "@/components/VerifyEmailBanner";
import { Suspense } from "react";
import DocsButton from "@/components/DocsButton";
import VoiceControl from "@/components/VoiceControl";
import { VOICE_COOKIE, parseVoiceMode } from "@/lib/voice";
import { planById } from "@/lib/plans";
import { db } from "@/lib/db";
import { isOnPrem } from "@/lib/edition";
import { cookies } from "next/headers";
import { THEME_COOKIE, THEME_SCRIPT, parseTheme } from "@/lib/theme";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";

// Un solo sans pulito (stile Exa): Geist (licenza OFL, file locali nel pacchetto
// "geist", niente download da Google) per testo, titoli e marchio.
const sans = GeistSans;
// Etichette tecniche (occhielli, colonne, categorie) in mono maiuscolo, stile Exein:
// IBM Plex Mono (licenza OFL), file locali in src/app/fonts.
const mono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "angar",
  description: "Discover every AI in your company. Understand what it can access. Control what it can do.",
  // App installabile (Android / iPhone): a tutto schermo, barra di stato scura.
  appleWebApp: { capable: true, title: "angar", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#202327",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = currentSession();
  const theme = parseTheme(cookies().get(THEME_COOKIE)?.value);
  const htmlClass = `${sans.variable} ${mono.variable}${theme === "dark" ? " dark" : ""}`;
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

  // Tutto in parallelo. Il ruolo nel token potrebbe essere vecchio: l'appartenenza
  // al workspace si verifica sempre nel database (il redirect arriva subito dopo).
  // Primi passi e conteggio "da rivedere" arrivano dalla cache di 60 s (lib/layout-data).
  const [member, org, { online: connectedComputers, total: devicesTotal }, memberships, platformAdmin, setupState, current] = await Promise.all([
    db.workspaceMember.findUnique({ where: { organizationId_email: { organizationId: session.orgId, email: session.email } } }),
    db.organization.findUnique({ where: { id: session.orgId } }),
    desktopDeviceCounts(session.orgId),
    db.workspaceMember.findMany({ where: { email: session.email, status: "active" }, include: { organization: { select: { id: true, name: true } } }, orderBy: { invitedAt: "asc" } }),
    isPlatformAdmin(session.email),
    orgSetupState(session.orgId),
    // Sessione revocata (logout altrove, cambio password): il token non vale più nemmeno per leggere.
    sessionCurrent(session),
  ]);
  const reviewCount = setupState.reviewCount;
  // Lista di controllo della sidebar: si spunta da sola dai dati; sparisce quando è tutto fatto.
  // Uso: app desktop installata, oppure un connettore di identità (Microsoft 365, Google Workspace, Okta).
  const setupSteps = [
    { key: "spend", title: "See what you pay for AI", href: "/", done: setupState.hasSpend },
    { key: "usage", title: "See who really uses each AI", href: "/connect", done: devicesTotal > 0 || setupState.identityConnected },
    { key: "team", title: "Invite your team", href: "/workspace", done: setupState.hasTeam },
  ];
  const setup = setupSteps.some((s) => !s.done) ? { steps: setupSteps } : null;
  if (!current) redirect("/api/auth/signout?reason=" + encodeURIComponent("Your session ended. Sign in again."));
  if (!member || member.status !== "active") redirect("/api/auth/signout?reason=" + encodeURIComponent("You no longer have access to that workspace."));

  // L'organizzazione è già stata letta qui sopra: niente seconda lettura.
  const planState = await getPlanState(session.orgId, org);
  const plan = planById(planState.effectivePlan);
  // Prova in corso o scaduta: una scheda piccola in fondo alla sidebar (niente striscia sopra la pagina).
  const trial = planState.trialing || planState.expired ? { trialing: planState.trialing, daysLeft: planState.trialDaysLeft ?? 0, totalDays: TRIAL_DAYS, endsAt: planState.trialEndsAt ? fmtDate(planState.trialEndsAt) : null } : null;
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
        {/* Sidebar chiusa di default; resta aperta solo se l'utente l'ha aperta (cookie "0"). */}
        <Sidebar initialCollapsed={cookies().get(SIDEBAR_COOKIE)?.value !== "0"} setup={setup} orgName={org?.name} workspace={workspace} userName={session.name ?? member.name ?? undefined} userEmail={session.email} platformAdmin={platformAdmin} connectedComputers={connectedComputers} reviewCount={reviewCount} trial={trial} onprem={isOnPrem()} />
        <div id="app-scroll" className="flex-1 flex flex-col min-w-0 bg-canvas overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
          <ScrollReset targetId="app-scroll" />
          {/* Senza padding in alto: la barra del titolo (PageHeader) è la prima cosa della pagina.
              Le pagine senza barra mostrano una barra vuota con i pulsanti fissi (globals.css). */}
          <main className="relative flex-1 w-full max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 pb-24">
            {/* Pulsanti fissi (avvisi, computer, voce, documentazione): dentro la barra del titolo,
                allineati a destra e centrati sulla sua altezza (56px), anche durante lo scroll (da tablet in su). */}
            <div className="hdr-tools-row relative sm:sticky top-0 z-40 h-0 print:hidden">
              {/* Barra vuota per le pagine senza PageHeader (errori, documenti): stessa cornice ovunque. */}
              <div aria-hidden className="page-bar-fallback absolute top-0 h-14 -left-[100vw] -right-[100vw] bg-panel border-b border-line" />
              <div className="absolute right-0 top-0 h-14 flex items-center gap-2 [&_.btn]:h-8 [&_.btn-icon]:w-8">
                <AlertsBell organizationId={session.orgId} />
                <ConnectedIndicator organizationId={session.orgId} />
                <VoiceControl initialMode={parseVoiceMode(cookies().get(VOICE_COOKIE)?.value)} />
                <DocsButton />
              </div>
            </div>
            <Suspense fallback={null}>
              <UrlNotice />
            </Suspense>
            {children}
            <VerifyEmailBanner />
          </main>
          <AskDocs />
        </div>
      </body>
    </html>
  );
}
