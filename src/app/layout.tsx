import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { db } from "@/lib/db";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Angar",
  description: "Discover every AI in your company. Understand what it can access. Control what it can do.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let orgName: string | undefined;
  try {
    const org = await db.organization.findUnique({ where: { id: "demo-org" } });
    orgName = org?.name;
  } catch {
    // il layout non deve mai bloccarsi per questo — nessun nome, nessun footer
  }

  return (
    <html lang="en" className={sans.variable}>
      <body className={`flex h-screen overflow-hidden bg-ink text-ink-100 font-body`}>
        <Sidebar orgName={orgName} />
        <div className="flex-1 flex flex-col min-w-0 bg-panel overflow-y-auto">
          <header className="h-14 border-b border-line flex items-center justify-between px-10 shrink-0 sticky top-0 bg-panel z-10">
            <form action="/search" method="GET" className="w-72">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-line bg-ink">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-ink-400 shrink-0">
                  <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M9.2 9.2L12 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                <input
                  name="q"
                  placeholder="Search AI systems..."
                  className="flex-1 bg-transparent text-xs text-ink-100 placeholder:text-ink-400 outline-none min-w-0"
                />
                <kbd className="text-[10px] text-ink-400 border border-line rounded px-1 shrink-0">/</kbd>
              </div>
            </form>
            {orgName && (
              <span className="text-xs text-ink-400 border border-line rounded-md px-3 py-1.5">
                {orgName}
              </span>
            )}
          </header>
          <main className="flex-1 px-10 py-9">{children}</main>
        </div>
      </body>
    </html>
  );
}
