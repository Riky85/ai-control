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
  title: "AI Control",
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
      <body className="flex min-h-screen bg-ink text-ink-100 font-body">
        <Sidebar orgName={orgName} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b border-line flex items-center justify-end px-10 shrink-0">
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
