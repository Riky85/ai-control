import Link from "next/link";
import AuthShell, { authInput, authButton, SsoButtons } from "@/components/AuthShell";
import { signInAction } from "@/lib/auth-actions";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams: { error?: string; next?: string; email?: string; reset?: string; verified?: string } }) {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to see your company's AI and what it costs.">
      <SsoButtons next={searchParams.next} email={searchParams.email} />
      <form action={signInAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={searchParams.next ?? "/"} />
        {searchParams.verified && <p className="rounded-xl bg-steady/10 px-3.5 py-2.5 text-sm text-steady">Email confirmed — sign in to continue.</p>}
        {searchParams.reset && <p className="rounded-xl bg-steady/10 px-3.5 py-2.5 text-sm text-steady">Password updated — sign in with the new one.</p>}
        <label className="flex flex-col gap-2 text-sm text-ink-400">
          Work email
          <input name="email" type="email" required autoComplete="email" autoFocus={!searchParams.email} defaultValue={searchParams.email} placeholder="name@company.com" className={authInput} />
        </label>
        <label className="flex flex-col gap-2 text-sm text-ink-400">
          <span className="flex justify-between">
            Password
            <Link href="/forgot" className="text-ink-400 hover:text-ink-100">Forgot?</Link>
          </span>
          <input name="password" type="password" required autoComplete="current-password" autoFocus={!!searchParams.email} className={authInput} />
        </label>
        {searchParams.error && <p className="rounded-xl bg-alarm/10 px-3.5 py-2.5 text-sm text-alarm">{searchParams.error}</p>}
        <button className={`${authButton} mt-1`}>Continue</button>
      </form>
      <p className="text-sm text-ink-400 mt-8">
        New to angar?{" "}
        <Link href="/signup" className="text-ink-100 font-medium hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
