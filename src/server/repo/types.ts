/**
 * Data access contract. Services depend on this interface only.
 *
 * Two implementations:
 *   - prisma.ts  — Azure SQL / SQL Server (production, CI integration tests)
 *   - memory.ts  — in-process store with seed data (unit tests, demo, UI work)
 *
 * Any method added here must be implemented in both and covered by
 * tests/repo-contract.test.ts.
 */
import type {
  Account,
  Activity,
  Contact,
  IntegrationEvent,
  Lookup,
  LookupKind,
  Opportunity,
  OutboxMessage,
  OutboxOperation,
  StageChange,
  User,
  VistaCustomer,
  VistaJob,
} from "@/domain/types";
import type { StageCode } from "@/domain/stages";

export type NewAccount = Omit<Account, "id" | "createdAt" | "updatedAt">;
export type NewContact = Omit<Contact, "id" | "createdAt" | "updatedAt">;
export type NewOpportunity = Omit<
  Opportunity,
  "id" | "createdAt" | "updatedAt" | "version" | "vistaSyncStatus" | "vistaLastSyncedAt" | "vistaPotentialProject"
>;
export type OpportunityPatch = Partial<Omit<Opportunity, "id" | "createdAt" | "updatedAt" | "version">>;
export type NewActivity = Omit<Activity, "id" | "createdAt">;

export interface OpportunityFilter {
  stages?: StageCode[];
  ownerId?: number;
  accountId?: number;
  search?: string;
}

export interface OutboxFilter {
  statuses?: OutboxMessage["status"][];
  opportunityId?: number;
  limit?: number;
}

export class ConcurrencyError extends Error {
  constructor(entity: string, id: number) {
    super(`${entity} ${id} was changed by someone else. Reload and try again.`);
    this.name = "ConcurrencyError";
  }
}

export class NotFoundError extends Error {
  constructor(entity: string, id: number | string) {
    super(`${entity} ${id} not found`);
    this.name = "NotFoundError";
  }
}

export interface Repo {
  /** Run fn atomically. Everything written through `tx` commits or rolls back together. */
  transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T>;

  users: {
    list(): Promise<User[]>;
    get(id: number): Promise<User | null>;
    getByEmail(email: string): Promise<User | null>;
    upsert(data: Omit<User, "id">): Promise<User>;
  };

  accounts: {
    list(search?: string): Promise<Account[]>;
    get(id: number): Promise<Account | null>;
    create(data: NewAccount): Promise<Account>;
    update(id: number, data: Partial<NewAccount>): Promise<Account>;
  };

  contacts: {
    listByAccount(accountId: number): Promise<Contact[]>;
    get(id: number): Promise<Contact | null>;
    create(data: NewContact): Promise<Contact>;
  };

  opportunities: {
    list(filter?: OpportunityFilter): Promise<Opportunity[]>;
    get(id: number): Promise<Opportunity | null>;
    create(data: NewOpportunity): Promise<Opportunity>;
    /** Updates only if the stored version equals expectedVersion; bumps version. */
    update(id: number, expectedVersion: number, patch: OpportunityPatch): Promise<Opportunity>;
    /** Integration-side update that does not touch version (sync status, Vista code). */
    setSync(
      id: number,
      patch: Pick<Partial<Opportunity>, "vistaSyncStatus" | "vistaLastSyncedAt" | "vistaPotentialProject">,
    ): Promise<void>;
  };

  stageChanges: {
    add(data: Omit<StageChange, "id">): Promise<StageChange>;
    listByOpportunity(opportunityId: number): Promise<StageChange[]>;
    listAll(): Promise<StageChange[]>;
  };

  activities: {
    list(filter: { opportunityId?: number; accountId?: number; ownerId?: number; openOnly?: boolean }): Promise<Activity[]>;
    create(data: NewActivity): Promise<Activity>;
    complete(id: number, at: Date): Promise<Activity>;
    findByExternalId(externalId: string): Promise<Activity | null>;
  };

  outbox: {
    enqueue(data: { opportunityId: number; operation: OutboxOperation; payload: unknown; now: Date }): Promise<OutboxMessage>;
    get(id: number): Promise<OutboxMessage | null>;
    list(filter?: OutboxFilter): Promise<OutboxMessage[]>;
    /** Every message for these opportunities that is not SUCCEEDED (used for ordering). */
    listUnfinishedFor(opportunityIds: number[]): Promise<OutboxMessage[]>;
    /** Candidates for claiming: PENDING/FAILED due now, or IN_PROGRESS with an expired lease. */
    listDue(now: Date, limit: number): Promise<OutboxMessage[]>;
    /**
     * Save a state transition. Fails with ConcurrencyError unless the stored row
     * still has `expected.status` and `expected.lockToken` (compare-and-set), so
     * two flows can never claim or complete the same message.
     */
    save(
      msg: OutboxMessage,
      expected: { status: OutboxMessage["status"]; lockToken: string | null },
    ): Promise<OutboxMessage>;
    replacePayload(id: number, payload: unknown, now: Date): Promise<void>;
  };

  events: {
    add(data: Omit<IntegrationEvent, "id" | "createdAt">): Promise<void>;
    list(limit: number): Promise<IntegrationEvent[]>;
  };

  vista: {
    upsertCustomers(rows: VistaCustomer[]): Promise<number>;
    searchCustomers(search: string, limit: number): Promise<VistaCustomer[]>;
    getCustomer(customerNumber: number): Promise<VistaCustomer | null>;
    upsertJobs(rows: VistaJob[]): Promise<number>;
    listJobsByCustomer(customerNumber: number): Promise<VistaJob[]>;
  };

  lookups: {
    upsert(rows: Lookup[]): Promise<number>;
    list(kind: LookupKind): Promise<Lookup[]>;
  };
}
