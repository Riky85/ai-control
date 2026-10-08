"use client";

import { useFormState } from "react-dom";
import SubmitButton from "@/components/SubmitButton";
import { deleteWorkspaceAction, type GdprFormState } from "@/lib/gdpr-actions";

// Invio con rotella mentre la cancellazione è in corso.
function Submit() {
  return (
    <SubmitButton className="btn btn-danger btn-sm" pendingLabel="Deleting…">
      Delete workspace
    </SubmitButton>
  );
}

// Cancellazione definitiva del workspace (solo Owner): si conferma scrivendo il nome.
export default function DeleteWorkspaceForm({ name }: { name: string }) {
  const [state, action] = useFormState<GdprFormState, FormData>(deleteWorkspaceAction, {});
  return (
    <form action={action} className="flex flex-col gap-2 w-full max-w-md">
      <div className="flex gap-2">
        <input name="confirm" required autoComplete="off" aria-label="Workspace name" placeholder={`Type "${name}"`} className="field flex-1 min-w-0 focus:border-alarm" />
        <Submit />
      </div>
      {state.error && <p className="text-xs text-alarm">{state.error}</p>}
    </form>
  );
}
