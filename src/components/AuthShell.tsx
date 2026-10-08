import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import { VendorBadge } from "@/components/VendorIcon";
import { ssoAvailable } from "@/lib/sso";

// Pagine di accesso (login, registrazione, password): sempre scure, a due
// colonne. A sinistra il modulo, grande e senza riquadri; a destra un'anteprima
// del prodotto con un bagliore arancione. Su mobile resta solo il modulo.
export default function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="force-dark min-h-screen w-full bg-sidebar text-ink-100 grid lg:grid-cols-[1fr_1.05fr] font-body">
      <div className="flex flex-col px-6 sm:px-12 py-8 min-h-screen">
        {/* Logo sempre in alto a sinistra, nome centrato sul logo. */}
        <Link href="/login" className="self-start inline-flex text-ink-100" aria-label="angar">
          <Wordmark size={24} />
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
          <Link href="/partners" className="hover:text-ink-100">Partners</Link>
          <Link href="/trust" className="hover:text-ink-100">Trust Center</Link>
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
      {/* bagliore neutro (l'arancio resta solo come segnale) */}
      <div className="pointer-events-none absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full bg-ink-100/[0.04] blur-[120px]" />

      <div className="relative max-w-md">
        <p className="font-display text-[26px] leading-[1.15] font-semibold tracking-tight text-ink-100">
          Drop your e-invoices and bank statement — in 10 minutes see what you spend on AI and <span className="text-accent">where to save</span>.
        </p>
        <p className="text-sm text-ink-400 mt-3">Nothing to type. Savings verified on your next bills.</p>
      </div>

      <div className="relative flex flex-col gap-3 max-w-[460px] w-full self-center">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-line bg-sidebar/80 backdrop-blur p-4">
            <div className="text-xs text-ink-400">AI in use</div>
            <div className="font-display text-[28px] font-light tabular text-ink-100 mt-1">13</div>
            <div className="text-xs text-ink-400">7 found automatically</div>
          </div>
          <div className="rounded-2xl border border-accent/40 bg-sidebar/80 backdrop-blur p-4">
            <div className="text-xs text-ink-400">You could save</div>
            <div className="font-display text-[28px] font-light tabular text-accent mt-1">€683<span className="text-sm text-ink-400 font-normal">/mo</span></div>
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
const ssoButton = "btn btn-secondary w-full !h-11 !rounded-xl !bg-sidebar text-[15px] gap-2.5 justify-center";

// Accesso con Microsoft / Google: solo i provider configurati; niente se nessuno lo è.
export function SsoButtons({ next, email }: { next?: string; email?: string }) {
  const sso = ssoAvailable();
  if (!sso.microsoft && !sso.google) return null;
  const qs = (p: string) => {
    const q = new URLSearchParams();
    if (next && next !== "/") q.set("next", next);
    if (email) q.set("email", email);
    const s = q.toString();
    return `/api/auth/sso/${p}/start${s ? `?${s}` : ""}`;
  };
  return (
    <div className="flex flex-col gap-3 mb-6">
      {sso.microsoft && (
        <a href={qs("microsoft")} className={ssoButton}>
          <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden>
            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
          </svg>
          Continue with Microsoft
        </a>
      )}
      {sso.google && (
        <a href={qs("google")} className={ssoButton}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Continue with Google
        </a>
      )}
      <div className="flex items-center gap-3 text-xs text-ink-400 mt-1">
        <span className="h-px flex-1 bg-line" />
        or with email
        <span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
