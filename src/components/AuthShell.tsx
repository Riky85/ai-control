import Logo from "@/components/Logo";

// Contenitore delle pagine di accesso: centrato, marchio in alto.
export default function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-ink px-4">
      <div className="w-full max-w-[400px]">
        <div className="flex items-center justify-center gap-2 mb-8 text-ink-100">
          <Logo size={20} />
          <span className="font-brand text-[20px] leading-none tracking-tight">Angar</span>
        </div>
        <div className="rounded-xl border border-line bg-panel p-7 shadow-card">
          <h1 className="font-display text-[22px] font-semibold tracking-tight text-ink-100">{title}</h1>
          <p className="text-sm text-ink-400 mt-1 mb-6">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export const authInput =
  "w-full border border-line rounded-lg px-3 py-2.5 text-sm text-ink-100 bg-panel placeholder:text-ink-400 focus:outline-none focus:border-ink-400";
