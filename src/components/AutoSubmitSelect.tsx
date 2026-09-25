"use client";

// Select che salva appena cambi valore (invia il form che la contiene):
// niente pulsante "Save" separato per una scelta singola.
export default function AutoSubmitSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
