import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "AI Control",
  description: "Discover every AI in your company. Understand what it can access. Control what it can do.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="flex min-h-screen bg-ink text-ink-100 font-body">
        <Sidebar />
        <main className="flex-1 px-10 py-9 max-w-[1100px]">{children}</main>
      </body>
    </html>
  );
}
