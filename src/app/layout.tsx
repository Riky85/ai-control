import type { Metadata } from "next";
import { Hanken_Grotesk, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { db } from "@/lib/db";

// Il font della Claude Console (Anthropic Sans/Serif) è proprietario: uso le
// alternative libere più vicine — grotesk per il testo, serif per il nome.
const sans = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const serif = Source_Serif_4({ subsets: ["latin"], weight: ["500"], variable: "--font-serif" });

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
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body className={`flex h-screen overflow-hidden bg-[#1A1918] text-ink-100 font-body`}>
        <Sidebar orgName={orgName} />
        <div className="flex-1 flex flex-col min-w-0 bg-panel overflow-y-auto">
          <main className="flex-1 w-full max-w-[1400px] mx-auto px-10 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
