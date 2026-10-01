/**
 * Testi delle pagine pubbliche /partners e /pilot in cinque lingue
 * (?lang=it|de|fr|es, inglese di default). Un solo dizionario: per cambiare
 * una frase si cambia qui. "{d}" = sconto partner, "{r}" = quota ricorrente,
 * "{f}" = success fee (sostituiti da fill()).
 */
export type Lang = "en" | "it" | "de" | "fr" | "es";

export const LANGS: { code: Lang; short: string; label: string }[] = [
  { code: "en", short: "EN", label: "English" },
  { code: "it", short: "IT", label: "Italiano" },
  { code: "de", short: "DE", label: "Deutsch" },
  { code: "fr", short: "FR", label: "Français" },
  { code: "es", short: "ES", label: "Español" },
];

export const pickLang = (v?: string | string[]): Lang => {
  const s = (Array.isArray(v) ? v[0] : v)?.toLowerCase();
  return LANGS.some((l) => l.code === s) ? (s as Lang) : "en";
};

/** Paesi del modulo: UE, SEE, Regno Unito e Svizzera (codici ISO). */
export const LEAD_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO", "GB", "CH",
];

/** Paesi con il nome nella lingua della pagina, in ordine alfabetico. */
export function countryOptions(lang: Lang) {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([lang], { type: "region" });
  } catch {
    names = null;
  }
  return LEAD_COUNTRIES.map((code) => ({ code, name: names?.of(code) ?? code })).sort((a, b) => a.name.localeCompare(b.name, lang));
}

export const EMPLOYEE_RANGES = ["1-49", "50-249", "250-999", "1000+"];

export const fill = (s: string, v: { d?: number; r?: number; f?: number }) =>
  s.replace("{d}", String(v.d ?? "")).replace("{r}", String(v.r ?? "")).replace("{f}", String(v.f ?? ""));

type Item = { t: string; d: string };

export interface CommonCopy {
  nav: { pricing: string; partners: string; engine: string; signIn: string; startFree: string };
  langLabel: string;
  form: {
    name: string;
    firm: string;
    company: string;
    email: string;
    country: string;
    countryPick: string;
    clients: string;
    employees: string;
    employeesPick: string;
    phone: string;
    message: string;
    optional: string;
    privacy: string;
    sending: string;
    errors: { required: string; email: string; rate: string; server: string };
    thanksTitle: string;
    thanksBody: string;
  };
  trust: { title: string; items: Item[]; link: string };
  howTitle: string;
}

export interface PartnersCopy {
  metaTitle: string;
  metaDesc: string;
  eyebrow: string;
  h1: string;
  sub: string;
  cta: string;
  ctaSecondary: string;
  audiences: string[];
  clientsTitle: string;
  clients: Item[];
  formatsLabel: string;
  statements: string;
  mock: { title: string; client: string; spend: string; save: string; example: string };
  youTitle: string;
  you: (Item & { soon?: boolean })[];
  soon: string;
  how: Item[];
  formTitle: string;
  formSub: string;
  messagePh: string;
  submit: string;
  pilotNote: string;
  pilotLink: string;
}

export interface PilotCopy {
  metaTitle: string;
  metaDesc: string;
  eyebrow: string;
  h1: string;
  sub: string;
  cta: string;
  ctaSecondary: string;
  facts: { v: string; l: string }[];
  getTitle: string;
  get: Item[];
  askTitle: string;
  ask: Item[];
  how: Item[];
  formTitle: string;
  formSub: string;
  messagePh: string;
  submit: string;
  partnerNote: string;
  partnerLink: string;
}

export const COMMON: Record<Lang, CommonCopy> = {
  en: {
    nav: { pricing: "Pricing", partners: "Partners", engine: "Engine", signIn: "Sign in", startFree: "Start free" },
    langLabel: "Language",
    form: {
      name: "Your name",
      firm: "Firm",
      company: "Company",
      email: "Work email",
      country: "Country",
      countryPick: "Choose a country",
      clients: "Client companies you look after",
      employees: "Employees",
      employeesPick: "Choose a range",
      phone: "Phone",
      message: "Message",
      optional: "optional",
      privacy: "We use these details only to reply to you. Hosted in the EU.",
      sending: "Sending…",
      errors: {
        required: "Fill in all the required fields.",
        email: "Enter a valid email address.",
        rate: "Too many requests from your network — try again in an hour.",
        server: "Something went wrong on our side — try again in a minute.",
      },
      thanksTitle: "Thank you — we've got it.",
      thanksBody: "We'll reply within two working days from a real person, not a robot.",
    },
    trust: {
      title: "Data & trust",
      items: [
        { t: "Hosted in the EU", d: "Data stays in the European Union." },
        { t: "GDPR", d: "Data processing agreement for you and each client." },
        { t: "Only AI lines", d: "From statements and invoices angar keeps AI charges only." },
        { t: "Read-only", d: "angar never changes anything in banks or accounts." },
      ],
      link: "Security and data handling",
    },
    howTitle: "How it works",
  },
  it: {
    nav: { pricing: "Prezzi", partners: "Partner", engine: "Engine", signIn: "Accedi", startFree: "Inizia gratis" },
    langLabel: "Lingua",
    form: {
      name: "Nome e cognome",
      firm: "Studio",
      company: "Azienda",
      email: "Email di lavoro",
      country: "Paese",
      countryPick: "Scegli un paese",
      clients: "Aziende clienti che seguite",
      employees: "Dipendenti",
      employeesPick: "Scegli una fascia",
      phone: "Telefono",
      message: "Messaggio",
      optional: "facoltativo",
      privacy: "Usiamo questi dati solo per risponderti. Ospitato nell'UE.",
      sending: "Invio…",
      errors: {
        required: "Compila tutti i campi obbligatori.",
        email: "Inserisci un indirizzo email valido.",
        rate: "Troppe richieste dalla tua rete — riprova tra un'ora.",
        server: "Qualcosa non ha funzionato da parte nostra — riprova tra un minuto.",
      },
      thanksTitle: "Grazie — abbiamo ricevuto la richiesta.",
      thanksBody: "Ti risponde una persona entro due giorni lavorativi.",
    },
    trust: {
      title: "Dati e fiducia",
      items: [
        { t: "Ospitato nell'UE", d: "I dati restano nell'Unione europea." },
        { t: "GDPR", d: "Accordo sul trattamento dei dati per te e per ogni cliente." },
        { t: "Solo le righe AI", d: "Da estratti conto e fatture angar conserva solo le spese AI." },
        { t: "Sola lettura", d: "angar non modifica nulla in banche e account." },
      ],
      link: "Sicurezza e trattamento dei dati",
    },
    howTitle: "Come funziona",
  },
  de: {
    nav: { pricing: "Preise", partners: "Partner", engine: "Engine", signIn: "Anmelden", startFree: "Kostenlos starten" },
    langLabel: "Sprache",
    form: {
      name: "Ihr Name",
      firm: "Kanzlei / Firma",
      company: "Unternehmen",
      email: "Geschäftliche E-Mail",
      country: "Land",
      countryPick: "Land wählen",
      clients: "Betreute Mandanten",
      employees: "Mitarbeitende",
      employeesPick: "Bereich wählen",
      phone: "Telefon",
      message: "Nachricht",
      optional: "optional",
      privacy: "Wir nutzen diese Angaben nur für unsere Antwort. Gehostet in der EU.",
      sending: "Wird gesendet…",
      errors: {
        required: "Bitte alle Pflichtfelder ausfüllen.",
        email: "Bitte eine gültige E-Mail-Adresse eingeben.",
        rate: "Zu viele Anfragen aus Ihrem Netzwerk — bitte in einer Stunde erneut versuchen.",
        server: "Bei uns ist etwas schiefgelaufen — bitte in einer Minute erneut versuchen.",
      },
      thanksTitle: "Danke — Ihre Anfrage ist da.",
      thanksBody: "Ein Mensch aus unserem Team antwortet innerhalb von zwei Werktagen.",
    },
    trust: {
      title: "Daten & Vertrauen",
      items: [
        { t: "Gehostet in der EU", d: "Die Daten bleiben in der Europäischen Union." },
        { t: "DSGVO", d: "Auftragsverarbeitungsvertrag für Sie und jeden Mandanten." },
        { t: "Nur KI-Positionen", d: "Aus Kontoauszügen und Rechnungen speichert angar nur KI-Kosten." },
        { t: "Nur Lesezugriff", d: "angar ändert nichts in Banken oder Konten." },
      ],
      link: "Sicherheit und Datenverarbeitung",
    },
    howTitle: "So funktioniert's",
  },
  fr: {
    nav: { pricing: "Tarifs", partners: "Partenaires", engine: "Engine", signIn: "Se connecter", startFree: "Commencer gratuitement" },
    langLabel: "Langue",
    form: {
      name: "Votre nom",
      firm: "Cabinet",
      company: "Entreprise",
      email: "E-mail professionnel",
      country: "Pays",
      countryPick: "Choisir un pays",
      clients: "Entreprises clientes suivies",
      employees: "Salariés",
      employeesPick: "Choisir une tranche",
      phone: "Téléphone",
      message: "Message",
      optional: "facultatif",
      privacy: "Ces informations servent uniquement à vous répondre. Hébergé dans l'UE.",
      sending: "Envoi…",
      errors: {
        required: "Remplissez tous les champs obligatoires.",
        email: "Saisissez une adresse e-mail valide.",
        rate: "Trop de demandes depuis votre réseau — réessayez dans une heure.",
        server: "Un problème est survenu de notre côté — réessayez dans une minute.",
      },
      thanksTitle: "Merci — nous avons bien reçu votre demande.",
      thanksBody: "Une vraie personne vous répond sous deux jours ouvrés.",
    },
    trust: {
      title: "Données et confiance",
      items: [
        { t: "Hébergé dans l'UE", d: "Les données restent dans l'Union européenne." },
        { t: "RGPD", d: "Accord de traitement des données pour vous et chaque client." },
        { t: "Uniquement les lignes IA", d: "Des relevés et factures, angar ne garde que les dépenses IA." },
        { t: "Lecture seule", d: "angar ne modifie rien dans les banques ni les comptes." },
      ],
      link: "Sécurité et traitement des données",
    },
    howTitle: "Comment ça marche",
  },
  es: {
    nav: { pricing: "Precios", partners: "Partners", engine: "Engine", signIn: "Iniciar sesión", startFree: "Empezar gratis" },
    langLabel: "Idioma",
    form: {
      name: "Tu nombre",
      firm: "Despacho / empresa",
      company: "Empresa",
      email: "Email de trabajo",
      country: "País",
      countryPick: "Elige un país",
      clients: "Empresas clientes que gestionáis",
      employees: "Empleados",
      employeesPick: "Elige un rango",
      phone: "Teléfono",
      message: "Mensaje",
      optional: "opcional",
      privacy: "Usamos estos datos solo para responderte. Alojado en la UE.",
      sending: "Enviando…",
      errors: {
        required: "Completa todos los campos obligatorios.",
        email: "Introduce un email válido.",
        rate: "Demasiadas solicitudes desde tu red — vuelve a intentarlo en una hora.",
        server: "Algo ha fallado por nuestra parte — vuelve a intentarlo en un minuto.",
      },
      thanksTitle: "Gracias — hemos recibido tu solicitud.",
      thanksBody: "Te responderá una persona en un plazo de dos días laborables.",
    },
    trust: {
      title: "Datos y confianza",
      items: [
        { t: "Alojado en la UE", d: "Los datos se quedan en la Unión Europea." },
        { t: "RGPD", d: "Acuerdo de tratamiento de datos para ti y cada cliente." },
        { t: "Solo líneas de IA", d: "De extractos y facturas angar guarda solo los gastos de IA." },
        { t: "Solo lectura", d: "angar no cambia nada en bancos ni cuentas." },
      ],
      link: "Seguridad y tratamiento de datos",
    },
    howTitle: "Cómo funciona",
  },
};

export const PARTNERS: Record<Lang, PartnersCopy> = {
  en: {
    metaTitle: "angar for accountants and IT partners",
    metaDesc: "Find your clients' AI spend from the e-invoices and bank statements you already handle, and show them where to save. For accountants, tax advisers and MSPs across Europe.",
    eyebrow: "Partner programme",
    h1: "Find your clients' AI spend in the documents you already have.",
    sub: "For accountants and bookkeepers, tax advisers and MSPs / IT providers across Europe. angar reads e-invoices and bank statements, finds every AI subscription and shows each client where to save — verified on the next bills.",
    cta: "Apply to become a partner",
    ctaSecondary: "See pricing",
    audiences: ["Accountants & bookkeepers", "Tax advisers", "MSPs & IT providers"],
    clientsTitle: "What your clients get",
    clients: [
      { t: "AI spend, found for them", d: "Every AI subscription in their e-invoices and bank or card statements, with plan, seats and real monthly cost." },
      { t: "Where to save", d: "Unused seats, duplicate tools, personal plans paid by the company, yearly billing that costs less." },
      { t: "Savings verified on the next bills", d: "angar checks the following bank charges: a saving counts only when the bill really goes down." },
    ],
    formatsLabel: "Reads",
    statements: "bank & card statements",
    mock: { title: "Your clients", client: "Client", spend: "AI spend", save: "Can save", example: "Example" },
    youTitle: "What you get",
    you: [
      { t: "Multi-client console", d: "Every client workspace in one place: AI spend, possible savings and what to review, across all clients." },
      { t: "{d}% partner discount", d: "{d}% off every licence and angar Edge device. Resell at list price or pass the discount on to clients." },
      { t: "Or a revenue share", d: "Prefer not to resell? Refer clients and receive {r}% of what they pay, every month they stay." },
      { t: "Your brand on client reports", d: "Monthly AI reports with your firm's name and logo, ready to send.", soon: true },
    ],
    soon: "Coming soon",
    how: [
      { t: "Apply", d: "Tell us about your firm. We reply within two working days and set up your partner account." },
      { t: "Add clients", d: "Create a workspace for each client in the partner console and drop their e-invoices and bank statements." },
      { t: "Report and save", d: "Show each client their AI spend and savings; angar verifies the savings on the next bills." },
    ],
    formTitle: "Apply to the partner programme",
    formSub: "Five fields, two minutes. No commitment.",
    messagePh: "Which clients, which software you use, anything we should know.",
    submit: "Send application",
    pilotNote: "Not a partner, but a company that wants to try angar?",
    pilotLink: "Join the pilot programme",
  },
  it: {
    metaTitle: "angar per commercialisti e partner IT",
    metaDesc: "Trova la spesa AI dei tuoi clienti nelle fatture elettroniche e negli estratti conto che gestisci già, e mostra loro dove risparmiare. Per commercialisti, consulenti fiscali e MSP in tutta Europa.",
    eyebrow: "Programma partner",
    h1: "La spesa AI dei tuoi clienti, nei documenti che hai già.",
    sub: "Per commercialisti, consulenti del lavoro e fiscali, MSP e fornitori IT in tutta Europa. angar legge fatture elettroniche ed estratti conto, trova ogni abbonamento AI e mostra a ogni cliente dove risparmiare — con i risparmi verificati sugli addebiti successivi.",
    cta: "Candidati come partner",
    ctaSecondary: "Vedi i prezzi",
    audiences: ["Commercialisti", "Consulenti fiscali", "MSP e fornitori IT"],
    clientsTitle: "Cosa ottengono i tuoi clienti",
    clients: [
      { t: "La spesa AI, trovata per loro", d: "Ogni abbonamento AI nelle fatture elettroniche e negli estratti conto o carta, con piano, licenze e costo mensile reale." },
      { t: "Dove risparmiare", d: "Licenze inutilizzate, strumenti doppi, piani personali pagati dall'azienda, fatturazione annuale più conveniente." },
      { t: "Risparmi verificati sugli addebiti successivi", d: "angar controlla gli addebiti bancari seguenti: un risparmio conta solo quando la spesa scende davvero." },
    ],
    formatsLabel: "Legge",
    statements: "estratti conto e carte",
    mock: { title: "I tuoi clienti", client: "Cliente", spend: "Spesa AI", save: "Risparmio", example: "Esempio" },
    youTitle: "Cosa ottieni tu",
    you: [
      { t: "Console multi-cliente", d: "Tutti i workspace dei clienti in un unico posto: spesa AI, risparmi possibili e cosa controllare." },
      { t: "Sconto partner del {d}%", d: "{d}% di sconto su ogni licenza e dispositivo angar Edge. Rivendi a listino o passa lo sconto ai clienti." },
      { t: "Oppure una quota ricorrente", d: "Non vuoi rivendere? Segnala i clienti e ricevi il {r}% di quanto pagano, ogni mese." },
      { t: "Il tuo marchio sui report", d: "Report AI mensili con nome e logo dello studio, pronti da inviare.", soon: true },
    ],
    soon: "In arrivo",
    how: [
      { t: "Candidati", d: "Raccontaci del tuo studio. Rispondiamo entro due giorni lavorativi e attiviamo l'account partner." },
      { t: "Aggiungi i clienti", d: "Crea un workspace per ogni cliente nella console partner e carica fatture elettroniche ed estratti conto." },
      { t: "Report e risparmi", d: "Mostra a ogni cliente spesa AI e risparmi; angar li verifica sugli addebiti successivi." },
    ],
    formTitle: "Candidati al programma partner",
    formSub: "Cinque campi, due minuti. Nessun impegno.",
    messagePh: "Che clienti seguite, che gestionale usate, cosa dovremmo sapere.",
    submit: "Invia la candidatura",
    pilotNote: "Non sei un partner ma un'azienda che vuole provare angar?",
    pilotLink: "Partecipa al programma pilota",
  },
  de: {
    metaTitle: "angar für Steuerberater und IT-Partner",
    metaDesc: "Finden Sie die KI-Ausgaben Ihrer Mandanten in E-Rechnungen und Kontoauszügen, die Sie ohnehin bearbeiten — und zeigen Sie, wo sie sparen. Für Steuerberater, Buchhalter und MSPs in ganz Europa.",
    eyebrow: "Partnerprogramm",
    h1: "Die KI-Ausgaben Ihrer Mandanten — in den Belegen, die Sie schon haben.",
    sub: "Für Steuerberater und Buchhalter, Steuerkanzleien sowie MSPs und IT-Dienstleister in ganz Europa. angar liest E-Rechnungen und Kontoauszüge, findet jedes KI-Abo und zeigt jedem Mandanten, wo er sparen kann — geprüft an den nächsten Abbuchungen.",
    cta: "Als Partner bewerben",
    ctaSecondary: "Preise ansehen",
    audiences: ["Steuerberater & Buchhalter", "Steuerkanzleien", "MSPs & IT-Dienstleister"],
    clientsTitle: "Was Ihre Mandanten bekommen",
    clients: [
      { t: "KI-Ausgaben, automatisch gefunden", d: "Jedes KI-Abo in E-Rechnungen und Konto- oder Kartenauszügen, mit Tarif, Lizenzen und echten Monatskosten." },
      { t: "Wo sich sparen lässt", d: "Ungenutzte Lizenzen, doppelte Tools, private Tarife auf Firmenkosten, günstigere Jahresabrechnung." },
      { t: "Ersparnis an den nächsten Rechnungen geprüft", d: "angar prüft die folgenden Abbuchungen: Eine Ersparnis zählt erst, wenn die Rechnung wirklich sinkt." },
    ],
    formatsLabel: "Liest",
    statements: "Konto- & Kartenauszüge",
    mock: { title: "Ihre Mandanten", client: "Mandant", spend: "KI-Ausgaben", save: "Ersparnis", example: "Beispiel" },
    youTitle: "Was Sie bekommen",
    you: [
      { t: "Mandanten-Konsole", d: "Alle Mandanten-Workspaces an einem Ort: KI-Ausgaben, mögliche Ersparnis und offene Prüfungen." },
      { t: "{d}% Partnerrabatt", d: "{d}% auf jede Lizenz und jedes angar-Edge-Gerät. Zum Listenpreis weiterverkaufen oder den Rabatt weitergeben." },
      { t: "Oder eine Umsatzbeteiligung", d: "Lieber nicht weiterverkaufen? Mandanten empfehlen und {r}% ihrer Zahlungen erhalten, jeden Monat." },
      { t: "Ihre Marke auf Mandantenberichten", d: "Monatliche KI-Berichte mit Name und Logo Ihrer Kanzlei, versandfertig.", soon: true },
    ],
    soon: "Demnächst",
    how: [
      { t: "Bewerben", d: "Erzählen Sie uns von Ihrer Kanzlei. Wir antworten innerhalb von zwei Werktagen und richten Ihr Partnerkonto ein." },
      { t: "Mandanten hinzufügen", d: "Legen Sie in der Partner-Konsole einen Workspace je Mandant an und laden Sie E-Rechnungen und Kontoauszüge hoch." },
      { t: "Berichten und sparen", d: "Zeigen Sie jedem Mandanten KI-Ausgaben und Ersparnis; angar prüft sie an den nächsten Rechnungen." },
    ],
    formTitle: "Für das Partnerprogramm bewerben",
    formSub: "Fünf Felder, zwei Minuten. Unverbindlich.",
    messagePh: "Welche Mandanten, welche Software (z. B. DATEV), was wir wissen sollten.",
    submit: "Bewerbung senden",
    pilotNote: "Kein Partner, sondern ein Unternehmen, das angar testen möchte?",
    pilotLink: "Am Pilotprogramm teilnehmen",
  },
  fr: {
    metaTitle: "angar pour les experts-comptables et partenaires IT",
    metaDesc: "Retrouvez les dépenses IA de vos clients dans les factures électroniques et relevés bancaires que vous traitez déjà, et montrez-leur où économiser. Pour experts-comptables, conseillers fiscaux et MSP dans toute l'Europe.",
    eyebrow: "Programme partenaires",
    h1: "Les dépenses IA de vos clients, dans les documents que vous avez déjà.",
    sub: "Pour les experts-comptables, conseillers fiscaux, MSP et prestataires IT dans toute l'Europe. angar lit les factures électroniques et les relevés bancaires, trouve chaque abonnement IA et montre à chaque client où économiser — économies vérifiées sur les factures suivantes.",
    cta: "Devenir partenaire",
    ctaSecondary: "Voir les tarifs",
    audiences: ["Experts-comptables", "Conseillers fiscaux", "MSP et prestataires IT"],
    clientsTitle: "Ce que vos clients obtiennent",
    clients: [
      { t: "Leurs dépenses IA, retrouvées", d: "Chaque abonnement IA dans leurs factures électroniques et relevés bancaires ou de carte, avec offre, licences et coût mensuel réel." },
      { t: "Où économiser", d: "Licences inutilisées, outils en double, offres personnelles payées par l'entreprise, facturation annuelle moins chère." },
      { t: "Économies vérifiées sur les factures suivantes", d: "angar contrôle les prélèvements suivants : une économie ne compte que si la facture baisse vraiment." },
    ],
    formatsLabel: "Lit",
    statements: "relevés bancaires et de carte",
    mock: { title: "Vos clients", client: "Client", spend: "Dépenses IA", save: "Économies", example: "Exemple" },
    youTitle: "Ce que vous obtenez",
    you: [
      { t: "Console multi-clients", d: "Tous les espaces clients au même endroit : dépenses IA, économies possibles et points à vérifier." },
      { t: "{d} % de remise partenaire", d: "{d} % sur chaque licence et chaque boîtier angar Edge. Revendez au prix catalogue ou faites profiter vos clients de la remise." },
      { t: "Ou un partage de revenus", d: "Vous préférez ne pas revendre ? Recommandez des clients et recevez {r} % de ce qu'ils paient, chaque mois." },
      { t: "Votre marque sur les rapports clients", d: "Rapports IA mensuels au nom et logo de votre cabinet, prêts à envoyer.", soon: true },
    ],
    soon: "Bientôt",
    how: [
      { t: "Postulez", d: "Présentez-nous votre cabinet. Nous répondons sous deux jours ouvrés et créons votre compte partenaire." },
      { t: "Ajoutez vos clients", d: "Créez un espace pour chaque client dans la console partenaires et déposez factures électroniques et relevés." },
      { t: "Rapports et économies", d: "Montrez à chaque client ses dépenses IA et ses économies ; angar les vérifie sur les factures suivantes." },
    ],
    formTitle: "Rejoindre le programme partenaires",
    formSub: "Cinq champs, deux minutes. Sans engagement.",
    messagePh: "Quels clients, quel logiciel comptable, ce que nous devrions savoir.",
    submit: "Envoyer la candidature",
    pilotNote: "Pas partenaire, mais une entreprise qui veut essayer angar ?",
    pilotLink: "Rejoindre le programme pilote",
  },
  es: {
    metaTitle: "angar para asesorías y partners IT",
    metaDesc: "Encuentra el gasto en IA de tus clientes en las facturas electrónicas y extractos bancarios que ya gestionas, y muéstrales dónde ahorrar. Para asesorías, gestorías y MSP en toda Europa.",
    eyebrow: "Programa de partners",
    h1: "El gasto en IA de tus clientes, en los documentos que ya tienes.",
    sub: "Para asesorías contables y fiscales, gestorías, MSP y proveedores IT en toda Europa. angar lee facturas electrónicas y extractos bancarios, encuentra cada suscripción de IA y muestra a cada cliente dónde ahorrar — con el ahorro verificado en los siguientes cargos.",
    cta: "Solicitar ser partner",
    ctaSecondary: "Ver precios",
    audiences: ["Asesorías contables", "Asesores fiscales", "MSP y proveedores IT"],
    clientsTitle: "Qué obtienen tus clientes",
    clients: [
      { t: "Su gasto en IA, encontrado", d: "Cada suscripción de IA en sus facturas electrónicas y extractos bancarios o de tarjeta, con plan, licencias y coste mensual real." },
      { t: "Dónde ahorrar", d: "Licencias sin uso, herramientas duplicadas, planes personales pagados por la empresa, facturación anual más barata." },
      { t: "Ahorro verificado en las siguientes facturas", d: "angar revisa los cargos bancarios siguientes: un ahorro cuenta solo cuando la factura baja de verdad." },
    ],
    formatsLabel: "Lee",
    statements: "extractos bancarios y de tarjeta",
    mock: { title: "Tus clientes", client: "Cliente", spend: "Gasto IA", save: "Ahorro", example: "Ejemplo" },
    youTitle: "Qué obtienes tú",
    you: [
      { t: "Consola multicliente", d: "Todos los espacios de tus clientes en un solo lugar: gasto en IA, ahorro posible y qué revisar." },
      { t: "{d}% de descuento partner", d: "{d}% en cada licencia y dispositivo angar Edge. Revende a precio de tarifa o traslada el descuento a tus clientes." },
      { t: "O una comisión recurrente", d: "¿Prefieres no revender? Recomienda clientes y recibe el {r}% de lo que pagan, cada mes." },
      { t: "Tu marca en los informes", d: "Informes mensuales de IA con el nombre y logo de tu despacho, listos para enviar.", soon: true },
    ],
    soon: "Próximamente",
    how: [
      { t: "Solicítalo", d: "Cuéntanos sobre tu despacho. Respondemos en dos días laborables y activamos tu cuenta de partner." },
      { t: "Añade clientes", d: "Crea un espacio para cada cliente en la consola de partners y sube sus facturas electrónicas y extractos." },
      { t: "Informa y ahorra", d: "Muestra a cada cliente su gasto en IA y el ahorro; angar lo verifica en las siguientes facturas." },
    ],
    formTitle: "Solicitud del programa de partners",
    formSub: "Cinco campos, dos minutos. Sin compromiso.",
    messagePh: "Qué clientes, qué software usáis, lo que deberíamos saber.",
    submit: "Enviar solicitud",
    pilotNote: "¿No eres partner sino una empresa que quiere probar angar?",
    pilotLink: "Únete al programa piloto",
  },
};

export const PILOT: Record<Lang, PilotCopy> = {
  en: {
    metaTitle: "angar pilot programme — 10 companies",
    metaDesc: "60 days free on the Save plan and a 30-minute setup call, in exchange for feedback and a short case study. Open to the first 10 companies.",
    eyebrow: "Pilot programme · first 10 companies",
    h1: "Find out what you really spend on AI — free for 60 days.",
    sub: "We're opening angar to 10 companies. You get the Save plan free for 60 days and a 30-minute setup call. We ask for honest feedback and a short case study.",
    cta: "Apply for the pilot",
    ctaSecondary: "Try the free check first",
    facts: [
      { v: "10", l: "companies" },
      { v: "60", l: "days free on Save" },
      { v: "30 min", l: "setup call" },
    ],
    getTitle: "What you get",
    get: [
      { t: "The Save plan, free for 60 days", d: "Every AI your company pays for, who uses it, unused seats and where to save. No card needed." },
      { t: "A 30-minute setup call", d: "We load your e-invoices and bank statement together and walk through the first results." },
      { t: "Savings verified on your bills", d: "We check the next bank charges with you, so every saving is real money, not an estimate." },
    ],
    askTitle: "What we ask in return",
    ask: [
      { t: "Honest feedback", d: "Two short calls during the 60 days: what helped, what didn't, what's missing." },
      { t: "A short case study", d: "A few lines and the numbers you're happy to share. Anonymous if you prefer." },
    ],
    how: [
      { t: "Apply", d: "Tell us about your company. We reply within two working days." },
      { t: "Setup call", d: "30 minutes: e-invoices and bank statement in, first savings on screen." },
      { t: "60 days on Save", d: "Make the changes, then see them confirmed on the next bills." },
    ],
    formTitle: "Apply for the pilot",
    formSub: "Places are limited to 10 companies. No commitment after the 60 days.",
    messagePh: "Which AI tools you use, what you'd like to find out.",
    submit: "Apply for the pilot",
    partnerNote: "An accountant or IT provider with several clients?",
    partnerLink: "See the partner programme",
  },
  it: {
    metaTitle: "Programma pilota angar — 10 aziende",
    metaDesc: "60 giorni gratis sul piano Save e una chiamata di avvio di 30 minuti, in cambio di feedback e un breve caso studio. Aperto alle prime 10 aziende.",
    eyebrow: "Programma pilota · prime 10 aziende",
    h1: "Scopri quanto spendi davvero in AI — gratis per 60 giorni.",
    sub: "Apriamo angar a 10 aziende. Ricevi il piano Save gratis per 60 giorni e una chiamata di avvio di 30 minuti. In cambio ti chiediamo un feedback sincero e un breve caso studio.",
    cta: "Candidati al pilota",
    ctaSecondary: "Prova prima il check gratuito",
    facts: [
      { v: "10", l: "aziende" },
      { v: "60", l: "giorni gratis su Save" },
      { v: "30 min", l: "chiamata di avvio" },
    ],
    getTitle: "Cosa ricevi",
    get: [
      { t: "Il piano Save, gratis per 60 giorni", d: "Ogni AI che l'azienda paga, chi la usa, licenze inutilizzate e dove risparmiare. Nessuna carta richiesta." },
      { t: "Una chiamata di avvio di 30 minuti", d: "Carichiamo insieme fatture elettroniche ed estratto conto e guardiamo i primi risultati." },
      { t: "Risparmi verificati in banca", d: "Controlliamo con te gli addebiti successivi: ogni risparmio è denaro vero, non una stima." },
    ],
    askTitle: "Cosa ti chiediamo",
    ask: [
      { t: "Un feedback sincero", d: "Due brevi chiamate nei 60 giorni: cosa è servito, cosa no, cosa manca." },
      { t: "Un breve caso studio", d: "Poche righe e i numeri che vuoi condividere. Anche in forma anonima." },
    ],
    how: [
      { t: "Candidati", d: "Raccontaci della tua azienda. Rispondiamo entro due giorni lavorativi." },
      { t: "Chiamata di avvio", d: "30 minuti: fatture ed estratto conto caricati, primi risparmi sullo schermo." },
      { t: "60 giorni su Save", d: "Applica le modifiche e vedile confermate sugli addebiti successivi." },
    ],
    formTitle: "Candidati al programma pilota",
    formSub: "Posti limitati a 10 aziende. Nessun impegno dopo i 60 giorni.",
    messagePh: "Che strumenti AI usate, cosa vorreste scoprire.",
    submit: "Candidati al pilota",
    partnerNote: "Sei un commercialista o un fornitore IT con più clienti?",
    partnerLink: "Vedi il programma partner",
  },
  de: {
    metaTitle: "angar Pilotprogramm — 10 Unternehmen",
    metaDesc: "60 Tage kostenlos im Save-Tarif und ein 30-minütiges Einrichtungsgespräch, im Gegenzug für Feedback und eine kurze Fallstudie. Für die ersten 10 Unternehmen.",
    eyebrow: "Pilotprogramm · die ersten 10 Unternehmen",
    h1: "Erfahren Sie, was Sie wirklich für KI ausgeben — 60 Tage kostenlos.",
    sub: "Wir öffnen angar für 10 Unternehmen. Sie erhalten den Save-Tarif 60 Tage kostenlos und ein 30-minütiges Einrichtungsgespräch. Wir bitten um ehrliches Feedback und eine kurze Fallstudie.",
    cta: "Für den Pilot bewerben",
    ctaSecondary: "Erst den kostenlosen Check testen",
    facts: [
      { v: "10", l: "Unternehmen" },
      { v: "60", l: "Tage kostenlos auf Save" },
      { v: "30 Min.", l: "Einrichtungsgespräch" },
    ],
    getTitle: "Was Sie bekommen",
    get: [
      { t: "Der Save-Tarif, 60 Tage kostenlos", d: "Jede KI, die Ihr Unternehmen bezahlt, wer sie nutzt, ungenutzte Lizenzen und wo sich sparen lässt. Ohne Kreditkarte." },
      { t: "Ein 30-minütiges Einrichtungsgespräch", d: "Wir laden gemeinsam E-Rechnungen und Kontoauszug hoch und gehen die ersten Ergebnisse durch." },
      { t: "Ersparnis an den Rechnungen geprüft", d: "Wir prüfen mit Ihnen die nächsten Abbuchungen — jede Ersparnis ist echtes Geld, keine Schätzung." },
    ],
    askTitle: "Was wir uns wünschen",
    ask: [
      { t: "Ehrliches Feedback", d: "Zwei kurze Gespräche in den 60 Tagen: was geholfen hat, was nicht, was fehlt." },
      { t: "Eine kurze Fallstudie", d: "Ein paar Sätze und die Zahlen, die Sie teilen möchten. Auf Wunsch anonym." },
    ],
    how: [
      { t: "Bewerben", d: "Erzählen Sie uns von Ihrem Unternehmen. Wir antworten innerhalb von zwei Werktagen." },
      { t: "Einrichtungsgespräch", d: "30 Minuten: E-Rechnungen und Kontoauszug hochgeladen, erste Ersparnis auf dem Bildschirm." },
      { t: "60 Tage auf Save", d: "Änderungen umsetzen und an den nächsten Rechnungen bestätigt sehen." },
    ],
    formTitle: "Für das Pilotprogramm bewerben",
    formSub: "Begrenzt auf 10 Unternehmen. Keine Verpflichtung nach den 60 Tagen.",
    messagePh: "Welche KI-Tools Sie nutzen, was Sie herausfinden möchten.",
    submit: "Für den Pilot bewerben",
    partnerNote: "Steuerberater oder IT-Dienstleister mit mehreren Mandanten?",
    partnerLink: "Zum Partnerprogramm",
  },
  fr: {
    metaTitle: "Programme pilote angar — 10 entreprises",
    metaDesc: "60 jours gratuits sur l'offre Save et un appel de mise en place de 30 minutes, en échange de vos retours et d'une courte étude de cas. Ouvert aux 10 premières entreprises.",
    eyebrow: "Programme pilote · 10 premières entreprises",
    h1: "Découvrez ce que vous dépensez vraiment en IA — gratuitement pendant 60 jours.",
    sub: "Nous ouvrons angar à 10 entreprises. Vous profitez de l'offre Save gratuitement pendant 60 jours et d'un appel de mise en place de 30 minutes. En échange, nous vous demandons des retours sincères et une courte étude de cas.",
    cta: "Candidater au pilote",
    ctaSecondary: "Essayer d'abord le check gratuit",
    facts: [
      { v: "10", l: "entreprises" },
      { v: "60", l: "jours gratuits sur Save" },
      { v: "30 min", l: "appel de mise en place" },
    ],
    getTitle: "Ce que vous obtenez",
    get: [
      { t: "L'offre Save, gratuite pendant 60 jours", d: "Chaque IA payée par l'entreprise, qui l'utilise, les licences inutilisées et où économiser. Sans carte bancaire." },
      { t: "Un appel de mise en place de 30 minutes", d: "Nous chargeons ensemble vos factures électroniques et relevé bancaire et passons en revue les premiers résultats." },
      { t: "Des économies vérifiées sur vos factures", d: "Nous vérifions avec vous les prélèvements suivants : chaque économie est de l'argent réel, pas une estimation." },
    ],
    askTitle: "Ce que nous demandons en retour",
    ask: [
      { t: "Des retours sincères", d: "Deux appels courts pendant les 60 jours : ce qui a aidé, ce qui n'a pas marché, ce qui manque." },
      { t: "Une courte étude de cas", d: "Quelques lignes et les chiffres que vous acceptez de partager. Anonyme si vous préférez." },
    ],
    how: [
      { t: "Candidatez", d: "Présentez-nous votre entreprise. Nous répondons sous deux jours ouvrés." },
      { t: "Appel de mise en place", d: "30 minutes : factures et relevé chargés, premières économies à l'écran." },
      { t: "60 jours sur Save", d: "Appliquez les changements et voyez-les confirmés sur les factures suivantes." },
    ],
    formTitle: "Candidater au programme pilote",
    formSub: "Limité à 10 entreprises. Aucun engagement après les 60 jours.",
    messagePh: "Quels outils IA vous utilisez, ce que vous aimeriez découvrir.",
    submit: "Candidater au pilote",
    partnerNote: "Expert-comptable ou prestataire IT avec plusieurs clients ?",
    partnerLink: "Voir le programme partenaires",
  },
  es: {
    metaTitle: "Programa piloto de angar — 10 empresas",
    metaDesc: "60 días gratis en el plan Save y una llamada de puesta en marcha de 30 minutos, a cambio de feedback y un breve caso de estudio. Abierto a las 10 primeras empresas.",
    eyebrow: "Programa piloto · 10 primeras empresas",
    h1: "Descubre cuánto gastas realmente en IA — gratis durante 60 días.",
    sub: "Abrimos angar a 10 empresas. Recibes el plan Save gratis durante 60 días y una llamada de puesta en marcha de 30 minutos. A cambio te pedimos feedback sincero y un breve caso de estudio.",
    cta: "Solicitar el piloto",
    ctaSecondary: "Prueba antes el check gratuito",
    facts: [
      { v: "10", l: "empresas" },
      { v: "60", l: "días gratis en Save" },
      { v: "30 min", l: "llamada de puesta en marcha" },
    ],
    getTitle: "Qué recibes",
    get: [
      { t: "El plan Save, gratis 60 días", d: "Cada IA que paga tu empresa, quién la usa, licencias sin uso y dónde ahorrar. Sin tarjeta." },
      { t: "Una llamada de 30 minutos", d: "Cargamos juntos tus facturas electrónicas y el extracto bancario y repasamos los primeros resultados." },
      { t: "Ahorro verificado en tus facturas", d: "Revisamos contigo los siguientes cargos: cada ahorro es dinero real, no una estimación." },
    ],
    askTitle: "Qué te pedimos a cambio",
    ask: [
      { t: "Feedback sincero", d: "Dos llamadas cortas durante los 60 días: qué ayudó, qué no, qué falta." },
      { t: "Un breve caso de estudio", d: "Unas líneas y las cifras que quieras compartir. Anónimo si lo prefieres." },
    ],
    how: [
      { t: "Solicítalo", d: "Cuéntanos sobre tu empresa. Respondemos en dos días laborables." },
      { t: "Llamada de puesta en marcha", d: "30 minutos: facturas y extracto cargados, primeros ahorros en pantalla." },
      { t: "60 días en Save", d: "Aplica los cambios y velos confirmados en las siguientes facturas." },
    ],
    formTitle: "Solicitud del programa piloto",
    formSub: "Plazas limitadas a 10 empresas. Sin compromiso tras los 60 días.",
    messagePh: "Qué herramientas de IA usáis, qué os gustaría descubrir.",
    submit: "Solicitar el piloto",
    partnerNote: "¿Asesoría o proveedor IT con varios clientes?",
    partnerLink: "Ver el programa de partners",
  },
};

/** Formati letti da angar, mostrati come etichette (nomi propri: uguali in ogni lingua). */
export const E_INVOICE_FORMATS = ["FatturaPA", "Peppol / UBL", "XRechnung", "ZUGFeRD", "Factur-X", "Facturae"];
