import Link from "next/link";
import AuthShell, { authInput, authButton } from "@/components/AuthShell";
import { requestPasswordResetAction } from "@/lib/auth-actions";
import { emailEnabled } from "@/lib/mail";

export const dynamic = "force-dynamic";

export default function ForgotPage({ searchParams }: { searchParams: { sent?: string; expired?: string } }) {
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new one.">
      {searchParams.sent ? (
        <p className="text-sm text-ink-100">
          If an account exists for that email, a reset link is on its way. It works once and expires in 1 hour.
          {!emailEnabled() && <span className="block text-ink-400 mt-2">Email isn't set up on this deployment yet — ask an admin of your workspace for a reset link.</span>}
        </p>
      ) : (
        <form action={requestPasswordResetAction} className="flex flex-col gap-4">
          {searchParams.expired && <p className="rounded-xl bg-alarm/10 px-3.5 py-2.5 text-sm text-alarm">That link has expired or was already used. Ask for a new one.</p>}
          <label className="flex flex-col gap-2 text-sm text-ink-400">
            Email
            <input name="email" type="email" required autoComplete="email" className={authInput} />
          </label>
          <button className={`${authButton} mt-1`}>Send reset link</button>
        </form>
      )}
      <p className="text-sm text-ink-400 mt-8">
        <Link href="/login" className="text-ink-100 font-medium hover:underline">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
