/**
 * Outbox state machine. Pure functions that return the next version of a
 * message; repositories persist it.
 *
 *   PENDING --claim--> IN_PROGRESS --success--> SUCCEEDED
 *                        |  \--failure, retryable, attempts left--> FAILED --(after backoff)--> claimable
 *                        |  \--failure, not retryable or out of attempts--> DEAD (needs a person)
 *                        \--lease expired (flow run died)--> claimable again
 *   FAILED / DEAD --replay (admin, or the user saves a fix)--> PENDING
 *
 * Messages for one opportunity are delivered in order: a message waits while an
 * earlier message for the same opportunity is unfinished.
 */
import type { OutboxMessage, OutboxStatus } from "./types";

export const MAX_ATTEMPTS = 8;
export const LEASE_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

export interface FailureInput {
  /** Short machine code from the flow, e.g. VISTA_VALIDATION, TIMEOUT. */
  code: string;
  message: string;
  /** False for errors a retry can't fix (bad data): the message goes straight to DEAD. */
  retryable: boolean;
}

/** Still has to be delivered before later messages for the same opportunity. */
export function isUnfinished(status: OutboxStatus): boolean {
  return status === "PENDING" || status === "IN_PROGRESS" || status === "FAILED" || status === "DEAD";
}

export function isClaimable(msg: OutboxMessage, now: Date): boolean {
  switch (msg.status) {
    case "PENDING":
    case "FAILED":
      return msg.nextAttemptAt.getTime() <= now.getTime();
    case "IN_PROGRESS":
      return msg.lockedUntil !== null && msg.lockedUntil.getTime() <= now.getTime();
    default:
      return false;
  }
}

/** True when an earlier message for the same opportunity hasn't been delivered yet. */
export function blockedByEarlier(msg: OutboxMessage, all: OutboxMessage[]): boolean {
  return all.some((m) => m.opportunityId === msg.opportunityId && m.id < msg.id && isUnfinished(m.status));
}

export function backoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

export function claim(msg: OutboxMessage, now: Date, lockToken: string): OutboxMessage {
  return {
    ...msg,
    status: "IN_PROGRESS",
    attempts: msg.attempts + 1,
    lockToken,
    lockedUntil: new Date(now.getTime() + LEASE_MS),
    updatedAt: now,
  };
}

export function succeed(msg: OutboxMessage, now: Date): OutboxMessage {
  return {
    ...msg,
    status: "SUCCEEDED",
    lockToken: null,
    lockedUntil: null,
    lastError: null,
    lastErrorCode: null,
    completedAt: now,
    updatedAt: now,
  };
}

export function fail(msg: OutboxMessage, now: Date, error: FailureInput): OutboxMessage {
  const outOfAttempts = msg.attempts >= MAX_ATTEMPTS;
  const dead = !error.retryable || outOfAttempts;
  return {
    ...msg,
    status: dead ? "DEAD" : "FAILED",
    lockToken: null,
    lockedUntil: null,
    lastError:
      error.retryable && outOfAttempts ? `${error.message} (gave up after ${msg.attempts} attempts)` : error.message,
    lastErrorCode: error.code,
    nextAttemptAt: dead ? msg.nextAttemptAt : new Date(now.getTime() + backoffMs(msg.attempts)),
    updatedAt: now,
  };
}

export function replay(msg: OutboxMessage, now: Date): OutboxMessage {
  if (msg.status !== "FAILED" && msg.status !== "DEAD") {
    throw new Error(`Only FAILED or DEAD messages can be replayed; message ${msg.id} is ${msg.status}`);
  }
  return {
    ...msg,
    status: "PENDING",
    attempts: 0,
    lockToken: null,
    lockedUntil: null,
    nextAttemptAt: now,
    updatedAt: now,
  };
}

/**
 * A queued message whose payload can be replaced in place with newer data
 * (latest data wins, instead of sending every intermediate edit).
 */
export function canCoalesce(msg: OutboxMessage): boolean {
  return msg.status === "PENDING" || msg.status === "FAILED";
}
