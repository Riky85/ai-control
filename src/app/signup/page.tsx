import Link from "next/link";
import AuthShell, { authInput, authButton, SsoButtons } from "@/components/AuthShell";
import { signUpAction } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";

export default function SignupPage({ searchParams }: { searchParams: { error?: string; email?: string; name?: string; company?: string; invite?: string } }) {
  return (
    <AuthShell title="Create your account" subtitle="See every AI your company uses in minutes. Invited? Use the same email to join that workspace.">
      <SsoButtons next={searchParams.invite ? `/api/invite/${searchParams.invite}` : undefined} email={searchParams.email} />
      <form action={signUpAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm text-ink-400">
          Full name
          {searchParams.invite && <input type="hidden" name="invite" value={searchParams.invite} />}
          <input name="name" required autoComplete="name" defaultValue={searchParams.name} className={authInput} />
        </label>
        <label className="flex flex-col gap-2 text-sm text-ink-400">
          Work email
          <input name="email" type="email" required autoComplete="email" defaultValue={searchParams.email} className={authInput} />
        </label>
        <label className="flex flex-col gap-2 text-sm text-ink-400">
          Company
          <input name="company" autoComplete="organization" defaultValue={searchParams.company} placeholder="Not needed if you were invited" className={authInput} />
        </label>
        <label className="flex flex-col gap-2 text-sm text-ink-400">
          Password
          <input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder="At least 10 characters, letters and numbers" className={authInput} />
        </label>
        {searchParams.error && <p className="rounded-xl bg-alarm/10 px-3.5 py-2.5 text-sm text-alarm">{searchParams.error}</p>}
        <button className={`${authButton} mt-1`}>Create account</button>
      </form>
      <p className="text-sm text-ink-400 mt-8">
        Already have an account? <Link href="/login" className="text-ink-100 font-medium hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
