import Link from "next/link";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { ssoAvailable } from "@/lib/sso";
import { setSignInSecurityAction } from "@/lib/auth-actions";
import { Notice, Panel } from "@/components/ui";

// Impostazioni → Sicurezza d'accesso: SSO obbligatorio e MFA obbligatoria (solo Owner).
export default async function SignInSecurityPanel({ message }: { message?: string }) {
  const s = currentSession();
  if (!s) return null;
  const org = await db.organization.findUnique({ where: { id: s.orgId }, select: { ssoRequired: true, ssoDomain: true, mfaRequired: true } });
  if (!org) return null;
  const isOwner = s.role === "OWNER";
  const sso = ssoAvailable();
  const ssoOn = sso.microsoft || sso.google;
  const providers = [sso.microsoft && "Microsoft", sso.google && "Google"].filter(Boolean).join(" or ");

  return (
    <div id="sign-in-security" className="scroll-mt-6">
      <Panel title="Sign-in security" subtitle="How members sign in to this workspace" action={<Link href="/account/security" className="btn btn-ghost btn-sm">My 2-step</Link>}>
        {message === "ok" && <div className="mb-3"><Notice tone="success">Saved.</Notice></div>}
        {message && message !== "ok" && <div className="mb-3"><Notice tone="error">{message}</Notice></div>}
        <form action={setSignInSecurityAction} className="flex flex-col gap-3">
          <fieldset disabled={!isOwner} className="flex flex-col gap-3">
            {/* Senza SSO configurato sulla piattaforma le opzioni SSO non si mostrano (restano solo se già attive). */}
            {(ssoOn || org.ssoRequired) && (<>
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input type="checkbox" name="ssoRequired" defaultChecked={org.ssoRequired} disabled={!ssoOn && !org.ssoRequired} className="mt-0.5 accent-accent" />
              <span>
                <span className="block text-ink-100">Require {providers || "Microsoft or Google"} sign-in</span>
                <span className="block text-xs text-ink-400">{ssoOn ? "Password sign-ins are refused for these members." : "Not set up on this deployment yet."}</span>
              </span>
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-ink-400 pl-7">
              Only for emails at (optional)
              <input name="ssoDomain" defaultValue={org.ssoDomain ?? ""} placeholder="company.com — empty = everyone" className="field w-full" />
            </label>
            </>)}
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input type="checkbox" name="mfaRequired" defaultChecked={org.mfaRequired} className="mt-0.5 accent-accent" />
              <span>
                <span className="block text-ink-100">Require two-step verification for password sign-ins</span>
                <span className="block text-xs text-ink-400">Members without it set it up right after signing in.</span>
              </span>
            </label>
          </fieldset>
          <div className="flex items-center gap-3">
            <button className="btn btn-secondary btn-sm" disabled={!isOwner}>Save</button>
            {!isOwner && <span className="text-xs text-ink-400">Owners only.</span>}
          </div>
        </form>
      </Panel>
    </div>
  );
}
