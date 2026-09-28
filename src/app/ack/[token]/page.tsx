import Link from "next/link";
import { db } from "@/lib/db";
import { Wordmark } from "@/components/Logo";
import { resolveAckToken, loadPolicySnapshot } from "@/lib/policy-ack";
import { LITERACY, LITERACY_LANGS, LANG_LABEL, QUIZ_TOTAL, pickLang, scoreQuiz } from "@/lib/literacy";
import { submitAckAction } from "@/lib/policy-ack-actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "AI policy", robots: { index: false, follow: false } };

// Pagina pubblica dal link nell'email (o dal link generico): policy AI
// dell'azienda + mini-modulo di AI literacy. La conferma si registra solo col
// pulsante (gli antivirus che aprono i link non confermano al posto della persona).
export default async function AckPage({ params, searchParams }: { params: { token: string }; searchParams: { lang?: string; done?: string; a?: string; err?: string } }) {
  const target = await resolveAckToken(params.token);
  const org = target ? await db.organization.findUnique({ where: { id: target.orgId }, select: { name: true, country: true } }) : null;
  const snap = target && org ? await loadPolicySnapshot(target.orgId, target.version) : null;
  const lang = pickLang(searchParams.lang, org?.country);
  const t = LITERACY[lang];

  if (target?.kind === "personal" && !target.row.openedAt && !target.row.acknowledgedAt) {
    await db.policyAck.updateMany({ where: { id: target.row.id, openedAt: null }, data: { openedAt: new Date() } }).catch(() => {});
  }

  const answers = /^[0-9]{5}$/.test(searchParams.a ?? "") ? searchParams.a!.split("").map(Number) : null;
  const personalDone = target?.kind === "personal" && !!target.row.acknowledgedAt;
  const done = personalDone || (searchParams.done === "1" && !!answers);
  const score = answers ? scoreQuiz(Object.fromEntries(t.questions.map((q, i) => [q.id, answers[i]])), lang) : target?.kind === "personal" ? target.row.quizScore : null;

  return (
    <div className="force-dark min-h-screen bg-sidebar text-ink-100 flex flex-col items-center px-4 sm:px-6 py-10 gap-8">
      <div className="w-full max-w-2xl flex items-center justify-between">
        <Wordmark size={22} />
        <nav className="flex gap-1 text-xs">
          {LITERACY_LANGS.map((l) => (
            <Link key={l} href={`/ack/${encodeURIComponent(params.token)}?lang=${l}${done && answers ? `&done=1&a=${searchParams.a}` : ""}`} className={`px-2 py-1 rounded-md ${l === lang ? "bg-panel text-ink-100" : "text-ink-400 hover:text-ink-100"}`}>
              {LANG_LABEL[l]}
            </Link>
          ))}
        </nav>
      </div>

      <div className="w-full max-w-2xl rounded-2xl border border-line bg-panel p-6 sm:p-8 flex flex-col gap-6">
        {!target || !org || !snap ? (
          <>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{t.ui.invalidTitle}</h1>
            <p className="text-sm text-ink-400">{t.ui.invalidBody}</p>
          </>
        ) : done ? (
          <>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">{t.ui.doneTitle}</h1>
              <p className="text-sm text-ink-400 mt-2">
                {personalDone && !answers && target.kind === "personal"
                  ? t.ui.alreadyDone(target.row.acknowledgedAt!.toISOString().slice(0, 10))
                  : t.ui.doneBody(score ?? 0, QUIZ_TOTAL)}
              </p>
            </div>
            <ol className="flex flex-col gap-4">
              {t.questions.map((q, i) => {
                const mine = answers ? answers[i] : null;
                return (
                  <li key={q.id} className="flex flex-col gap-1">
                    <div className="text-sm font-medium text-ink-100">{i + 1}. {q.q}</div>
                    <div className="text-sm text-steady">{t.ui.correctLabel}: {q.options[q.correct]}</div>
                    {mine != null && mine !== q.correct && <div className="text-sm text-alarm">{t.ui.yourAnswer}: {q.options[mine]}</div>}
                    <div className="text-xs text-ink-400">{q.why}</div>
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <form action={submitAckAction} className="flex flex-col gap-6">
            <input type="hidden" name="token" value={params.token} />
            <input type="hidden" name="lang" value={lang} />
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">{t.ui.title} — {snap.orgName}</h1>
              <p className="text-sm text-ink-400 mt-2">{t.ui.intro(snap.orgName)}</p>
            </div>

            <section className="flex flex-col gap-4">
              <h2 className="text-base font-semibold">{t.ui.rulesHeading}</h2>
              <ul className="list-disc pl-5 text-sm text-ink-100 flex flex-col gap-1.5">
                {t.rules.map((r) => <li key={r}>{r}</li>)}
              </ul>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-steady">{t.ui.approvedHeading}</h3>
                  <p className="text-sm text-ink-400 mt-1">{snap.approved.length ? snap.approved.join(", ") : t.ui.none}</p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-alarm">{t.ui.notAllowedHeading}</h3>
                  <p className="text-sm text-ink-400 mt-1">{snap.notAllowed.length ? snap.notAllowed.join(", ") : "—"}</p>
                </div>
              </div>
              {snap.rules.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold">{t.ui.companyRulesHeading}</h3>
                  <ul className="mt-1 flex flex-col gap-1.5">
                    {snap.rules.map((r) => (
                      <li key={r.name} className="text-sm">
                        <span className="text-ink-100 font-medium">{r.name}.</span> <span className="text-ink-400">{r.description}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className="flex flex-col gap-4 border-t border-line pt-6">
              <div>
                <h2 className="text-base font-semibold">{t.ui.quizHeading}</h2>
                <p className="text-xs text-ink-400 mt-1">{t.ui.quizIntro}</p>
              </div>
              {searchParams.err === "answers" && <p className="text-sm text-alarm">{t.ui.answerAll}</p>}
              {searchParams.err === "rate" && <p className="text-sm text-alarm">Too many attempts — try again in a minute.</p>}
              {t.questions.map((q, i) => (
                <fieldset key={q.id} className="flex flex-col gap-2">
                  <legend className="text-sm font-medium text-ink-100 mb-1">{i + 1}. {q.q}</legend>
                  {q.options.map((o, j) => (
                    <label key={j} className="flex items-start gap-3 rounded-lg border border-line px-3 py-2 text-sm cursor-pointer hover:border-ink-400 has-[:checked]:border-accent">
                      <input type="radio" name={q.id} value={j} required className="mt-1 accent-accent" />
                      <span>{o}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </section>

            <button className="btn btn-primary !h-11 !rounded-xl">{t.ui.button}</button>
            <p className="text-xs text-ink-400">{t.ui.footer}</p>
          </form>
        )}
      </div>
    </div>
  );
}
