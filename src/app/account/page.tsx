import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { emailEnabled } from "@/lib/mail";
import { SESSION_COOKIE, SESSION_DAYS, verifySession } from "@/lib/session";
import { updateProfileAction, changePasswordAction, resendVerificationAction, signOutAction } from "@/lib/auth-actions";
import { fmtDate } from "@/lib/format";
import { Notice, PageHeader } from "@/components/ui";
import { Row, Section } from "@/components/SettingsRows";

export const dynamic = "force-dynamic";

const SAVED: Record<string, string> = { profile: "Name saved.", password: "Password changed." };

export default async function AccountPage({ searchParams }: { searchParams: { saved?: string; verified?: string; verifySent?: string } }) {
  const s = currentSession();
  if (!s) redirect("/login");
  const account = await db.account.findUnique({ where: { id: s.accountId } });
  if (!account) redirect("/api/auth/signout");
  const session = await verifySession(cookies().get(SESSION_COOKIE)?.value);
  const via = session?.m === "sso" ? "Microsoft or Google" : "email and password";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Account" subtitle={account.email} />
      {searchParams.saved && SAVED[searchParams.saved] && <Notice tone="success">{SAVED[searchParams.saved]}</Notice>}
      {searchParams.verified && <Notice tone="success">Email confirmed.</Notice>}
      {searchParams.verifySent && <Notice tone="success">Confirmation link sent to {account.email}.</Notice>}

      <Section title="Profile">
        <Row title="Name">
          <form action={updateProfileAction} className="flex gap-2 w-full max-w-xs md:w-auto">
            <input name="name" required maxLength={120} defaultValue={account.name ?? ""} autoComplete="name" aria-label="Name" className="field flex-1 min-w-0 md:w-56" />
            <button className="btn btn-secondary btn-sm">Save</button>
          </form>
        </Row>
        <Row title="Email" hint={`Member since ${fmtDate(account.createdAt)}`}>
          <span className="text-sm text-ink-100 break-all">{account.email}</span>
          {account.emailVerifiedAt ? (
            <span className="text-xs text-steady">Confirmed</span>
          ) : emailEnabled() ? (
            <form action={resendVerificationAction}>
              <button className="btn btn-secondary btn-sm">Resend confirmation</button>
            </form>
          ) : (
            <span className="text-xs text-signal">Not confirmed</span>
          )}
        </Row>
      </Section>

      <Section title="Security">
        <Row title="Password" id="password" hint={account.ssoOnly ? "None — you use Microsoft or Google. To add one, sign out and use Forgot password." : "10+ characters, letters and numbers."}>
          {!account.ssoOnly && (
            <form action={changePasswordAction} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] items-center gap-2 w-full max-w-lg">
              <input name="current" type="password" required autoComplete="current-password" placeholder="Current password" aria-label="Current password" className="field w-full min-w-0" />
              <input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder="New password" aria-label="New password" className="field w-full min-w-0" />
              <button className="btn btn-secondary btn-sm justify-self-start">Change</button>
            </form>
          )}
        </Row>
        <Row title="Two-step verification" hint={account.ssoOnly ? "Handled by Microsoft or Google." : account.totpEnabledAt ? `On since ${fmtDate(account.totpEnabledAt)}` : "Off — an authenticator code after your password."}>
          {!account.ssoOnly && <Link href="/account/security" className="btn btn-secondary btn-sm">{account.totpEnabledAt ? "Manage" : "Set up"}</Link>}
        </Row>
        <Row title="This browser" hint={`Signed in with ${via}${account.lastLoginAt ? ` · ${fmtDate(account.lastLoginAt)}` : ""} · lasts ${SESSION_DAYS} days.`}>
          <form action={signOutAction}>
            <button className="btn btn-secondary btn-sm">Sign out</button>
          </form>
        </Row>
      </Section>
      <p className="text-xs text-ink-400 px-1">Lost a device? Ask an owner to remove and re-invite you — a new password doesn&apos;t sign out other browsers.</p>
    </div>
  );
}
