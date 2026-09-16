import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "AI Control",
  description: "Discover every AI in your company. Understand what it can access. Control what it can do.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen bg-bg text-white font-sans">
        <Sidebar />
        <main className="flex-1 p-8 max-w-6xl">{children}</main>
      </body>
    </html>
  );
}
