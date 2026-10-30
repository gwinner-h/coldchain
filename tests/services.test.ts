import { describe, expect, it } from "vitest";
import { setup } from "./support/fixtures";
import { changeStage, createOpportunity, updateOpportunity } from "@/server/services/opportunities";
import { claimDue, replayMessage, reportFailure, reportSuccess } from "@/server/services/outbox";
import { ingestJobs } from "@/server/services/vistaInbound";
import { createAccount, logActivity, updateAccount } from "@/server/services/crm";
import { pipelineTotals, summarizeByStage, winRate } from "@/server/services/reports";
import { ValidationError, ForbiddenError } from "@/server/errors";
import { ConcurrencyError } from "@/server/repo/types";
import { LEASE_MS } from "@/domain/outbox";

describe("creating and moving opportunities", () => {
  it("keeps early-stage opportunities out of Vista", async () => {
    const t = await setup();
    const o = await createOpportunity(t.ctx(), t.draft());
    expect(o.vistaSyncStatus).toBe("NOT_REQUIRED");
    expect(await t.repo.outbox.list()).toHaveLength(0);
    expect(await t.repo.stageChanges.listByOpportunity(o.id)).toMatchObject([{ fromStage: null, toStage: "03" }]);
  });

  it("refuses to reach 06 until Vista fields are complete, and says which", async () => {
    const t = await setup();
    const o = await createOpportunity(t.ctx(), t.draft());
    const err = await changeStage(t.ctx(), o.id, o.version, "06").catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toMatch(/Estimated value, Project type, City, State, Bid due date, Estimator/);
    expect((await t.repo.opportunities.get(o.id))!.stage).toBe("03");
  });

  it("queues a create when an opportunity is first entered at 07", async () => {
    const t = await setup();
    const o = await createOpportunity(t.ctx(), t.vistaReady({ stage: "07" }));
    expect(o.vistaSyncStatus).toBe("PENDING");
    const [m] = await t.repo.outbox.list();
    expect(m).toMatchObject({ operation: "CREATE_POTENTIAL_PROJECT", status: "PENDING" });
    expect(m.payload).toMatchObject({ JCCo: 201, Status: "Proposal", customer: { mode: "existing", Customer: 1001 } });
  });

  it("requires a full address when the customer is new to Vista", async () => {
    const t = await setup();
    const err = await createOpportunity(t.ctx(), t.vistaReady({ accountId: t.accounts.noAddress.id })).catch((e) => e);
    expect(err.message).toMatch(/Customer address/);
  });

  it("folds edits made before delivery into the queued create", async () => {
    const t = await setup();
    let o = await createOpportunity(t.ctx(), t.vistaReady());
    o = await updateOpportunity(t.ctx(), o.id, o.version, { ...t.vistaReady(), estimatedValue: 5_000_000 });
    await changeStage(t.ctx(), o.id, o.version, "07");
    const msgs = await t.repo.outbox.list();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].payload).toMatchObject({ EstimatedValue: 5_000_000, Status: "Proposal" });
  });

  it("rejects a save based on a stale version", async () => {
    const t = await setup();
    const o = await createOpportunity(t.ctx(), t.draft());
    await updateOpportunity(t.ctx(), o.id, o.version, t.draft({ name: "A" }));
    await expect(updateOpportunity(t.ctx(), o.id, o.version, t.draft({ name: "B" }))).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it("rolls back the opportunity if queueing fails", async () => {
    const t = await setup();
    const original = t.repo.outbox.enqueue;
    t.repo.outbox.enqueue = async () => {
      throw new Error("db down");
    };
    await expect(createOpportunity(t.ctx(), t.vistaReady())).rejects.toThrow("db down");
    t.repo.outbox.enqueue = original;
    expect(await t.repo.opportunities.list()).toHaveLength(0);
  });

  it("requires a closed reason to lose", async () => {
    const t = await setup();
    const o = await createOpportunity(t.ctx(), t.draft());
    await expect(changeStage(t.ctx(), o.id, o.version, "10")).rejects.toThrow(/closed reason/);
    const lost = await changeStage(t.ctx(), o.id, o.version, "10", "Lost on price");
    expect(lost.stage).toBe("10");
    expect(await t.repo.outbox.list()).toHaveLength(0);
  });

  it("does not let PMs or executives edit opportunities", async () => {
    const t = await setup();
    await expect(createOpportunity(t.ctx("PM"), t.draft())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createOpportunity(t.ctx("EXECUTIVE"), t.draft())).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("delivering to Vista through App Xchange", () => {
  it("claims, succeeds and records the Vista code", async () => {
    const t = await setup();
    const o = await createOpportunity(t.ctx(), t.vistaReady());
    const [m] = await claimDue(t.ictx);
    expect(m.payload).toMatchObject({ PotentialProject: `CRM${String(o.id).padStart(6, "0")}` });
    expect(await claimDue(t.ictx)).toHaveLength(0);

    await reportSuccess(t.ictx, m.id, m.lockToken, { potentialProject: "CRM000001" });
    const after = (await t.repo.opportunities.get(o.id))!;
    expect(after).toMatchObject({ vistaSyncStatus: "SYNCED", vistaPotentialProject: "CRM000001" });
  });

  it("links the account when the flow creates the Vista customer", async () => {
    const t = await setup();
    await createOpportunity(t.ctx(), t.vistaReady({ accountId: t.accounts.unlinked.id }));
    const [m] = await claimDue(t.ictx);
    expect(m.payload).toMatchObject({ customer: { mode: "create", Name: "Arctic Bay Seafood" } });
    await reportSuccess(t.ictx, m.id, m.lockToken, { potentialProject: "CRM000001", customerNumber: 2001 });
    expect((await t.repo.accounts.get(t.accounts.unlinked.id))!.vistaCustomerNumber).toBe(2001);
  });

  it("sends later changes, including losing the bid, as updates", async () => {
    const t = await setup();
    const o = await createOpportunity(t.ctx(), t.vistaReady());
    const [m] = await claimDue(t.ictx);
    await reportSuccess(t.ictx, m.id, m.lockToken, { potentialProject: "CRM000001" });
    const current = (await t.repo.opportunities.get(o.id))!;
    await changeStage(t.ctx(), o.id, current.version, "10", "Lost on price");
    const [u] = await claimDue(t.ictx);
    expect(u).toMatchObject({ operation: "UPDATE_POTENTIAL_PROJECT", payload: { Status: "Lost", Notes: "Closed: Lost on price" } });
  });

  it("never sends an update before its create has succeeded", async () => {
    const t = await setup();
    const o = await createOpportunity(t.ctx(), t.vistaReady());
    const [create] = await claimDue(t.ictx); // in flight
    const current = (await t.repo.opportunities.get(o.id))!;
    await changeStage(t.ctx(), o.id, current.version, "07");
    expect(await t.repo.outbox.list()).toHaveLength(2);
    expect(await claimDue(t.ictx)).toHaveLength(0);
    await reportSuccess(t.ictx, create.id, create.lockToken, { potentialProject: "CRM000001" });
    const [update] = await claimDue(t.ictx);
    expect(update.operation).toBe("UPDATE_POTENTIAL_PROJECT");
  });

  it("retries a temporary failure after the backoff", async () => {
    const t = await setup();
    await createOpportunity(t.ctx(), t.vistaReady());
    const [m] = await claimDue(t.ictx);
    const failed = await reportFailure(t.ictx, m.id, m.lockToken, { code: "TIMEOUT", message: "timed out", retryable: true });
    expect(failed.status).toBe("FAILED");
    expect(await claimDue(t.ictx)).toHaveLength(0);
    t.clock.advance(61_000);
    expect(await claimDue(t.ictx)).toHaveLength(1);
  });

  it("flags a rejected push and resends it once the user fixes the data", async () => {
    const t = await setup();
    const o = await createOpportunity(t.ctx(), t.vistaReady());
    const [m] = await claimDue(t.ictx);
    await reportFailure(t.ictx, m.id, m.lockToken, { code: "VISTA_VALIDATION", message: "bad project type", retryable: false });
    let current = (await t.repo.opportunities.get(o.id))!;
    expect(current.vistaSyncStatus).toBe("ERROR");

    current = await updateOpportunity(t.ctx(), o.id, current.version, t.vistaReady({ projectType: "DIST" }));
    expect(current.vistaSyncStatus).toBe("PENDING");
    const [retry] = await claimDue(t.ictx);
    expect(retry).toMatchObject({ id: m.id, attempt: 1, payload: { ProjectType: "DIST" } });
  });

  it("lets an admin retry, but not a BD user", async () => {
    const t = await setup();
    await createOpportunity(t.ctx(), t.vistaReady());
    const [m] = await claimDue(t.ictx);
    await reportFailure(t.ictx, m.id, m.lockToken, { code: "X", message: "x", retryable: false });
    await expect(replayMessage(t.ctx("BD"), m.id)).rejects.toBeInstanceOf(ForbiddenError);
    await replayMessage(t.ctx("ADMIN"), m.id);
    expect(await claimDue(t.ictx)).toHaveLength(1);
  });

  it("reclaims a message when the flow dies mid-run, and rejects the stale result", async () => {
    const t = await setup();
    await createOpportunity(t.ctx(), t.vistaReady());
    const [first] = await claimDue(t.ictx);
    t.clock.advance(LEASE_MS + 1);
    const [second] = await claimDue(t.ictx);
    expect(second.id).toBe(first.id);
    await expect(reportSuccess(t.ictx, first.id, first.lockToken, { potentialProject: "X" })).rejects.toBeInstanceOf(ConcurrencyError);
    await reportSuccess(t.ictx, second.id, second.lockToken, { potentialProject: "X" });
  });

  it("never hands the same message to two flow runs", async () => {
    const t = await setup();
    await createOpportunity(t.ctx(), t.vistaReady());
    const [a, b] = await Promise.all([claimDue(t.ictx), claimDue(t.ictx)]);
    expect(a.length + b.length).toBe(1);
  });
});

describe("Vista data coming in", () => {
  it("keeps jobs from 2020 on", async () => {
    const t = await setup();
    const r = await ingestJobs(t.ictx, [
      { company: 9, job: "19-001", description: "Old", status: "Closed", startDate: "2019-12-31" },
      { company: 9, job: "20-001", description: "New", status: "Open", startDate: "2020-01-01", customerNumber: 1001 },
      { company: 9, job: "NODATE", description: "Unknown", status: "Open" },
    ]);
    expect(r).toEqual({ kept: 2, skipped: 1 });
    expect((await t.repo.vista.listJobsByCustomer(1001)).map((j) => j.job)).toEqual(["20-001"]);
  });

  it("rejects a malformed batch", async () => {
    const t = await setup();
    await expect(ingestJobs(t.ictx, [{ job: "x" }])).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("accounts and activities", () => {
  it("only links accounts to Vista customers that exist", async () => {
    const t = await setup();
    await expect(createAccount(t.ctx(), { name: "X", type: "OWNER", vistaCustomerNumber: 9999 })).rejects.toThrow(/synced list/);
    const a = await createAccount(t.ctx(), { name: "X", type: "OWNER", vistaCustomerNumber: 1001 });
    expect(a.vistaCustomerNumber).toBe(1001);
  });

  it("won't silently relink an account to a different Vista customer", async () => {
    const t = await setup();
    await expect(
      updateAccount(t.ctx(), t.accounts.linked.id, { name: "Northgate", type: "OWNER", vistaCustomerNumber: null }),
    ).rejects.toThrow(/already linked/);
  });

  it("lets PMs log activities and fills in the account from the opportunity", async () => {
    const t = await setup();
    const o = await createOpportunity(t.ctx(), t.draft());
    const a = await logActivity(t.ctx("PM"), { type: "CALL", subject: "Intro", occurredAt: "2026-11-01", opportunityId: o.id });
    expect(a.accountId).toBe(t.accounts.linked.id);
  });
});

describe("reports", () => {
  it("summarises the pipeline and win rate", async () => {
    const t = await setup();
    const a = await createOpportunity(t.ctx(), t.vistaReady({ stage: "07", estimatedValue: 100 }));
    const b = await createOpportunity(t.ctx(), t.vistaReady({ stage: "07", estimatedValue: 50 }));
    await createOpportunity(t.ctx(), t.draft({ estimatedValue: 25 }));
    await changeStage(t.ctx(), a.id, a.version, "09");
    await changeStage(t.ctx(), b.id, b.version, "10", "Price");

    const opps = await t.repo.opportunities.list();
    expect(pipelineTotals(opps)).toEqual({ openCount: 1, openValue: 25, proposalValue: 0, wonValue: 100 });
    expect(summarizeByStage(opps).find((s) => s.code === "09")).toMatchObject({ count: 1, totalValue: 100 });
    expect(winRate(await t.repo.stageChanges.listAll(), new Date("2026-01-01"))).toEqual({ won: 1, lost: 1, rate: 0.5 });
  });
});
