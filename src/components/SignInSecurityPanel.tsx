import Link from "next/link";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";
import { ssoAvailable } from "@/lib/sso";
import { setSignInSecurityAction } from "@/lib/auth-actions";
import { Notice } from "@/components/ui";
import { Row, Section } from "@/components/SettingsRows";

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
  const check = "h-4 w-4 accent-accent cursor-pointer disabled:cursor-not-allowed";

  return (
    <div className="flex flex-col gap-4">
      {message === "ok" && <Notice tone="success">Saved.</Notice>}
      {message && message !== "ok" && <Notice tone="error">{message}</Notice>}
      <form action={setSignInSecurityAction}>
        {/* Un solo fieldset: senza permessi i controlli restano visibili ma spenti. */}
        <fieldset disabled={!isOwner} className="contents">
          <Section
            id="sign-in-security"
            title="Sign-in"
            action={!isOwner ? "Owners only" : undefined}
            footer={<button className="btn btn-secondary btn-sm" disabled={!isOwner}>Save</button>}
          >
            {/* Senza SSO configurato sulla piattaforma le opzioni SSO non si mostrano (restano solo se già attive). */}
            {(ssoOn || org.ssoRequired) && (
              <Row title={`Require ${providers || "Microsoft or Google"}`} hint={ssoOn ? "Passwords refused." : "Not set up."}>
                <input type="checkbox" name="ssoRequired" aria-label="Require single sign-on" defaultChecked={org.ssoRequired} disabled={!ssoOn && !org.ssoRequired} className={check} />
                <input name="ssoDomain" defaultValue={org.ssoDomain ?? ""} placeholder="Only company.com (optional)" aria-label="Only for emails at this domain" className="field w-full sm:w-56 min-w-0" />
              </Row>
            )}
            <Row title="Require two-step" hint="For password sign-ins.">
              <input type="checkbox" name="mfaRequired" aria-label="Require two-step verification" defaultChecked={org.mfaRequired} className={check} />
            </Row>
            <Row title="Your two-step" hint="Your own authenticator app.">
              <Link href="/account/security" className="btn btn-secondary btn-sm">Open →</Link>
            </Row>
          </Section>
        </fieldset>
      </form>
    </div>
  );
}
