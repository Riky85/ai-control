import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { decryptJson } from "@/lib/crypto";
import { otpauthUri } from "@/lib/totp";
import { qrSvg } from "@/lib/qr";
import { Notice, PageHeader, Panel } from "@/components/ui";
import MfaPanel from "./MfaPanel";

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage({ searchParams }: { searchParams: { error?: string; required?: string; setup?: string; off?: string } }) {
  const s = currentSession();
  if (!s) redirect("/login");
  const account = await db.account.findUnique({ where: { id: s.accountId } });
  if (!account) redirect("/api/auth/signout");
  const enabled = Boolean(account.totpEnabledAt);
  const secret = !enabled ? decryptJson<{ s: string }>(account.totpSecretEncrypted)?.s : undefined;
  const required = await db.workspaceMember.findFirst({ where: { email: account.email, status: "active", organization: { mfaRequired: true } }, include: { organization: { select: { name: true } } } });

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <PageHeader title="Security" subtitle="Two-step verification for your password sign-ins." crumbs={[{ label: "Account", href: "/account" }, { label: "Security" }]} />
      {searchParams.required && !enabled && <Notice tone="error">{required?.organization.name ?? "Your workspace"} requires two-step verification. Set it up to continue.</Notice>}
      {searchParams.off && <Notice tone="success">Two-step verification is off.</Notice>}
      {searchParams.error && <Notice tone="error">{searchParams.error}</Notice>}
      <Panel title="Two-step verification" subtitle="An authenticator app code after your password (TOTP).">
        {account.ssoOnly ? (
          <p className="text-sm text-ink-400">You sign in with Microsoft or Google, so two-step verification is handled by your company&apos;s account there.</p>
        ) : (
          <MfaPanel
            enabled={enabled}
            setup={Boolean(secret)}
            secret={secret}
            qrSvg={secret ? qrSvg(otpauthUri(secret, account.email), 184) : undefined}
            recoveryLeft={account.recoveryCodesHash.length}
            canDisable={!required}
          />
        )}
      </Panel>
    </div>
  );
}
