/**
 * Brief settimanale con decisioni one-click (lunedì mattina).
 *
 * Ogni settimana si scelgono le 3 decisioni che valgono di più tra:
 *  - una AI nuova da approvare / non consentire (costo e persone che la usano),
 *  - il risparmio più grande da accettare (pesato per confidenza),
 *  - un'anomalia (prezzo, posti, spesa) o un'AI non consentita ancora in uso,
 *  - il calo dell'angar Score con la correzione che fa guadagnare di più,
 *  - un cambiamento del mercato AI che tocca l'estate (prezzo, deprecazione, ritiro: market/).
 * Il "valore" è un numero deterministico in € equivalenti (vedi VALUE): nessun
 * LLM. Prima passata una decisione per tipo (varietà), poi le migliori rimaste.
 *
 * I pulsanti usano i link firmati di chat-actions.ts (/api/chat-action/[token]):
 * firma HMAC, scadenza 7 giorni, controllo del workspace, ruolo EDITOR+ e audit.
 * Stessi link in Slack, Teams ed email.
 */
import { monthlyOf, type Saving } from "@/lib/savings";
import type { Anomaly } from "@/lib/engine/forecast";


export type DecisionKind = "review" | "saving" | "anomaly" | "policy" | "score" | "market";

export interface DecisionCandidate {
  kind: DecisionKind;
  /** Chiave stabile: id dell'AI, chiave del risparmio o dell'anomalia. */
  id: string;
  title: string;
  detail: string;
  /** Valore in € equivalenti al mese, per ordinare. */
  value: number;
  href: string;
  /** Solo "review": l'AI da decidere. "saving": la chiave del risparmio. */
  target?: string;
}

export type ButtonStyle = "primary" | "danger" | "default";
export interface DecisionButton {
  label: string;
  url: string;
  style: ButtonStyle;
  /** Solo per Slack interattivo: approve / reject gestiti da /api/slack/interactions. */
  slackReview?: { act: "approve" | "reject"; asset: string };
}
export interface Decision extends DecisionCandidate {
  buttons: DecisionButton[];
}

/** Pesi del valore (documentati): tutto in € equivalenti al mese. */
export const VALUE = {
  reviewBase: 150,
  reviewEachActive: 15,
  savingMinEur: 5,
  confidence: { HIGH: 1, MEDIUM: 0.75, LOW: 0.5 } as Record<Saving["confidence"], number>,
  anomaly: { critical: 700, warning: 250, info: 80 } as Record<Anomaly["severity"], number>,
  policy: 500,
  scoreDropBase: 300,
  scoreDropEachPoint: 25,
  scoreDropMin: 2,
  scoreFixEachPoint: 12,
  /** Mercato AI: ritiro entro 60 giorni, altro ritiro / deprecazione; i prezzi valgono la variazione mensile. */
  marketRetireSoon: 600,
  marketLifecycle: 250,
} as const;

const KIND_ORDER: Record<DecisionKind, number> = { anomaly: 0, policy: 1, market: 2, saving: 3, review: 4, score: 5 };
const eur = (n: number) => "€" + Math.round(n).toLocaleString("en-GB");
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

// ── Candidati (funzioni pure) ─────────────────────────────────────────────

export interface ReviewInput {
  id: string;
  name: string;
  vendor: string | null;
  monthlyEur: number | null;
  activeUsers: number;
}
export function reviewCandidates(assets: ReviewInput[]): DecisionCandidate[] {
  return assets.map((a) => {
    const bits = [
      a.vendor && a.vendor !== a.name ? a.vendor : null,
      a.activeUsers > 0 ? `used by ${plural(a.activeUsers, "person", "people")} in 30 days` : "found, no known users yet",
      a.monthlyEur && a.monthlyEur > 0 ? `about ${eur(a.monthlyEur)} a month` : null,
    ].filter(Boolean);
    return {
      kind: "review" as const,
      id: a.id,
      target: a.id,
      title: `New AI to decide: ${a.name}`,
      detail: bits.join(" · "),
      value: VALUE.reviewBase + (a.monthlyEur ?? 0) + VALUE.reviewEachActive * a.activeUsers,
      href: `/assets/${a.id}`,
    };
  });
}

export function savingCandidates(items: Pick<Saving, "key" | "title" | "detail" | "monthlyEur" | "confidence" | "href">[]): DecisionCandidate[] {
  return items
    .filter((s) => s.monthlyEur >= VALUE.savingMinEur)
    .map((s) => ({
      kind: "saving" as const,
      id: s.key,
      target: s.key,
      title: `Save ${eur(s.monthlyEur)} a month: ${s.title}`,
      detail: s.detail,
      value: s.monthlyEur * (VALUE.confidence[s.confidence] ?? 0.5),
      href: s.href || "/opportunities",
    }));
}

export function anomalyCandidates(anomalies: Pick<Anomaly, "key" | "severity" | "title" | "body" | "href">[]): DecisionCandidate[] {
  return anomalies.map((a) => ({ kind: "anomaly" as const, id: a.key, title: a.title, detail: a.body, value: VALUE.anomaly[a.severity] ?? 0, href: a.href }));
}

export function policyCandidates(assets: { id: string; name: string }[]): DecisionCandidate[] {
  return assets.map((a) => ({
    kind: "policy" as const,
    id: a.id,
    title: `${a.name} is not allowed but still in use`,
    detail: "Seen in the last 7 days. Block it on the network, tell the team, or allow it if it's needed.",
    value: VALUE.policy,
    href: `/assets/${a.id}`,
  }));
}

export interface MarketInput {
  id: string;
  changeId: string;
  type: string;
  title: string;
  detail: string;
  daysUntil: number | null;
  annualDeltaEur: number | null;
}
export function marketCandidates(items: MarketInput[]): DecisionCandidate[] {
  return items.map((m) => {
    const lifecycle = m.type === "retirement" || m.type === "deprecation";
    const value = lifecycle ? (m.type === "retirement" && m.daysUntil != null && m.daysUntil <= 60 ? VALUE.marketRetireSoon : VALUE.marketLifecycle) : Math.abs(m.annualDeltaEur ?? 0) / 12;
    return { kind: "market" as const, id: m.id, title: m.title, detail: m.detail, value, href: `/market/${m.changeId}` };
  });
}

export interface ScoreInput {
  score: number;
  /** Livello (Excellent / Good / Fair / Needs attention). */
  grade: string;
  /** Punteggio di circa 7 giorni fa, stesso metodo (null se non c'è storia). */
  previous: number | null;
  /** La migliore prossima azione di "Improve my score": titolo, punti guadagnati, link. */
  top: { label: string; scoreImpact: number; href: string } | null;
}
export function scoreCandidate(s: ScoreInput): DecisionCandidate[] {
  const drop = s.previous != null ? s.previous - s.score : 0;
  const fix = s.top ? `Top fix: ${s.top.label} (+${Math.max(1, Math.round(Math.abs(s.top.scoreImpact)))} points).` : "";
  if (drop >= VALUE.scoreDropMin) {
    return [{
      kind: "score",
      id: "score",
      title: `angar Score down ${Math.round(drop)} points to ${s.score} (${s.grade})`,
      detail: fix || "Open the Score to see what changed.",
      value: VALUE.scoreDropBase + drop * VALUE.scoreDropEachPoint,
      href: s.top?.href ?? "/score",
    }];
  }
  if (s.top && s.score < 85) {
    return [{
      kind: "score",
      id: "score",
      title: `Raise your angar Score (${s.score}, ${s.grade})`,
      detail: fix,
      value: Math.abs(s.top.scoreImpact) * VALUE.scoreFixEachPoint,
      href: s.top.href,
    }];
  }
  return [];
}

/**
 * Le `n` decisioni che valgono di più: prima la migliore di ogni tipo, poi le
 * migliori rimaste. Ordine finale per valore. Deterministico a parità di input.
 */
export function pickDecisions(cands: DecisionCandidate[], n = 3): DecisionCandidate[] {
  const sorted = cands
    .filter((c) => Number.isFinite(c.value) && c.value > 0)
    .sort((a, b) => b.value - a.value || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id));
  const out: DecisionCandidate[] = [];
  const seenKinds = new Set<DecisionKind>();
  // Una policy e un'anomalia sulla stessa AI sono la stessa decisione: niente doppioni per href.
  const seenHref = new Set<string>();
  for (const c of sorted) {
    if (out.length >= n) break;
    if (seenKinds.has(c.kind) || seenHref.has(c.href + c.kind)) continue;
    out.push(c);
    seenKinds.add(c.kind);
    seenHref.add(c.href + c.kind);
  }
  for (const c of sorted) {
    if (out.length >= n) break;
    if (out.includes(c)) continue;
    out.push(c);
  }
  return out.sort((a, b) => b.value - a.value || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id));
}

/** Pulsanti di ogni decisione. `link` firma un'azione (iniettato: puro e testabile). */
export function withButtons(
  d: DecisionCandidate,
  base: string,
  link: (act: "approve" | "reject" | "accept_saving", target: string) => string
): Decision {
  const open: DecisionButton = { label: "Open", url: `${base}${d.href}`, style: "default" };
  switch (d.kind) {
    case "review":
      return {
        ...d,
        buttons: [
          { label: "Approve", url: link("approve", d.target!), style: "primary", slackReview: { act: "approve", asset: d.target! } },
          { label: "Not allowed", url: link("reject", d.target!), style: "danger", slackReview: { act: "reject", asset: d.target! } },
          open,
        ],
      };
    case "saving":
      return { ...d, buttons: [{ label: "Accept saving", url: link("accept_saving", d.target!), style: "primary" }, { ...open, url: `${base}/opportunities` }] };
    default:
      return { ...d, buttons: [open] };
  }
}

// ── Messaggi ─────────────────────────────────────────────────────────────

export interface BriefSummary {
  orgName: string;
  aiCount: number;
  monthlyEur: number;
  canSaveEur: number;
  openAlerts: number;
  base: string;
}

const FOOTNOTE = "Buttons open angar: you confirm there, signed in (editor role or higher). Links expire in 7 days.";
const slackEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const htmlEsc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function summaryLine(s: BriefSummary) {
  return [
    `${plural(s.aiCount, "AI", "AI")} in use · ${eur(s.monthlyEur)} a month`,
    s.canSaveEur >= 1 ? `${eur(s.canSaveEur)} a month to save` : null,
    s.openAlerts ? `${plural(s.openAlerts, "open alert")}` : null,
  ].filter(Boolean).join(" · ");
}

const heading = (n: number) => (n === 0 ? "Nothing to decide this week" : n === 1 ? "1 decision this week" : `${n} decisions this week`);

export function briefText(s: BriefSummary, decisions: Decision[]) {
  const lines = [`angar weekly — ${s.orgName}`, summaryLine(s), "", heading(decisions.length)];
  decisions.forEach((d, i) => {
    lines.push("", `${i + 1}. ${d.title}`, d.detail);
    for (const b of d.buttons) lines.push(`   ${b.label}: ${b.url}`);
  });
  if (decisions.some((d) => d.buttons.length > 1)) lines.push("", FOOTNOTE);
  return lines.join("\n");
}

export function briefSlackBlocks(s: BriefSummary, decisions: Decision[], interactive: boolean, orgId: string): unknown[] {
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: `*angar weekly — ${slackEsc(s.orgName)}*\n${slackEsc(summaryLine(s))}` } },
    { type: "divider" },
  ];
  decisions.forEach((d, i) => {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `*${i + 1}. ${slackEsc(d.title)}*\n${slackEsc(d.detail).slice(0, 2500)}` } });
    blocks.push({
      type: "actions",
      block_id: `brief_${i}_${d.kind}`.slice(0, 255),
      elements: d.buttons.map((b, j) => {
        const style = b.style === "default" ? {} : { style: b.style };
        if (interactive && b.slackReview) {
          return { type: "button", action_id: `angar_review_${b.slackReview.act}`, text: { type: "plain_text", text: b.label }, ...style, value: JSON.stringify({ o: orgId, a: b.slackReview.asset }) };
        }
        return { type: "button", action_id: `angar_link_brief_${i}_${j}`, text: { type: "plain_text", text: b.label }, ...style, url: b.url };
      }),
    });
  });
  if (!decisions.length) blocks.push({ type: "section", text: { type: "mrkdwn", text: "Nothing to decide this week — all tidy." } });
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: decisions.length ? FOOTNOTE : `<${s.base}|Open angar>` }] });
  return blocks;
}

export function briefTeamsCard(s: BriefSummary, decisions: Decision[]) {
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.4",
    body: [
      { type: "TextBlock", size: "Medium", weight: "Bolder", text: `angar weekly — ${s.orgName}`, wrap: true },
      { type: "TextBlock", text: summaryLine(s), isSubtle: true, wrap: true, spacing: "None" },
      ...decisions.flatMap((d, i) => [
        { type: "TextBlock", text: `**${i + 1}. ${d.title}**`, wrap: true, spacing: "Large", separator: i === 0 },
        { type: "TextBlock", text: d.detail, wrap: true, isSubtle: true, spacing: "Small" },
        { type: "ActionSet", actions: d.buttons.map((b) => ({ type: "Action.OpenUrl", title: b.label, url: b.url, ...(b.style === "primary" ? { style: "positive" } : b.style === "danger" ? { style: "destructive" } : {}) })) },
      ]),
      ...(decisions.length ? [] : [{ type: "TextBlock", text: "Nothing to decide this week — all tidy.", wrap: true, spacing: "Large" }]),
      { type: "TextBlock", text: FOOTNOTE, isSubtle: true, size: "Small", wrap: true, spacing: "Large" },
    ],
  };
}

/** Email: card compatta con gli stessi pulsanti (link firmati). */
export function briefEmailHtml(s: BriefSummary, decisions: Decision[]) {
  const btn = (b: DecisionButton) => {
    const bg = b.style === "primary" ? "#FF7323" : b.style === "danger" ? "#FFFFFF" : "#FFFFFF";
    const fg = b.style === "primary" ? "#FFFFFF" : b.style === "danger" ? "#D64545" : "#141418";
    const border = b.style === "primary" ? "#FF7323" : b.style === "danger" ? "#F0C4C4" : "#DCDCE1";
    return `<a href="${htmlEsc(b.url)}" style="display:inline-block;margin:0 6px 6px 0;padding:7px 14px;border-radius:8px;border:1px solid ${border};background:${bg};color:${fg};font-size:13px;font-weight:600;text-decoration:none">${htmlEsc(b.label)}</a>`;
  };
  const items = decisions
    .map(
      (d, i) => `<div style="border:1px solid #EBEBEF;border-radius:12px;padding:14px 16px;margin-top:10px">
<div style="font-size:11px;color:#FF7323;font-weight:600;letter-spacing:.04em">${String(i + 1).padStart(2, "0")}</div>
<div style="font-weight:600;font-size:15px;margin-top:2px">${htmlEsc(d.title)}</div>
<div style="font-size:13px;color:#5F5F69;margin:4px 0 10px">${htmlEsc(d.detail)}</div>
${d.buttons.map(btn).join("")}</div>`
    )
    .join("");
  return `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#141418;max-width:560px;margin:0 auto;padding:24px">
<div style="font-weight:600;font-size:18px">angar</div>
<div style="margin-top:14px;font-size:20px;font-weight:600">${htmlEsc(heading(decisions.length))}</div>
<div style="font-size:13px;color:#5F5F69;margin-top:2px">${htmlEsc(s.orgName)} · ${htmlEsc(summaryLine(s))}</div>
${items || `<p style="font-size:14px;color:#5F5F69">All tidy. <a href="${htmlEsc(s.base)}" style="color:#FF7323">Open angar</a></p>`}
<div style="margin-top:18px;font-size:12px;color:#5F5F69">${htmlEsc(FOOTNOTE)}</div>
<div style="margin-top:8px;font-size:12px;color:#5F5F69">You receive this weekly brief as an owner or admin of ${htmlEsc(s.orgName)} on angar.</div></div>`;
}

// ── Dal database ─────────────────────────────────────────────────────────

const DAY = 86400000;

/** Candidati della settimana per un'azienda (ognuna delle fonti può mancare senza rompere il brief). */
export async function loadBrief(orgId: string, now = new Date()) {
  const [{ db }, { computeSavings }, { detectAnomalies }, score, { countActive }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/savings"),
    import("@/lib/engine/forecast"),
    import("@/lib/engine/score"),
    import("@/lib/seats"),
  ]);
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const [org, savings, anomalies, toReview, blocked, openAlerts, result, history] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId }, select: { name: true, chatWebhookEncrypted: true } }),
    computeSavings(orgId),
    detectAnomalies(orgId).catch(() => [] as Anomaly[]),
    db.aiAsset.findMany({
      where: { organizationId: orgId, deletedAt: null, status: { in: ["UNKNOWN", "UNREVIEWED"] } },
      include: { cost: true, usages: { select: { lastSeenAt: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.aiAsset.findMany({ where: { organizationId: orgId, deletedAt: null, status: "UNAPPROVED", lastSeenAt: { gte: weekAgo } }, select: { id: true, name: true }, take: 20 }),
    db.alert.count({ where: { organizationId: orgId, readAt: null } }),
    score.computeScore(orgId).catch(() => null),
    score.scoreHistory(orgId, 14, now).catch(() => []),
  ]);
  const market = await import("@/lib/market/service").then((m) => m.briefMarketItems(orgId, now)).catch(() => [] as MarketInput[]);
  // Punteggio di riferimento: l'istantanea più vicina a 7 giorni fa (non più recente di 5 giorni).
  const target = score.romeDay(weekAgo);
  const limit = score.romeDay(new Date(now.getTime() - 5 * DAY));
  const past = history.filter((p) => p.day <= limit);
  const prev = past.length ? past.reduce((best, p) => (Math.abs(dayDiff(p.day, target)) < Math.abs(dayDiff(best.day, target)) ? p : best)) : null;

  const cands: DecisionCandidate[] = [
    ...reviewCandidates(toReview.map((a) => ({ id: a.id, name: a.name, vendor: a.vendor, monthlyEur: monthlyOf(a)?.eur ?? null, activeUsers: countActive(a.usages) }))),
    ...savingCandidates(savings.items),
    ...anomalyCandidates(anomalies),
    ...policyCandidates(blocked),
    ...marketCandidates(market),
    ...(result
      ? (() => {
          const best = score.scoreActions(result.facts, result).best;
          return scoreCandidate({ score: result.score, grade: result.levelLabel, previous: prev?.score ?? null, top: best && best.points > 0 ? { label: best.title, scoreImpact: best.points, href: "/score/improve" } : null });
        })()
      : []),
  ];
  const summary = {
    orgName: org?.name ?? "your company",
    aiCount: savings.assets.length,
    monthlyEur: savings.assets.reduce((t, a) => t + (monthlyOf(a)?.eur ?? 0), 0),
    canSaveEur: savings.totalMonthly,
    openAlerts,
  };
  return { org, summary, decisions: pickDecisions(cands, 3) };
}

const dayDiff = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / DAY;
