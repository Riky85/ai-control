/**
 * Modelli di accordo / consultazione con le rappresentanze dei lavoratori per
 * gli strumenti che possono comportare un controllo a distanza: Italia (art. 4
 * L. 300/1970), Germania (§87 Abs. 1 Nr. 6 BetrVG), Francia (CSE, L2312-38 e
 * L1222-4), Spagna (art. 64 ET, art. 87 LOPDGDD). Precompilati con la
 * limitazione delle finalità, la minimizzazione e la conservazione reali di angar.
 */
import { MIN_GROUP, USAGE_RETENTION_MONTHS, HOSTING } from "@/lib/trust";
import type { TrustDoc } from "./types";

export function buildWorksCouncil(country: string): TrustDoc {
  if (country === "de") return de();
  if (country === "fr") return fr();
  if (country === "es") return es();
  return it();
}

function it(): TrustDoc {
  const m = USAGE_RETENTION_MONTHS;
  return {
    title: "Accordo sindacale per l'installazione e l'uso del sistema angar",
    subtitle: "ai sensi dell'art. 4, comma 1, della L. 20 maggio 1970, n. 300 (Statuto dei lavoratori)",
    blocks: [
      { p: "Tra [[ragione sociale]], con sede in [[indirizzo]], in persona di [[legale rappresentante]] (di seguito \"l'Azienda\")" },
      { p: "e [[le RSA / la RSU]] dell'unità produttiva di [[sede]] [[oppure: le organizzazioni sindacali comparativamente più rappresentative sul piano nazionale, per le imprese con unità produttive in più province o regioni]]" },
      { h: "Premesso che" },
      {
        ul: [
          "l'Azienda intende adottare angar, un servizio che tiene l'inventario degli strumenti di intelligenza artificiale (IA) usati per lavoro, dei loro costi e del loro utilizzo;",
          "alcune componenti di angar (app desktop, estensione del browser, sensore di rete angar Edge) rilevano l'uso di strumenti di IA sui dispositivi aziendali e potrebbero, in astratto, consentire un controllo a distanza dell'attività dei lavoratori;",
          "l'art. 4, comma 1, L. 300/1970 consente l'impiego di tali strumenti esclusivamente per esigenze organizzative e produttive, per la sicurezza del lavoro e per la tutela del patrimonio aziendale, previo accordo collettivo con le rappresentanze sindacali;",
          "le parti intendono garantire che il sistema non sia usato per controllare la prestazione lavorativa;",
        ],
      },
      { p: "si conviene quanto segue." },

      { h: "Art. 1 — Oggetto" },
      { p: "Il presente accordo disciplina l'installazione e l'uso di angar, nelle componenti indicate nell'allegato A, presso [[unità produttive]]." },

      { h: "Art. 2 — Finalità" },
      { p: "angar è utilizzato esclusivamente per:" },
      {
        ul: [
          "a) esigenze organizzative e produttive: controllo dei costi e delle licenze degli strumenti di IA (per esempio licenze pagate e non utilizzate);",
          "b) tutela del patrimonio aziendale e sicurezza delle informazioni: individuazione di strumenti di IA non autorizzati a cui potrebbero essere inviati dati aziendali o personali;",
          "c) adempimenti del Regolamento (UE) 2024/1689 (AI Act): registro dei sistemi di IA e alfabetizzazione del personale (art. 4 AI Act).",
        ],
      },
      { p: "È esclusa qualsiasi finalità di controllo della prestazione, di misurazione della produttività o di valutazione dei singoli lavoratori. I dati raccolti non possono essere utilizzati a fini disciplinari né per decisioni relative al rapporto di lavoro (art. 4, comma 3, L. 300/1970, come qui limitato dalle parti)." },

      { h: "Art. 3 — Dati trattati" },
      { p: "angar tratta esclusivamente: il nome degli strumenti di IA utilizzati, la data e i minuti di utilizzo giornalieri, il nome del computer aziendale, il sistema operativo, gli indirizzi IP locali, nome, email di lavoro e reparto del lavoratore, e i costi degli abbonamenti di IA risultanti da fatture ed estratti conto aziendali." },
      { p: "angar non raccoglie in nessun caso: il contenuto di richieste, risposte, messaggi, email, file o documenti; indirizzi completi delle pagine (URL), ricerche, titoli delle pagine, schermate, tasti premuti; l'uso di programmi e siti che non sono strumenti di IA; la posizione del lavoratore. La cronologia del browser viene confrontata sul computer e non viene trasmessa." },

      { h: "Art. 4 — Modalità di visualizzazione e minimizzazione" },
      { p: `angar è configurato in modalità "per reparto": i dati sono mostrati solo come totali per reparto e solo per gruppi di almeno ${MIN_GROUP} lavoratori; i reparti più piccoli sono uniti; i conteggi inferiori a ${MIN_GROUP} sono mascherati. I dati di utilizzo sono conservati con uno pseudonimo e non con l'email del lavoratore.` },
      { p: "Il passaggio alla modalità \"per persona\" richiede un'integrazione scritta del presente accordo. [[Oppure: le parti concordano la modalità per persona limitatamente alla finalità di cui all'art. 2, lett. a), con le seguenti garanzie: …]]" },

      { h: "Art. 5 — Accesso ai dati" },
      { p: "Possono accedere ad angar esclusivamente [[numero]] persone con ruolo di amministratore ([[funzioni, es. IT, amministrazione, compliance]]), nominativamente indicate e autorizzate al trattamento. L'accesso avviene con autenticazione personale e verifica in due passaggi. Ogni azione degli amministratori è registrata in un registro delle attività protetto contro le modifiche (catena di hash), consultabile su richiesta dalle RSA/RSU." },

      { h: "Art. 6 — Conservazione" },
      { p: `I dati di utilizzo sono cancellati automaticamente dopo ${m} mesi. I dati sono ospitati nell'Unione europea (${HOSTING.provider}, ${HOSTING.region}, Paesi Bassi) [[oppure: su un server dell'Azienda con l'edizione on-premises]].` },

      { h: "Art. 7 — Informazione dei lavoratori" },
      { p: "Prima dell'installazione l'Azienda consegna a ciascun lavoratore interessato l'informativa ai sensi dell'art. 13 GDPR e dell'art. 4, comma 3, L. 300/1970 (allegato B), che descrive le modalità d'uso dello strumento e di effettuazione dei controlli." },

      { h: "Art. 8 — Diritti dei lavoratori" },
      { p: "I lavoratori possono esercitare i diritti di cui agli artt. 15–21 GDPR rivolgendosi a [[contatto del titolare / DPO]]. Resta fermo il diritto di proporre reclamo al Garante per la protezione dei dati personali." },

      { h: "Art. 9 — Verifica" },
      { p: "Le parti si incontrano almeno una volta l'anno, e comunque prima di ogni modifica delle componenti, delle fonti di dati o della modalità di visualizzazione, per verificare l'applicazione del presente accordo. L'Azienda fornisce alle RSA/RSU, su richiesta, le statistiche aggregate e l'estratto del registro delle attività degli amministratori." },

      { h: "Art. 10 — Durata" },
      { p: "Il presente accordo entra in vigore alla data della sottoscrizione e ha durata [[indeterminata / di … anni]], con possibilità di recesso da ciascuna parte con preavviso di [[ ]] mesi. In caso di cessazione, l'uso delle componenti di cui all'allegato A viene sospeso." },

      { h: "Allegati" },
      { ul: ["A — Componenti di angar installate e fonti collegate: [[app desktop / estensione del browser / angar Edge / Microsoft 365 / Google Workspace]]", "B — Informativa ai lavoratori", "C — Valutazione d'impatto sulla protezione dei dati (art. 35 GDPR)"] },
      { p: "[[luogo]], [[data]]" },
      { sign: ["Per l'Azienda", "Per le RSA / la RSU"] },
    ],
  };
}

function de(): TrustDoc {
  const m = USAGE_RETENTION_MONTHS;
  return {
    title: "Betriebsvereinbarung über die Einführung und Anwendung von angar",
    subtitle: "gemäß §87 Abs. 1 Nr. 6 BetrVG",
    blocks: [
      { p: "Zwischen [[Firma]], [[Anschrift]], vertreten durch [[Geschäftsführung]] (nachfolgend \"Arbeitgeber\")" },
      { p: "und dem Betriebsrat des Betriebs [[Betrieb / Standort]] [[bzw. dem Gesamtbetriebsrat]] (nachfolgend \"Betriebsrat\")" },
      { p: "wird folgende Betriebsvereinbarung geschlossen." },

      { h: "§1 Gegenstand und Geltungsbereich" },
      { p: "Diese Vereinbarung regelt Einführung und Anwendung von angar, einem Dienst, der ein Verzeichnis der für die Arbeit genutzten KI-Werkzeuge, ihrer Kosten und ihrer Nutzung führt, in den in Anlage 1 genannten Komponenten. Sie gilt für alle Beschäftigten im Sinne von §5 Abs. 1 BetrVG im Betrieb [[ ]]. angar ist eine technische Einrichtung im Sinne von §87 Abs. 1 Nr. 6 BetrVG, da sie objektiv geeignet ist, Daten über die Nutzung von KI-Werkzeugen zu erfassen." },

      { h: "§2 Zweckbestimmung" },
      { p: "angar wird ausschließlich zu folgenden Zwecken eingesetzt:" },
      {
        ul: [
          "Kontrolle der Kosten und Lizenzen von KI-Werkzeugen (z. B. bezahlte, ungenutzte Lizenzen);",
          "Informationssicherheit: Erkennen nicht freigegebener KI-Werkzeuge, an die Unternehmens- oder personenbezogene Daten gelangen könnten;",
          "Erfüllung der Pflichten aus der Verordnung (EU) 2024/1689 (KI-Verordnung), insbesondere Verzeichnis der eingesetzten KI und KI-Kompetenz (Art. 4 KI-Verordnung).",
        ],
      },

      { h: "§3 Ausschluss von Leistungs- und Verhaltenskontrolle" },
      { p: "Eine Leistungs- oder Verhaltenskontrolle einzelner Beschäftigter mittels angar findet nicht statt. Die Daten werden nicht zur Messung der Produktivität, nicht für Beurteilungen und nicht für arbeitsrechtliche Maßnahmen (insbesondere Abmahnung, Kündigung) verwendet. Unter Verstoß gegen diese Vereinbarung gewonnene Erkenntnisse dürfen nicht verwertet werden." },

      { h: "§4 Erhobene Daten" },
      { p: "Erhoben werden ausschließlich: Name des genutzten KI-Werkzeugs, Datum und Nutzungsminuten pro Tag, Name, Betriebssystem und lokale IP-Adressen des Firmencomputers, Name, dienstliche E-Mail-Adresse und Abteilung der Beschäftigten sowie die Kosten der KI-Abonnements aus Rechnungen und Kontoauszügen des Unternehmens." },
      { p: "Nicht erhoben werden: Inhalte von Eingaben (Prompts), Antworten, Nachrichten, E-Mails, Dateien oder Dokumenten; vollständige URLs, Suchanfragen, Seitentitel, Bildschirmfotos oder Tastatureingaben; die Nutzung von Programmen und Websites, die keine KI-Werkzeuge sind; der Standort. Der Browserverlauf wird auf dem Computer abgeglichen und nicht übertragen." },

      { h: "§5 Anzeige, Aggregation und Pseudonymisierung" },
      { p: `angar wird im Modus „Pro Abteilung“ betrieben: Auswertungen zeigen nur Summen pro Abteilung und nur für Gruppen von mindestens ${MIN_GROUP} Beschäftigten; kleinere Abteilungen werden zusammengefasst, Zahlen unter ${MIN_GROUP} werden nicht genau angezeigt. Nutzungsdaten werden unter einem Pseudonym statt der E-Mail-Adresse gespeichert.` },
      { p: "Ein Wechsel in den Modus „Pro Person“ bedarf der vorherigen Zustimmung des Betriebsrats in Form einer Ergänzung dieser Vereinbarung." },

      { h: "§6 Zugriffsberechtigungen" },
      { p: "Zugriff auf angar haben ausschließlich die in Anlage 2 namentlich genannten Administratorinnen und Administratoren ([[Funktionen, z. B. IT, Finanzen, Compliance]]). Der Zugang erfolgt mit persönlicher Anmeldung und Zwei-Faktor-Authentifizierung. Alle Administratoraktionen werden in einem manipulationsgeschützten Protokoll (Hash-Kette) erfasst, das der Betriebsrat auf Verlangen einsehen kann." },

      { h: "§7 Speicherdauer und Speicherort" },
      { p: `Nutzungsdaten werden nach ${m} Monaten automatisch gelöscht. Die Daten werden in der Europäischen Union gespeichert (${HOSTING.provider}, ${HOSTING.region}, Niederlande) [[bzw. auf einem Server des Arbeitgebers in der On-Premises-Edition]]. Mit angar besteht ein Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO.` },

      { h: "§8 Information der Beschäftigten" },
      { p: "Vor der Installation erhalten alle betroffenen Beschäftigten die Datenschutzinformation nach Art. 13 DSGVO (Anlage 3)." },

      { h: "§9 Rechte der Beschäftigten" },
      { p: "Die Beschäftigten können ihre Rechte nach Art. 15–21 DSGVO gegenüber [[Kontakt Verantwortlicher / Datenschutzbeauftragte]] geltend machen. Das Beschwerderecht bei der Aufsichtsbehörde bleibt unberührt." },

      { h: "§10 Kontrollrechte des Betriebsrats" },
      { p: "Der Betriebsrat kann die Einhaltung dieser Vereinbarung jederzeit überprüfen und dazu Einsicht in die Konfiguration, die aggregierten Auswertungen und das Administratorprotokoll nehmen. Er kann hierzu einen Sachverständigen nach §80 Abs. 3 BetrVG hinzuziehen. Änderungen an Komponenten, Datenquellen oder Anzeigemodus werden dem Betriebsrat vorab mitgeteilt und bedürfen seiner Zustimmung." },

      { h: "§11 Rechtsgrundlage" },
      { p: "Diese Vereinbarung ist eine Kollektivvereinbarung im Sinne von Art. 88 DSGVO und §26 Abs. 4 BDSG. Ergänzend stützt sich die Verarbeitung auf Art. 6 Abs. 1 lit. f DSGVO." },

      { h: "§12 Inkrafttreten und Kündigung" },
      { p: "Die Vereinbarung tritt mit Unterzeichnung in Kraft. Sie kann mit einer Frist von [[drei]] Monaten zum Monatsende gekündigt werden. Bis zum Abschluss einer neuen Vereinbarung wirkt sie nach." },

      { h: "Anlagen" },
      { ul: ["1 — Eingesetzte Komponenten und Datenquellen: [[Desktop-App / Browser-Erweiterung / angar Edge / Microsoft 365 / Google Workspace]]", "2 — Liste der Zugriffsberechtigten", "3 — Datenschutzinformation für Beschäftigte", "4 — Datenschutz-Folgenabschätzung (Art. 35 DSGVO)"] },
      { p: "[[Ort]], [[Datum]]" },
      { sign: ["Für den Arbeitgeber", "Für den Betriebsrat"] },
    ],
  };
}

function fr(): TrustDoc {
  const m = USAGE_RETENTION_MONTHS;
  return {
    title: "Note d'information et de consultation du CSE sur la mise en place d'angar",
    subtitle: "articles L2312-8, L2312-38 et L1222-4 du Code du travail",
    blocks: [
      { p: "Entreprise : [[raison sociale]], [[adresse]]. Établissement : [[ ]]." },
      { p: "Destinataire : le comité social et économique (CSE) [[central / d'établissement]]." },
      { p: "Réunion de consultation prévue le : [[date]]. Délai de consultation : [[un mois, sauf accord]] (article R2312-6 du Code du travail)." },

      { h: "1. Objet de la consultation" },
      { p: "L'employeur envisage de mettre en place angar, un service qui tient l'inventaire des outils d'intelligence artificielle (IA) utilisés pour le travail, de leur coût et de leur utilisation. Certaines composantes (application de bureau, extension de navigateur, capteur réseau angar Edge) relèvent l'utilisation d'outils d'IA sur les postes de l'entreprise. Conformément à l'article L2312-38 du Code du travail, le CSE est informé et consulté, préalablement à la décision de mise en œuvre, sur ces moyens et techniques." },

      { h: "2. Finalités" },
      {
        ul: [
          "Maîtrise des coûts et des licences des outils d'IA (par exemple des licences payées et inutilisées).",
          "Sécurité de l'information : repérer les outils d'IA non autorisés vers lesquels des données de l'entreprise ou des données personnelles pourraient être envoyées.",
          "Conformité au règlement (UE) 2024/1689 (AI Act) : registre des IA utilisées et maîtrise de l'IA par le personnel (article 4).",
        ],
      },
      { p: "L'outil n'est pas utilisé pour évaluer la performance, mesurer la productivité ou contrôler l'activité individuelle des salariés, ni à des fins disciplinaires." },

      { h: "3. Données traitées" },
      { p: "Seules sont traitées : le nom des outils d'IA utilisés, la date et les minutes d'utilisation par jour, le nom, le système d'exploitation et les adresses IP locales de l'ordinateur professionnel, le nom, l'adresse e-mail professionnelle et le service du salarié, ainsi que le coût des abonnements d'IA issu des factures et relevés bancaires de l'entreprise." },
      { p: "Ne sont jamais collectés : le contenu des requêtes (prompts), réponses, messages, e-mails, fichiers ou documents ; les URL complètes, recherches, titres de pages, captures d'écran ou frappes au clavier ; l'utilisation de logiciels et de sites qui ne sont pas des outils d'IA ; la localisation. L'historique du navigateur est comparé sur l'ordinateur et n'est pas transmis." },

      { h: "4. Agrégation et pseudonymisation" },
      { p: `angar est configuré en mode « par service » : les données ne sont affichées que sous forme de totaux par service, pour des groupes d'au moins ${MIN_GROUP} salariés ; les petites équipes sont regroupées et les effectifs inférieurs à ${MIN_GROUP} sont masqués. Les données d'utilisation sont enregistrées sous un pseudonyme et non sous l'adresse e-mail.` },
      { p: "Tout passage au mode « par personne » fera l'objet d'une nouvelle information-consultation du CSE et d'une information préalable des salariés." },

      { h: "5. Accès aux données" },
      { p: "Seuls [[nombre]] administrateurs nommément désignés ([[fonctions : informatique, finance, conformité]]) ont accès à angar, avec une authentification personnelle et une vérification en deux étapes. Toutes leurs actions sont enregistrées dans un journal protégé contre la modification (chaîne de hachage), consultable par le CSE sur demande." },

      { h: "6. Durée de conservation et hébergement" },
      { p: `Les données d'utilisation sont supprimées automatiquement après ${m} mois. Les données sont hébergées dans l'Union européenne (${HOSTING.provider}, ${HOSTING.region}, Pays-Bas) [[ou : sur un serveur de l'entreprise avec l'édition sur site]]. Un accord de sous-traitance (article 28 du RGPD) est conclu avec angar.` },

      { h: "7. Information des salariés" },
      { p: "Conformément à l'article L1222-4 du Code du travail, aucune information concernant un salarié n'est collectée par un dispositif qui n'a pas été porté préalablement à sa connaissance. Chaque salarié concerné reçoit, avant l'installation, la note d'information prévue à l'article 13 du RGPD (annexe 2)." },

      { h: "8. Droits des salariés" },
      { p: "Les salariés peuvent exercer leurs droits (articles 15 à 21 du RGPD) auprès de [[contact du responsable de traitement / DPO]] et introduire une réclamation auprès de la CNIL." },

      { h: "9. Suivi" },
      { p: "L'employeur présente au CSE, au moins une fois par an, un bilan de l'utilisation d'angar (statistiques agrégées, extrait du journal des administrateurs) et l'informe préalablement de toute modification des composantes, des sources de données ou du mode d'affichage." },

      { h: "Avis du CSE" },
      { p: "Le CSE, réuni le [[date]], rend un avis [[favorable / défavorable / favorable avec réserves]] : [[motivation et éventuelles réserves]]." },

      { h: "Annexes" },
      { ul: ["1 — Composantes et sources activées : [[application de bureau / extension de navigateur / angar Edge / Microsoft 365 / Google Workspace]]", "2 — Note d'information des salariés", "3 — Analyse d'impact relative à la protection des données (article 35 du RGPD)"] },
      { sign: ["Pour l'employeur", "Pour le CSE (secrétaire)"] },
    ],
  };
}

function es(): TrustDoc {
  const m = USAGE_RETENTION_MONTHS;
  return {
    title: "Información a la representación legal de las personas trabajadoras sobre la implantación de angar",
    subtitle: "art. 64.5 del Estatuto de los Trabajadores y art. 87 de la Ley Orgánica 3/2018 (LOPDGDD)",
    blocks: [
      { p: "Empresa: [[razón social]], [[domicilio]], [[CIF]]." },
      { p: "Destinatario: [[el comité de empresa / los delegados de personal]] del centro de trabajo de [[ ]]." },
      { p: "Fecha de entrega: [[fecha]]. Plazo para emitir informe: [[quince días]] (art. 64.6 ET)." },

      { h: "1. Objeto" },
      { p: "La empresa prevé implantar angar, un servicio que mantiene el inventario de las herramientas de inteligencia artificial (IA) usadas para el trabajo, de su coste y de su uso. Algunos componentes (aplicación de escritorio, extensión del navegador, sensor de red angar Edge) registran el uso de herramientas de IA en los dispositivos de la empresa. De acuerdo con el artículo 64.5.f) del Estatuto de los Trabajadores, se informa a la representación legal con carácter previo a su implantación, para que pueda emitir informe, y se establecen los criterios de utilización de los dispositivos digitales con su participación (artículo 87.3 LOPDGDD)." },

      { h: "2. Finalidades" },
      {
        ul: [
          "Control de costes y licencias de las herramientas de IA (por ejemplo, licencias pagadas que nadie usa).",
          "Seguridad de la información: detectar herramientas de IA no autorizadas a las que podrían enviarse datos de la empresa o datos personales.",
          "Cumplimiento del Reglamento (UE) 2024/1689 (Reglamento de IA): registro de las IA en uso y alfabetización en IA del personal (artículo 4).",
        ],
      },
      { p: "La herramienta no se utiliza para evaluar el rendimiento, medir la productividad ni controlar la actividad individual de las personas trabajadoras, ni con fines disciplinarios. Se respetan en todo caso su intimidad y su dignidad (artículos 20.3 y 20 bis ET)." },

      { h: "3. Datos tratados" },
      { p: "Solo se tratan: el nombre de las herramientas de IA usadas, la fecha y los minutos de uso al día, el nombre, el sistema operativo y las direcciones IP locales del ordenador de la empresa, el nombre, el correo de trabajo y el departamento de la persona trabajadora, y el coste de las suscripciones de IA según las facturas y extractos bancarios de la empresa." },
      { p: "No se recogen en ningún caso: el contenido de peticiones (prompts), respuestas, mensajes, correos, archivos o documentos; URL completas, búsquedas, títulos de páginas, capturas de pantalla o pulsaciones de teclas; el uso de programas y sitios que no son herramientas de IA; la ubicación. El historial del navegador se compara en el propio ordenador y no se transmite." },

      { h: "4. Agregación y seudonimización" },
      { p: `angar está configurado en modo «por departamento»: los datos solo se muestran como totales por departamento y para grupos de al menos ${MIN_GROUP} personas; los equipos más pequeños se agrupan y las cifras inferiores a ${MIN_GROUP} se ocultan. Los datos de uso se guardan con un seudónimo y no con el correo electrónico.` },
      { p: "Cualquier cambio al modo «por persona» se comunicará previamente a la representación legal y a las personas trabajadoras." },

      { h: "5. Acceso a los datos" },
      { p: "Solo tienen acceso a angar [[número]] administradores designados nominalmente ([[funciones: TI, finanzas, cumplimiento]]), con autenticación personal y verificación en dos pasos. Todas sus acciones quedan registradas en un registro protegido frente a modificaciones (cadena de hashes), que la representación legal puede consultar a petición." },

      { h: "6. Conservación y alojamiento" },
      { p: `Los datos de uso se eliminan automáticamente a los ${m} meses. Los datos se alojan en la Unión Europea (${HOSTING.provider}, ${HOSTING.region}, Países Bajos) [[o bien: en un servidor de la empresa con la edición local]]. Se ha firmado un contrato de encargo del tratamiento con angar (artículo 28 RGPD).` },

      { h: "7. Información a las personas trabajadoras" },
      { p: "Antes de la instalación, cada persona afectada recibe la información prevista en el artículo 13 del RGPD y en el artículo 87 de la LOPDGDD (anexo 2), con los criterios de utilización de los dispositivos." },

      { h: "8. Derechos" },
      { p: "Las personas trabajadoras pueden ejercer sus derechos (artículos 15 a 21 RGPD) ante [[contacto del responsable / DPD]] y presentar una reclamación ante la Agencia Española de Protección de Datos." },

      { h: "9. Seguimiento" },
      { p: "La empresa presentará a la representación legal, al menos una vez al año, un resumen del uso de angar (estadísticas agregadas y extracto del registro de administradores) y le informará previamente de cualquier cambio en los componentes, las fuentes de datos o el modo de visualización." },

      { h: "Informe de la representación legal" },
      { p: "[[Fecha y contenido del informe, o constancia de que no se ha emitido en plazo]]" },

      { h: "Anexos" },
      { ul: ["1 — Componentes y fuentes activadas: [[aplicación de escritorio / extensión del navegador / angar Edge / Microsoft 365 / Google Workspace]]", "2 — Información a las personas trabajadoras", "3 — Evaluación de impacto relativa a la protección de datos (artículo 35 RGPD)"] },
      { sign: ["Por la empresa", "Recibido por la representación legal"] },
    ],
  };
}
