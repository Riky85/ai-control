import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { emailEnabled } from "@/lib/mail";
import { resendVerificationAction } from "@/lib/auth-actions";

// Piccolo promemoria finché l'email non è confermata (solo se le email sono attive).
export default async function VerifyEmailBanner() {
  if (!emailEnabled()) return null;
  const s = currentSession();
  if (!s) return null;
  const account = await db.account.findUnique({ where: { id: s.accountId }, select: { emailVerifiedAt: true, ssoOnly: true, email: true } });
  if (!account || account.emailVerifiedAt || account.ssoOnly) return null;
  return (
    <div className="mb-6 lg:mr-[9rem] flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-signal/30 bg-signal/[0.06] px-4 py-2.5 text-sm text-ink-100 print:hidden">
      <span className="h-2 w-2 rounded-full bg-signal shrink-0" />
      <span className="flex-1 min-w-0">Confirm your email — we sent a link to {account.email}.</span>
      <form action={resendVerificationAction}>
        <button className="text-sm text-ink-400 hover:text-ink-100 underline">Resend</button>
      </form>
    </div>
  );
}
