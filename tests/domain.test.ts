import { describe, expect, it } from "vitest";
import { STAGES, getStage, isStageCode, requiresVista, stageLabel } from "@/domain/stages";
import { changedSyncedFields, decideVistaOperation, needsVistaReadiness } from "@/domain/push";
import { checkStageRequirements, checkVistaReadiness, opportunityInputSchema } from "@/domain/validation";
import { backoffMs, blockedByEarlier, claim, fail, isClaimable, MAX_ATTEMPTS, replay, succeed } from "@/domain/outbox";
import { can } from "@/domain/permissions";
import { buildPotentialProjectPayload, potentialProjectCode, toVistaStatus } from "@/integration/vista/mapping";
import type { Account, Opportunity, OutboxMessage } from "@/domain/types";

const now = new Date("2026-11-02T14:00:00Z");

const opp = (o: Partial<Opportunity> = {}): Opportunity => ({
  id: 42,
  name: "Freezer addition",
  accountId: 1,
  stage: "06",
  estimatedValue: 1000,
  marketSector: null,
  projectType: "COLD",
  deliveryMethod: null,
  city: "Detroit",
  state: "MI",
  bidDueDate: new Date("2026-12-01"),
  expectedAwardDate: null,
  description: "Two bays",
  ownerId: 1,
  estimatorCode: "RCHEN",
  closedReason: null,
  vistaPotentialProject: null,
  vistaSyncStatus: "NOT_REQUIRED",
  vistaLastSyncedAt: null,
  version: 1,
  createdAt: now,
  updatedAt: now,
  ...o,
});

const account = (a: Partial<Account> = {}): Account => ({
  id: 1,
  name: "Northgate Foods",
  type: "OWNER",
  phone: null,
  website: null,
  street: "400 Riverside Dr",
  city: "Detroit",
  state: "MI",
  zip: "48207",
  vistaCustomerNumber: 1001,
  ownerId: 1,
  createdAt: now,
  updatedAt: now,
  ...a,
});

const msg = (m: Partial<OutboxMessage> = {}): OutboxMessage => ({
  id: 1,
  opportunityId: 42,
  operation: "CREATE_POTENTIAL_PROJECT",
  payload: {},
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
  ...m,
});

describe("stages", () => {
  it("lists all 14 company stages in order", () => {
    expect(STAGES.map((s) => s.code)).toEqual([
      "00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "09A", "10", "11", "12",
    ]);
  });

  it("requires Vista from 06 through 09A only", () => {
    expect(["06", "07", "08", "09", "09A"].every((c) => requiresVista(c as never))).toBe(true);
    expect(["00", "05", "10", "11", "12"].some((c) => requiresVista(c as never))).toBe(false);
  });

  it("labels and validates codes", () => {
    expect(stageLabel("09A")).toBe("09A-PO Pending");
    expect(isStageCode("13")).toBe(false);
    expect(() => getStage("99" as never)).toThrow();
  });
});

describe("push rules", () => {
  const fresh = { pushed: false, createQueued: false };

  it("creates when first reaching 06", () => {
    expect(decideVistaOperation(opp({ stage: "05" }), opp({ stage: "06" }), fresh)).toBe("CREATE_POTENTIAL_PROJECT");
  });

  it("creates when first entered at 07", () => {
    expect(decideVistaOperation(null, opp({ stage: "07" }), fresh)).toBe("CREATE_POTENTIAL_PROJECT");
  });

  it("does nothing before 06", () => {
    expect(decideVistaOperation(null, opp({ stage: "05" }), fresh)).toBeNull();
  });

  it("never pushes an opportunity closed before reaching Vista", () => {
    expect(decideVistaOperation(opp({ stage: "05" }), opp({ stage: "12" }), fresh)).toBeNull();
  });

  it("updates when a synced field changes after the push", () => {
    expect(
      decideVistaOperation(opp({ stage: "07" }), opp({ stage: "10" }), { pushed: true, createQueued: false }),
    ).toBe("UPDATE_POTENTIAL_PROJECT");
  });

  it("skips the update when only CRM-only fields change", () => {
    expect(
      decideVistaOperation(opp(), opp({ marketSector: "FOOD", deliveryMethod: "CMAR" }), {
        pushed: true,
        createQueued: false,
      }),
    ).toBeNull();
  });

  it("compares dates by value", () => {
    expect(changedSyncedFields(opp(), opp({ bidDueDate: new Date("2026-12-01") }))).toEqual([]);
  });

  it("requires readiness for Vista stages and for anything already pushed", () => {
    expect(needsVistaReadiness("06", fresh)).toBe(true);
    expect(needsVistaReadiness("10", fresh)).toBe(false);
    expect(needsVistaReadiness("10", { pushed: true, createQueued: false })).toBe(true);
  });
});

describe("validation", () => {
  it("lists every field Vista needs", () => {
    const r = checkVistaReadiness(
      { name: "x", estimatedValue: null, projectType: null, city: null, state: null, bidDueDate: null, estimatorCode: null },
      account({ vistaCustomerNumber: null, street: null }),
    );
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual(["estimatedValue", "projectType", "city", "state", "bidDueDate", "estimatorCode", "customer"]);
  });

  it("does not need an address for a linked Vista customer", () => {
    expect(checkVistaReadiness(opp(), account({ street: null, zip: null })).ready).toBe(true);
  });

  it("requires a closed reason for 10-12", () => {
    expect(checkStageRequirements("10", null)).toMatch(/closed reason/);
    expect(checkStageRequirements("10", "Price")).toBeNull();
    expect(checkStageRequirements("07", null)).toBeNull();
  });

  it("parses form strings: money, dates, blank optionals, state codes", () => {
    const r = opportunityInputSchema.parse({
      name: " Job ",
      accountId: "3",
      stage: "06",
      ownerId: "1",
      estimatedValue: "$1,250,000.456",
      bidDueDate: "2026-12-01",
      city: "",
      state: "mi",
    });
    expect(r).toMatchObject({ name: "Job", accountId: 3, estimatedValue: 1250000.46, city: null, state: "MI" });
    expect(r.bidDueDate).toEqual(new Date("2026-12-01"));
  });

  it("rejects bad values", () => {
    const r = opportunityInputSchema.safeParse({ name: "", accountId: "x", stage: "13", ownerId: 1, estimatedValue: "-5", state: "Mich" });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path[0]).sort()).toEqual(["accountId", "estimatedValue", "name", "stage", "state"]);
  });
});

describe("outbox state machine", () => {
  it("claims a pending message with a lease", () => {
    const c = claim(msg(), now, "tok");
    expect(c).toMatchObject({ status: "IN_PROGRESS", attempts: 1, lockToken: "tok" });
    expect(c.lockedUntil!.getTime()).toBeGreaterThan(now.getTime());
  });

  it("reclaims an in-progress message only after its lease expires", () => {
    const c = claim(msg(), now, "tok");
    expect(isClaimable(c, now)).toBe(false);
    expect(isClaimable(c, new Date(c.lockedUntil!.getTime() + 1))).toBe(true);
  });

  it("retries a retryable failure with backoff", () => {
    const f = fail(claim(msg(), now, "t"), now, { code: "TIMEOUT", message: "Vista timed out", retryable: true });
    expect(f.status).toBe("FAILED");
    expect(f.nextAttemptAt.getTime() - now.getTime()).toBe(backoffMs(1));
    expect(isClaimable(f, now)).toBe(false);
  });

  it("stops at once on a non-retryable failure", () => {
    const f = fail(claim(msg(), now, "t"), now, { code: "VISTA_VALIDATION", message: "bad", retryable: false });
    expect(f.status).toBe("DEAD");
    expect(isClaimable(f, new Date(now.getTime() + 1e9))).toBe(false);
  });

  it("gives up after MAX_ATTEMPTS", () => {
    const f = fail(claim(msg({ attempts: MAX_ATTEMPTS - 1 }), now, "t"), now, { code: "X", message: "x", retryable: true });
    expect(f.status).toBe("DEAD");
  });

  it("caps backoff at an hour", () => {
    expect(backoffMs(1)).toBe(60_000);
    expect(backoffMs(3)).toBe(240_000);
    expect(backoffMs(30)).toBe(3_600_000);
  });

  it("succeeds and clears the lock", () => {
    expect(succeed(claim(msg(), now, "t"), now)).toMatchObject({ status: "SUCCEEDED", lockToken: null, completedAt: now });
  });

  it("replays only failed or dead messages", () => {
    expect(replay(msg({ status: "DEAD", attempts: 8 }), now)).toMatchObject({ status: "PENDING", attempts: 0 });
    expect(() => replay(msg({ status: "SUCCEEDED" }), now)).toThrow();
  });

  it("keeps messages for one opportunity in order", () => {
    const all = [msg({ id: 1, status: "FAILED" }), msg({ id: 2 }), msg({ id: 3, opportunityId: 7 })];
    expect(blockedByEarlier(all[1], all)).toBe(true);
    expect(blockedByEarlier(all[2], all)).toBe(false);
  });
});

describe("permissions", () => {
  it("lets BD and estimators edit, PMs log activities, executives only view", () => {
    expect(can("BD", "opportunity:edit")).toBe(true);
    expect(can("ESTIMATOR", "opportunity:edit")).toBe(true);
    expect(can("PM", "opportunity:edit")).toBe(false);
    expect(can("PM", "activity:edit")).toBe(true);
    expect(can("EXECUTIVE", "activity:edit")).toBe(false);
    expect(can("ADMIN", "integration:replay")).toBe(true);
    expect(can("BD", "integration:replay")).toBe(false);
  });
});

describe("Vista field map", () => {
  it("builds a potential project for an existing customer", () => {
    const p = buildPotentialProjectPayload(opp({ stage: "07" }), account(), 9);
    expect(p).toEqual({
      JCCo: 9,
      PotentialProject: "CRM000042",
      Description: "Freezer addition",
      Status: "Proposal",
      ProjectType: "COLD",
      City: "Detroit",
      State: "MI",
      EstimatedValue: 1000,
      BidDueDate: "2026-12-01",
      Estimator: "RCHEN",
      Notes: "Two bays",
      customer: { mode: "existing", Customer: 1001 },
      ud_CRMId: 42,
    });
  });

  it("asks the flow to create the customer when the account isn't linked", () => {
    const p = buildPotentialProjectPayload(opp(), account({ vistaCustomerNumber: null, phone: "555" }), 9);
    expect(p.customer).toEqual({ mode: "create", Name: "Northgate Foods", Address: "400 Riverside Dr", City: "Detroit", State: "MI", Zip: "48207", Phone: "555" });
  });

  it("puts the closed reason in Notes", () => {
    expect(buildPotentialProjectPayload(opp({ stage: "10", closedReason: "Price" }), account(), 9)).toMatchObject({
      Status: "Lost",
      Notes: "Closed: Price",
    });
  });

  it("has a Vista status for every stage that can be in Vista, and none before 06", () => {
    for (const s of STAGES) {
      if (s.requiresVista || s.group === "closed") expect(() => toVistaStatus(s.code)).not.toThrow();
      else expect(() => toVistaStatus(s.code)).toThrow();
    }
  });

  it("formats potential project codes within Vista's 20 characters", () => {
    expect(potentialProjectCode(7)).toBe("CRM000007");
    expect(potentialProjectCode(12345678).length).toBeLessThanOrEqual(20);
  });
});
