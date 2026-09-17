import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "AI Control",
  description: "Discover every AI in your company. Understand what it can access. Control what it can do.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body className="flex min-h-screen bg-ink text-ink-100 font-body">
        <Sidebar />
        <main className="flex-1 px-10 py-9">{children}</main>
      </body>
    </html>
  );
}
