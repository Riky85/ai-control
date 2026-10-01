"use client";

import { useState, useTransition } from "react";
import { submitLeadAction, type LeadFormResult } from "@/lib/lead-actions";
import { EMPLOYEE_RANGES, type CommonCopy } from "@/lib/i18n-partners";

const field = "field w-full";
const labelCls = "flex flex-col gap-1.5 text-sm text-ink-400 min-w-0";

/**
 * Modulo di candidatura per /partners (kind "partner") e /pilot (kind "pilot").
 * Testi dal dizionario della pagina; i paesi arrivano già tradotti dal server.
 */
export default function LeadForm({
  kind,
  lang,
  copy,
  countries,
  submit,
  messagePh,
}: {
  kind: "partner" | "pilot";
  lang: string;
  copy: CommonCopy["form"];
  countries: { code: string; name: string }[];
  submit: string;
  messagePh: string;
}) {
  const [result, setResult] = useState<LeadFormResult | null>(null);
  const [pending, start] = useTransition();
  const opt = <span className="text-ink-400/80 font-normal"> · {copy.optional}</span>;

  if (result?.ok) {
    return (
      <div className="flex flex-col items-start gap-3 py-6 animate-rise" role="status">
        <span className="h-10 w-10 rounded-full bg-steady/10 text-steady flex items-center justify-center" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h3 className="font-display text-xl font-semibold text-ink-100">{copy.thanksTitle}</h3>
        <p className="text-sm text-ink-400 max-w-md">{copy.thanksBody}</p>
      </div>
    );
  }

  return (
    <form action={(fd) => start(async () => setResult(await submitLeadAction(fd)))} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="lang" value={lang} />
      {/* Esca per i bot: invisibile alle persone, ignorata dai lettori di schermo. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className={labelCls}>
        {copy.name}
        <input name="name" required maxLength={120} autoComplete="name" className={field} />
      </label>
      <label className={labelCls}>
        {kind === "partner" ? copy.firm : copy.company}
        <input name="company" required maxLength={160} autoComplete="organization" className={field} />
      </label>
      <label className={labelCls}>
        {copy.email}
        <input name="email" type="email" required maxLength={200} autoComplete="email" className={field} />
      </label>
      <label className={labelCls}>
        {copy.country}
        <select name="country" required defaultValue="" className={field}>
          <option value="" disabled>
            {copy.countryPick}
          </option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {kind === "partner" ? (
        <label className={labelCls}>
          {copy.clients}
          <input name="clients" type="number" inputMode="numeric" required min={0} max={100000} className={field} />
        </label>
      ) : (
        <label className={labelCls}>
          <span>
            {copy.employees}
            {opt}
          </span>
          <select name="employees" defaultValue="" className={field}>
            <option value="">{copy.employeesPick}</option>
            {EMPLOYEE_RANGES.map((r) => (
              <option key={r} value={r}>
                {r.replace("-", "–")}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={labelCls}>
        <span>
          {copy.phone}
          {opt}
        </span>
        <input name="phone" type="tel" maxLength={40} autoComplete="tel" className={field} />
      </label>
      <label className={`${labelCls} sm:col-span-2`}>
        <span>
          {copy.message}
          {opt}
        </span>
        <textarea name="message" rows={3} maxLength={2000} placeholder={messagePh} className={`${field} !h-auto py-2 resize-y`} />
      </label>
      {result && !result.ok && (
        <p className="sm:col-span-2 rounded-lg bg-alarm/10 px-3.5 py-2.5 text-sm text-alarm" role="alert">
          {copy.errors[result.code]}
        </p>
      )}
      <div className="sm:col-span-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
        <p className="text-xs text-ink-400">{copy.privacy}</p>
        <button disabled={pending} className="btn btn-primary h-10 px-5 disabled:opacity-60 shrink-0">
          {pending ? copy.sending : submit}
        </button>
      </div>
    </form>
  );
}
