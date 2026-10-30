/**
 * Behaviour every Repo implementation must have. Runs against the in-memory
 * repo here; point `makeRepo` at the Prisma repo to check SQL Server the same way.
 */
import { describe, expect, it } from "vitest";
import { setup } from "./support/fixtures";
import { NotFoundError } from "@/server/repo/types";

const at = new Date("2026-11-02T14:00:00Z");

describe("repository contract", () => {
  it("finds users by email regardless of case and updates on upsert", async () => {
    const { repo } = await setup();
    expect((await repo.users.getByEmail("BD@Test.Local"))?.role).toBe("BD");
    const u = await repo.users.upsert({ email: "BD@test.local", name: "Renamed", role: "BD", active: true });
    expect(u.name).toBe("Renamed");
    expect((await repo.users.list()).filter((x) => x.email === "bd@test.local")).toHaveLength(1);
  });

  it("searches accounts by name, sorted", async () => {
    const { repo } = await setup();
    expect((await repo.accounts.list("bay")).map((a) => a.name)).toEqual(["Arctic Bay Seafood"]);
    const names = (await repo.accounts.list()).map((a) => a.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("lists contacts by last name and gets one", async () => {
    const { repo, accounts } = await setup();
    const base = { accountId: accounts.linked.id, title: null, email: null, phone: null };
    await repo.contacts.create({ ...base, firstName: "Zed", lastName: "Young" });
    const c = await repo.contacts.create({ ...base, firstName: "Amy", lastName: "Adams" });
    expect((await repo.contacts.listByAccount(accounts.linked.id)).map((x) => x.lastName)).toEqual(["Adams", "Young"]);
    expect((await repo.contacts.get(c.id))?.firstName).toBe("Amy");
    expect(await repo.contacts.get(999)).toBeNull();
  });

  it("filters activities and finds Outlook items by external id", async () => {
    const { repo, users, accounts } = await setup();
    const base = {
      notes: null,
      occurredAt: at,
      completedAt: null,
      opportunityId: null,
      contactId: null,
      source: "MANUAL" as const,
      externalId: null,
    };
    await repo.activities.create({ ...base, type: "CALL", subject: "Done call", dueAt: null, accountId: accounts.linked.id, ownerId: users.BD.id });
    await repo.activities.create({
      ...base,
      type: "FOLLOW_UP",
      subject: "Open follow-up",
      dueAt: at,
      accountId: accounts.unlinked.id,
      ownerId: users.BD.id,
      source: "OUTLOOK",
      externalId: "AAMk-1",
    });
    expect((await repo.activities.list({ openOnly: true })).map((a) => a.subject)).toEqual(["Open follow-up"]);
    expect(await repo.activities.list({ accountId: accounts.linked.id })).toHaveLength(1);
    expect((await repo.activities.findByExternalId("AAMk-1"))?.subject).toBe("Open follow-up");
    await expect(repo.activities.complete(999, at)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("searches active Vista customers by name or number", async () => {
    const { repo } = await setup();
    await repo.vista.upsertCustomers([
      { customerNumber: 3003, name: "Old Customer", city: null, state: null, active: false, syncedAt: at },
    ]);
    expect((await repo.vista.searchCustomers("north", 10)).map((c) => c.customerNumber)).toEqual([1001]);
    expect((await repo.vista.searchCustomers("1001", 10))).toHaveLength(1);
    expect(await repo.vista.searchCustomers("old", 10)).toHaveLength(0);
  });

  it("lists only active lookups, sorted by description", async () => {
    const { repo } = await setup();
    await repo.lookups.upsert([
      { kind: "ESTIMATOR", code: "ZZ", description: "Zoe Zhang", active: true },
      { kind: "ESTIMATOR", code: "AA", description: "Al Adams", active: true },
      { kind: "ESTIMATOR", code: "XX", description: "Gone", active: false },
    ]);
    expect((await repo.lookups.list("ESTIMATOR")).map((l) => l.code)).toEqual(["AA", "ZZ"]);
  });

  it("rolls back everything in a failed transaction", async () => {
    const { repo } = await setup();
    const before = (await repo.accounts.list()).length;
    await expect(
      repo.transaction(async (tx) => {
        await tx.accounts.create({
          name: "Temp",
          type: "OTHER",
          phone: null,
          website: null,
          street: null,
          city: null,
          state: null,
          zip: null,
          vistaCustomerNumber: null,
          ownerId: null,
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await repo.accounts.list()).toHaveLength(before);
  });
});
