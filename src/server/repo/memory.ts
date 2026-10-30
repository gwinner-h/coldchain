/**
 * In-memory repository for unit tests, demos and UI work without a database.
 * Behaves like the Prisma repository, including optimistic concurrency and
 * compare-and-set on the outbox. Data is lost on restart.
 */
import type {
  Account,
  Activity,
  Contact,
  IntegrationEvent,
  Lookup,
  Opportunity,
  OutboxMessage,
  StageChange,
  User,
  VistaCustomer,
  VistaJob,
} from "@/domain/types";
import { ConcurrencyError, NotFoundError, type Repo } from "./types";

export interface MemoryData {
  users: User[];
  accounts: Account[];
  contacts: Contact[];
  opportunities: Opportunity[];
  stageChanges: StageChange[];
  activities: Activity[];
  outbox: OutboxMessage[];
  events: IntegrationEvent[];
  vistaCustomers: VistaCustomer[];
  vistaJobs: VistaJob[];
  lookups: Lookup[];
  seq: Record<string, number>;
}

export function emptyData(): MemoryData {
  return {
    users: [],
    accounts: [],
    contacts: [],
    opportunities: [],
    stageChanges: [],
    activities: [],
    outbox: [],
    events: [],
    vistaCustomers: [],
    vistaJobs: [],
    lookups: [],
    seq: {},
  };
}

const clone = <T>(v: T): T => structuredClone(v);

export function createMemoryRepo(initial: MemoryData = emptyData()): Repo & { data: MemoryData } {
  const state = { data: initial };
  let txQueue: Promise<unknown> = Promise.resolve();

  const nextId = (name: string) => {
    state.data.seq[name] = (state.data.seq[name] ?? 0) + 1;
    return state.data.seq[name];
  };
  const d = () => state.data;

  const repo: Repo & { data: MemoryData } = {
    get data() {
      return state.data;
    },

    async transaction(fn) {
      const run = async () => {
        const snapshot = clone(state.data);
        try {
          return await fn(repo);
        } catch (err) {
          state.data = snapshot;
          throw err;
        }
      };
      const result = txQueue.then(run, run);
      txQueue = result.catch(() => undefined);
      return result;
    },

    users: {
      async list() {
        return clone(d().users);
      },
      async get(id) {
        return clone(d().users.find((u) => u.id === id) ?? null);
      },
      async getByEmail(email) {
        const e = email.toLowerCase();
        return clone(d().users.find((u) => u.email.toLowerCase() === e) ?? null);
      },
      async upsert(data) {
        const email = data.email.toLowerCase();
        const existing = d().users.find((u) => u.email === email);
        if (existing) {
          Object.assign(existing, data, { email });
          return clone(existing);
        }
        const row: User = { ...data, email, id: nextId("user") };
        d().users.push(row);
        return clone(row);
      },
    },

    accounts: {
      async list(search) {
        const s = search?.trim().toLowerCase();
        return clone(
          d()
            .accounts.filter((a) => !s || a.name.toLowerCase().includes(s))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      },
      async get(id) {
        return clone(d().accounts.find((a) => a.id === id) ?? null);
      },
      async create(data) {
        const now = new Date();
        const row: Account = { ...data, id: nextId("account"), createdAt: now, updatedAt: now };
        d().accounts.push(row);
        return clone(row);
      },
      async update(id, data) {
        const row = d().accounts.find((a) => a.id === id);
        if (!row) throw new NotFoundError("Account", id);
        Object.assign(row, data, { updatedAt: new Date() });
        return clone(row);
      },
    },

    contacts: {
      async listByAccount(accountId) {
        return clone(
          d()
            .contacts.filter((c) => c.accountId === accountId)
            .sort((a, b) => a.lastName.localeCompare(b.lastName)),
        );
      },
      async get(id) {
        return clone(d().contacts.find((c) => c.id === id) ?? null);
      },
      async create(data) {
        const now = new Date();
        const row: Contact = { ...data, id: nextId("contact"), createdAt: now, updatedAt: now };
        d().contacts.push(row);
        return clone(row);
      },
    },

    opportunities: {
      async list(filter = {}) {
        const s = filter.search?.trim().toLowerCase();
        return clone(
          d()
            .opportunities.filter(
              (o) =>
                (!filter.stages || filter.stages.includes(o.stage)) &&
                (!filter.ownerId || o.ownerId === filter.ownerId) &&
                (!filter.accountId || o.accountId === filter.accountId) &&
                (!s || o.name.toLowerCase().includes(s)),
            )
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
        );
      },
      async get(id) {
        return clone(d().opportunities.find((o) => o.id === id) ?? null);
      },
      async create(data) {
        const now = new Date();
        const row: Opportunity = {
          ...data,
          id: nextId("opportunity"),
          vistaPotentialProject: null,
          vistaSyncStatus: "NOT_REQUIRED",
          vistaLastSyncedAt: null,
          version: 1,
          createdAt: now,
          updatedAt: now,
        };
        d().opportunities.push(row);
        return clone(row);
      },
      async update(id, expectedVersion, patch) {
        const row = d().opportunities.find((o) => o.id === id);
        if (!row) throw new NotFoundError("Opportunity", id);
        if (row.version !== expectedVersion) throw new ConcurrencyError("Opportunity", id);
        Object.assign(row, patch, { version: row.version + 1, updatedAt: new Date() });
        return clone(row);
      },
      async setSync(id, patch) {
        const row = d().opportunities.find((o) => o.id === id);
        if (!row) throw new NotFoundError("Opportunity", id);
        Object.assign(row, patch);
      },
    },

    stageChanges: {
      async add(data) {
        const row: StageChange = { ...data, id: nextId("stageChange") };
        d().stageChanges.push(row);
        return clone(row);
      },
      async listByOpportunity(opportunityId) {
        return clone(
          d()
            .stageChanges.filter((s) => s.opportunityId === opportunityId)
            .sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime() || a.id - b.id),
        );
      },
      async listAll() {
        return clone(d().stageChanges);
      },
    },

    activities: {
      async list(filter) {
        return clone(
          d()
            .activities.filter(
              (a) =>
                (!filter.opportunityId || a.opportunityId === filter.opportunityId) &&
                (!filter.accountId || a.accountId === filter.accountId) &&
                (!filter.ownerId || a.ownerId === filter.ownerId) &&
                (!filter.openOnly || (a.dueAt !== null && a.completedAt === null)),
            )
            .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()),
        );
      },
      async create(data) {
        const row: Activity = { ...data, id: nextId("activity"), createdAt: new Date() };
        d().activities.push(row);
        return clone(row);
      },
      async complete(id, at) {
        const row = d().activities.find((a) => a.id === id);
        if (!row) throw new NotFoundError("Activity", id);
        row.completedAt = at;
        return clone(row);
      },
      async findByExternalId(externalId) {
        return clone(d().activities.find((a) => a.externalId === externalId) ?? null);
      },
    },

    outbox: {
      async enqueue({ opportunityId, operation, payload, now }) {
        const row: OutboxMessage = {
          id: nextId("outbox"),
          opportunityId,
          operation,
          payload: clone(payload),
          status: "PENDING",
          attempts: 0,
          nextAttemptAt: now,
          lockedUntil: null,
          lockToken: null,
          lastError: null,
          lastErrorCode: null,
          createdAt: now,
          updatedAt: now,
          completedAt: null,
        };
        d().outbox.push(row);
        return clone(row);
      },
      async get(id) {
        return clone(d().outbox.find((m) => m.id === id) ?? null);
      },
      async list(filter = {}) {
        return clone(
          d()
            .outbox.filter(
              (m) =>
                (!filter.statuses || filter.statuses.includes(m.status)) &&
                (!filter.opportunityId || m.opportunityId === filter.opportunityId),
            )
            .sort((a, b) => b.id - a.id)
            .slice(0, filter.limit ?? 200),
        );
      },
      async listUnfinishedFor(opportunityIds) {
        return clone(
          d().outbox.filter((m) => opportunityIds.includes(m.opportunityId) && m.status !== "SUCCEEDED"),
        );
      },
      async listDue(now, limit) {
        return clone(
          d()
            .outbox.filter(
              (m) =>
                ((m.status === "PENDING" || m.status === "FAILED") && m.nextAttemptAt <= now) ||
                (m.status === "IN_PROGRESS" && m.lockedUntil !== null && m.lockedUntil <= now),
            )
            .sort((a, b) => a.id - b.id)
            .slice(0, limit),
        );
      },
      async save(msg, expected) {
        const idx = d().outbox.findIndex((m) => m.id === msg.id);
        if (idx < 0) throw new NotFoundError("Outbox message", msg.id);
        const current = d().outbox[idx];
        if (current.status !== expected.status || current.lockToken !== expected.lockToken) {
          throw new ConcurrencyError("Outbox message", msg.id);
        }
        d().outbox[idx] = clone(msg);
        return clone(msg);
      },
      async replacePayload(id, payload, now) {
        const row = d().outbox.find((m) => m.id === id);
        if (!row) throw new NotFoundError("Outbox message", id);
        row.payload = clone(payload);
        row.updatedAt = now;
      },
    },

    events: {
      async add(data) {
        d().events.push({ ...data, id: nextId("event"), createdAt: new Date() });
      },
      async list(limit) {
        return clone([...d().events].sort((a, b) => b.id - a.id).slice(0, limit));
      },
    },

    vista: {
      async upsertCustomers(rows) {
        for (const r of rows) {
          const i = d().vistaCustomers.findIndex((c) => c.customerNumber === r.customerNumber);
          if (i >= 0) d().vistaCustomers[i] = clone(r);
          else d().vistaCustomers.push(clone(r));
        }
        return rows.length;
      },
      async searchCustomers(search, limit) {
        const s = search.trim().toLowerCase();
        return clone(
          d()
            .vistaCustomers.filter(
              (c) => c.active && (!s || c.name.toLowerCase().includes(s) || String(c.customerNumber) === s),
            )
            .sort((a, b) => a.name.localeCompare(b.name))
            .slice(0, limit),
        );
      },
      async getCustomer(customerNumber) {
        return clone(d().vistaCustomers.find((c) => c.customerNumber === customerNumber) ?? null);
      },
      async upsertJobs(rows) {
        for (const r of rows) {
          const i = d().vistaJobs.findIndex((j) => j.company === r.company && j.job === r.job);
          if (i >= 0) d().vistaJobs[i] = clone(r);
          else d().vistaJobs.push(clone(r));
        }
        return rows.length;
      },
      async listJobsByCustomer(customerNumber) {
        return clone(
          d()
            .vistaJobs.filter((j) => j.customerNumber === customerNumber)
            .sort((a, b) => (b.startDate?.getTime() ?? 0) - (a.startDate?.getTime() ?? 0)),
        );
      },
    },

    lookups: {
      async upsert(rows) {
        for (const r of rows) {
          const i = d().lookups.findIndex((l) => l.kind === r.kind && l.code === r.code);
          if (i >= 0) d().lookups[i] = clone(r);
          else d().lookups.push(clone(r));
        }
        return rows.length;
      },
      async list(kind) {
        return clone(
          d()
            .lookups.filter((l) => l.kind === kind && l.active)
            .sort((a, b) => a.description.localeCompare(b.description)),
        );
      },
    },
  };

  return repo;
}
