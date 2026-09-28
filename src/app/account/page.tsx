import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { emailEnabled } from "@/lib/mail";
import { SESSION_COOKIE, SESSION_DAYS, verifySession } from "@/lib/session";
import { updateProfileAction, changePasswordAction, resendVerificationAction, signOutAction } from "@/lib/auth-actions";
import { fmtDate } from "@/lib/format";
import { Notice, PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

const SAVED: Record<string, string> = { profile: "Name saved.", password: "Password changed." };

export default async function AccountPage({ searchParams }: { searchParams: { error?: string; saved?: string; verified?: string; verifySent?: string } }) {
  const s = currentSession();
  if (!s) redirect("/login");
  const account = await db.account.findUnique({ where: { id: s.accountId } });
  if (!account) redirect("/api/auth/signout");
  const session = await verifySession(cookies().get(SESSION_COOKIE)?.value);
  const via = session?.m === "sso" ? "Microsoft or Google" : "email and password";

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <PageHeader title="Account" subtitle={account.email} />
      {searchParams.error && <Notice tone="error">{searchParams.error}</Notice>}
      {searchParams.saved && SAVED[searchParams.saved] && <Notice tone="success">{SAVED[searchParams.saved]}</Notice>}
      {searchParams.verified && <Notice tone="success">Email confirmed.</Notice>}
      {searchParams.verifySent && <Notice tone="success">Confirmation link sent to {account.email}.</Notice>}

      <Panel title="Profile">
        <form action={updateProfileAction} className="flex items-end gap-2">
          <label className="flex-1 flex flex-col gap-1.5 text-sm text-ink-400">
            Name
            <input name="name" required maxLength={120} defaultValue={account.name ?? ""} autoComplete="name" className="field w-full" />
          </label>
          <button className="btn btn-secondary btn-sm">Save</button>
        </form>
        <dl className="text-sm flex flex-col gap-2.5 mt-4 pt-4 border-t border-line">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-400">Email</dt>
            <dd className="text-ink-100 flex items-center gap-3">
              {account.email}
              {account.emailVerifiedAt ? (
                <span className="text-xs text-steady">Confirmed</span>
              ) : emailEnabled() ? (
                <form action={resendVerificationAction}>
                  <button className="text-xs text-signal hover:underline">Not confirmed — resend link</button>
                </form>
              ) : (
                <span className="text-xs text-ink-400">Not confirmed</span>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-400">Member since</dt>
            <dd className="text-ink-100">{fmtDate(account.createdAt)}</dd>
          </div>
        </dl>
      </Panel>

      <div id="password" className="scroll-mt-6">
        <Panel title="Password" subtitle={account.ssoOnly ? "You sign in with Microsoft or Google." : undefined}>
          {account.ssoOnly ? (
            <p className="text-sm text-ink-400">
              No password is set. To add one, use <Link href="/forgot" className="underline hover:text-ink-100">Forgot password</Link> after signing out — we&apos;ll email you a link.
            </p>
          ) : (
            <form action={changePasswordAction} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
              <label className="flex flex-col gap-1.5 text-sm text-ink-400">
                Current password
                <input name="current" type="password" required autoComplete="current-password" className="field w-full" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-ink-400">
                New password
                <input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder="10+ characters, letters and numbers" className="field w-full" />
              </label>
              <button className="btn btn-secondary btn-sm">Change</button>
            </form>
          )}
        </Panel>
      </div>

      <Panel
        title="Two-step verification"
        subtitle={account.ssoOnly ? "Handled by Microsoft or Google." : account.totpEnabledAt ? `On since ${fmtDate(account.totpEnabledAt)}` : "Off"}
        action={!account.ssoOnly ? <Link href="/account/security" className="btn btn-secondary btn-sm">{account.totpEnabledAt ? "Manage" : "Set up"}</Link> : undefined}
      >
        <p className="text-sm text-ink-400">A code from an authenticator app after your password, so a stolen password isn&apos;t enough.</p>
      </Panel>

      <Panel title="Sessions">
        <p className="text-sm text-ink-400">
          This session signed in with {via}. Sessions last {SESSION_DAYS} days on each browser{account.lastLoginAt ? `; last sign-in ${fmtDate(account.lastLoginAt)}` : ""}.
          Changing your password doesn&apos;t sign out other browsers — sign out there, or ask an owner to remove and re-invite you if a device is lost.
        </p>
        <form action={signOutAction} className="mt-3">
          <button className="btn btn-secondary btn-sm">Sign out of this browser</button>
        </form>
      </Panel>
    </div>
  );
}
