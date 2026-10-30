# coldchain CRM

An in-house CRM for business development: accounts, contacts, a 14-stage pipeline from
00-Lead to 12-Inactive, follow-ups, and pipeline reporting. When an opportunity reaches
06-Budget (or is first entered at 07 or later), it is pushed to Vista as a Pre-Construction
potential project through Trimble App Xchange, and kept in step until it's won or closed.

Built to fix why Unanet stalled: reporting, an unreliable Vista sync, and slow activity
tracking. See [CLAUDE.md](./CLAUDE.md) for architecture and rules.

> **Status: built on assumptions.** The Vista connector's exact field names haven't been
> confirmed yet (no App Xchange access). Everything Vista-specific is marked `ASSUMPTION`
> and lives in a few files; see "Before going live" below.

## Run it

Requires Node.js 22+.

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no `DATABASE_URL`, the app runs on in-memory demo data
(resets on restart) and shows a "sign in as" switcher so you can try each role.

To watch the Vista sync work end to end, run a fake App Xchange flow in a second terminal:

```bash
cp .env.example .env     # set INTEGRATION_API_KEY to 32+ random characters
npm run dev              # restart so the key is picked up
npm run mock:appxchange -- --watch          # every push succeeds
npm run mock:appxchange -- --fail           # Vista rejects pushes: see the Vista sync screen
```

Move an opportunity to 06-Budget and watch it appear on **Vista sync**.

### With SQL Server

```bash
docker compose up -d
docker compose exec sqlserver /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa \
  -P 'Local_Dev_Passw0rd!' -Q "CREATE DATABASE crm"
# set DATABASE_URL in .env (see .env.example)
npm run db:migrate -- --name init
npm run dev
```

## Check your work

```bash
npm run check           # typecheck, lint, tests
npm run test:coverage   # what CI runs
npm run build
```

GitHub Actions runs the same checks on every pull request.

## How it fits together

```
CRM (this app)                     App Xchange                      Vista (company 9)
opportunity saved at 06+  ──►  outbox message
                                   scheduled flow claims it  ──►  Potential Projects Add/Change
                          ◄──  result (code or error)  ◄──────────
Vista customers, jobs     ◄──  flows on Vista cache events  ◄──  AR customers, JC jobs (2020+)
and pick lists                                                     project types, estimators
```

- The CRM owns retries, ordering and errors. Temporary failures retry with backoff (up to
  8 attempts); data Vista rejects stops and shows on the **Vista sync** screen with Retry.
- Payloads are already in Vista's shape (`src/integration/vista/mapping.ts`), so flows
  don't map fields.
- Contract for the flows: [docs/openapi.yaml](./docs/openapi.yaml). Every call sends the
  `INTEGRATION_API_KEY` as `x-api-key`.

## Before going live

1. **Get App Xchange access** and open the Vista connector's Pre-Construction >
   Potential Projects actions. Update `src/integration/vista/mapping.ts` and its tests to
   the real property names, status values and code length.
2. **Confirm required fields** for a potential project and update `checkVistaReadiness`
   in `src/domain/validation.ts`.
3. **Add a user-defined field** on Vista potential projects for the CRM id (`ud_CRMId`),
   or drop it from the map.
4. **Build three App Xchange flows** with the HTTP connector pointed at this app:
   outbox delivery (scheduled), customers + jobs + lookups (Vista cache events).
5. **Test against company 201** with `VISTA_COMPANY=201`, then switch to `9` after UAT.
6. **Host on Azure**: App Service (Node 22) with Authentication on (Microsoft Entra ID),
   Azure SQL, `AUTH_MODE=entra`, and secrets in Key Vault. Run `npm run db:deploy` on release.
7. **Add users** with their Microsoft 365 email and role.

## Not built yet

- Outlook email and meeting capture (Microsoft Graph); the activity model is ready for it
- Power BI reports on the SQL database
- Admin screens for users and roles (seeded for now)
- Importing the ~20 open Unanet pursuits (re-enter or CSV)
