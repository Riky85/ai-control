import ScoreRing from "@/components/engine/ScoreRing";
import { AxisGauge } from "@/components/engine/ScoreCard";
import { fmtEur } from "@/lib/format";

/**
 * "Foto del prodotto" per l'hero: finestra con barra del titolo, anello
 * dell'angar Score, i quattro assi e una riga di risparmio. Dati illustrativi.
 */
export default function ProductShot() {
  return (
    <div className="relative w-full max-w-[520px] mx-auto">
      {/* Bagliore appena percettibile dietro la finestra */}
      <div aria-hidden className="pointer-events-none absolute inset-x-10 top-10 bottom-0 rounded-[40px] bg-accent/[0.07] blur-3xl hidden dark:block" />

      <figure className="relative rounded-2xl border border-line bg-panel shadow-[0_1px_2px_rgba(20,20,24,0.04),0_24px_48px_-24px_rgba(20,20,24,0.22)] overflow-hidden">
        {/* Barra della finestra */}
        <div className="flex items-center gap-3 border-b border-line px-4 h-10">
          <span className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-ink-100/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-ink-100/10" />
            <span className="h-2.5 w-2.5 rounded-full bg-ink-100/10" />
          </span>
          <span className="flex-1 flex justify-center">
            <span className="rounded-md bg-ink-100/[0.04] px-3 py-0.5 text-[11px] text-ink-400">angar · Score</span>
          </span>
          <span className="w-[42px]" aria-hidden />
        </div>

        <div className="p-3.5 sm:p-5 flex flex-col gap-4">
          <div className="flex items-center gap-4 sm:gap-5">
            <ScoreRing score={72} grade="B" size={132} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-ink-400">
                <span className="font-medium text-ink-100">angar Score</span>
                <span className="tabular font-medium text-steady">▲ 6</span>
              </div>
              <div className="text-sm text-ink-100 mt-1 leading-snug">Well run, with clear room to save.</div>
              <div className="mt-3 flex flex-col gap-1 text-xs text-ink-400">
                <span>Top way to improve</span>
                <span className="text-ink-100">
                  Remove 9 unused ChatGPT seats <span className="tabular text-accent font-medium">+5 pts</span>
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
            <AxisGauge label="Efficiency" value={58} />
            <AxisGauge label="Governance" value={76} />
            <AxisGauge label="Risk" value={84} />
            <AxisGauge label="Adoption" value={64} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-4 sm:px-5 py-2.5 text-xs">
          <span className="flex items-center gap-2 text-ink-400">
            <span className="h-1.5 w-1.5 rounded-full bg-steady" aria-hidden />
            Verified on bills
          </span>
          <span className="tabular text-ink-100">
            <b className="font-semibold">{fmtEur(1240)}</b> <span className="text-ink-400">a month</span>
          </span>
        </div>
        <figcaption className="sr-only">Example company: angar Score 72 out of 100, grade B.</figcaption>
      </figure>
    </div>
  );
}
