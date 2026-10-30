/**
 * Opportunity writes. Every save goes through saveOpportunity so the Vista rules
 * (readiness check, stage history, outbox) are applied in one place, inside one
 * transaction: the opportunity and its outbox message commit together or not at all.
 */
import { decideVistaOperation, needsVistaReadiness, type PushState } from "@/domain/push";
import { canCoalesce, replay } from "@/domain/outbox";
import { requiresVista, type StageCode } from "@/domain/stages";
import type { Opportunity, OutboxMessage, OutboxOperation } from "@/domain/types";
import {
  checkStageRequirements,
  checkVistaReadiness,
  describeMissing,
  opportunityInputSchema,
  type OpportunityInput,
} from "@/domain/validation";
import { buildPotentialProjectPayload } from "@/integration/vista/mapping";
import { fieldErrorsFromZod, ValidationError } from "../errors";
import { requirePermission, type ServiceContext } from "../context";
import { NotFoundError, type Repo } from "../repo/types";

function parseInput(raw: unknown): OpportunityInput {
  const parsed = opportunityInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("Please fix the highlighted fields", fieldErrorsFromZod(parsed.error.issues));
  }
  return parsed.data;
}

function normalise(input: OpportunityInput) {
  return {
    name: input.name,
    accountId: input.accountId,
    stage: input.stage,
    estimatedValue: input.estimatedValue ?? null,
    marketSector: input.marketSector ?? null,
    projectType: input.projectType ?? null,
    deliveryMethod: input.deliveryMethod ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    bidDueDate: input.bidDueDate ?? null,
    expectedAwardDate: input.expectedAwardDate ?? null,
    description: input.description ?? null,
    ownerId: input.ownerId,
    estimatorCode: input.estimatorCode ?? null,
    closedReason: input.closedReason ?? null,
  };
}

async function pushStateFor(repo: Repo, opp: Opportunity | null): Promise<{ state: PushState; unfinished: OutboxMessage[] }> {
  if (!opp) return { state: { pushed: false, createQueued: false }, unfinished: [] };
  const unfinished = (await repo.outbox.listUnfinishedFor([opp.id])).sort((a, b) => a.id - b.id);
  return {
    state: {
      pushed: opp.vistaPotentialProject !== null,
      createQueued: unfinished.some((m) => m.operation === "CREATE_POTENTIAL_PROJECT"),
    },
    unfinished,
  };
}

/**
 * Queue the latest state for Vista. Rather than piling up messages, the newest
 * queued (not in-flight) message for the opportunity takes the new payload.
 * A message that died (e.g. Vista rejected a value) is retried automatically
 * once the user saves a fix.
 */
async function queueForVista(
  repo: Repo,
  opp: Opportunity,
  op: OutboxOperation,
  payload: unknown,
  unfinished: OutboxMessage[],
  now: Date,
): Promise<void> {
  const latest = unfinished.at(-1);
  const reusable =
    latest &&
    latest.status !== "IN_PROGRESS" &&
    (latest.operation === op || latest.operation === "CREATE_POTENTIAL_PROJECT");

  if (latest && reusable) {
    await repo.outbox.replacePayload(latest.id, payload, now);
    if (!canCoalesce(latest)) {
      // DEAD: resend with the corrected data.
      const fresh = await repo.outbox.get(latest.id);
      if (fresh) await repo.outbox.save({ ...replay(fresh, now), payload }, { status: fresh.status, lockToken: fresh.lockToken });
    }
  } else {
    await repo.outbox.enqueue({ opportunityId: opp.id, operation: op, payload, now });
  }
  await repo.opportunities.setSync(opp.id, { vistaSyncStatus: "PENDING" });
  await repo.events.add({
    direction: "OUTBOUND",
    kind: op,
    status: "INFO",
    message: `Queued ${op === "CREATE_POTENTIAL_PROJECT" ? "create" : "update"} for "${opp.name}"`,
    outboxId: null,
    opportunityId: opp.id,
  });
}

async function saveOpportunity(
  ctx: ServiceContext,
  id: number | null,
  expectedVersion: number | null,
  raw: unknown,
): Promise<Opportunity> {
  requirePermission(ctx, "opportunity:edit");
  const input = normalise(parseInput(raw));

  const stageError = checkStageRequirements(input.stage, input.closedReason);
  if (stageError) throw new ValidationError(stageError, { closedReason: [stageError] });

  return ctx.repo.transaction(async (tx) => {
    const now = ctx.now();
    const before = id === null ? null : await tx.opportunities.get(id);
    if (id !== null && !before) throw new NotFoundError("Opportunity", id);

    const account = await tx.accounts.get(input.accountId);
    if (!account) throw new ValidationError("Pick an account", { accountId: ["Account not found"] });

    const owner = await tx.users.get(input.ownerId);
    if (!owner) throw new ValidationError("Pick an owner", { ownerId: ["User not found"] });

    const { state, unfinished } = await pushStateFor(tx, before);

    if (needsVistaReadiness(input.stage, state)) {
      const readiness = checkVistaReadiness(input, account);
      if (!readiness.ready) {
        const reason = requiresVista(input.stage) && !state.pushed && !state.createQueued
          ? `To move to stage ${input.stage}, this opportunity must be sent to Vista. Fill in: ${describeMissing(readiness.missing)}`
          : `This opportunity is in Vista, so these fields are required: ${describeMissing(readiness.missing)}`;
        throw new ValidationError(
          reason,
          Object.fromEntries(readiness.missing.map((f) => [f === "customer" ? "accountId" : f, ["Required for Vista"]])),
        );
      }
    }

    const saved =
      before === null
        ? await tx.opportunities.create(input)
        : await tx.opportunities.update(before.id, expectedVersion ?? -1, input);

    if (!before || before.stage !== saved.stage) {
      await tx.stageChanges.add({
        opportunityId: saved.id,
        fromStage: before?.stage ?? null,
        toStage: saved.stage,
        changedById: ctx.user.id,
        changedAt: now,
      });
    }

    const op = decideVistaOperation(before, saved, state);
    if (op) {
      const payload = buildPotentialProjectPayload(saved, account, ctx.config.vistaCompany);
      await queueForVista(tx, saved, op, payload, unfinished, now);
    }

    return (await tx.opportunities.get(saved.id)) as Opportunity;
  });
}

export function createOpportunity(ctx: ServiceContext, raw: unknown): Promise<Opportunity> {
  return saveOpportunity(ctx, null, null, raw);
}

export function updateOpportunity(
  ctx: ServiceContext,
  id: number,
  expectedVersion: number,
  raw: unknown,
): Promise<Opportunity> {
  return saveOpportunity(ctx, id, expectedVersion, raw);
}

/** Move to another stage, keeping every other field as it is. */
export async function changeStage(
  ctx: ServiceContext,
  id: number,
  expectedVersion: number,
  stage: StageCode,
  closedReason?: string | null,
): Promise<Opportunity> {
  const current = await ctx.repo.opportunities.get(id);
  if (!current) throw new NotFoundError("Opportunity", id);
  return saveOpportunity(ctx, id, expectedVersion, {
    ...current,
    stage,
    closedReason: closedReason ?? current.closedReason,
  });
}
