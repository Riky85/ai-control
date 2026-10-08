"use client";

import { useFormStatus } from "react-dom";

/**
 * Pulsante di invio unico per i form con server action: mentre il form è in
 * corso si disattiva e mostra una piccola rotella. La larghezza resta stabile:
 * etichetta normale ed etichetta "in corso" occupano la stessa cella della
 * griglia, quella non attiva è solo trasparente.
 */
export default function SubmitButton({
  children,
  pendingLabel,
  className = "btn btn-primary",
  disabled,
  ...rest
}: {
  children: React.ReactNode;
  /** Testo mostrato durante l'invio (facoltativo: senza, resta solo la rotella). */
  pendingLabel?: string;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type" | "className" | "children">) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={pending || undefined} {...rest}>
      <span className="grid place-items-center [grid-template-areas:'cell']">
        <span aria-hidden={pending || undefined} className={`[grid-area:cell] inline-flex items-center gap-1.5 transition-opacity ${pending ? "opacity-0" : ""}`}>
          {children}
        </span>
        <span aria-hidden={!pending || undefined} className={`[grid-area:cell] inline-flex items-center gap-1.5 transition-opacity ${pending ? "" : "opacity-0"}`}>
          <Spinner />
          {pendingLabel && <span>{pendingLabel}</span>}
          {!pendingLabel && <span className="sr-only">Working…</span>}
        </span>
      </span>
    </button>
  );
}

// Rotella piccola: segue il colore del testo del pulsante.
function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="animate-spin shrink-0">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
