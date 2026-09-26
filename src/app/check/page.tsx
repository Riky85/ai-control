import type { Metadata } from "next";
import SpendCheck from "@/components/SpendCheck";
import { currentSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "AI Spend Check — angar",
  description: "Drop your bank statement and see in seconds every AI your company pays for, what it really costs and where you overpay. Nothing is stored.",
};

// Pagina pubblica, senza registrazione: il primo contatto con angar.
export default function CheckPage() {
  const signedIn = Boolean(currentSession());
  return (
    <div className={signedIn ? "" : "min-h-screen bg-panel"}>
      {!signedIn && (
        <header className="max-w-5xl mx-auto px-6 pt-8 flex items-center justify-between">
          <a href="/check" className="font-brand text-[20px] tracking-tight text-ink-100">angar</a>
          <div className="flex items-center gap-3">
            <a href="/pricing" className="text-sm text-ink-400 hover:text-ink-100">Pricing</a>
            <a href="/login" className="text-sm text-ink-400 hover:text-ink-100">Sign in</a>
            <a href="/signup" className="btn btn-secondary btn-sm">Create free account</a>
          </div>
        </header>
      )}
      <main className="max-w-5xl mx-auto px-6 py-12">
        <SpendCheck signedIn={signedIn} />
      </main>
    </div>
  );
}
