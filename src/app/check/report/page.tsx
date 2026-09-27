import type { Metadata } from "next";
import CheckReport from "@/components/check/CheckReport";

export const metadata: Metadata = {
  title: "AI Spend Report — angar",
  robots: { index: false },
};

// Report stampabile dell'AI Spend Check: i dati arrivano dal browser del visitatore, nulla dal server.
export default function CheckReportPage() {
  return <CheckReport />;
}
