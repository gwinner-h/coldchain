/**
 * SQL Server / Azure SQL repository (Prisma 7 with the mssql driver adapter).
 * Converts between database rows and the plain domain types.
 */
import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import type {
  Account,
  AccountType,
  Activity,
  ActivityType,
  IntegrationEvent,
  Lookup,
  LookupKind,
  Opportunity,
  OutboxMessage,
  OutboxOperation,
  OutboxStatus,
  Role,
  StageChange,
  User,
  VistaJob,
  VistaSyncStatus,
} from "@/domain/types";
import type { StageCode } from "@/domain/stages";
import { ConcurrencyError, NotFoundError, type Repo } from "./types";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Convert a Prisma-style SQL Server URL
 *   sqlserver://host:1433;database=crm;user=sa;password=...;encrypt=true;trustServerCertificate=true
 * into an mssql connection config for the driver adapter.
 */
export function mssqlConfigFromUrl(url: string) {
  const match = /^sqlserver:\/\/([^;:]+)(?::(\d+))?;(.*)$/i.exec(url);
  if (!match) throw new Error("DATABASE_URL must look like sqlserver://host:1433;database=...;user=...;password=...");
  const params = Object.fromEntries(
    match[3]
      .split(";")
      .filter(Boolean)
      .map((pair) => {
        const i = pair.indexOf("=");
        return [pair.slice(0, i).trim().toLowerCase(), pair.slice(i + 1).trim()];
      }),
  );
  return {
    server: match[1],
    port: match[2] ? Number(match[2]) : 1433,
    database: params.database ?? params["initial catalog"],
    user: params.user ?? params.username,
    password: params.password,
    options: {
      encrypt: (params.encrypt ?? "true") === "true",
      trustServerCertificate: params.trustservercertificate === "true",
    },
  };
}

export function createPrismaClient(url = process.env.DATABASE_URL): PrismaClient {
  if (!url) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaMssql(mssqlConfigFromUrl(url));
  return new PrismaClient({ adapter });
}

const num = (d: Prisma.Decimal | null): number | null => (d === null ? null : Number(d));

const toUser = (r: Prisma.UserGetPayload<object>): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  role: r.role as Role,
  active: r.active,
});

const toAccount = (r: Prisma.AccountGetPayload<object>): Account => ({ ...r, type: r.type as AccountType });

const toOpp = (r: Prisma.OpportunityGetPayload<object>): Opportunity => ({
  ...r,
  stage: r.stage as StageCode,
  estimatedValue: num(r.estimatedValue),
  vistaSyncStatus: r.vistaSyncStatus as VistaSyncStatus,
});

const toActivity = (r: Prisma.ActivityGetPayload<object>): Activity => ({
  ...r,
  type: r.type as ActivityType,
  source: r.source as Activity["source"],
});

const toOutbox = (r: Prisma.OutboxMessageGetPayload<object>): OutboxMessage => ({
  ...r,
  operation: r.operation as OutboxOperation,
  status: r.status as OutboxStatus,
  payload: JSON.parse(r.payload) as unknown,
});

const toJob = (r: Prisma.VistaJobGetPayload<object>): VistaJob => ({
  ...r,
  contractAmount: num(r.contractAmount),
  billedToDate: num(r.billedToDate),
});

function build(db: Tx, root: PrismaClient): Repo {
  const repo: Repo = {
    async transaction(fn) {
      if (db !== root) return fn(repo); // already inside a transaction
      return root.$transaction((tx) => fn(build(tx, root)), { isolationLevel: "Serializable" });
    },

    users: {
      async list() {
        return (await db.user.findMany({ orderBy: { name: "asc" } })).map(toUser);
      },
      async get(id) {
        const r = await db.user.findUnique({ where: { id } });
        return r && toUser(r);
      },
      async getByEmail(email) {
        const r = await db.user.findUnique({ where: { email: email.toLowerCase() } });
        return r && toUser(r);
      },
      async upsert(data) {
        const row = { ...data, email: data.email.toLowerCase() };
        return toUser(await db.user.upsert({ where: { email: row.email }, create: row, update: row }));
      },
    },

    accounts: {
      async list(search) {
        const rows = await db.account.findMany({
          where: search ? { name: { contains: search } } : undefined,
          orderBy: { name: "asc" },
        });
        return rows.map(toAccount);
      },
      async get(id) {
        const r = await db.account.findUnique({ where: { id } });
        return r && toAccount(r);
      },
      async create(data) {
        return toAccount(await db.account.create({ data }));
      },
      async update(id, data) {
        return toAccount(await db.account.update({ where: { id }, data }));
      },
    },

    contacts: {
      async listByAccount(accountId) {
        return db.contact.findMany({ where: { accountId }, orderBy: { lastName: "asc" } });
      },
      async get(id) {
        return db.contact.findUnique({ where: { id } });
      },
      async create(data) {
        return db.contact.create({ data });
      },
    },

    opportunities: {
      async list(filter = {}) {
        const rows = await db.opportunity.findMany({
          where: {
            stage: filter.stages ? { in: filter.stages } : undefined,
            ownerId: filter.ownerId,
            accountId: filter.accountId,
            name: filter.search ? { contains: filter.search } : undefined,
          },
          orderBy: { updatedAt: "desc" },
        });
        return rows.map(toOpp);
      },
      async get(id) {
        const r = await db.opportunity.findUnique({ where: { id } });
        return r && toOpp(r);
      },
      async create(data) {
        return toOpp(await db.opportunity.create({ data }));
      },
      async update(id, expectedVersion, patch) {
        const { count } = await db.opportunity.updateMany({
          where: { id, version: expectedVersion },
          data: { ...patch, version: { increment: 1 } },
        });
        if (count === 0) {
          const exists = await db.opportunity.findUnique({ where: { id }, select: { id: true } });
          if (!exists) throw new NotFoundError("Opportunity", id);
          throw new ConcurrencyError("Opportunity", id);
        }
        return toOpp(await db.opportunity.findUniqueOrThrow({ where: { id } }));
      },
      async setSync(id, patch) {
        await db.opportunity.update({ where: { id }, data: patch });
      },
    },

    stageChanges: {
      async add(data) {
        const r = await db.stageChange.create({ data });
        return { ...r, fromStage: r.fromStage as StageCode | null, toStage: r.toStage as StageCode };
      },
      async listByOpportunity(opportunityId) {
        const rows = await db.stageChange.findMany({
          where: { opportunityId },
          orderBy: [{ changedAt: "asc" }, { id: "asc" }],
        });
        return rows.map((r) => ({ ...r, fromStage: r.fromStage as StageCode | null, toStage: r.toStage as StageCode }));
      },
      async listAll() {
        const rows = await db.stageChange.findMany();
        return rows.map(
          (r): StageChange => ({ ...r, fromStage: r.fromStage as StageCode | null, toStage: r.toStage as StageCode }),
        );
      },
    },

    activities: {
      async list(filter) {
        const rows = await db.activity.findMany({
          where: {
            opportunityId: filter.opportunityId,
            accountId: filter.accountId,
            ownerId: filter.ownerId,
            ...(filter.openOnly ? { dueAt: { not: null }, completedAt: null } : {}),
          },
          orderBy: { occurredAt: "desc" },
        });
        return rows.map(toActivity);
      },
      async create(data) {
        return toActivity(await db.activity.create({ data }));
      },
      async complete(id, at) {
        return toActivity(await db.activity.update({ where: { id }, data: { completedAt: at } }));
      },
      async findByExternalId(externalId) {
        const r = await db.activity.findFirst({ where: { externalId } });
        return r && toActivity(r);
      },
    },

    outbox: {
      async enqueue({ opportunityId, operation, payload, now }) {
        const r = await db.outboxMessage.create({
          data: {
            opportunityId,
            operation,
            payload: JSON.stringify(payload),
            status: "PENDING",
            nextAttemptAt: now,
            createdAt: now,
          },
        });
        return toOutbox(r);
      },
      async get(id) {
        const r = await db.outboxMessage.findUnique({ where: { id } });
        return r && toOutbox(r);
      },
      async list(filter = {}) {
        const rows = await db.outboxMessage.findMany({
          where: { status: filter.statuses ? { in: filter.statuses } : undefined, opportunityId: filter.opportunityId },
          orderBy: { id: "desc" },
          take: filter.limit ?? 200,
        });
        return rows.map(toOutbox);
      },
      async listUnfinishedFor(opportunityIds) {
        if (opportunityIds.length === 0) return [];
        const rows = await db.outboxMessage.findMany({
          where: { opportunityId: { in: opportunityIds }, status: { not: "SUCCEEDED" } },
        });
        return rows.map(toOutbox);
      },
      async listDue(now, limit) {
        const rows = await db.outboxMessage.findMany({
          where: {
            OR: [
              { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } },
              { status: "IN_PROGRESS", lockedUntil: { lte: now } },
            ],
          },
          orderBy: { id: "asc" },
          take: limit,
        });
        return rows.map(toOutbox);
      },
      async save(msg, expected) {
        const { count } = await db.outboxMessage.updateMany({
          where: { id: msg.id, status: expected.status, lockToken: expected.lockToken },
          data: {
            status: msg.status,
            attempts: msg.attempts,
            nextAttemptAt: msg.nextAttemptAt,
            lockedUntil: msg.lockedUntil,
            lockToken: msg.lockToken,
            lastError: msg.lastError,
            lastErrorCode: msg.lastErrorCode,
            completedAt: msg.completedAt,
          },
        });
        if (count === 0) throw new ConcurrencyError("Outbox message", msg.id);
        return toOutbox(await db.outboxMessage.findUniqueOrThrow({ where: { id: msg.id } }));
      },
      async replacePayload(id, payload) {
        await db.outboxMessage.update({ where: { id }, data: { payload: JSON.stringify(payload) } });
      },
    },

    events: {
      async add(data) {
        await db.integrationEvent.create({ data: { ...data, message: data.message.slice(0, 2000) } });
      },
      async list(limit) {
        const rows = await db.integrationEvent.findMany({ orderBy: { id: "desc" }, take: limit });
        return rows.map(
          (r): IntegrationEvent => ({
            ...r,
            direction: r.direction as IntegrationEvent["direction"],
            status: r.status as IntegrationEvent["status"],
          }),
        );
      },
    },

    vista: {
      async upsertCustomers(rows) {
        for (const r of rows) {
          await db.vistaCustomer.upsert({ where: { customerNumber: r.customerNumber }, create: r, update: r });
        }
        return rows.length;
      },
      async searchCustomers(search, limit) {
        const asNumber = Number(search);
        return db.vistaCustomer.findMany({
          where: {
            active: true,
            OR: [
              { name: { contains: search } },
              ...(Number.isInteger(asNumber) && asNumber > 0 ? [{ customerNumber: asNumber }] : []),
            ],
          },
          orderBy: { name: "asc" },
          take: limit,
        });
      },
      async getCustomer(customerNumber) {
        return db.vistaCustomer.findUnique({ where: { customerNumber } });
      },
      async upsertJobs(rows) {
        for (const r of rows) {
          await db.vistaJob.upsert({
            where: { company_job: { company: r.company, job: r.job } },
            create: r,
            update: r,
          });
        }
        return rows.length;
      },
      async listJobsByCustomer(customerNumber) {
        const rows = await db.vistaJob.findMany({ where: { customerNumber }, orderBy: { startDate: "desc" } });
        return rows.map(toJob);
      },
    },

    lookups: {
      async upsert(rows) {
        for (const r of rows) {
          await db.lookup.upsert({ where: { kind_code: { kind: r.kind, code: r.code } }, create: r, update: r });
        }
        return rows.length;
      },
      async list(kind) {
        const rows = await db.lookup.findMany({ where: { kind, active: true }, orderBy: { description: "asc" } });
        return rows.map((r): Lookup => ({ ...r, kind: r.kind as LookupKind }));
      },
    },
  };
  return repo;
}

export function createPrismaRepo(client: PrismaClient = createPrismaClient()): Repo {
  return build(client, client);
}

