import { db } from "@/lib/db";
import { computeSavings, loadAssets, monthlyOf } from "@/lib/savings";
import { NAV_PAGES, fuzzyScore } from "@/lib/search-index";
import { fmtEur } from "@/lib/format";

/**
 * Comandi in linguaggio naturale (scritti o a voce), in italiano o inglese:
 * domande sui dati del workspace ("quanto spendiamo per ChatGPT?"),
 * navigazione ("apri i budget") e azioni con conferma ("blocca DeepSeek").
 * Regole deterministiche sui dati del database: niente modello AI, niente
 * dati che escono dal server. Se nessuna regola capisce la frase, handled=false
 * e il chiamante passa alla documentazione.
 */
export interface CommandResult {
  handled: boolean;
  answer: string;
  href?: string;
  hrefLabel?: string;
  /** Azione da confermare con un clic (mai eseguita senza conferma). */
  confirm?: { label: string; assetId: string; status: "APPROVED" | "UNAPPROVED" };
  /** Solo navigazione: il client apre subito la pagina. */
  go?: boolean;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const IT_WORDS = /\b(quanto|quanti|quante|quali|quale|mostra|apri|vai|spendiamo|spendo|costa|costano|risparmi\w*|chi|usa|usano|approva|blocca|vieta|posti|licenze|nuove|nuovi|impostazioni|dove|come|abbiamo|ci sono|dammi|fammi|installa|collega|questo mese|cosa|rivedere|possiamo|puoi|nostr\w*|funziona|serve|perche)\b/;

const has = (t: string, re: RegExp) => re.test(t);

const COST = /\b(spend\w*|spesa|spese|cost\w*|pay\w*|paghiamo|pago|bill\w*|budget speso|quanto)\b/;
const SAVE = /\b(sav\w*|risparm\w*|cheaper|ridurre|ridurre i costi|cut|waste|spreco)\b/;
const REVIEW = /\b(review\w*|da rivedere|revision\w*|pending|in attesa|da approvare|decid\w*)\b/;
const SEATS = /\b(seat|seats|posti|licenz\w*|license\w*)\b/;
const UNUSED = /\b(unused|idle|inactive|non usat\w*|inutilizzat\w*|inattiv\w*|liber\w*|nobody|nessuno)\b/;
const USERS = /\b(who|chi|users?|utenti|persone|people|usa|usano|uses|use)\b/;
const NEW = /\b(new|nuov\w*|recent\w*|ultim\w*|appears?|comparse|trovat\w*)\b/;
const COUNT = /\b(how many|quante|quanti|numero|count)\b/;
const OPEN = /\b(open|go to|goto|show|apri|vai a|vai|mostra|portami|take me)\b/;
const APPROVE = /^(?:please |per favore )?(approve|allow|approva|consenti|autorizza|permetti)\s+(.+)$/;
const BLOCK = /^(?:please |per favore )?(block|ban|disallow|reject|blocca|vieta|rifiuta|non consentire|non permettere)\s+(.+)$/;

/** Pagine riconosciute a voce, con parole italiane e inglesi. */
const PAGES: { href: string; label: string; words: RegExp }[] = [
  { href: "/savings", label: "Savings", words: /\b(savings?|risparmi\w*)\b/ },
  { href: "/usage", label: "Usage", words: /\b(usage|utilizzo|uso)\b/ },
  { href: "/review", label: "To review", words: /\b(review|da rivedere)\b/ },
  { href: "/budgets", label: "Budgets", words: /\b(budgets?)\b/ },
  { href: "/governance", label: "Governance", words: /\b(governance|policy|policies|regole|ai act|compliance|conformita)\b/ },
  { href: "/connect", label: "Connect", words: /\b(connect|collega\w*|connessioni|fonti di dati)\b/ },
  { href: "/sources", label: "Sources", words: /\b(sources|fonti|estratto conto|bank|banca|fatture|invoices)\b/ },
  { href: "/download", label: "Desktop app", words: /\b(desktop|app desktop|download|scarica|installa\w*|computer)\b/ },
  { href: "/edge/sensors", label: "angar Edge", words: /\b(edge|sensor\w*|sensori|rete|network|dns|firewall)\b/ },
  { href: "/connectors", label: "AI provider keys", words: /\b(api keys?|chiav\w*|keys?)\b/ },
  { href: "/settings", label: "Settings", words: /\b(settings|impostazioni)\b/ },
  { href: "/workspace", label: "Workspace", words: /\b(workspace|membri|members|invit\w*|colleghi)\b/ },
  { href: "/billing", label: "Plan & billing", words: /\b(billing|plan|piano|abbonamento|fattura\w* angar)\b/ },
  { href: "/report", label: "Monthly report", words: /\b(report|resoconto|riepilogo)\b/ },
  { href: "/alerts", label: "Alerts", words: /\b(alerts?|avvisi|notifiche|renewals?|rinnovi)\b/ },
  { href: "/docs", label: "Documentation", words: /\b(docs|documentation|documentazione|guida|help|aiuto)\b/ },
  { href: "/", label: "Overview", words: /\b(overview|home|panoramica|dashboard)\b/ },
];

type Asset = Awaited<ReturnType<typeof loadAssets>>[number];

/** L'AI nominata nella frase (nome o fornitore), la più specifica. */
function mentioned(t: string, assets: Asset[]): Asset | null {
  let best: { a: Asset; len: number } | null = null;
  for (const a of assets) {
    for (const n of [a.name, a.vendor ?? ""]) {
      const k = norm(n);
      if (k.length < 3) continue;
      const re = new RegExp(`(^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);
      if (re.test(t) && (!best || k.length > best.len)) best = { a, len: k.length };
    }
  }
  return best?.a ?? null;
}

/** Miglior AI per un nome detto a voce (tollerante: "chat gpt" → ChatGPT). */
function byName(name: string, assets: Asset[]): Asset | null {
  const q = norm(name).replace(/\b(the|il|lo|la|l|i|gli|le|app|ai)\b/g, "").trim();
  if (!q) return null;
  let best: { a: Asset; s: number } | null = null;
  for (const a of assets) {
    const s = Math.max(fuzzyScore(q, a.name), fuzzyScore(q.replace(/\s/g, ""), a.name.toLowerCase().replace(/\s/g, "")), a.vendor ? fuzzyScore(q, a.vendor) - 10 : 0);
    if (s >= 50 && (!best || s > best.s)) best = { a, s };
  }
  return best?.a ?? null;
}

export async function runCommand(orgId: string, text: string): Promise<CommandResult> {
  const t = norm(text);
  if (!t) return { handled: false, answer: "" };
  const it = IT_WORDS.test(t);
  const L = (en: string, itText: string) => (it ? itText : en);

  const assets = await loadAssets(orgId, { includeRejected: true });
  const live = assets.filter((a) => a.status !== "UNAPPROVED");

  // ——— Azioni (sempre con conferma) ———
  const ap = t.match(APPROVE);
  const bl = t.match(BLOCK);
  if (ap || bl) {
    const a = byName((ap ?? bl)![2], assets);
    if (!a) return { handled: true, answer: L(`I can't find "${(ap ?? bl)![2]}" among your AI.`, `Non trovo "${(ap ?? bl)![2]}" tra le vostre AI.`), href: "/", hrefLabel: "Overview" };
    const status = ap ? "APPROVED" : "UNAPPROVED";
    if (a.status === status) return { handled: true, answer: L(`${a.name} is already ${ap ? "approved" : "not allowed"}.`, `${a.name} è già ${ap ? "approvata" : "non consentita"}.`), href: `/assets/${a.id}`, hrefLabel: a.name };
    return {
      handled: true,
      answer: ap
        ? L(`Approve ${a.name} for the whole company?`, `Approvo ${a.name} per tutta l'azienda?`)
        : L(`Mark ${a.name} as not allowed? People using it will see a gentle message, and angar Edge blocks it on the network.`, `Segno ${a.name} come non consentita? Chi la usa vedrà un messaggio e angar Edge la blocca in rete.`),
      confirm: { label: ap ? L("Approve", "Approva") : L("Not allowed", "Non consentire"), assetId: a.id, status },
      href: `/assets/${a.id}`,
      hrefLabel: a.name,
    };
  }

  const one = mentioned(t, assets);

  // ——— Domande su una singola AI ———
  if (one && (has(t, COST) || has(t, USERS) || has(t, SEATS) || has(t, OPEN))) {
    const m = monthlyOf(one);
    const users = one.usages.length;
    const seats = one.cost?.seats ?? null;
    const status = one.status === "APPROVED" ? L("approved", "approvata") : one.status === "UNAPPROVED" ? L("not allowed", "non consentita") : L("to review", "da rivedere");
    const parts = [
      m ? L(`${fmtEur(m.eur)} a month${m.estimated ? " (estimated)" : ""}`, `${fmtEur(m.eur)} al mese${m.estimated ? " (stima)" : ""}`) : L("no cost found yet", "nessun costo trovato"),
      L(`${users} ${users === 1 ? "person uses it" : "people use it"}`, `${users} ${users === 1 ? "persona la usa" : "persone la usano"}`),
      seats ? L(`${seats} seats paid`, `${seats} posti pagati`) : null,
      status,
    ].filter(Boolean);
    return { handled: true, answer: `${one.name}: ${parts.join(" · ")}.`, href: `/assets/${one.id}`, hrefLabel: L(`Open ${one.name}`, `Apri ${one.name}`) };
  }

  // ——— Posti inutilizzati ———
  if (has(t, SEATS) && (has(t, UNUSED) || has(t, SAVE))) {
    const s = await computeSavings(orgId);
    const seats = s.items.filter((i) => i.kind === "seats" || i.kind === "idle");
    const eur = seats.reduce((n, i) => n + i.monthlyEur, 0);
    return {
      handled: true,
      answer: seats.length
        ? L(`${seats.length} ${seats.length === 1 ? "AI has" : "AI have"} seats nobody uses — about ${fmtEur(eur)} a month. Biggest: ${seats[0].title}.`, `${seats.length} AI ${seats.length === 1 ? "ha" : "hanno"} posti che nessuno usa — circa ${fmtEur(eur)} al mese. Il più grande: ${seats[0].title}.`)
        : L("No unused seats found. angar needs Microsoft 365, Google Workspace or the desktop app to know who is active.", "Nessun posto inutilizzato. Per sapere chi è attivo servono Microsoft 365, Google Workspace o l'app desktop."),
      href: "/usage",
      hrefLabel: L("Open Usage", "Apri Usage"),
    };
  }

  // ——— Risparmi ———
  if (has(t, SAVE)) {
    const s = await computeSavings(orgId);
    const top = [...s.items].sort((a, b) => b.monthlyEur - a.monthlyEur)[0];
    return {
      handled: true,
      answer: top
        ? L(`You could save about ${fmtEur(s.totalMonthly)} a month (${fmtEur(s.totalMonthly * 12)} a year). Start with: ${top.title} — ${fmtEur(top.monthlyEur)} a month.`, `Potete risparmiare circa ${fmtEur(s.totalMonthly)} al mese (${fmtEur(s.totalMonthly * 12)} all'anno). Iniziate da: ${top.title} — ${fmtEur(top.monthlyEur)} al mese.`)
        : L("Nothing to save right now. Add a bank statement if angar doesn't know your costs yet.", "Niente da risparmiare al momento. Se angar non conosce ancora i costi, aggiungete un estratto conto."),
      href: "/savings",
      hrefLabel: L("Open Savings", "Apri Savings"),
    };
  }

  // ——— Da rivedere ———
  if (has(t, REVIEW)) {
    const pending = live.filter((a) => a.status === "UNKNOWN" || a.status === "UNREVIEWED");
    return {
      handled: true,
      answer: pending.length
        ? L(`${pending.length} AI waiting for a decision: ${pending.slice(0, 4).map((a) => a.name).join(", ")}${pending.length > 4 ? "…" : "."}`, `${pending.length} AI in attesa di una decisione: ${pending.slice(0, 4).map((a) => a.name).join(", ")}${pending.length > 4 ? "…" : "."}`)
        : L("Nothing to review — all caught up.", "Niente da rivedere, tutto in ordine."),
      href: "/review",
      hrefLabel: L("Open To review", "Apri To review"),
    };
  }

  // ——— Nuove AI ———
  if (has(t, NEW) && /\b(ai|tool\w*|app\w*|strument\w*|servizi)\b/.test(t)) {
    const since = Date.now() - 30 * 86_400_000;
    const fresh = live.filter((a) => a.createdAt.getTime() > since);
    return {
      handled: true,
      answer: fresh.length
        ? L(`${fresh.length} new AI in the last 30 days: ${fresh.slice(0, 5).map((a) => a.name).join(", ")}${fresh.length > 5 ? "…" : "."}`, `${fresh.length} nuove AI negli ultimi 30 giorni: ${fresh.slice(0, 5).map((a) => a.name).join(", ")}${fresh.length > 5 ? "…" : "."}`)
        : L("No new AI in the last 30 days.", "Nessuna nuova AI negli ultimi 30 giorni."),
      href: "/",
      hrefLabel: "Overview",
    };
  }

  // ——— Spesa totale ———
  if (has(t, COST)) {
    const rows = live.map((a) => ({ a, m: monthlyOf(a) })).filter((r) => r.m && r.m.eur > 0) as { a: Asset; m: { eur: number; estimated: boolean } }[];
    const total = rows.reduce((n, r) => n + r.m.eur, 0);
    rows.sort((x, y) => y.m.eur - x.m.eur);
    const top = rows.slice(0, 3).map((r) => `${r.a.name} ${fmtEur(r.m.eur)}`).join(", ");
    return {
      handled: true,
      answer: rows.length
        ? L(`About ${fmtEur(total)} a month on AI (${fmtEur(total * 12)} a year) across ${rows.length} ${rows.length === 1 ? "tool" : "tools"}. Biggest: ${top}.`, `Circa ${fmtEur(total)} al mese in AI (${fmtEur(total * 12)} all'anno) su ${rows.length} ${rows.length === 1 ? "strumento" : "strumenti"}. I più cari: ${top}.`)
        : L("angar doesn't know your AI costs yet — drop a bank statement in Sources.", "angar non conosce ancora i costi dell'AI: caricate un estratto conto in Sources."),
      href: rows.length ? "/report" : "/sources",
      hrefLabel: rows.length ? L("Open the report", "Apri il report") : L("Add costs", "Aggiungi i costi"),
    };
  }

  // ——— Quante AI ———
  if (has(t, COUNT) && /\b(ai|tool\w*|strument\w*)\b/.test(t)) {
    const unpaid = live.filter((a) => !monthlyOf(a)).length;
    return {
      handled: true,
      answer: L(`${live.length} AI in use, ${unpaid} of them not paid by the company.`, `${live.length} AI in uso, di cui ${unpaid} non ${unpaid === 1 ? "pagata" : "pagate"} dall'azienda.`),
      href: "/",
      hrefLabel: "Overview",
    };
  }

  // "Come si fa…" / "cos'è…": risponde la documentazione, non la navigazione.
  if (/^(how|come|cos e|cosa e|cosa fa|che cos|what is|what does|what are|why|perche|spiegami|explain)\b/.test(t)) return { handled: false, answer: "" };

  // ——— Navigazione ———
  const page = PAGES.find((p) => p.words.test(t));
  if (page) return { handled: true, go: true, answer: L(`Opening ${page.label}.`, `Apro ${page.label}.`), href: page.href, hrefLabel: page.label };
  if (one) return { handled: true, go: true, answer: L(`Opening ${one.name}.`, `Apro ${one.name}.`), href: `/assets/${one.id}`, hrefLabel: one.name };
  if (has(t, OPEN)) {
    const q = t.replace(OPEN, "").trim();
    const nav = NAV_PAGES.map((p) => ({ p, s: Math.max(fuzzyScore(q, p.label), fuzzyScore(q, p.keywords) - 25) })).sort((a, b) => b.s - a.s)[0];
    if (nav && nav.s >= 50) return { handled: true, go: true, answer: L(`Opening ${nav.p.label}.`, `Apro ${nav.p.label}.`), href: nav.p.href, hrefLabel: nav.p.label };
  }

  return { handled: false, answer: "" };
}

/** Riassunto compatto del workspace (solo numeri e nomi delle AI, mai persone) per l'assistente AI. */
export async function workspaceBrief(orgId: string): Promise<string> {
  const [assets, savings] = await Promise.all([loadAssets(orgId, { includeRejected: true }), computeSavings(orgId)]);
  const lines = assets.slice(0, 60).map((a) => {
    const m = monthlyOf(a);
    return `- ${a.name}${a.vendor ? ` (${a.vendor})` : ""}: ${a.status.toLowerCase()}, ${m ? `${fmtEur(m.eur)}/month${m.estimated ? " est." : ""}` : "no cost"}, ${a.usages.length} users${a.cost?.seats ? `, ${a.cost.seats} seats` : ""}`;
  });
  const top = [...savings.items].sort((a, b) => b.monthlyEur - a.monthlyEur).slice(0, 5).map((s) => `- ${s.title}: ${fmtEur(s.monthlyEur)}/month`);
  const pending = await db.aiAsset.count({ where: { organizationId: orgId, deletedAt: null, status: { in: ["UNKNOWN", "UNREVIEWED"] } } });
  return `AI in this workspace:\n${lines.join("\n") || "- none yet"}\nPossible savings: ${fmtEur(savings.totalMonthly)}/month\n${top.join("\n")}\nWaiting for review: ${pending}`;
}
