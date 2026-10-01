// Modello di valutazione d'impatto (art. 35 GDPR) per l'app desktop angar, precompilato. Inglese e italiano.
import { MIN_GROUP, USAGE_RETENTION_MONTHS, HOSTING } from "@/lib/trust";
import type { TrustDoc } from "./types";

export function buildDpia(lang: string): TrustDoc {
  return lang === "it" ? dpiaIt() : dpiaEn();
}

function dpiaEn(): TrustDoc {
  const m = USAGE_RETENTION_MONTHS;
  return {
    title: "Data Protection Impact Assessment — angar desktop app",
    subtitle: "Template under Article 35 GDPR, pre-filled with how angar works",
    blocks: [
      { p: "This template is pre-filled with the processing the angar desktop app actually performs. Complete the parts in brackets, adjust the risk ratings to your context, and have it reviewed by your Data Protection Officer. Where national law requires it, consult the workers' representatives before deployment." },
      {
        table: {
          head: ["Item", "Details"],
          rows: [
            ["Controller", "[[company name, address]]"],
            ["Data Protection Officer", "[[name, contact — or \"not appointed\"]]"],
            ["Processor", "angar (see the Data Processing Agreement)"],
            ["Assessment carried out by", "[[name, role]]"],
            ["Date / version", "[[date]] · v1"],
          ],
        },
      },

      { h: "1. Why a DPIA" },
      { p: "The desktop app records which AI tools employees use and for how long. Systematic observation of employees can meet the criteria for a DPIA in the EDPB guidelines (vulnerable data subjects in an employment relationship; systematic monitoring). This assessment documents why the processing is necessary and proportionate and how the risks are addressed." },

      { h: "2. Description of the processing" },
      { h3: "Purposes" },
      {
        ul: [
          "Managing the cost and licences of AI tools (for example paid seats nobody uses).",
          "Information security: spotting unapproved AI tools to which company or personal data could be sent.",
          "AI Act compliance: a register of the AI systems in use and AI literacy of staff (Article 4 of Regulation (EU) 2024/1689).",
        ],
      },
      { p: "Explicitly excluded: evaluating the performance, productivity or behaviour of individual employees, and any disciplinary use." },
      { h3: "What the app collects" },
      {
        ul: [
          "Names of AI tools in use, recognised from running programs and from the browser history on the computer, matched against angar's catalogue of AI services.",
          "Minutes of use per AI tool per day, and the time it was last seen.",
          "Computer name, operating system, app version, local IP addresses, and the employee's work email.",
        ],
      },
      { h3: "What the app never collects" },
      {
        ul: [
          "Content: prompts, answers, chats, documents, files, emails.",
          "Full URLs, searches, page titles, screenshots or keystrokes. Browser history is read and matched on the computer itself; only the names of AI services leave it.",
          "Use of websites and programs that are not AI tools.",
          "Location.",
        ],
      },
      { h3: "Data subjects, recipients, storage" },
      {
        ul: [
          "Data subjects: [[number]] employees with the app installed, in [[departments / countries]].",
          "Recipients: administrators of the company's angar workspace ([[roles, e.g. IT, finance, compliance]]), and angar as processor.",
          `Storage: angar cloud, hosted in the EU (${HOSTING.provider}, ${HOSTING.region}, ${HOSTING.country}) — or the company's own server with the on-premises edition: [[cloud / on-premises]].`,
          `Retention: usage data is deleted automatically after ${m} months.`,
        ],
      },
      { h3: "How the data is shown (privacy mode)" },
      {
        ul: [
          `By department (default for new workspaces): totals per department only, for groups of at least ${MIN_GROUP} people; smaller teams are merged into "Other (small teams)"; counts under ${MIN_GROUP} are shown as "<${MIN_GROUP}". Usage is stored under a keyed pseudonym (HMAC-SHA256 with a per-workspace secret), not an email; computer names are obfuscated.`,
          "Company totals only: no names, devices or departments.",
          "By person: administrators see which AI tools each person uses — needed for seat clean-up.",
          "Mode chosen: [[By department / Company totals only / By person]] — reason: [[ ]].",
        ],
      },

      { h: "3. Necessity and proportionality" },
      {
        table: {
          head: ["Question", "Assessment"],
          rows: [
            ["Lawful basis", "Legitimate interest (Article 6(1)(f) GDPR) in controlling the cost, security and regulatory compliance of AI tools; where applicable, the collective agreement under Article 88 GDPR. [[Attach the legitimate interest assessment]]"],
            ["Necessity", "Bank statements and invoices show what is paid, not what is used; company accounts do not show AI used outside them. Without usage data, unused seats and unapproved AI cannot be identified."],
            ["Less intrusive alternatives", "Considered: invoices only; company account sign-ins only; company totals only. [[Why the chosen mode is needed]]"],
            ["Data minimisation", "Tool names and minutes only; no content, no URLs, no non-AI activity. Aggregation and pseudonymisation by default."],
            ["Retention", `${m} months, then automatic deletion.`],
            ["Transparency", "Employee notice (Article 13 GDPR) handed out before installation: [[date, channel]]."],
            ["Data subject rights", "Access, rectification, erasure, restriction and objection via [[contact]]. Owners can pseudonymise past data in Settings → Privacy."],
            ["Processor", "Data Processing Agreement with angar (Article 28 GDPR), sub-processors listed in its Annex 3."],
            ["Transfers outside the EEA", "Usage data is stored in the EU. The optional assistant may send aggregated workspace figures to Anthropic (outside the EEA, under SCCs / Data Privacy Framework); it is not used in the on-premises edition, in EU-only mode (ANGAR_EU_ONLY=1) or when the workspace keeps AI answers inside the EU (Settings → Privacy). [[Enabled / not used]]"],
            ["Workers' representatives", "[[Agreement / consultation reference, e.g. accordo sindacale, Betriebsvereinbarung, avis du CSE, informe de la RLT]]"],
          ],
        },
      },

      { h: "4. Risks and mitigations" },
      { p: "Likelihood and severity: low / medium / high, after the measures listed. Adjust to your context." },
      {
        table: {
          head: ["Risk to employees", "Measures", "Likelihood", "Severity"],
          rows: [
            ["Use of the data to monitor or evaluate individual performance (function creep)", `Purpose limitation in the notice and the works council agreement; aggregated mode by default (groups of ${MIN_GROUP}+); no productivity metrics in the product; administrator actions recorded in a tamper-evident audit log.`, "Low", "High"],
            ["Identification of a person in a small team", `k-anonymity: groups under ${MIN_GROUP} people merged or suppressed; counts under ${MIN_GROUP} masked; pseudonyms instead of emails.`, "Low", "Medium"],
            ["Collection of content or sensitive information", "No content is collected by design; history is matched on the device; only AI service names are sent.", "Low", "High"],
            ["Unauthorised access to the data", "Encryption in transit; SSO and two-step verification (can be mandatory); roles; read-only connectors; credentials encrypted with AES-256-GCM; audit log.", "Low", "Medium"],
            ["Data kept longer than needed", `Automatic deletion after ${m} months.`, "Low", "Low"],
            ["Employees unaware of the processing", "Employee notice before installation; the app shows a welcome screen when it is set up; the works council is involved.", "Low", "Medium"],
            ["Switching to per-person mode without safeguards", "Mode change limited to administrators and recorded in the audit log; this DPIA and the employee notice to be updated first.", "[[ ]]", "Medium"],
          ],
        },
      },

      { h: "5. Residual risk and conclusion" },
      { p: "Residual risk: [[low / medium / high]]. If the residual risk remains high, consult the supervisory authority before processing (Article 36 GDPR)." },
      { p: "DPO opinion: [[ ]]" },
      { p: "Workers' representatives' opinion: [[ ]]" },
      { p: "Review date: [[at least yearly, and before changing the privacy mode or adding sources]]" },
      { sign: ["Controller", "Data Protection Officer"] },
    ],
  };
}

function dpiaIt(): TrustDoc {
  const m = USAGE_RETENTION_MONTHS;
  return {
    title: "Valutazione d'impatto sulla protezione dei dati — app desktop angar",
    subtitle: "Modello ai sensi dell'art. 35 GDPR, precompilato con il funzionamento di angar",
    blocks: [
      { p: "Questo modello è precompilato con i trattamenti che l'app desktop angar svolge davvero. Completa le parti tra parentesi, adatta le valutazioni dei rischi al tuo contesto e falla verificare dal Responsabile della protezione dei dati (DPO). Prima dell'installazione serve l'accordo con le RSA/RSU o l'autorizzazione dell'Ispettorato territoriale del lavoro (art. 4 L. 300/1970)." },
      {
        table: {
          head: ["Voce", "Dettagli"],
          rows: [
            ["Titolare del trattamento", "[[ragione sociale, indirizzo]]"],
            ["Responsabile della protezione dei dati (DPO)", "[[nome, contatto — oppure \"non nominato\"]]"],
            ["Responsabile del trattamento", "angar (vedi l'accordo sul trattamento dei dati)"],
            ["Valutazione redatta da", "[[nome, ruolo]]"],
            ["Data / versione", "[[data]] · v1"],
          ],
        },
      },

      { h: "1. Perché una valutazione d'impatto" },
      { p: "L'app desktop registra quali strumenti di IA usano i dipendenti e per quanto tempo. L'osservazione sistematica di lavoratori può rientrare nei criteri che richiedono una DPIA secondo le linee guida dell'EDPB e l'elenco del Garante (interessati vulnerabili nel rapporto di lavoro; monitoraggio sistematico). Questa valutazione documenta perché il trattamento è necessario e proporzionato e come vengono gestiti i rischi." },

      { h: "2. Descrizione del trattamento" },
      { h3: "Finalità" },
      {
        ul: [
          "Controllo dei costi e delle licenze degli strumenti di IA (per esempio posti pagati e non usati).",
          "Sicurezza delle informazioni e tutela del patrimonio aziendale: individuare strumenti di IA non autorizzati a cui potrebbero essere inviati dati aziendali o personali.",
          "Conformità all'AI Act: registro dei sistemi di IA in uso e alfabetizzazione del personale (art. 4 Regolamento (UE) 2024/1689).",
        ],
      },
      { p: "Escluse espressamente: la valutazione della prestazione, della produttività o del comportamento dei singoli lavoratori e qualsiasi uso disciplinare." },
      { h3: "Cosa raccoglie l'app" },
      {
        ul: [
          "Il nome degli strumenti di IA in uso, riconosciuti dai programmi in esecuzione e dalla cronologia del browser sul computer, confrontati con il catalogo dei servizi di IA di angar.",
          "I minuti di utilizzo di ciascuno strumento di IA al giorno e l'ultimo utilizzo.",
          "Nome del computer, sistema operativo, versione dell'app, indirizzi IP locali ed email di lavoro del dipendente.",
        ],
      },
      { h3: "Cosa l'app non raccoglie mai" },
      {
        ul: [
          "Contenuti: richieste (prompt), risposte, chat, documenti, file, email.",
          "Indirizzi completi delle pagine (URL), ricerche, titoli delle pagine, schermate o tasti premuti. La cronologia del browser viene letta e confrontata sul computer stesso: ne escono solo i nomi dei servizi di IA.",
          "L'uso di siti e programmi che non sono strumenti di IA.",
          "La posizione.",
        ],
      },
      { h3: "Interessati, destinatari, conservazione" },
      {
        ul: [
          "Interessati: [[numero]] dipendenti con l'app installata, in [[reparti / sedi]].",
          "Destinatari: gli amministratori del workspace angar dell'azienda ([[ruoli, es. IT, amministrazione, compliance]]) e angar come responsabile del trattamento.",
          `Conservazione dei dati: cloud angar, ospitato nell'UE (${HOSTING.provider}, ${HOSTING.region}, Paesi Bassi) — oppure sul server dell'azienda con l'edizione on-premises: [[cloud / on-premises]].`,
          `Tempi di conservazione: i dati di utilizzo vengono cancellati automaticamente dopo ${m} mesi.`,
        ],
      },
      { h3: "Come vengono mostrati i dati (modalità privacy)" },
      {
        ul: [
          `Per reparto (predefinita per i nuovi workspace): solo totali per reparto, per gruppi di almeno ${MIN_GROUP} persone; i reparti più piccoli vengono uniti in "Other (small teams)"; i conteggi sotto ${MIN_GROUP} sono mostrati come "<${MIN_GROUP}". L'utilizzo è salvato con uno pseudonimo (HMAC-SHA256 con una chiave propria del workspace) e non con l'email; i nomi dei computer sono offuscati.`,
          "Solo totali aziendali: nessun nome, dispositivo o reparto.",
          "Per persona: gli amministratori vedono quali strumenti di IA usa ciascuna persona — necessario per liberare le licenze inutilizzate.",
          "Modalità scelta: [[Per reparto / Solo totali aziendali / Per persona]] — motivazione: [[ ]].",
        ],
      },

      { h: "3. Necessità e proporzionalità" },
      {
        table: {
          head: ["Domanda", "Valutazione"],
          rows: [
            ["Base giuridica", "Legittimo interesse (art. 6, par. 1, lett. f GDPR) a controllare costi, sicurezza e conformità normativa degli strumenti di IA, nel rispetto dell'art. 4 L. 300/1970 e dell'art. 114 D.Lgs. 196/2003. [[Allegare il bilanciamento del legittimo interesse]]"],
            ["Necessità", "Estratti conto e fatture mostrano cosa si paga, non cosa si usa; gli account aziendali non mostrano le IA usate al di fuori di essi. Senza dati di utilizzo non si possono individuare licenze inutilizzate e IA non autorizzate."],
            ["Alternative meno invasive", "Valutate: solo fatture; solo accessi con gli account aziendali; solo totali aziendali. [[Perché serve la modalità scelta]]"],
            ["Minimizzazione", "Solo nomi degli strumenti e minuti; nessun contenuto, nessun URL, nessuna attività non legata all'IA. Aggregazione e pseudonimizzazione predefinite."],
            ["Conservazione", `${m} mesi, poi cancellazione automatica.`],
            ["Trasparenza", "Informativa ai dipendenti (art. 13 GDPR e art. 4, comma 3, L. 300/1970) consegnata prima dell'installazione: [[data, modalità]]."],
            ["Diritti degli interessati", "Accesso, rettifica, cancellazione, limitazione e opposizione tramite [[contatto]]. Il titolare può pseudonimizzare i dati passati da Impostazioni → Privacy."],
            ["Responsabile del trattamento", "Accordo sul trattamento dei dati con angar (art. 28 GDPR), sub-responsabili elencati nell'allegato 3."],
            ["Trasferimenti fuori dal SEE", "I dati di utilizzo sono conservati nell'UE. L'assistente facoltativo può inviare dati aggregati del workspace ad Anthropic (fuori dal SEE, con clausole contrattuali standard / Data Privacy Framework); non è usato nell'edizione on-premises, in modalità solo UE (ANGAR_EU_ONLY=1) né quando il workspace tiene le risposte AI nell'UE (Settings → Privacy). [[Attivo / non usato]]"],
            ["Rappresentanze dei lavoratori", "[[Estremi dell'accordo con le RSA/RSU o dell'autorizzazione dell'Ispettorato territoriale del lavoro]]"],
          ],
        },
      },

      { h: "4. Rischi e misure" },
      { p: "Probabilità e gravità: bassa / media / alta, tenendo conto delle misure indicate. Adattale al tuo contesto." },
      {
        table: {
          head: ["Rischio per i lavoratori", "Misure", "Probabilità", "Gravità"],
          rows: [
            ["Uso dei dati per controllare o valutare la prestazione individuale (sviamento della finalità)", `Limitazione della finalità nell'informativa e nell'accordo sindacale; modalità aggregata predefinita (gruppi di almeno ${MIN_GROUP}); nessuna metrica di produttività nel prodotto; azioni degli amministratori registrate in un registro a prova di manomissione.`, "Bassa", "Alta"],
            ["Identificazione di una persona in un reparto piccolo", `k-anonimato: gruppi sotto ${MIN_GROUP} persone uniti o nascosti; conteggi sotto ${MIN_GROUP} mascherati; pseudonimi al posto delle email.`, "Bassa", "Media"],
            ["Raccolta di contenuti o informazioni sensibili", "Nessun contenuto raccolto per progettazione; la cronologia è confrontata sul dispositivo; vengono inviati solo i nomi dei servizi di IA.", "Bassa", "Alta"],
            ["Accesso non autorizzato ai dati", "Cifratura in transito; accesso con SSO e verifica in due passaggi (anche obbligatoria); ruoli; connettori in sola lettura; credenziali cifrate con AES-256-GCM; registro delle attività.", "Bassa", "Media"],
            ["Conservazione oltre il necessario", `Cancellazione automatica dopo ${m} mesi.`, "Bassa", "Bassa"],
            ["Lavoratori non informati del trattamento", "Informativa prima dell'installazione; l'app mostra una schermata di benvenuto quando viene configurata; coinvolgimento delle RSA/RSU.", "Bassa", "Media"],
            ["Passaggio alla modalità per persona senza garanzie", "Cambio di modalità riservato agli amministratori e registrato; prima vanno aggiornati questa valutazione, l'informativa e, se necessario, l'accordo sindacale.", "[[ ]]", "Media"],
          ],
        },
      },

      { h: "5. Rischio residuo e conclusione" },
      { p: "Rischio residuo: [[basso / medio / alto]]. Se il rischio residuo resta alto, prima del trattamento va consultato il Garante per la protezione dei dati personali (art. 36 GDPR)." },
      { p: "Parere del DPO: [[ ]]" },
      { p: "Parere delle RSA/RSU: [[ ]]" },
      { p: "Data di revisione: [[almeno annuale, e prima di cambiare modalità privacy o aggiungere fonti]]" },
      { sign: ["Il titolare del trattamento", "Il DPO"] },
    ],
  };
}
