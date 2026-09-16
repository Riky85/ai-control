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
  admin consent concesso. La correlazione sign-in→asset è marcata come TODO
  esplicito nel codice: non è ancora completa (vedi commento nel file).
- **Connettore GitHub** (`src/lib/connectors/github.ts`) — GitHub App con
  JWT firmato via `node:crypto` (nessuna dipendenza extra), seat Copilot,
  repository, audit log best-effort. Funziona con una vera GitHub App
  installata sull'org.
- **Trigger di sync manuale**: `POST /api/sync/microsoft_365` o
  `POST /api/sync/github` (finché non c'è uno scheduler/cron).
- **Dashboard, lista asset, dettaglio asset** con dati demo seedati che
  rispecchiano lo scenario "aha moment" del PRD (un tool AI di terze parti
  scoperto via OAuth grant che IT non conosceva, un coding agent su un repo
  di produzione senza owner, ecc.).

## Cosa NON è ancora implementato (onestamente, non nascosto)

- **Connettori Anthropic e OpenAI**: solo l'interfaccia esiste
  (`src/lib/connectors/types.ts`), nessuna implementazione — richiedono un
  cliente pilota con Claude Enterprise / ChatGPT Enterprise reale per essere
  scritti e testati (PRD §5.3, §5.4).
- **Autenticazione multi-tenant reale**: tutto gira su `ORG_ID = "demo-org"`
  hardcoded. Fuori scope MVP1 per esplicita scelta del PRD.
- **Enforcement/blocco attivo**: il prodotto osserva, non blocca ancora
  nulla (Control/Policy engine è V4 nella roadmap del PRD, richiede
  integrazioni con proxy/endpoint/IdP che non abbiamo).
- **Scheduler dei sync**: oggi il sync è manuale via API route. Un cron
  reale (Railway cron, o un job scheduler) è il prossimo passo naturale.
- **Correlazione sign-in Microsoft → asset**: il connettore MS365 legge i
  sign-in log ma non li collega ancora agli asset per `appId`/`objectId`
  (vedi TODO nel codice).

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
