# AI Control — MVP scaffold

> Discover every AI in your company. Understand what it can access. Control what it can do.

Implementazione dell'MVP descritto in `AI-Control-PRD.md`: discovery via
connettori, AI Asset Graph, risk engine deterministico, dashboard.

## Cosa funziona davvero in questo scaffold

- **Schema dati completo** (`prisma/schema.prisma`) — 1:1 con il PRD §4.
- **Risk engine deterministico** (`src/lib/risk-engine.ts`) — pesi e soglie
  come da PRD §6. Nessun LLM nel percorso di calcolo dello score.
- **Connettore Microsoft 365/Entra** (`src/lib/connectors/microsoft365.ts`) —
  flusso client-credentials reale via Graph API. Funziona se fornisci
  `MS365_TENANT_ID/CLIENT_ID/CLIENT_SECRET` con una vera app registration e
  admin consent concesso. Correlazione sign-in→asset via mappa appId→service
  principal (non più un TODO).
- **Connettore GitHub** (`src/lib/connectors/github.ts`) — GitHub App con
  JWT firmato via `node:crypto` (nessuna dipendenza extra), seat Copilot,
  repository, audit log best-effort. Funziona con una vera GitHub App
  installata sull'org.
- **Connettore Anthropic** (`src/lib/connectors/anthropic.ts`) — Admin API
  di Claude Enterprise/Team (`ANTHROPIC_ADMIN_API_KEY`). Vede solo i membri
  dell'organizzazione gestita, mai il contenuto delle conversazioni — vedi
  il commento nel file per il limite strutturale (PRD §5.3). Endpoint da
  riverificare contro la documentazione corrente prima del primo uso reale.
- **Connettore OpenAI** (`src/lib/connectors/openai.ts`) — Organization
  Admin API di ChatGPT Enterprise/Edu (`OPENAI_ADMIN_API_KEY`). Utenti e
  audit log best-effort; le metriche di utilizzo (Workspace Analytics) sono
  esplicitamente segnalate come non ancora importate (PRD §5.4). Stesso
  avviso di verifica endpoint del connettore Anthropic.
- **Trigger di sync**: bottone "Sync now" nella pagina Connectors (server
  action), oppure `POST /api/sync/{provider}` direttamente.
- **Assegnazione owner e approvazione/rifiuto asset** dalla pagina di
  dettaglio (server actions in `src/lib/actions.ts`) — il primo pezzo reale
  di controllo amministrativo, non enforcement runtime.
- **Evidence**: snapshot automatico dell'inventario dopo ogni sync
  (`src/lib/evidence.ts`), con confronto "N nuovi/rimossi dall'ultima volta".
- **Dashboard, lista asset, dettaglio asset** con dati demo seedati che
  rispecchiano lo scenario "aha moment" del PRD (un tool AI di terze parti
  scoperto via OAuth grant che IT non conosceva, un coding agent su un repo
  di produzione senza owner, ecc.).

## Cosa NON è ancora implementato (onestamente, non nascosto)

- **Autenticazione multi-tenant reale**: tutto gira su `ORG_ID = "demo-org"`
  hardcoded. Fuori scope MVP1 per esplicita scelta del PRD.
- **Enforcement/blocco attivo**: il prodotto osserva, non blocca ancora
  nulla (Control/Policy engine è V4 nella roadmap del PRD, richiede
  integrazioni con proxy/endpoint/IdP che non abbiamo).
- **Scheduler dei sync**: oggi il sync parte a mano (bottone o API route).
  Un cron reale (Railway cron, o un job scheduler) è il prossimo passo
  naturale.
- **Cifratura credenziali connettore**: il campo `credentialsEncrypted` è
  nello schema ma nessun connettore lo popola ancora — tutti e quattro
  leggono le credenziali direttamente da variabili d'ambiente, non da
  righe salvate nel database.
- **Endpoint Anthropic/OpenAI da riverificare**: entrambi i connettori
  sono scritti secondo le Admin API note dei due vendor, ma vanno testati
  contro un'organizzazione reale prima di fare affidamento sui path esatti
  (vedi i commenti nei rispettivi file).

## Sviluppo locale

```bash
npm install
cp .env.example .env
npm run db:push
npm run db:seed
npm run dev
```

## Deploy su Railway

Stesso pattern già validato per il progetto `ai-agent-governance`:

1. Attacca un plugin **PostgreSQL** al servizio.
2. `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`.
3. Railpack rileva Next.js automaticamente. `npm run build` esegue
   `prisma generate && next build`.
4. `preDeployCommand`: `npx prisma db push --skip-generate --accept-data-loss && npx tsx prisma/seed.ts`
   (idempotente grazie agli `upsert` nel seed — sicuro da rieseguire a ogni deploy).
5. Genera un dominio pubblico per il servizio.
6. Per attivare i connettori reali, imposta le variabili elencate in
   `.env.example` sul servizio Railway.

## Principio architetturale

Come per il progetto gemello `ai-agent-governance`: **il database è sempre
la fonte di verità** per identità, permessi, stato di approvazione e risk
score. Claude/LLM, quando verrà integrato per la spiegazione in prosa dei
risk assessment, non scrive mai questi valori — li legge e li racconta.
