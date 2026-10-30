import { createMemoryRepo } from "@/server/repo/memory";
import type { IntegrationContext, ServiceContext } from "@/server/context";
import type { Role } from "@/domain/types";

/** A fresh in-memory repo with one user per role, a linked account and pick lists. */
export async function setup(opts: { now?: Date } = {}) {
  const repo = createMemoryRepo();
  let current = opts.now ?? new Date("2026-11-02T14:00:00Z");
  const clock = {
    now: () => new Date(current),
    advance(ms: number) {
      current = new Date(current.getTime() + ms);
    },
  };
  const config = { vistaCompany: 201 };

  const roles: Role[] = ["BD", "ESTIMATOR", "PM", "ADMIN", "EXECUTIVE"];
  const users = Object.fromEntries(
    await Promise.all(
      roles.map(async (role) => [
        role,
        await repo.users.upsert({ email: `${role.toLowerCase()}@test.local`, name: role, role, active: true }),
      ]),
    ),
  ) as Record<Role, Awaited<ReturnType<typeof repo.users.upsert>>>;

  await repo.vista.upsertCustomers([
    { customerNumber: 1001, name: "Northgate Foods", city: "Detroit", state: "MI", active: true, syncedAt: clock.now() },
  ]);
  const linked = await repo.accounts.create({
    name: "Northgate Foods",
    type: "OWNER",
    phone: null,
    website: null,
    street: "400 Riverside Dr",
    city: "Detroit",
    state: "MI",
    zip: "48207",
    vistaCustomerNumber: 1001,
    ownerId: users.BD.id,
  });
  const unlinked = await repo.accounts.create({
    name: "Arctic Bay Seafood",
    type: "OWNER",
    phone: "419-555-0100",
    website: null,
    street: "1 Pier St",
    city: "Toledo",
    state: "OH",
    zip: "43604",
    vistaCustomerNumber: null,
    ownerId: users.BD.id,
  });
  const noAddress = await repo.accounts.create({
    name: "Mystery Developer",
    type: "DEVELOPER",
    phone: null,
    website: null,
    street: null,
    city: null,
    state: null,
    zip: null,
    vistaCustomerNumber: null,
    ownerId: users.BD.id,
  });

  const ctx = (role: Role = "BD"): ServiceContext => ({ repo, user: users[role], now: clock.now, config });
  const ictx: IntegrationContext = { repo, now: clock.now, config };

  /** Minimum valid input for a stage before 06. */
  const draft = (overrides: Record<string, unknown> = {}) => ({
    name: "Freezer addition",
    accountId: linked.id,
    stage: "03",
    ownerId: users.BD.id,
    ...overrides,
  });

  /** Input with every field Vista needs. */
  const vistaReady = (overrides: Record<string, unknown> = {}) =>
    draft({
      stage: "06",
      estimatedValue: 4_750_000,
      projectType: "COLD",
      city: "Grand Rapids",
      state: "MI",
      bidDueDate: "2026-12-01",
      estimatorCode: "RCHEN",
      ...overrides,
    });

  return { repo, clock, users, accounts: { linked, unlinked, noAddress }, ctx, ictx, draft, vistaReady };
}
