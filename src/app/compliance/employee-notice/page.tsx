import { USAGE_RETENTION_MONTHS } from "@/lib/jobs";
import Link from "next/link";
import { db } from "@/lib/db";
import { currentOrgId } from "@/lib/org";
import { featureEnabled } from "@/lib/plan-gate";
import LockedFeature from "@/components/LockedFeature";
import { PageHeader } from "@/components/ui";
import CopyButton from "@/components/CopyButton";
import PrintButton from "@/components/PrintButton";
import { privacyModeOf, privacyModeLabel } from "@/lib/privacy";
import { buildEmployeeNotice, noticeLang, noticeText, NOTICE_LANGS } from "@/lib/employee-notice";

export const dynamic = "force-dynamic";

// Informativa pronta per i dipendenti, generata dai dati dell'azienda. Si
// stampa (o si salva in PDF) oppure si copia per email / intranet.
export default async function EmployeeNoticePage({ searchParams }: { searchParams: { lang?: string; contact?: string; retention?: string } }) {
  const orgId = currentOrgId();
  const lang = noticeLang(searchParams.lang);
  const contact = searchParams.contact?.trim().slice(0, 300) || null;
  // angar cancella i dati d'uso dopo USAGE_RETENTION_MONTHS: l'informativa dice lo stesso.
  const retention = USAGE_RETENTION_MONTHS;

  const [org, desktop, extension, connectors, sensors, tools] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId }, select: { name: true, country: true, privacyMode: true } }),
    db.desktopDevice.count({ where: { organizationId: orgId } }),
    db.aiAssetActivity.findFirst({ where: { eventType: "extension.active", aiAsset: { organizationId: orgId } }, select: { id: true } }),
    db.connector.findMany({ where: { organizationId: orgId, status: { not: "DISCONNECTED" }, provider: { in: ["MICROSOFT_365", "GOOGLE_WORKSPACE", "OKTA"] } }, select: { provider: true } }),
    db.edgeSensor.findMany({ where: { organizationId: orgId }, select: { syslogEnabled: true } }),
    db.aiAsset.findMany({ where: { organizationId: orgId, deletedAt: null, status: { not: "UNAPPROVED" } }, select: { name: true }, orderBy: { lastSeenAt: { sort: "desc", nulls: "last" } }, take: 8 }),
  ]);
  const mode = privacyModeOf(org);
  const notice = buildEmployeeNotice(
    {
      orgName: org?.name ?? "The company",
      country: org?.country ?? null,
      mode,
      contact,
      retentionMonths: retention,
      sources: {
        desktop: desktop > 0,
        extension: !!extension,
        microsoft365: connectors.some((c) => c.provider === "MICROSOFT_365"),
        google: connectors.some((c) => c.provider === "GOOGLE_WORKSPACE"),
        okta: connectors.some((c) => c.provider === "OKTA"),
        edge: sensors.length > 0,
        firewallBytes: sensors.some((x) => x.syslogEnabled),
      },
      tools: tools.map((t) => t.name),
      date: new Date(),
    },
    lang,
  );
  const text = noticeText(notice);
  const hasPlaceholders = /\[\[/.test(JSON.stringify(notice.blocks));

  return (
    <div className="flex flex-col gap-6">
      <div className="contents print:hidden">
        <PageHeader subtitle="What staff need to know"
          crumbs={[{ label: "AI Act", href: "/compliance" }, { label: "Employee notice" }]}
          title="Employee notice"
          action={
            (await featureEnabled(orgId, "employeeNotice")) ? (
              <>
                <CopyButton text={text} label="Copy" className="btn btn-secondary" />
                <PrintButton label="Print" />
              </>
            ) : <LockedFeature feature="employeeNotice" label="Copy & print" />
          }
        />

        <form method="get" className="rounded-xl border border-line bg-panel p-5 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-3 items-end">
          <label className="flex flex-col gap-1.5 text-sm text-ink-400">
            Language
            <select name="lang" defaultValue={lang} className="field">
              {NOTICE_LANGS.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-ink-400">
            Contact (controller / DPO)
            <input name="contact" defaultValue={contact ?? ""} placeholder="e.g. Acme S.p.A., Via Roma 1, Milano — privacy@acme.com" className="field" />
          </label>
          <button className="btn btn-secondary">Update</button>
        </form>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-400">
          <span>
            Privacy mode: <span className="text-ink-100">{privacyModeLabel(mode)}</span> — <Link href="/settings?tab=privacy" className="underline hover:text-ink-100">change</Link>
          </span>
          {hasPlaceholders && <span className="text-accent">Fill in the highlighted parts before you hand it out.</span>}
        </div>
      </div>

      <article className="rounded-xl border border-line bg-panel p-5 sm:p-8 max-w-3xl print:border-0 print:p-0 print:max-w-none" lang={lang}>
        <h1 className="text-xl font-semibold text-ink-100 leading-snug">{notice.title}</h1>
        <div className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-ink-100">
          {notice.blocks.map((b, i) =>
            "h" in b ? (
              <h2 key={i} className="text-base font-bold text-ink-100 mt-3">{b.h}</h2>
            ) : "p" in b ? (
              <p key={i}><Filled text={b.p} /></p>
            ) : (
              <ul key={i} className="list-disc pl-5 flex flex-col gap-1">
                {b.ul.map((x, j) => (
                  <li key={j}><Filled text={x} /></li>
                ))}
              </ul>
            ),
          )}
        </div>
      </article>
      <p className="text-xs text-ink-400 print:hidden max-w-3xl">
        A template, not legal advice — have it checked by your DPO or counsel. In Italy, Germany, France and Spain, involve the workers&apos; representatives before rolling angar out — templates for each country are in the{" "}
        <Link href="/trust#documents" className="underline hover:text-ink-100">Trust Center</Link>.
      </p>
    </div>
  );
}

/** Evidenzia i segnaposto [[…]] da completare. */
function Filled({ text }: { text: string }) {
  const parts = text.split(/(\[\[.+?\]\])/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("[[") ? (
          <mark key={i} className="bg-accent/15 text-ink-100 rounded-[2px] px-1">[{p.slice(2, -2)}]</mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
