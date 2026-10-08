/**
 * Informativa ai dipendenti (art. 13 GDPR) generata dai dati dell'azienda:
 * cosa raccoglie angar secondo le fonti davvero collegate, cosa non
 * raccoglie mai, finalità, base giuridica, conservazione, modalità privacy.
 * Cinque lingue: inglese, italiano (art. 4 L. 300/1970), tedesco (§87 BetrVG),
 * francese (art. L1222-4 e L2312-38 Code du travail) e spagnolo (art. 87 LOPDGDD, art. 64 ET).
 * I segnaposto [[…]] vanno completati dall'azienda prima di distribuirla.
 */
import { MIN_GROUP, type PrivacyMode } from "@/lib/privacy";

export type NoticeLang = "en" | "it" | "de" | "fr" | "es";
export const NOTICE_LANGS: { id: NoticeLang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "it", label: "Italiano" },
  { id: "de", label: "Deutsch" },
  { id: "fr", label: "Français" },
  { id: "es", label: "Español" },
];
export const noticeLang = (v?: string | null): NoticeLang => (v === "it" || v === "de" || v === "fr" || v === "es" ? v : "en");

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
    okta?: boolean;
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
      s.okta && "Da Okta: le app di IA assegnate e gli accessi con l'account aziendale (nome dell'app e date).",
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
      s.okta && "Aus Okta: zugewiesene KI-Apps und Anmeldungen mit dem Firmenkonto (Name der App und Datum).",
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

  if (lang === "fr") {
    const collected = [
      "Le nom des outils d'intelligence artificielle utilisés pour le travail (par exemple ChatGPT ou Microsoft Copilot), ainsi que le jour et l'heure d'utilisation.",
      s.desktop && "Depuis l'application angar installée sur l'ordinateur de l'entreprise : le temps passé sur chaque outil d'IA par jour (par exemple « ChatGPT, 40 minutes ») et le nom de l'ordinateur.",
      s.extension && "Depuis l'extension angar du navigateur de l'entreprise : le nom des sites d'IA consultés, par jour.",
      s.microsoft365 && "Depuis Microsoft 365 : les connexions à des applications d'IA avec le compte professionnel (nom de l'application et date).",
      s.google && "Depuis Google Workspace : les applications d'IA reliées au compte professionnel (nom de l'application et date).",
      s.okta && "Depuis Okta : les applications d'IA attribuées et les connexions avec le compte professionnel (nom de l'application et dates).",
      s.edge && `Depuis le réseau de l'entreprise (angar Edge) : les services d'IA contactés et le nombre de connexions par appareil${s.firewallBytes ? ", ainsi que le volume de données envoyées (octets) issu des journaux du pare-feu" : ""}.`,
      "Depuis l'annuaire de l'entreprise : nom, adresse e-mail professionnelle et service.",
      "Le coût des abonnements d'IA, à partir des factures et relevés bancaires de l'entreprise (données de l'entreprise, pas les vôtres).",
    ].filter(Boolean) as string[];
    const modeText =
      c.mode === "individual"
        ? "Par personne : les administrateurs d'angar voient quels outils d'IA chaque personne utilise, afin de gérer les licences (par exemple demander si une licence payée et inutilisée est encore nécessaire)."
        : c.mode === "department"
          ? `Par service : angar n'affiche ni noms, ni e-mails, ni appareils — uniquement des totaux par service, et seulement pour des groupes d'au moins ${MIN_GROUP} personnes. Les petites équipes sont regroupées.`
          : "Totaux de l'entreprise uniquement : angar n'affiche ni noms, ni appareils, ni services — seulement les totaux de toute l'entreprise.";
    return {
      title: "Information des salariés sur l'utilisation d'angar pour la gestion des outils d'IA",
      blocks: [
        { p: `${org} utilise angar, un service qui tient l'inventaire des outils d'intelligence artificielle utilisés pour le travail, de leur coût et de leur statut (autorisé ou non). Cette information, donnée au titre de l'article 13 du RGPD et de l'article L1222-4 du Code du travail, explique quelles données sont collectées et pourquoi.` },
        { h: "1. Responsable du traitement" },
        { p: `Le responsable du traitement est ${org}. Contact : ${contact ?? "[[nom, e-mail et adresse du responsable du traitement et, le cas échéant, du délégué à la protection des données (DPO)]]"}. angar traite les données pour le compte de ${org} en qualité de sous-traitant (article 28 du RGPD).` },
        { h: "2. Données collectées par angar" },
        { ul: collected },
        ...(c.tools.length ? [{ p: `Outils d'IA déjà présents dans l'entreprise, par exemple : ${list(c.tools, "et")}.` }] : []),
        { h: "3. Ce qu'angar ne collecte jamais" },
        {
          ul: [
            "Le contenu de ce que vous écrivez ou recevez : requêtes (prompts), réponses, messages, e-mails, fichiers et documents.",
            "Les adresses complètes des pages (URL), les recherches, les titres de pages, les captures d'écran ou les frappes au clavier.",
            "L'utilisation de sites et de logiciels qui ne sont pas des outils d'IA.",
            "Votre localisation, ni les appareils personnels qui ne sont pas enregistrés dans angar.",
          ],
        },
        { h: "4. Finalités" },
        {
          ul: [
            "Maîtrise des coûts et des licences des outils d'IA (par exemple des licences payées et inutilisées).",
            "Sécurité de l'information et protection du patrimoine de l'entreprise : repérer les outils d'IA non autorisés vers lesquels des données de l'entreprise ou des données personnelles pourraient être envoyées.",
            "Conformité au règlement (UE) 2024/1689 (AI Act) : registre des IA utilisées et maîtrise de l'IA par le personnel (article 4 AI Act).",
          ],
        },
        { p: `angar n'est pas utilisé pour surveiller ou évaluer la performance ou la productivité individuelle, et ses données ne sont pas utilisées à des fins disciplinaires. Le comité social et économique (CSE) a été informé et consulté avant la mise en œuvre (article L2312-38 du Code du travail) : ${"[[date de l'avis du CSE]]"}.` },
        { h: "5. Comment les données sont affichées" },
        { p: `Mode actuel : ${modeText}` },
        { h: "6. Base légale" },
        { p: `Intérêt légitime du responsable du traitement (article 6, paragraphe 1, point f du RGPD) à maîtriser le coût, la sécurité et la conformité réglementaire des outils d'IA, mis en balance avec vos droits : angar ne collecte que des noms d'outils et des données d'utilisation, jamais de contenu. Vous pouvez vous opposer à tout moment pour des raisons tenant à votre situation particulière (article 21 du RGPD).` },
        { h: "7. Durée de conservation" },
        { p: `Les données d'utilisation sont conservées ${c.retentionMonths} mois, puis supprimées. Des statistiques agrégées sans noms peuvent être conservées plus longtemps. Le journal des actions des administrateurs est conservé aussi longtemps que nécessaire pour démontrer la conformité.` },
        { h: "8. Qui peut voir les données" },
        { p: `Uniquement les personnes de ${org} ayant un accès administrateur à angar (par exemple informatique, finance, conformité), selon le mode décrit au point 5, ainsi qu'angar en qualité de sous-traitant.` },
        { h: "9. Vos droits" },
        { p: `Vous pouvez demander l'accès à vos données, leur rectification, leur effacement, la limitation du traitement et vous opposer au traitement (articles 15 à 21 du RGPD) en écrivant à ${contact ?? "[[contact]]"}. Vous pouvez également introduire une réclamation auprès de la CNIL (www.cnil.fr).` },
        { p: `Mise à jour le ${c.date.toLocaleDateString("fr-FR")}.` },
      ],
    };
  }

  if (lang === "es") {
    const collected = [
      "El nombre de las herramientas de inteligencia artificial utilizadas para el trabajo (por ejemplo ChatGPT o Microsoft Copilot) y el día y la hora en que se usaron.",
      s.desktop && "Desde la aplicación angar instalada en el ordenador de la empresa: el tiempo dedicado a cada herramienta de IA al día (por ejemplo «ChatGPT, 40 minutos») y el nombre del ordenador.",
      s.extension && "Desde la extensión angar del navegador de la empresa: los nombres de los sitios de IA visitados, por día.",
      s.microsoft365 && "Desde Microsoft 365: los inicios de sesión en aplicaciones de IA con la cuenta de la empresa (nombre de la aplicación y fecha).",
      s.google && "Desde Google Workspace: las aplicaciones de IA conectadas a la cuenta de la empresa (nombre de la aplicación y fecha).",
      s.okta && "Desde Okta: las aplicaciones de IA asignadas y los accesos con la cuenta de la empresa (nombre de la aplicación y fechas).",
      s.edge && `Desde la red de la empresa (angar Edge): qué servicios de IA se contactan y el número de conexiones por dispositivo${s.firewallBytes ? ", y la cantidad de datos enviados (bytes) a partir de los registros del cortafuegos" : ""}.`,
      "Desde el directorio de la empresa: nombre, correo electrónico de trabajo y departamento.",
      "El coste de las suscripciones de IA, a partir de facturas y extractos bancarios de la empresa (datos de la empresa, no tuyos).",
    ].filter(Boolean) as string[];
    const modeText =
      c.mode === "individual"
        ? "Por persona: los administradores de angar ven qué herramientas de IA usa cada persona, para gestionar las licencias (por ejemplo, preguntar si una licencia pagada y sin uso sigue siendo necesaria)."
        : c.mode === "department"
          ? `Por departamento: angar no muestra nombres, correos ni dispositivos, solo totales por departamento y solo para grupos de al menos ${MIN_GROUP} personas. Los equipos más pequeños se agrupan.`
          : "Solo totales de la empresa: angar no muestra nombres, dispositivos ni departamentos, solo los totales de toda la empresa.";
    return {
      title: "Información a las personas trabajadoras sobre el uso de angar para gestionar las herramientas de IA",
      blocks: [
        { p: `${org} utiliza angar, un servicio que mantiene el inventario de las herramientas de inteligencia artificial usadas para el trabajo, de su coste y de si están autorizadas. Esta información, facilitada conforme al artículo 13 del RGPD y al artículo 87 de la Ley Orgánica 3/2018 (LOPDGDD), explica qué datos se recogen y por qué.` },
        { h: "1. Responsable del tratamiento" },
        { p: `El responsable del tratamiento es ${org}. Contacto: ${contact ?? "[[nombre, correo y dirección del responsable y, en su caso, del delegado de protección de datos (DPD)]]"}. angar trata los datos por cuenta de ${org} como encargado del tratamiento (artículo 28 del RGPD).` },
        { h: "2. Qué datos recoge angar" },
        { ul: collected },
        ...(c.tools.length ? [{ p: `Herramientas de IA ya presentes en la empresa, por ejemplo: ${list(c.tools, "y")}.` }] : []),
        { h: "3. Qué no recoge nunca angar" },
        {
          ul: [
            "El contenido de lo que escribes o recibes: peticiones (prompts), respuestas, mensajes, correos, archivos y documentos.",
            "Direcciones completas de las páginas (URL), búsquedas, títulos de páginas, capturas de pantalla o pulsaciones de teclas.",
            "El uso de sitios y programas que no son herramientas de IA.",
            "Tu ubicación ni los dispositivos personales que no estén registrados en angar.",
          ],
        },
        { h: "4. Finalidades" },
        {
          ul: [
            "Control de costes y licencias de las herramientas de IA (por ejemplo, licencias pagadas que nadie usa).",
            "Seguridad de la información y protección del patrimonio de la empresa: detectar herramientas de IA no autorizadas a las que podrían enviarse datos de la empresa o datos personales.",
            "Cumplimiento del Reglamento (UE) 2024/1689 (Reglamento de IA): registro de las IA en uso y alfabetización en IA del personal (artículo 4 del Reglamento de IA).",
          ],
        },
        { p: `angar no se utiliza para vigilar ni evaluar el rendimiento o la productividad individual, y sus datos no se utilizan con fines disciplinarios. La representación legal de las personas trabajadoras ha sido informada conforme al artículo 64 del Estatuto de los Trabajadores y al artículo 87 de la LOPDGDD: ${"[[fecha de la información / del informe de la representación legal]]"}.` },
        { h: "5. Cómo se muestran los datos" },
        { p: `Modo actual: ${modeText}` },
        { h: "6. Base jurídica" },
        { p: `Interés legítimo del responsable (artículo 6.1.f del RGPD) en controlar el coste, la seguridad y el cumplimiento normativo de las herramientas de IA, ponderado con tus derechos: angar solo recoge nombres de herramientas y datos de uso, nunca contenidos. Puedes oponerte en cualquier momento por motivos relacionados con tu situación particular (artículo 21 del RGPD).` },
        { h: "7. Conservación" },
        { p: `Los datos de uso se conservan durante ${c.retentionMonths} meses y después se eliminan. Las estadísticas agregadas sin nombres pueden conservarse más tiempo. El registro de las acciones de los administradores se conserva el tiempo necesario para demostrar el cumplimiento.` },
        { h: "8. Quién puede ver los datos" },
        { p: `Solo las personas de ${org} con acceso de administrador a angar (por ejemplo TI, finanzas, cumplimiento), según el modo descrito en el punto 5, y angar como encargado del tratamiento.` },
        { h: "9. Tus derechos" },
        { p: `Puedes solicitar el acceso a tus datos, su rectificación, supresión, la limitación del tratamiento y oponerte al mismo (artículos 15 a 21 del RGPD) escribiendo a ${contact ?? "[[contacto]]"}. También puedes presentar una reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).` },
        { p: `Actualizada el ${c.date.toLocaleDateString("es-ES")}.` },
      ],
    };
  }

  const collected = [
    "The names of the AI tools used for work (for example ChatGPT or Microsoft Copilot) and the day and time they were used.",
    s.desktop && "From the angar app on company computers: time spent on each AI tool each day (for example \"ChatGPT, 40 minutes\") and the computer's name.",
    s.extension && "From the angar extension in the company browser: the names of AI websites visited, each day.",
    s.microsoft365 && "From Microsoft 365: sign-ins to AI apps with your company account (app name and date).",
    s.google && "From Google Workspace: AI apps connected to your company account (app name and date).",
    s.okta && "From Okta: AI apps assigned to you and sign-ins with your company account (app name and dates).",
    s.edge && `From the company network (angar Edge): which AI services are contacted and the number of connections for each device${s.firewallBytes ? ", and the amount of data sent (bytes) from the firewall logs" : ""}.`,
    "From the company directory: name, work email and department.",
    "Costs of AI subscriptions from company invoices and bank statements (company data, not yours).",
  ].filter(Boolean) as string[];
  const modeText =
    c.mode === "individual"
      ? "By person: angar administrators see which AI tools each person uses, to manage licences (for example to ask whether an unused paid seat is still needed)."
      : c.mode === "department"
        ? `By department: angar shows no names, emails or devices — only department totals, and only for groups of at least ${MIN_GROUP} people. Smaller teams are merged.`
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
