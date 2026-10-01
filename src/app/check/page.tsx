import PublicHeader from "@/components/PublicHeader";
import type { Metadata } from "next";
import SpendCheck from "@/components/SpendCheck";
import { currentSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "AI Spend Check — angar",
  description: "Drop your e-invoices and bank statement — in 10 minutes see what you spend on AI and where to save. Nothing is stored.",
};

// Pagina pubblica, senza registrazione: il primo contatto con angar.
export default function CheckPage() {
  const signedIn = Boolean(currentSession());
  return (
    <div className={signedIn ? "" : "min-h-screen bg-panel"}>
      {!signedIn && (
        <PublicHeader active="check" width="max-w-5xl" />
      )}
      {/* Da loggati il layout dell'app dà già il padding: niente doppio margine. */}
      <main className={signedIn ? "max-w-5xl" : "max-w-5xl mx-auto px-4 sm:px-6 py-12"}>
        <SpendCheck signedIn={signedIn} />
      </main>
    </div>
  );
}
