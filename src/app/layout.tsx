import type { Metadata } from "next";
import { Hanken_Grotesk, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { db } from "@/lib/db";

// Testo in Hanken Grotesk; il nome "Angar" in Space Grotesk, distinto dal
// serif della Claude Console.
const sans = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const brand = Space_Grotesk({ subsets: ["latin"], weight: ["600"], variable: "--font-brand" });

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
    <html lang="en" className={`${sans.variable} ${brand.variable}`}>
      <body className={`flex h-screen overflow-hidden bg-[#1A1918] text-ink-100 font-body`}>
        <Sidebar orgName={orgName} />
        <div className="flex-1 flex flex-col min-w-0 bg-panel overflow-y-auto">
          <main className="flex-1 w-full max-w-[1400px] mx-auto px-10 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
