/**
 * Informativa ai dipendenti (art. 13 GDPR) generata dai dati dell'azienda:
 * cosa raccoglie angar secondo le fonti davvero collegate, cosa non
 * raccoglie mai, finalità, base giuridica, conservazione, modalità privacy.
 * Tre lingue: inglese, italiano (art. 4 L. 300/1970) e tedesco (§87 BetrVG).
 * I segnaposto [[…]] vanno completati dall'azienda prima di distribuirla.
 */
import { MIN_GROUP, type PrivacyMode } from "@/lib/privacy";

export type NoticeLang = "en" | "it" | "de";
export const NOTICE_LANGS: { id: NoticeLang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "it", label: "Italiano" },
  { id: "de", label: "Deutsch" },
];
export const noticeLang = (v?: string | null): NoticeLang => (v === "it" || v === "de" ? v : "en");

export interface NoticeContext {
  orgName: string;
  country: string | null;
  mode: PrivacyMode;
  contact: string | null; // chi contattare (titolare / DPO), testo libero
  retentionMonths: number;
  sources: {
    desktop: boolean;
    extension: boolean;
    microsoft365: boolean;
    google: boolean;
    edge: boolean;
    firewallBytes: boolean;
  };
  tools: string[]; // alcune AI già note in azienda, come esempio
  date: Date;
}

export type NoticeBlock = { h: string } | { p: string } | { ul: string[] };

export interface Notice {
  title: string;
  blocks: NoticeBlock[];
}

const list = (xs: string[], and: string) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${and} ${xs[xs.length - 1]}`);

export function buildEmployeeNotice(c: NoticeContext, lang: NoticeLang): Notice {
  const contact = c.contact?.trim() || null;
  const org = c.orgName;
  const s = c.sources;

  if (lang === "it") {
    const collected = [
      "Il nome degli strumenti di intelligenza artificiale usati per lavoro (per esempio ChatGPT o Microsoft Copilot) e il giorno e l'ora in cui sono stati usati.",
      s.desktop && "Dall'app angar installata sul computer aziendale: il tempo passato su ciascuno strumento di IA al giorno (per esempio \"ChatGPT, 40 minuti\") e il nome del computer.",
      s.extension && "Dall'estensione angar del browser aziendale: i nomi dei siti di IA visitati, per giorno.",
      s.microsoft365 && "Da Microsoft 365: gli accessi con l'account aziendale ad app di IA (nome dell'app e data).",
      s.google && "Da Google Workspace: le app di IA collegate all'account aziendale (nome dell'app e data).",
      s.edge && `Dalla rete aziendale (angar Edge): quali servizi di IA vengono contattati e il numero di connessioni per dispositivo${s.firewallBytes ? ", e la quantità di dati inviati (byte) ricavata dai log del firewall" : ""}.`,
      "Dall'elenco utenti aziendale: nome, email di lavoro e reparto.",
      "Costi degli abbonamenti di IA da fatture ed estratti conto aziendali (dati dell'azienda, non tuoi).",
    ].filter(Boolean) as string[];
    const modeText =
      c.mode === "individual"
        ? "Per persona: gli amministratori di angar vedono quali strumenti di IA usa ciascuna persona, per gestire le licenze (per esempio chiedere se un posto pagato e non usato serve ancora)."
        : c.mode === "department"
          ? `Per reparto: in angar non compaiono nomi, email o dispositivi, ma solo totali per reparto e solo per gruppi di almeno ${MIN_GROUP} persone. I reparti più piccoli vengono uniti.`
          : "Solo totali aziendali: in angar non compaiono nomi, dispositivi né reparti, ma solo i totali dell'intera azienda.";
    return {
      title: `Informativa ai dipendenti sull'uso di angar per la gestione degli strumenti di IA`,
      blocks: [
        { p: `${org} utilizza angar, un servizio che tiene l'inventario degli strumenti di intelligenza artificiale usati per lavoro, dei loro costi e del fatto che siano autorizzati o meno. Questa informativa, resa ai sensi dell'art. 13 del Regolamento (UE) 2016/679 (GDPR) e dell'art. 4, comma 3, della L. 300/1970 (Statuto dei lavoratori), spiega quali dati vengono raccolti e perché.` },
        { h: "1. Titolare del trattamento" },
        { p: `Titolare è ${org}. Contatti: ${contact ?? "[[nome, email e indirizzo del titolare e, se nominato, del Responsabile della protezione dei dati (DPO)]]"}. angar tratta i dati per conto di ${org} come responsabile del trattamento (art. 28 GDPR).` },
        { h: "2. Quali dati raccoglie angar" },
        { ul: collected },
        ...(c.tools.length ? [{ p: `Strumenti di IA già presenti in azienda, per esempio: ${list(c.tools, "e")}.` }] : []),
        { h: "3. Cosa angar non raccoglie mai" },
        {
          ul: [
            "Il contenuto di quello che scrivi o ricevi: richieste (prompt), risposte, messaggi, email, file e documenti.",
            "Indirizzi completi delle pagine (URL), ricerche, titoli delle pagine, schermate o tasti premuti.",
            "L'uso di siti e programmi che non sono strumenti di IA.",
            "La tua posizione e i dispositivi personali non registrati in angar.",
          ],
        },
        { h: "4. Finalità" },
        {
          ul: [
            "Controllo dei costi e delle licenze degli strumenti di IA (per esempio posti pagati e non usati).",
            "Sicurezza delle informazioni e tutela del patrimonio aziendale: individuare strumenti di IA non autorizzati a cui potrebbero essere inviati dati aziendali o personali.",
            "Conformità al Regolamento (UE) 2024/1689 (AI Act): registro delle IA usate e alfabetizzazione in materia di IA del personale (art. 4 AI Act).",
          ],
        },
        { p: `Lo strumento è adottato esclusivamente per esigenze organizzative e produttive, per la sicurezza del lavoro e per la tutela del patrimonio aziendale (art. 4, comma 1, L. 300/1970). Non viene usato per il controllo a distanza dell'attività lavorativa né per valutare la prestazione o la produttività delle persone, e i dati non vengono usati a fini disciplinari. ${"[[Estremi dell'accordo con le RSA/RSU o dell'autorizzazione dell'Ispettorato territoriale del lavoro, se richiesti]]"}.` },
        { h: "5. Come vengono mostrati i dati" },
        { p: `Modalità attuale: ${modeText}` },
        { h: "6. Base giuridica" },
        { p: `Legittimo interesse del titolare (art. 6, par. 1, lett. f GDPR) a controllare costi, sicurezza e conformità normativa degli strumenti di IA, bilanciato con i tuoi diritti: angar raccoglie solo i nomi degli strumenti e dati di utilizzo, mai contenuti. Il trattamento avviene nel rispetto dell'art. 4 L. 300/1970 e del D.Lgs. 196/2003 (Codice privacy). Puoi opporti in qualsiasi momento per motivi legati alla tua situazione particolare (art. 21 GDPR).` },
        { h: "7. Conservazione" },
        { p: `I dati di utilizzo sono conservati per ${c.retentionMonths} mesi e poi cancellati. Statistiche aggregate senza nomi possono essere conservate più a lungo. Il registro delle attività degli amministratori è conservato per la durata necessaria a dimostrare la conformità.` },
        { h: "8. Chi può vedere i dati" },
        { p: `Solo le persone di ${org} con accesso amministrativo ad angar (per esempio IT, amministrazione, responsabile della conformità), secondo la modalità indicata al punto 5, e angar come responsabile del trattamento.` },
        { h: "9. I tuoi diritti" },
        { p: `Puoi chiedere l'accesso ai tuoi dati, la rettifica, la cancellazione, la limitazione del trattamento e opporti (artt. 15–21 GDPR), scrivendo a ${contact ?? "[[contatto]]"}. Puoi anche proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).` },
        { p: `Aggiornata al ${c.date.toLocaleDateString("it-IT")}.` },
      ],
    };
  }

  if (lang === "de") {
    const collected = [
      "Die Namen der KI-Werkzeuge, die für die Arbeit genutzt werden (z. B. ChatGPT oder Microsoft Copilot), sowie Tag und Uhrzeit der Nutzung.",
      s.desktop && "Über die angar-App auf dem Firmencomputer: die Zeit pro KI-Werkzeug und Tag (z. B. \"ChatGPT, 40 Minuten\") und den Namen des Computers.",
      s.extension && "Über die angar-Erweiterung im Firmenbrowser: die Namen der besuchten KI-Websites pro Tag.",
      s.microsoft365 && "Aus Microsoft 365: Anmeldungen mit dem Firmenkonto bei KI-Apps (Name der App und Datum).",
      s.google && "Aus Google Workspace: mit dem Firmenkonto verbundene KI-Apps (Name der App und Datum).",
      s.edge && `Aus dem Firmennetz (angar Edge): welche KI-Dienste kontaktiert werden und die Anzahl der Verbindungen pro Gerät${s.firewallBytes ? " sowie die gesendete Datenmenge (Bytes) aus den Firewall-Protokollen" : ""}.`,
      "Aus dem Benutzerverzeichnis des Unternehmens: Name, dienstliche E-Mail-Adresse und Abteilung.",
      "Kosten der KI-Abonnements aus Rechnungen und Kontoauszügen des Unternehmens (Unternehmensdaten, nicht Ihre).",
    ].filter(Boolean) as string[];
    const modeText =
      c.mode === "individual"
        ? "Pro Person: Die angar-Administratoren sehen, welche KI-Werkzeuge jede Person nutzt, um Lizenzen zu verwalten (z. B. nachzufragen, ob ein bezahlter, ungenutzter Platz noch gebraucht wird)."
        : c.mode === "department"
          ? `Pro Abteilung: angar zeigt keine Namen, E-Mail-Adressen oder Geräte, sondern nur Summen pro Abteilung und nur für Gruppen von mindestens ${MIN_GROUP} Personen. Kleinere Abteilungen werden zusammengefasst.`
          : "Nur Unternehmenssummen: angar zeigt keine Namen, Geräte oder Abteilungen, sondern nur Summen für das gesamte Unternehmen.";
    return {
      title: "Information für Beschäftigte über den Einsatz von angar zur Verwaltung von KI-Werkzeugen",
      blocks: [
        { p: `${org} setzt angar ein, einen Dienst, der ein Verzeichnis der für die Arbeit genutzten KI-Werkzeuge führt, ihre Kosten erfasst und festhält, ob sie freigegeben sind. Diese Information nach Art. 13 DSGVO erklärt, welche Daten erhoben werden und warum.` },
        { h: "1. Verantwortlicher" },
        { p: `Verantwortlich ist ${org}. Kontakt: ${contact ?? "[[Name, E-Mail und Anschrift des Verantwortlichen und ggf. des/der Datenschutzbeauftragten]]"}. angar verarbeitet die Daten im Auftrag von ${org} als Auftragsverarbeiter (Art. 28 DSGVO).` },
        { h: "2. Welche Daten angar erhebt" },
        { ul: collected },
        ...(c.tools.length ? [{ p: `Im Unternehmen bereits bekannte KI-Werkzeuge, zum Beispiel: ${list(c.tools, "und")}.` }] : []),
        { h: "3. Was angar niemals erhebt" },
        {
          ul: [
            "Inhalte dessen, was Sie schreiben oder erhalten: Eingaben (Prompts), Antworten, Nachrichten, E-Mails, Dateien und Dokumente.",
            "Vollständige Seitenadressen (URLs), Suchanfragen, Seitentitel, Bildschirmfotos oder Tastatureingaben.",
            "Die Nutzung von Websites und Programmen, die keine KI-Werkzeuge sind.",
            "Ihren Standort und private Geräte, die nicht in angar registriert sind.",
          ],
        },
        { h: "4. Zwecke" },
        {
          ul: [
            "Kontrolle der Kosten und Lizenzen von KI-Werkzeugen (z. B. bezahlte, ungenutzte Plätze).",
            "Informationssicherheit und Schutz des Unternehmens: nicht freigegebene KI-Werkzeuge erkennen, an die Unternehmens- oder personenbezogene Daten gelangen könnten.",
            "Einhaltung der Verordnung (EU) 2024/1689 (KI-Verordnung): Verzeichnis der eingesetzten KI und KI-Kompetenz der Beschäftigten (Art. 4 KI-Verordnung).",
          ],
        },
        { p: `angar ist eine technische Einrichtung im Sinne von §87 Abs. 1 Nr. 6 BetrVG. Einführung und Anwendung sind in der Betriebsvereinbarung ${"[[Titel und Datum der Betriebsvereinbarung]]"} mit dem Betriebsrat geregelt. Die Daten werden nicht zur Leistungs- oder Verhaltenskontrolle einzelner Beschäftigter verwendet und nicht für arbeitsrechtliche Maßnahmen herangezogen.` },
        { h: "5. Wie die Daten angezeigt werden" },
        { p: `Aktueller Modus: ${modeText}` },
        { h: "6. Rechtsgrundlage" },
        { p: `Berechtigtes Interesse des Verantwortlichen (Art. 6 Abs. 1 lit. f DSGVO) an der Kontrolle von Kosten, Sicherheit und Rechtskonformität der KI-Werkzeuge, abgewogen gegen Ihre Interessen: angar erhebt nur Namen von Werkzeugen und Nutzungsdaten, niemals Inhalte. Ergänzend gelten §26 BDSG und die oben genannte Betriebsvereinbarung (Art. 88 DSGVO). Sie können der Verarbeitung aus Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit widersprechen (Art. 21 DSGVO).` },
        { h: "7. Speicherdauer" },
        { p: `Nutzungsdaten werden ${c.retentionMonths} Monate gespeichert und danach gelöscht. Zusammengefasste Statistiken ohne Namen können länger aufbewahrt werden. Das Protokoll der Administratoraktionen wird so lange aufbewahrt, wie es zum Nachweis der Rechtskonformität erforderlich ist.` },
        { h: "8. Wer die Daten sehen kann" },
        { p: `Nur Personen bei ${org} mit Administratorzugang zu angar (z. B. IT, Finanzen, Compliance) im unter Punkt 5 genannten Modus sowie angar als Auftragsverarbeiter.` },
        { h: "9. Ihre Rechte" },
        { p: `Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Widerspruch (Art. 15–21 DSGVO). Wenden Sie sich an ${contact ?? "[[Kontakt]]"}. Sie können sich außerdem bei der zuständigen Datenschutz-Aufsichtsbehörde beschweren.` },
        { p: `Stand: ${c.date.toLocaleDateString("de-DE")}.` },
      ],
    };
  }

  const collected = [
    "The names of the AI tools used for work (for example ChatGPT or Microsoft Copilot) and the day and time they were used.",
    s.desktop && "From the angar app on company computers: time spent on each AI tool per day (for example \"ChatGPT, 40 minutes\") and the computer's name.",
    s.extension && "From the angar extension in the company browser: the names of AI websites visited, per day.",
    s.microsoft365 && "From Microsoft 365: sign-ins to AI apps with your company account (app name and date).",
    s.google && "From Google Workspace: AI apps connected to your company account (app name and date).",
    s.edge && `From the company network (angar Edge): which AI services are contacted and the number of connections per device${s.firewallBytes ? ", and the amount of data sent (bytes) from the firewall logs" : ""}.`,
    "From the company directory: name, work email and department.",
    "Costs of AI subscriptions from company invoices and bank statements (company data, not yours).",
  ].filter(Boolean) as string[];
  const modeText =
    c.mode === "individual"
      ? "Per person: angar administrators see which AI tools each person uses, to manage licences (for example to ask whether an unused paid seat is still needed)."
      : c.mode === "department"
        ? `Per department: angar shows no names, emails or devices — only totals per department, and only for groups of at least ${MIN_GROUP} people. Smaller teams are merged.`
        : "Company totals only: angar shows no names, devices or departments — only totals for the whole company.";
  return {
    title: "Notice to employees: how angar is used to manage AI tools",
    blocks: [
      { p: `${org} uses angar, a service that keeps an inventory of the AI tools used for work, what they cost and whether they are approved. This notice, given under Article 13 GDPR, explains what is collected and why.` },
      { h: "1. Who is responsible" },
      { p: `The controller is ${org}. Contact: ${contact ?? "[[name, email and address of the controller and, if appointed, the Data Protection Officer]]"}. angar processes the data on behalf of ${org} as a processor (Article 28 GDPR).` },
      { h: "2. What angar collects" },
      { ul: collected },
      ...(c.tools.length ? [{ p: `AI tools already known in the company include: ${list(c.tools, "and")}.` }] : []),
      { h: "3. What angar never collects" },
      {
        ul: [
          "The content of what you write or receive: prompts, answers, messages, emails, files and documents.",
          "Full page addresses (URLs), searches, page titles, screenshots or keystrokes.",
          "Use of websites and programs that are not AI tools.",
          "Your location, or personal devices that aren't enrolled in angar.",
        ],
      },
      { h: "4. Why" },
      {
        ul: [
          "Cost and licence control for AI tools (for example paid seats nobody uses).",
          "Information security and protection of company assets: spotting unapproved AI tools that company or personal data could be sent to.",
          "Compliance with Regulation (EU) 2024/1689 (AI Act): a register of the AI in use and AI literacy of staff (Article 4 AI Act).",
        ],
      },
      { p: "angar is not used to monitor or evaluate individual work performance or productivity, and its data is not used for disciplinary purposes." },
      { h: "5. How the data is shown" },
      { p: `Current mode: ${modeText}` },
      { h: "6. Legal basis" },
      { p: `Legitimate interest of the controller (Article 6(1)(f) GDPR) in controlling the cost, security and regulatory compliance of AI tools, balanced against your rights: angar only collects tool names and usage data, never content. You can object at any time on grounds relating to your particular situation (Article 21 GDPR).` },
      { h: "7. How long it is kept" },
      { p: `Usage data is kept for ${c.retentionMonths} months and then deleted. Aggregated statistics without names may be kept longer. The log of administrator actions is kept as long as needed to demonstrate compliance.` },
      { h: "8. Who can see it" },
      { p: `Only people at ${org} with administrator access to angar (for example IT, finance, compliance), in the mode described in section 5, and angar as processor.` },
      { h: "9. Your rights" },
      { p: `You can ask for access to your data, correction, erasure, restriction and object to processing (Articles 15–21 GDPR) by contacting ${contact ?? "[[contact]]"}. You can also complain to your data protection supervisory authority.` },
      { p: `Last updated ${c.date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.` },
    ],
  };
}

/** Testo semplice per "Copia" (email, intranet, bacheca). */
export function noticeText(n: Notice): string {
  const out = [n.title, ""];
  for (const b of n.blocks) {
    if ("h" in b) out.push("", b.h);
    else if ("p" in b) out.push(b.p);
    else out.push(...b.ul.map((x) => `• ${x}`));
  }
  return out.join("\n").replace(/\[\[(.+?)\]\]/g, "[$1]").replace(/\n{3,}/g, "\n\n").trim();
}
