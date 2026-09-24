import Link from "next/link";
import AuthShell, { authInput } from "@/components/AuthShell";
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
        <form action={requestPasswordResetAction} className="flex flex-col gap-3">
          {searchParams.expired && <p className="text-sm text-alarm">That link has expired or was already used. Ask for a new one.</p>}
          <label className="flex flex-col gap-1.5 text-sm text-ink-100">
            Email
            <input name="email" type="email" required autoComplete="email" className={authInput} />
          </label>
          <button className="btn btn-primary w-full mt-2">Send reset link</button>
        </form>
      )}
      <p className="text-sm text-ink-400 mt-5 text-center">
        <Link href="/login" className="text-ink-100 font-medium underline">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
