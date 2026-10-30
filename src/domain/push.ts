/**
 * When does an opportunity change need to reach Vista?
 *
 * - Not yet in Vista (and no create queued), stage 06 through 09A -> CREATE.
 *   Covers both moving into 06 and opportunities first entered at 07 or later.
 * - Already in Vista (or a create is queued) and a synced field changed -> UPDATE.
 *   Closing stages 10-12 update the record so lost work is closed out in Vista.
 * - Closed before ever reaching Vista -> nothing.
 */
import { requiresVista, type StageCode } from "./stages";
import type { Opportunity, OutboxOperation } from "./types";

/** Fields carried on the Vista potential project. Changing any of them sends an update. */
export const SYNCED_FIELDS = [
  "name",
  "accountId",
  "stage",
  "estimatedValue",
  "projectType",
  "city",
  "state",
  "bidDueDate",
  "description",
  "estimatorCode",
  "closedReason",
] as const satisfies readonly (keyof Opportunity)[];

export type SyncedField = (typeof SYNCED_FIELDS)[number];
export type SyncedSnapshot = Pick<Opportunity, SyncedField>;

export interface PushState {
  /** The potential project exists in Vista. */
  pushed: boolean;
  /** A create message is queued or in progress. */
  createQueued: boolean;
}

function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

export function changedSyncedFields(prev: SyncedSnapshot, next: SyncedSnapshot): SyncedField[] {
  return SYNCED_FIELDS.filter((f) => !same(prev[f], next[f]));
}

export function decideVistaOperation(
  prev: SyncedSnapshot | null,
  next: SyncedSnapshot,
  state: PushState,
): OutboxOperation | null {
  if (!state.pushed && !state.createQueued) {
    return requiresVista(next.stage) ? "CREATE_POTENTIAL_PROJECT" : null;
  }
  if (prev === null || changedSyncedFields(prev, next).length > 0) return "UPDATE_POTENTIAL_PROJECT";
  return null;
}

/**
 * Must the Vista readiness check pass before saving? Yes for stages 06-09A,
 * and for anything already in Vista (or on its way), whatever the stage.
 */
export function needsVistaReadiness(stage: StageCode, state: PushState): boolean {
  return requiresVista(stage) || state.pushed || state.createQueued;
}
