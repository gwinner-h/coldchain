/**
 * Plain domain types shared by services, repositories and UI.
 * Money is a number of dollars (2 decimals); the database stores DECIMAL(14,2).
 * Dates are JS Date objects; date-only fields use midnight UTC.
 */
import type { StageCode } from "./stages";

export const ROLES = ["BD", "ESTIMATOR", "PM", "ADMIN", "EXECUTIVE"] as const;
export type Role = (typeof ROLES)[number];

export interface User {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: boolean;
}

export const ACCOUNT_TYPES = [
  "OWNER",
  "GENERAL_CONTRACTOR",
  "DEVELOPER",
  "ARCHITECT",
  "ENGINEER",
  "SUBCONTRACTOR",
  "OTHER",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  phone: string | null;
  website: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  /** Linked Vista AR customer number; null until linked or created at the first push. */
  vistaCustomerNumber: number | null;
  ownerId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Contact {
  id: number;
  accountId: number;
  firstName: string;
  lastName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const VISTA_SYNC_STATUSES = ["NOT_REQUIRED", "PENDING", "SYNCED", "ERROR"] as const;
export type VistaSyncStatus = (typeof VISTA_SYNC_STATUSES)[number];

export interface Opportunity {
  id: number;
  name: string;
  accountId: number;
  stage: StageCode;
  estimatedValue: number | null;
  marketSector: string | null;
  /** Code picked from the Vista-synced "PROJECT_TYPE" lookup, never typed. */
  projectType: string | null;
  deliveryMethod: string | null;
  city: string | null;
  state: string | null;
  bidDueDate: Date | null;
  expectedAwardDate: Date | null;
  description: string | null;
  ownerId: number;
  /** Code picked from the Vista-synced "ESTIMATOR" lookup. */
  estimatorCode: string | null;
  closedReason: string | null;
  /** Vista PC potential project code once the first push succeeds. */
  vistaPotentialProject: string | null;
  vistaSyncStatus: VistaSyncStatus;
  vistaLastSyncedAt: Date | null;
  /** Optimistic concurrency: incremented on every update. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StageChange {
  id: number;
  opportunityId: number;
  fromStage: StageCode | null;
  toStage: StageCode;
  changedById: number;
  changedAt: Date;
}

export const ACTIVITY_TYPES = ["CALL", "MEETING", "EMAIL", "SITE_VISIT", "NOTE", "FOLLOW_UP"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface Activity {
  id: number;
  type: ActivityType;
  subject: string;
  notes: string | null;
  occurredAt: Date;
  dueAt: Date | null;
  completedAt: Date | null;
  opportunityId: number | null;
  accountId: number | null;
  contactId: number | null;
  ownerId: number;
  /** MANUAL, or OUTLOOK when captured through Microsoft Graph. */
  source: "MANUAL" | "OUTLOOK";
  /** Outlook message/event id, used to avoid logging the same item twice. */
  externalId: string | null;
  createdAt: Date;
}

export const OUTBOX_OPERATIONS = ["CREATE_POTENTIAL_PROJECT", "UPDATE_POTENTIAL_PROJECT"] as const;
export type OutboxOperation = (typeof OUTBOX_OPERATIONS)[number];

export const OUTBOX_STATUSES = ["PENDING", "IN_PROGRESS", "SUCCEEDED", "FAILED", "DEAD"] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export interface OutboxMessage {
  id: number;
  opportunityId: number;
  operation: OutboxOperation;
  /** JSON payload in the Vista field map shape (see integration/vista/mapping.ts). */
  payload: unknown;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: Date;
  lockedUntil: Date | null;
  lockToken: string | null;
  lastError: string | null;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface IntegrationEvent {
  id: number;
  direction: "OUTBOUND" | "INBOUND";
  kind: string;
  status: "INFO" | "SUCCESS" | "ERROR";
  message: string;
  outboxId: number | null;
  opportunityId: number | null;
  createdAt: Date;
}

/** AR customer as synced from Vista. Accounts link to one by number. */
export interface VistaCustomer {
  customerNumber: number;
  name: string;
  city: string | null;
  state: string | null;
  active: boolean;
  syncedAt: Date;
}

/** JC job as synced from Vista (jobs from 2020 on). Read-only in the CRM. */
export interface VistaJob {
  company: number;
  job: string;
  description: string;
  customerNumber: number | null;
  status: string;
  contractAmount: number | null;
  billedToDate: number | null;
  startDate: Date | null;
  potentialProject: string | null;
  syncedAt: Date;
}

export const LOOKUP_KINDS = ["PROJECT_TYPE", "ESTIMATOR", "MARKET_SECTOR"] as const;
export type LookupKind = (typeof LOOKUP_KINDS)[number];

/** Pick-list value synced from Vista so codes are chosen, never typed. */
export interface Lookup {
  kind: LookupKind;
  code: string;
  description: string;
  active: boolean;
}
