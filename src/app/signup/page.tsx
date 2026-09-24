import Link from "next/link";
import AuthShell, { authInput } from "@/components/AuthShell";
import { signUpAction } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";

export default function SignupPage({ searchParams }: { searchParams: { error?: string; email?: string; name?: string; company?: string } }) {
  return (
    <AuthShell title="Create your account" subtitle="If you were invited, use the same email and you'll join that workspace.">
      <form action={signUpAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm text-ink-100">
          Full name
          <input name="name" required autoComplete="name" defaultValue={searchParams.name} className={authInput} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-ink-100">
          Work email
          <input name="email" type="email" required autoComplete="email" defaultValue={searchParams.email} className={authInput} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-ink-100">
          Company
          <input name="company" autoComplete="organization" defaultValue={searchParams.company} placeholder="Not needed if you were invited" className={authInput} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-ink-100">
          Password
          <input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder="At least 10 characters, letters and numbers" className={authInput} />
        </label>
        {searchParams.error && <p className="text-sm text-alarm">{searchParams.error}</p>}
        <button className="btn btn-primary w-full mt-2">Create account</button>
      </form>
      <p className="text-sm text-ink-400 mt-5 text-center">
        Already have an account? <Link href="/login" className="text-ink-100 font-medium underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
