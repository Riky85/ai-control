import Link from "next/link";
import AuthShell, { authInput } from "@/components/AuthShell";
import { signInAction } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams: { error?: string; next?: string; email?: string; reset?: string } }) {
  return (
    <AuthShell title="Sign in" subtitle="Welcome back to your AI estate.">
      <form action={signInAction} className="flex flex-col gap-3">
        <input type="hidden" name="next" value={searchParams.next ?? "/"} />
        <label className="flex flex-col gap-1.5 text-sm text-ink-100">
          Email
          <input name="email" type="email" required autoComplete="email" defaultValue={searchParams.email} className={authInput} />
        </label>
        {searchParams.reset && <p className="text-sm text-steady">Password updated — sign in with the new one.</p>}
        <label className="flex flex-col gap-1.5 text-sm text-ink-100">
          <span className="flex justify-between">Password <Link href="/forgot" className="text-ink-400 hover:text-ink-100 underline">Forgot password?</Link></span>
          <input name="password" type="password" required autoComplete="current-password" className={authInput} />
        </label>
        {searchParams.error && <p className="text-sm text-alarm">{searchParams.error}</p>}
        <button className="btn btn-primary w-full mt-2">Sign in</button>
      </form>
      <p className="text-sm text-ink-400 mt-5 text-center">
        New to Angar? <Link href="/signup" className="text-ink-100 font-medium underline">Create an account</Link>
      </p>
    </AuthShell>
  );
}
