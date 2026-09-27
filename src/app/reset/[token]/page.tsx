import AuthShell, { authInput, authButton } from "@/components/AuthShell";
import { resetPasswordAction } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";

export default function ResetPage({ params, searchParams }: { params: { token: string }; searchParams: { error?: string } }) {
  return (
    <AuthShell title="Choose a new password" subtitle="At least 10 characters, with letters and numbers.">
      <form action={resetPasswordAction} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={params.token} />
        <label className="flex flex-col gap-2 text-sm text-ink-400">
          New password
          <input name="password" type="password" required minLength={10} autoComplete="new-password" className={authInput} />
        </label>
        {searchParams.error && <p className="rounded-xl bg-alarm/10 px-3.5 py-2.5 text-sm text-alarm">{searchParams.error}</p>}
        <button className={`${authButton} mt-1`}>Save password</button>
      </form>
    </AuthShell>
  );
}
