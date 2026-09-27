import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import { VendorBadge } from "@/components/VendorIcon";

// Pagine di accesso (login, registrazione, password): sempre scure, a due
// colonne. A sinistra il modulo, grande e senza riquadri; a destra un'anteprima
// del prodotto con un bagliore arancione. Su mobile resta solo il modulo.
export default function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="force-dark min-h-screen w-full bg-sidebar text-ink-100 grid lg:grid-cols-[1fr_1.05fr] font-body">
      <div className="flex flex-col px-6 sm:px-12 py-8 min-h-screen">
        <Link href="/login" className="text-ink-100 self-start" aria-label="angar">
          <Wordmark size={20} logoSize={22} />
        </Link>
        <div className="flex-1 flex items-center justify-center py-10">
          <div className="w-full max-w-[380px] animate-rise">
            <h1 className="font-display text-[34px] leading-[1.1] font-semibold tracking-tight text-ink-100">{title}</h1>
            <p className="text-[15px] text-ink-400 mt-2.5 mb-8">{subtitle}</p>
            {children}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-400">
          <span>© angar</span>
          <Link href="/pricing" className="hover:text-ink-100">Pricing</Link>
          <Link href="/check" className="hover:text-ink-100">Free AI spend check</Link>
          <span>Hosted in the EU · GDPR</span>
        </div>
      </div>

      <div className="hidden lg:block p-4">
        <Showcase />
      </div>
    </div>
  );
}

// Anteprima: cosa vedrai dentro angar, con numeri d'esempio.
function Showcase() {
  const rows = [
    { name: "ChatGPT", vendor: "OpenAI", info: "10 seats · 3 used", eur: "€305", flag: true },
    { name: "Claude", vendor: "Anthropic", info: "Team · 6 seats", eur: "€150" },
    { name: "Microsoft Copilot", vendor: "Microsoft", info: "Business · 8 seats", eur: "€168" },
    { name: "Cursor", vendor: "Anysphere", info: "Found on 4 computers", eur: "Not paid", muted: true },
  ];
  return (
    <div className="relative h-full min-h-[calc(100vh-2rem)] rounded-3xl border border-line bg-panel overflow-hidden flex flex-col justify-between p-10">
      {/* bagliore */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full bg-accent/25 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-48 -left-32 h-[420px] w-[420px] rounded-full bg-accent/10 blur-[110px]" />

      <div className="relative max-w-md">
        <p className="font-display text-[30px] leading-[1.15] font-semibold tracking-tight text-ink-100">
          Every AI your company uses — and what it <span className="text-accent">really</span> costs.
        </p>
        <p className="text-sm text-ink-400 mt-3">Found automatically from your bank, invoices and computers. Nothing to type.</p>
      </div>

      <div className="relative flex flex-col gap-3 max-w-[460px] w-full self-center">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-line bg-sidebar/80 backdrop-blur p-4">
            <div className="text-xs text-ink-400">AI in use</div>
            <div className="font-display text-[28px] font-semibold tabular text-ink-100 mt-1">13</div>
            <div className="text-xs text-ink-400">7 found automatically</div>
          </div>
          <div className="rounded-2xl border border-accent/40 bg-sidebar/80 backdrop-blur p-4">
            <div className="text-xs text-ink-400">You could save</div>
            <div className="font-display text-[28px] font-semibold tabular text-accent mt-1">€683<span className="text-sm text-ink-400 font-normal">/mo</span></div>
            <div className="text-xs text-ink-400">€8,196 a year</div>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-sidebar/80 backdrop-blur divide-y divide-line">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center gap-3 px-4 py-3">
              <VendorBadge vendor={r.vendor} name={r.name} size={30} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-100 truncate">{r.name}</div>
                <div className={`text-xs truncate ${r.flag ? "text-signal" : "text-ink-400"}`}>{r.info}</div>
              </div>
              <div className={`text-sm tabular ${r.muted ? "text-ink-400" : "text-ink-100 font-medium"}`}>{r.eur}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative flex items-center gap-2 text-xs text-ink-400">
        <span className="h-2 w-2 rounded-full bg-steady" /> Read-only access · only AI names and costs, never content
      </div>
    </div>
  );
}

export const authInput = "field w-full !h-11 !rounded-xl !bg-sidebar !text-[15px] focus:!border-accent/70";
export const authButton = "btn btn-primary w-full !h-11 !rounded-xl text-[15px]";
