import { describe, expect, it } from "vitest";
import { setup } from "./support/fixtures";
import { completeActivity, createAccount, createContact, logActivity, updateAccount } from "@/server/services/crm";
import { createOpportunity } from "@/server/services/opportunities";
import { ingestCustomers, ingestLookups } from "@/server/services/vistaInbound";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { NotFoundError } from "@/server/repo/types";

describe("accounts", () => {
  it("creates an unlinked account owned by the creator", async () => {
    const t = await setup();
    const a = await createAccount(t.ctx(), { name: "Polar Logistics", type: "DEVELOPER", state: "oh" });
    expect(a).toMatchObject({ name: "Polar Logistics", state: "OH", vistaCustomerNumber: null, ownerId: t.users.BD.id });
  });

  it("explains field problems", async () => {
    const t = await setup();
    const err = await createAccount(t.ctx(), { name: "", type: "NOPE" }).catch((e) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(Object.keys(err.fieldErrors).sort()).toEqual(["name", "type"]);
  });

  it("links an unlinked account to a synced Vista customer", async () => {
    const t = await setup();
    await ingestCustomers(t.ictx, [{ customerNumber: 2002, name: "Arctic Bay Seafood" }]);
    const a = await updateAccount(t.ctx(), t.accounts.unlinked.id, { ...t.accounts.unlinked, vistaCustomerNumber: 2002 });
    expect(a.vistaCustomerNumber).toBe(2002);
  });

  it("reports a missing account", async () => {
    const t = await setup();
    await expect(updateAccount(t.ctx(), 999, { name: "X", type: "OWNER" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not let executives edit accounts", async () => {
    const t = await setup();
    await expect(createAccount(t.ctx("EXECUTIVE"), { name: "X", type: "OWNER" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("contacts", () => {
  it("adds a contact to an account", async () => {
    const t = await setup();
    const c = await createContact(t.ctx(), {
      accountId: t.accounts.linked.id,
      firstName: "Dana",
      lastName: "Price",
      email: "dana@northgate.example",
    });
    expect(c).toMatchObject({ accountId: t.accounts.linked.id, title: null, email: "dana@northgate.example" });
  });

  it("rejects a bad email and a missing account", async () => {
    const t = await setup();
    const bad = await createContact(t.ctx(), { accountId: t.accounts.linked.id, firstName: "A", lastName: "B", email: "nope" }).catch(
      (e) => e,
    );
    expect(bad.fieldErrors.email).toBeDefined();
    await expect(createContact(t.ctx(), { accountId: 999, firstName: "A", lastName: "B" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("activities", () => {
  it("needs an opportunity or an account", async () => {
    const t = await setup();
    await expect(logActivity(t.ctx(), { type: "CALL", subject: "Intro" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("logs against an account and completes a follow-up", async () => {
    const t = await setup();
    const a = await logActivity(t.ctx(), {
      type: "FOLLOW_UP",
      subject: "Send budget",
      accountId: t.accounts.linked.id,
      dueAt: "2026-11-05",
    });
    expect(a).toMatchObject({ source: "MANUAL", completedAt: null, ownerId: t.users.BD.id });
    const done = await completeActivity(t.ctx(), a.id);
    expect(done.completedAt).toEqual(t.clock.now());
  });

  it("reports an unknown opportunity", async () => {
    const t = await setup();
    await expect(logActivity(t.ctx(), { type: "NOTE", subject: "x", opportunityId: 999 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keeps executives read-only", async () => {
    const t = await setup();
    const o = await createOpportunity(t.ctx(), t.draft());
    await expect(logActivity(t.ctx("EXECUTIVE"), { type: "NOTE", subject: "x", opportunityId: o.id })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("pick lists from Vista", () => {
  it("upserts lookups and rejects unknown kinds", async () => {
    const t = await setup();
    expect(await ingestLookups(t.ictx, [{ kind: "PROJECT_TYPE", code: "COLD", description: "Cold storage" }])).toBe(1);
    expect((await t.repo.lookups.list("PROJECT_TYPE")).map((l) => l.code)).toContain("COLD");
    await expect(ingestLookups(t.ictx, [{ kind: "COLOR", code: "X", description: "x" }])).rejects.toBeInstanceOf(ValidationError);
  });
});
