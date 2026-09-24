import AuthShell, { authInput } from "@/components/AuthShell";
import { resetPasswordAction } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";

export default function ResetPage({ params, searchParams }: { params: { token: string }; searchParams: { error?: string } }) {
  return (
    <AuthShell title="Choose a new password" subtitle="At least 10 characters, with letters and numbers.">
      <form action={resetPasswordAction} className="flex flex-col gap-3">
        <input type="hidden" name="token" value={params.token} />
        <label className="flex flex-col gap-1.5 text-sm text-ink-100">
          New password
          <input name="password" type="password" required minLength={10} autoComplete="new-password" className={authInput} />
        </label>
        {searchParams.error && <p className="text-sm text-alarm">{searchParams.error}</p>}
        <button className="btn btn-primary w-full mt-2">Save password</button>
      </form>
    </AuthShell>
  );
}
