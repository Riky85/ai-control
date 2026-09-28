import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AuthShell, { authInput, authButton } from "@/components/AuthShell";
import { verifyMfaAction } from "@/lib/auth-actions";
import { verifyPurpose } from "@/lib/session";

export const dynamic = "force-dynamic";

// Secondo passo del login (MFA): valido 5 minuti dopo la password giusta.
export default async function MfaPage({ searchParams }: { searchParams: { error?: string } }) {
  const pending = await verifyPurpose<{ a: string }>("mfa", cookies().get("angar_mfa")?.value);
  if (!pending) redirect(`/login?error=${encodeURIComponent("The sign-in took too long — enter your password again.")}`);
  return (
    <AuthShell title="Two-step verification" subtitle="Enter the 6-digit code from your authenticator app.">
      <form action={verifyMfaAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm text-ink-400">
          Code
          <input name="code" required autoFocus autoComplete="one-time-code" maxLength={20} placeholder="123 456" className={`${authInput} tracking-widest`} />
        </label>
        {searchParams.error && <p className="rounded-xl bg-alarm/10 px-3.5 py-2.5 text-sm text-alarm">{searchParams.error}</p>}
        <button className={`${authButton} mt-1`}>Verify</button>
      </form>
      <p className="text-sm text-ink-400 mt-8">
        Lost your phone? Enter one of your recovery codes instead (like <span className="font-mono">k7m2p-x9q4r</span>).{" "}
        <Link href="/login" className="text-ink-100 font-medium hover:underline">Start over</Link>
      </p>
    </AuthShell>
  );
}
