/**
 * The App Xchange side of the outbox. A scheduled App Xchange flow:
 *   1. claims due messages (POST /api/integration/outbox/claim),
 *   2. passes each payload to the Vista connector's Potential Projects action,
 *   3. reports the result (POST /api/integration/outbox/{id}/result).
 * The CRM owns retries, ordering and error visibility; the flow stays thin.
 */
import { randomUUID } from "node:crypto";
import { blockedByEarlier, claim, fail, isClaimable, replay, succeed, type FailureInput } from "@/domain/outbox";
import type { OutboxMessage } from "@/domain/types";
import { requirePermission, type IntegrationContext, type ServiceContext } from "../context";
import { ValidationError } from "../errors";
import { ConcurrencyError, NotFoundError, type Repo } from "../repo/types";

export interface ClaimedMessage {
  id: number;
  lockToken: string;
  operation: OutboxMessage["operation"];
  opportunityId: number;
  attempt: number;
  payload: unknown;
}

export async function claimDue(ctx: IntegrationContext, limit = 10): Promise<ClaimedMessage[]> {
  const now = ctx.now();
  const due = await ctx.repo.outbox.listDue(now, Math.max(limit * 3, limit));
  const unfinished = await ctx.repo.outbox.listUnfinishedFor([...new Set(due.map((m) => m.opportunityId))]);
  const claimed: ClaimedMessage[] = [];
  const claimedOpps = new Set<number>();

  for (const msg of due) {
    if (claimed.length >= limit) break;
    // One message per opportunity per batch, oldest first, never past an unfinished earlier one.
    if (claimedOpps.has(msg.opportunityId)) continue;
    if (!isClaimable(msg, now) || blockedByEarlier(msg, unfinished)) continue;

    const token = randomUUID();
    try {
      const saved = await ctx.repo.outbox.save(claim(msg, now, token), { status: msg.status, lockToken: msg.lockToken });
      claimed.push({
        id: saved.id,
        lockToken: token,
        operation: saved.operation,
        opportunityId: saved.opportunityId,
        attempt: saved.attempts,
        payload: saved.payload,
      });
      claimedOpps.add(saved.opportunityId);
    } catch (err) {
      if (err instanceof ConcurrencyError) continue; // another flow run took it
      throw err;
    }
  }
  return claimed;
}

async function loadLocked(repo: Repo, id: number, lockToken: string): Promise<OutboxMessage> {
  const msg = await repo.outbox.get(id);
  if (!msg) throw new NotFoundError("Outbox message", id);
  if (msg.status !== "IN_PROGRESS" || msg.lockToken !== lockToken) {
    throw new ConcurrencyError("Outbox message", id);
  }
  return msg;
}

async function refreshSyncStatus(repo: Repo, opportunityId: number, now: Date): Promise<void> {
  const unfinished = await repo.outbox.listUnfinishedFor([opportunityId]);
  const dead = unfinished.some((m) => m.status === "DEAD");
  await repo.opportunities.setSync(opportunityId, {
    vistaSyncStatus: dead ? "ERROR" : unfinished.length > 0 ? "PENDING" : "SYNCED",
    ...(unfinished.length === 0 ? { vistaLastSyncedAt: now } : {}),
  });
}

export interface SuccessResult {
  /** Vista potential project code as stored in Vista. */
  potentialProject: string;
  /** AR customer number, when the flow created a new customer. */
  customerNumber?: number;
}

export async function reportSuccess(
  ctx: IntegrationContext,
  id: number,
  lockToken: string,
  result: SuccessResult,
): Promise<void> {
  await ctx.repo.transaction(async (tx) => {
    const now = ctx.now();
    const msg = await loadLocked(tx, id, lockToken);
    await tx.outbox.save(succeed(msg, now), { status: msg.status, lockToken });
    await tx.opportunities.setSync(msg.opportunityId, { vistaPotentialProject: result.potentialProject });

    if (result.customerNumber !== undefined) {
      const opp = await tx.opportunities.get(msg.opportunityId);
      const account = opp && (await tx.accounts.get(opp.accountId));
      if (account && account.vistaCustomerNumber === null) {
        await tx.accounts.update(account.id, { vistaCustomerNumber: result.customerNumber });
      }
    }
    await refreshSyncStatus(tx, msg.opportunityId, now);
    await tx.events.add({
      direction: "OUTBOUND",
      kind: msg.operation,
      status: "SUCCESS",
      message: `Vista potential project ${result.potentialProject} ${msg.operation === "CREATE_POTENTIAL_PROJECT" ? "created" : "updated"}`,
      outboxId: msg.id,
      opportunityId: msg.opportunityId,
    });
  });
}

export async function reportFailure(
  ctx: IntegrationContext,
  id: number,
  lockToken: string,
  error: FailureInput,
): Promise<OutboxMessage> {
  return ctx.repo.transaction(async (tx) => {
    const now = ctx.now();
    const msg = await loadLocked(tx, id, lockToken);
    const failed = await tx.outbox.save(fail(msg, now, error), { status: msg.status, lockToken });
    await refreshSyncStatus(tx, msg.opportunityId, now);
    await tx.events.add({
      direction: "OUTBOUND",
      kind: msg.operation,
      status: "ERROR",
      message:
        failed.status === "DEAD"
          ? `Vista rejected the push and needs attention: [${error.code}] ${error.message}`
          : `Attempt ${failed.attempts} failed, retrying: [${error.code}] ${error.message}`,
      outboxId: msg.id,
      opportunityId: msg.opportunityId,
    });
    return failed;
  });
}

/** Admin "Retry now" from the Vista sync screen. */
export async function replayMessage(ctx: ServiceContext, id: number): Promise<void> {
  requirePermission(ctx, "integration:replay");
  await ctx.repo.transaction(async (tx) => {
    const now = ctx.now();
    const msg = await tx.outbox.get(id);
    if (!msg) throw new NotFoundError("Outbox message", id);
    if (msg.status !== "FAILED" && msg.status !== "DEAD") {
      throw new ValidationError(`Only failed messages can be retried; this one is ${msg.status}`);
    }
    await tx.outbox.save(replay(msg, now), { status: msg.status, lockToken: msg.lockToken });
    await refreshSyncStatus(tx, msg.opportunityId, now);
    await tx.events.add({
      direction: "OUTBOUND",
      kind: msg.operation,
      status: "INFO",
      message: `Retry requested by ${ctx.user.name}`,
      outboxId: msg.id,
      opportunityId: msg.opportunityId,
    });
  });
}
