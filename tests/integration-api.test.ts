import { describe, expect, it } from "vitest";
import { setup } from "./support/fixtures";
import { checkApiKey, postClaim, postInbound, postResult } from "@/server/http/integration";
import { createOpportunity } from "@/server/services/opportunities";

const KEY = "k".repeat(40);
const req = (body: unknown, headers: Record<string, string> = { "x-api-key": KEY }) =>
  new Request("http://crm.test/api", { method: "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });

describe("API key", () => {
  it("accepts x-api-key or a bearer token", () => {
    expect(checkApiKey(req({}), KEY)).toBeNull();
    expect(checkApiKey(req({}, { authorization: `Bearer ${KEY}` }), KEY)).toBeNull();
  });

  it("rejects a wrong or missing key", () => {
    expect(checkApiKey(req({}, { "x-api-key": "nope" }), KEY)!.status).toBe(401);
    expect(checkApiKey(req({}, {}), KEY)!.status).toBe(401);
  });

  it("is disabled until a strong key is configured", () => {
    expect(checkApiKey(req({}), undefined)!.status).toBe(503);
    expect(checkApiKey(req({}), "short")!.status).toBe(503);
  });
});

describe("outbox endpoints", () => {
  it("runs a full claim → success round trip", async () => {
    const t = await setup();
    const o = await createOpportunity(t.ctx(), t.vistaReady());

    const claimRes = await postClaim(req({ limit: 5 }), t.ictx);
    expect(claimRes.status).toBe(200);
    const { messages } = await claimRes.json();
    expect(messages).toHaveLength(1);

    const res = await postResult(
      req({ success: true, lockToken: messages[0].lockToken, potentialProject: "CRM000001" }),
      t.ictx,
      String(messages[0].id),
    );
    expect(res.status).toBe(200);
    expect((await t.repo.opportunities.get(o.id))!.vistaSyncStatus).toBe("SYNCED");
  });

  it("claims with an empty body", async () => {
    const t = await setup();
    const res = await postClaim(new Request("http://crm.test/api", { method: "POST" }), t.ictx);
    expect(res.status).toBe(200);
  });

  it("records a failure and tells the flow when the retry is", async () => {
    const t = await setup();
    await createOpportunity(t.ctx(), t.vistaReady());
    const { messages } = await (await postClaim(req({}), t.ictx)).json();
    const res = await postResult(
      req({ success: false, lockToken: messages[0].lockToken, error: { code: "TIMEOUT", message: "slow", retryable: true } }),
      t.ictx,
      String(messages[0].id),
    );
    expect(await res.json()).toMatchObject({ status: "FAILED", nextAttemptAt: expect.any(String) });
  });

  it("answers 409 for a result with a stale lock token", async () => {
    const t = await setup();
    await createOpportunity(t.ctx(), t.vistaReady());
    const { messages } = await (await postClaim(req({}), t.ictx)).json();
    const res = await postResult(req({ success: true, lockToken: "wrong", potentialProject: "X" }), t.ictx, String(messages[0].id));
    expect(res.status).toBe(409);
  });

  it("answers 400 for bad input and 404 for unknown messages", async () => {
    const t = await setup();
    expect((await postResult(req({ success: true }), t.ictx, "1")).status).toBe(400);
    expect((await postResult(req({ success: true, lockToken: "x", potentialProject: "X" }), t.ictx, "999")).status).toBe(404);
    expect((await postResult(req({}), t.ictx, "abc")).status).toBe(400);
    expect((await postClaim(req({ limit: 500 }), t.ictx)).status).toBe(400);
  });
});

describe("inbound endpoints", () => {
  it("ingests customers, jobs and lookups", async () => {
    const t = await setup();
    expect(await (await postInbound(req({ rows: [{ customerNumber: 5, name: "New Co" }] }), t.ictx, "customers")).json()).toEqual({ received: 1 });
    expect(await (await postInbound(req({ rows: [{ company: 9, job: "26-001", status: "Open", startDate: "2026-01-05" }] }), t.ictx, "jobs")).json()).toEqual({ kept: 1, skipped: 0 });
    expect(await (await postInbound(req({ rows: [{ kind: "ESTIMATOR", code: "AB", description: "A B" }] }), t.ictx, "lookups")).json()).toEqual({ received: 1 });
  });

  it("rejects a body without rows", async () => {
    const t = await setup();
    expect((await postInbound(req({ items: [] }), t.ictx, "jobs")).status).toBe(400);
  });
});
