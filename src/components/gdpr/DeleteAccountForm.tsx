"use client";

import { useFormState } from "react-dom";
import SubmitButton from "@/components/SubmitButton";
import { deleteAccountAction, type GdprFormState } from "@/lib/gdpr-actions";

// Invio con rotella mentre la cancellazione è in corso.
function Submit({ disabled }: { disabled: boolean }) {
  return (
    <SubmitButton className="btn btn-danger btn-sm" pendingLabel="Deleting…" disabled={disabled}>
      Delete account
    </SubmitButton>
  );
}

// Cancellazione del proprio account: si conferma scrivendo la propria email.
export default function DeleteAccountForm({ email, blocked }: { email: string; blocked: boolean }) {
  const [state, action] = useFormState<GdprFormState, FormData>(deleteAccountAction, {});
  return (
    <form action={action} className="flex flex-col gap-2 w-full max-w-md">
      <div className="flex gap-2">
        <input name="confirm" type="email" required autoComplete="off" aria-label="Your email" placeholder={`Type ${email}`} className="field flex-1 min-w-0 focus:border-alarm" disabled={blocked} />
        <Submit disabled={blocked} />
      </div>
      {state.error && <p className="text-xs text-alarm">{state.error}</p>}
    </form>
  );
}
