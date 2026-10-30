# CLAUDE.md

Instructions for AI coding tools (Claude Code, Codex) and people working on this repo.
`AGENTS.md` points here. Read this file before changing anything.

## What this is

An in-house CRM for a construction company's business development pipeline. It replaces
Unanet, which stalled on weak reporting, a Vista sync that errored constantly (mostly field
mapping), and slow activity tracking. Vista ERP (cloud) is the system of record for money and
jobs. Trimble App Xchange moves data between the two.

Users: BD, estimators, and (later) PMs. Roles: `BD`, `ESTIMATOR`, `PM`, `ADMIN`, `EXECUTIVE`.

## Commands

```bash
npm install            # also generates the Prisma client
npm run dev            # http://localhost:3000, in-memory demo data when DATABASE_URL is empty
npm run check          # typecheck + lint + tests: run before every commit
npm run test:coverage  # what CI runs; thresholds in vitest.config.mts
npm run build
npm run mock:appxchange -- --watch   # fake App Xchange flow against the running app
```

## Architecture

```
src/domain/            Pure business rules. No I/O. Everything here is unit tested.
  stages.ts            The 14 pipeline stages (00-12) and their rules
  push.ts              When a change must go to Vista (create vs update)
  outbox.ts            Outbox state machine (claim, retry, backoff, dead, replay)
  validation.ts        zod input schemas + the Vista readiness check
  permissions.ts       Role -> permission grants
src/integration/vista/
  mapping.ts           THE Vista field map. The only place CRM fields become Vista fields.
src/server/
  services/            All writes. Take a ServiceContext; enforce permissions and rules.
  repo/                Repo interface; memory.ts (tests, demo) and prisma.ts (SQL Server)
  http/                Integration API handlers (plain Request -> Response, testable)
  auth.ts, runtime.ts  Current user and repo selection
src/app/               Next.js 16 App Router pages, server actions, API routes
prisma/schema.prisma   SQL Server schema
docs/openapi.yaml      Contract with the App Xchange flows
tests/                 Vitest. support/fixtures.ts builds a seeded in-memory world.
```

### How a project reaches Vista

1. A user saves an opportunity. `services/opportunities.ts` validates it, and in ONE
   transaction saves it, records the stage change and writes an outbox message.
2. A scheduled App Xchange flow calls `POST /api/integration/outbox/claim`, passes each
   payload unchanged to the Vista connector (Pre-Construction > Potential Projects Add/Change),
   then reports `POST /api/integration/outbox/{id}/result`.
3. The CRM records success (Vista code, new customer number) or failure (retry with backoff,
   or DEAD for bad data). Failures show on the Vista sync screen with a Retry button.

Push rules: stages 06-09A must be in Vista. An opportunity created at 07 or later is pushed
on save. After the first push, any change to a synced field sends an update, including
closing at 10-Lose, 11-Cancel or 12-Inactive. Opportunities closed before 06 never go to Vista.

## Rules (do not break these)

- **Business rules live in `src/domain/`**, nowhere else. UI and services import them.
- **Vista field names live only in `src/integration/vista/mapping.ts`.** App Xchange flows
  must not map fields. Change the map and its tests together.
- **All writes go through `src/server/services/`.** Pages and server actions never call
  `repo.*.create/update` directly. Services check permissions and rules.
- **Opportunity + outbox are saved in one transaction.** Never queue Vista work outside
  `repo.transaction`.
- **Codes are picked, never typed.** Project type, estimator and Vista customer come from
  lists synced from Vista (`lookups`, `vistaCustomers`).
- **Every change ships with tests.** New rule -> test in `tests/domain.test.ts`. New service
  behaviour -> `tests/services.test.ts` or `tests/crm.test.ts`. A new repo method -> add it
  to both repos and to `tests/repo-contract.test.ts`.
- **Schema changes go through Prisma migrations** (`npm run db:migrate -- --name <what>`).
  Never edit the database by hand. SQL Server has no Prisma enums: use strings + TS unions.
- **Never touch production.** AI tools work against the in-memory backend, local SQL Server,
  the stale Vista sandbox, or Vista test company 201. No production connection strings or
  API keys in code, prompts or commits. `.env` is git-ignored.
- **Never write to Vista with SQL.** Vista changes go through App Xchange only.
- **Money** is dollars as `number` in TS and `DECIMAL(14,2)` in SQL. Round to cents on input.
- **Dates** without a time are stored as midnight UTC. Format with `src/lib/format.ts`.

## Next.js 16 notes

This is Next.js 16 with `cacheComponents`. Request APIs (`params`, `searchParams`,
`cookies()`, `headers()`) are async. Pages that read CRM data need a `loading.tsx` (or a
`<Suspense>`) in their route folder, or dev shows "uncached data during prerendering".
Check `node_modules/next/dist/docs/` before using an API you're unsure of.

## Assumptions still to confirm (search the code for `ASSUMPTION`)

- Vista connector action names and property names for Potential Projects (mapping.ts)
- Vista potential project status values and code length (mapping.ts)
- Fields Vista requires before a push (validation.ts `checkVistaReadiness`)
- A Vista user-defined field (`ud_CRMId`) on potential projects to hold the CRM id
- App Xchange flow can create an AR customer before the potential project
- Entra ID sign-in via Azure App Service Authentication (auth.ts)
