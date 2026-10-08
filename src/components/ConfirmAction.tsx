import SubmitButton from "@/components/SubmitButton";

/**
 * Azione distruttiva con conferma in un piccolo riquadro (stesso schema di
 * "Remove seat"): il primo clic apre il riquadro, il secondo invia il form.
 * Nessun JavaScript oltre al pulsante di invio, niente window.confirm.
 */
export default function ConfirmAction({
  label,
  question,
  detail,
  confirmLabel,
  pendingLabel,
  action,
  fields,
  triggerClassName = "btn btn-secondary btn-sm",
  title,
  align = "right",
}: {
  /** Testo del pulsante che apre la conferma ("Delete"). */
  label: string;
  /** Domanda nel riquadro ("Delete this webhook?"). */
  question: React.ReactNode;
  detail?: React.ReactNode;
  /** Testo del pulsante che conferma ("Yes, delete it"). */
  confirmLabel: string;
  pendingLabel?: string;
  action: (formData: FormData) => void | Promise<void>;
  /** Campi nascosti del form (id, back, ...). */
  fields: Record<string, string>;
  triggerClassName?: string;
  title?: string;
  align?: "left" | "right";
}) {
  return (
    <details className="relative inline-block text-left">
      <summary className={`${triggerClassName} list-none cursor-pointer [&::-webkit-details-marker]:hidden`} title={title}>
        {label}
      </summary>
      <div className={`absolute ${align === "right" ? "right-0" : "left-0"} z-30 mt-1.5 w-72 rounded-xl border border-line bg-panel p-4 shadow-lg flex flex-col gap-3`}>
        <p className="text-sm text-ink-100">{question}</p>
        {detail && <p className="text-xs text-ink-400">{detail}</p>}
        <form action={action}>
          {Object.entries(fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <SubmitButton className="btn btn-danger btn-sm w-full" pendingLabel={pendingLabel}>
            {confirmLabel}
          </SubmitButton>
        </form>
      </div>
    </details>
  );
}
