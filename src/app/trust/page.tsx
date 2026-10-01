import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { currentSession } from "@/lib/auth";
import { COLLECTED, EU_ONLY, HOSTING, MEASURES, MIN_GROUP, NEVER_COLLECTED, ROADMAP, SUB_PROCESSORS, USAGE_RETENTION_MONTHS } from "@/lib/trust";
import { aiAnswersAvailable, euOnlyDeployment } from "@/lib/eu-only";
import { emailTransport } from "@/lib/mail";
import { PRIVACY_MODES } from "@/lib/privacy";
import { TRUST_DOCS } from "@/lib/trust-docs";
import { TrustFooter, TrustHeader, TRUST_REVIEWED } from "@/components/trust/TrustChrome";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trust Center — angar",
  description: "Where angar keeps your data, what it collects and never collects, sub-processors, security measures and ready-to-use GDPR documents.",
};

// Trust Center pubblico: fatti presi da src/lib/trust.ts (lo stesso testo dei documenti).
export default function TrustPage() {
  const signedIn = !!currentSession();
  const always = SUB_PROCESSORS.filter((s) => s.when === "always");
  const optional = SUB_PROCESSORS.filter((s) => s.when === "optional");
  // Stato reale di questo deployment, letto dall'ambiente a ogni richiesta: mai dichiarare più di così.
  const euOn = euOnlyDeployment();
  const mail = emailTransport();
  const mailText = mail === "smtp" ? "Email goes through this deployment's own SMTP server." : mail === "resend" ? "Email is sent through Resend." : "Email is not set up.";
  const aiText = euOn ? "AI answers are off: nothing is sent to Anthropic." : aiAnswersAvailable() ? "AI answers are available; any workspace can keep them inside the EU from Settings → Privacy." : "AI answers are not offered on this deployment.";

  return (
    <div className={signedIn ? "" : "min-h-screen bg-panel"}>
      {!signedIn && <TrustHeader />}
      <div className={signedIn ? "max-w-5xl" : "max-w-5xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-10"}>
        {/* Apertura */}
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-wide text-ink-400">Trust Center</div>
          <h1 className="font-display text-[32px] sm:text-[40px] leading-[1.1] font-semibold tracking-tight text-ink-100 mt-2">How angar protects your data</h1>
          <p className="text-[15px] text-ink-400 mt-4 leading-relaxed">
            angar shows which AI your company uses and what it costs. To do that it needs very little: names of AI tools, minutes and charges. Never what anyone writes. This page sets out where the data lives, who processes it and what we do to protect it — written from what the software actually does.
          </p>
        </div>

        <dl className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line rounded-xl border border-line overflow-hidden">
          <Fact term="Hosted in the EU" detail={`${HOSTING.provider}, ${HOSTING.region} — the Netherlands`} />
          <Fact term="No content, ever" detail="Never prompts, chats, files, URLs or keystrokes" />
          <Fact term="Private by default" detail={`New workspaces show department totals for groups of ${MIN_GROUP}+`} />
          <Fact term="Encrypted credentials" detail="AES-256-GCM at rest, removed on disconnect" />
        </dl>

        <nav aria-label="On this page" className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {[
            ["#data", "Where data lives"],
            ["#eu-only", "EU-only mode"],
            ["#collect", "What we collect"],
            ["#privacy", "Employee privacy"],
            ["#security", "Security"],
            ["#subprocessors", "Sub-processors"],
            ["#certifications", "Certifications"],
            ["#documents", "Documents"],
          ].map(([href, label]) => (
            <a key={href} href={href} className="text-ink-400 hover:text-ink-100 underline-offset-4 hover:underline">{label}</a>
          ))}
        </nav>

        <Section id="data" title="Where your data lives" lead="One region, in the EU.">
          <ul className="flex flex-col gap-3 text-[15px] text-ink-100 leading-relaxed">
            <li>The application and its database run on {HOSTING.provider} in the <b className="font-medium">{HOSTING.region}</b> region, in {HOSTING.country}. Nightly backups are kept with the same hosting provider.</li>
            <li>Usage data from the desktop app, browser extension and angar Edge is deleted automatically after <b className="font-medium">{USAGE_RETENTION_MONTHS} months</b>.</li>
            <li>When your contract ends, your workspace data is deleted within 30 days (see the <Link href="/trust/docs/dpa" className="underline hover:text-ink-400">DPA</Link>, section 12).</li>
            <li>
              Prefer to keep everything in-house? The <b className="font-medium">on-premises edition</b> runs the same software on a server in your network, and data never leaves it.
            </li>
          </ul>
        </Section>

        <Section id="eu-only" title="EU-only mode" lead="What stays in the EU, what doesn't, and how to turn it on.">
          <div className="rounded-xl border border-line px-4 sm:px-5 py-3.5">
            <div className="text-sm font-medium text-ink-100">This deployment: EU-only mode {euOn ? "on" : "off"}</div>
            <p className="text-sm text-ink-400 mt-1 leading-relaxed">
              {aiText} {mailText}
              {!euOn && " Until EU-only mode is on, this deployment does not claim that data stays in the EU."}
            </p>
          </div>
          <p className="text-[15px] text-ink-100 mt-6 leading-relaxed max-w-3xl">
            With EU-only mode on and an SMTP server in the EU, customer workspace data never leaves the EU. Every point below is enforced by the software; the only exceptions are billing details and services you connect yourself.
          </p>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
            <div>
              <h3 className="text-sm font-semibold text-ink-100">Stays in the EU</h3>
              <BulletList items={EU_ONLY.stays} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink-100">Still outside this mode</h3>
              <BulletList items={EU_ONLY.outside} />
            </div>
          </div>
          <h3 className="text-sm font-semibold text-ink-100 mt-8 mb-3">Turn it on</h3>
          <div className="rounded-xl border border-line divide-y divide-line">
            {EU_ONLY.turnOn.map((t) => (
              <div key={t.who} className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-1 md:gap-6 px-4 sm:px-5 py-3.5">
                <div className="text-sm font-medium text-ink-100">{t.who}</div>
                <div className="text-sm text-ink-400 leading-relaxed">{t.text}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section id="collect" title="What angar collects" lead="Only what is needed to count AI tools, use and cost.">
          <div className="rounded-xl border border-line divide-y divide-line">
            {COLLECTED.map((c) => (
              <div key={c.source} className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-1 md:gap-6 px-4 sm:px-5 py-3.5">
                <div className="text-sm font-medium text-ink-100">{c.source}</div>
                <div className="text-sm text-ink-400 leading-relaxed">{c.text}</div>
              </div>
            ))}
          </div>
          <h3 className="text-sm font-semibold text-ink-100 mt-8 mb-3">Never collected</h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {NEVER_COLLECTED.map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-sm text-ink-100">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="mt-[3px] shrink-0 text-ink-400" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                {t}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="privacy" title="Employee privacy" lead="Three modes. New workspaces start aggregated.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[PRIVACY_MODES.find((m) => m.id === "department")!, PRIVACY_MODES.find((m) => m.id === "anonymous")!, PRIVACY_MODES.find((m) => m.id === "individual")!].map((m) => (
              <div key={m.id} className={`rounded-xl border p-4 ${m.id === "department" ? "border-ink-400" : "border-line"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-ink-100">{m.label}</div>
                  {m.id === "department" && <span className="text-[11px] font-medium text-accent">Default</span>}
                </div>
                <p className="text-sm text-ink-400 mt-1.5 leading-relaxed">{m.description}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-ink-400 mt-4 leading-relaxed max-w-3xl">
            In the aggregated modes, groups under {MIN_GROUP} people are merged into &ldquo;Other (small teams)&rdquo;, counts under {MIN_GROUP} are shown as &ldquo;&lt;{MIN_GROUP}&rdquo;, and usage is stored under a keyed pseudonym instead of an email. Switching to &ldquo;By person&rdquo; is an administrator&apos;s decision, recorded in the audit log — hand out the employee notice first and, where the law requires it, agree it with the works council or unions.
          </p>
        </Section>

        <Section id="security" title="Security measures" lead="What the software does today.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
            {MEASURES.map((g) => (
              <div key={g.title}>
                <h3 className="text-sm font-semibold text-ink-100">{g.title}</h3>
                <BulletList items={g.items} />
              </div>
            ))}
          </div>
        </Section>

        <Section id="subprocessors" title="Sub-processors" lead="Companies that process data for angar. Optional ones only receive data if you connect or use that feature.">
          <SubTable title="Always used" rows={always} />
          <SubTable title="Only if you connect it" rows={optional} className="mt-6" />
          <p className="text-sm text-ink-400 mt-4 leading-relaxed max-w-3xl">
            Services you connect yourself — Microsoft 365, Google Workspace, your AI providers, Slack, Microsoft Teams, Jira, ServiceNow — are your own processors, not angar&apos;s. We announce changes to this list here at least 30 days in advance.
          </p>
        </Section>

        <Section id="certifications" title="Certifications" lead="Where we stand, honestly.">
          <div className="rounded-xl border border-line divide-y divide-line">
            {ROADMAP.map((r) => (
              <div key={r.title} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-6 px-4 sm:px-5 py-3.5">
                <div className="sm:w-[220px] shrink-0 text-sm font-medium text-ink-100">{r.title}</div>
                <div className="flex-1 text-sm text-ink-400 leading-relaxed">{r.text}</div>
                <div className="text-xs text-ink-100 sm:text-right shrink-0">{r.status}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section id="documents" title="Documents" lead="Open, fill in the highlighted parts, then print or save as PDF.">
          <div className="rounded-xl border border-line divide-y divide-line">
            {TRUST_DOCS.map((d) => (
              <Link key={d.slug} href={`/trust/docs/${d.slug}`} className="group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 px-4 sm:px-5 py-4 hover:bg-ink-100/[0.03] transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-100">{d.title}</span>
                    <span className="text-[11px] text-ink-400 border border-line rounded px-1.5 py-px">{d.kind}</span>
                  </div>
                  <p className="text-sm text-ink-400 mt-1 leading-relaxed">{d.summary}</p>
                </div>
                <div className="text-xs text-ink-400 sm:text-right sm:w-48 shrink-0">{d.versions.map((v) => v.id.toUpperCase()).join(" · ")}</div>
                <span className="text-sm text-ink-400 group-hover:text-ink-100 shrink-0" aria-hidden>Open →</span>
              </Link>
            ))}
          </div>
          <p className="text-xs text-ink-400 mt-4 leading-relaxed max-w-3xl">
            Templates are not legal advice — have them reviewed by your labour lawyer or data protection adviser.{" "}
            {signedIn ? (
              <>
                Your <Link href="/compliance/employee-notice" className="underline hover:text-ink-100">employee notice</Link> can also be generated from the sources you have connected.
              </>
            ) : (
              "Customers can also generate the employee notice from the sources they have connected."
            )}
          </p>
        </Section>

        <TrustFooter updated={TRUST_REVIEWED} />
      </div>
    </div>
  );
}

function Fact({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="bg-panel px-5 py-4">
      <dt className="text-sm font-medium text-ink-100">{term}</dt>
      <dd className="text-sm text-ink-400 mt-1 leading-snug">{detail}</dd>
    </div>
  );
}

function Section({ id, title, lead, children }: { id: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8 mt-16 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 lg:gap-10">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink-100">{title}</h2>
        <p className="text-sm text-ink-400 mt-1.5 leading-relaxed">{lead}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="mt-2.5 flex flex-col gap-2">
      {items.map((t) => (
        <li key={t} className="text-sm text-ink-400 leading-relaxed pl-3.5 relative before:absolute before:left-0 before:top-[9px] before:h-1 before:w-1 before:rounded-full before:bg-ink-400">{t}</li>
      ))}
    </ul>
  );
}

function SubTable({ title, rows, className = "" }: { title: string; rows: typeof SUB_PROCESSORS; className?: string }) {
  return (
    <div className={className}>
      <h3 className="text-sm font-semibold text-ink-100 mb-3">{title}</h3>
      {/* Desktop: tabella; mobile: righe impilate. */}
      <div className="hidden md:block rounded-xl border border-line overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-400 border-b border-line">
              <th className="font-medium px-4 py-2.5 w-[22%]">Company</th>
              <th className="font-medium px-4 py-2.5">What for</th>
              <th className="font-medium px-4 py-2.5 w-[26%]">Location</th>
              <th className="font-medium px-4 py-2.5 w-[20%]">EU-only mode</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((s) => (
              <tr key={s.name} className="align-top">
                <td className="px-4 py-3 text-ink-100 font-medium">{s.name}</td>
                <td className="px-4 py-3 text-ink-400 leading-relaxed">
                  {s.purpose}.
                  {s.when === "optional" && <span className="block text-xs mt-1">{s.whenText}</span>}
                </td>
                <td className="px-4 py-3 text-ink-400 leading-relaxed">{s.location}</td>
                <td className={`px-4 py-3 leading-relaxed ${s.euOnly === "not-used" ? "text-ink-100" : "text-ink-400"}`}>{s.euOnlyText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden rounded-xl border border-line divide-y divide-line">
        {rows.map((s) => (
          <div key={s.name} className="px-4 py-3">
            <div className="text-sm font-medium text-ink-100">{s.name}</div>
            <div className="text-sm text-ink-400 mt-1 leading-relaxed">{s.purpose}.</div>
            <div className="text-xs text-ink-400 mt-1.5">{s.location}</div>
            {s.when === "optional" && <div className="text-xs text-ink-400 mt-0.5">{s.whenText}</div>}
            <div className="text-xs text-ink-400 mt-0.5">EU-only mode: {s.euOnlyText}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
