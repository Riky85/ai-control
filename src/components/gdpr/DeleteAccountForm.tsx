"use client";

import { useFormState, useFormStatus } from "react-dom";
import { deleteAccountAction, type GdprFormState } from "@/lib/gdpr-actions";

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-danger btn-sm" disabled={pending || disabled}>
      {pending ? "Deleting…" : "Delete account"}
    </button>
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
