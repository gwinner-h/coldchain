/**
 * Demo / development seed data. Runs through the real services so the seeded
 * state (stage history, outbox, sync status) is exactly what the app would produce.
 * All names are fictional.
 */
import type { Repo } from "./repo/types";
import type { AppConfig, IntegrationContext, ServiceContext } from "./context";
import { createAccount, createContact, logActivity } from "./services/crm";
import { changeStage, createOpportunity } from "./services/opportunities";
import { claimDue, reportFailure, reportSuccess } from "./services/outbox";
import { ingestCustomers, ingestJobs, ingestLookups } from "./services/vistaInbound";
import type { Role } from "@/domain/types";

const USERS: { email: string; name: string; role: Role }[] = [
  { email: "admin@example.com", name: "Alex Admin", role: "ADMIN" },
  { email: "bd1@example.com", name: "Jordan Lee", role: "BD" },
  { email: "bd2@example.com", name: "Sam Patel", role: "BD" },
  { email: "estimator@example.com", name: "Riley Chen", role: "ESTIMATOR" },
  { email: "pm@example.com", name: "Morgan Diaz", role: "PM" },
  { email: "exec@example.com", name: "Casey Brooks", role: "EXECUTIVE" },
];

const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export async function seed(repo: Repo, config: AppConfig) {
  for (const u of USERS) await repo.users.upsert({ ...u, active: true });
  const users = await repo.users.list();
  const byEmail = (e: string) => users.find((u) => u.email === e)!;
  const admin = byEmail("admin@example.com");
  const bd1 = byEmail("bd1@example.com");
  const bd2 = byEmail("bd2@example.com");

  const now = () => new Date();
  const ictx: IntegrationContext = { repo, now, config };
  const ctx = (userId: number): ServiceContext => ({ repo, user: users.find((u) => u.id === userId)!, now, config });

  await ingestLookups(ictx, [
    { kind: "PROJECT_TYPE", code: "COLD", description: "Cold storage warehouse" },
    { kind: "PROJECT_TYPE", code: "DIST", description: "Distribution center" },
    { kind: "PROJECT_TYPE", code: "FOODPROC", description: "Food processing plant" },
    { kind: "PROJECT_TYPE", code: "RETRO", description: "Refrigeration retrofit" },
    { kind: "ESTIMATOR", code: "RCHEN", description: "Riley Chen" },
    { kind: "ESTIMATOR", code: "TNGUYEN", description: "Taylor Nguyen" },
    { kind: "MARKET_SECTOR", code: "FOOD", description: "Food & beverage" },
    { kind: "MARKET_SECTOR", code: "PHARMA", description: "Pharmaceutical" },
    { kind: "MARKET_SECTOR", code: "LOGISTICS", description: "Logistics" },
  ]);

  await ingestCustomers(ictx, [
    { customerNumber: 1001, name: "Northgate Foods", city: "Detroit", state: "MI" },
    { customerNumber: 1002, name: "Lakeshore Logistics", city: "Grand Rapids", state: "MI" },
    { customerNumber: 1003, name: "Summit Pharma Partners", city: "Columbus", state: "OH" },
    { customerNumber: 1004, name: "Great Lakes Dairy Co-op", city: "Lansing", state: "MI" },
  ]);

  await ingestJobs(ictx, [
    { company: config.vistaCompany, job: "19-014", description: "Northgate freezer expansion", customerNumber: 1001, status: "Closed", contractAmount: 2_100_000, billedToDate: 2_100_000, startDate: "2019-04-01" },
    { company: config.vistaCompany, job: "21-032", description: "Northgate blast freezer", customerNumber: 1001, status: "Closed", contractAmount: 3_450_000, billedToDate: 3_450_000, startDate: "2021-03-15" },
    { company: config.vistaCompany, job: "24-008", description: "Northgate dock refrigeration", customerNumber: 1001, status: "Open", contractAmount: 1_250_000, billedToDate: 880_000, startDate: "2024-02-01" },
    { company: config.vistaCompany, job: "23-051", description: "Lakeshore cross-dock cooler", customerNumber: 1002, status: "Closed", contractAmount: 5_800_000, billedToDate: 5_800_000, startDate: "2023-06-12" },
    { company: config.vistaCompany, job: "25-017", description: "Great Lakes Dairy cheese cave", customerNumber: 1004, status: "Open", contractAmount: 4_200_000, billedToDate: 1_150_000, startDate: "2025-09-08" },
  ]);

  const northgate = await createAccount(ctx(bd1.id), { name: "Northgate Foods", type: "OWNER", street: "400 Riverside Dr", city: "Detroit", state: "MI", zip: "48207", vistaCustomerNumber: 1001 });
  const lakeshore = await createAccount(ctx(bd1.id), { name: "Lakeshore Logistics", type: "OWNER", street: "77 Harbor Way", city: "Grand Rapids", state: "MI", zip: "49503", vistaCustomerNumber: 1002 });
  const summit = await createAccount(ctx(bd2.id), { name: "Summit Pharma Partners", type: "OWNER", street: "12 Research Pkwy", city: "Columbus", state: "OH", zip: "43215", vistaCustomerNumber: 1003 });
  const dairy = await createAccount(ctx(bd2.id), { name: "Great Lakes Dairy Co-op", type: "OWNER", street: "9 Creamery Rd", city: "Lansing", state: "MI", zip: "48906", vistaCustomerNumber: 1004 });
  const arctic = await createAccount(ctx(bd1.id), { name: "Arctic Bay Seafood", type: "OWNER", street: "1 Pier St", city: "Toledo", state: "OH", zip: "43604" });
  const meridian = await createAccount(ctx(bd2.id), { name: "Meridian Builders", type: "GENERAL_CONTRACTOR", city: "Troy", state: "MI" });

  await createContact(ctx(bd1.id), { accountId: northgate.id, firstName: "Dana", lastName: "Whitfield", title: "VP Operations", email: "dana@northgate.example", phone: "313-555-0141" });
  await createContact(ctx(bd1.id), { accountId: lakeshore.id, firstName: "Chris", lastName: "Okafor", title: "Facilities Director", email: "chris@lakeshore.example" });
  await createContact(ctx(bd2.id), { accountId: summit.id, firstName: "Priya", lastName: "Raman", title: "Capital Projects Lead", email: "priya@summit.example" });
  await createContact(ctx(bd2.id), { accountId: meridian.id, firstName: "Luis", lastName: "Romero", title: "Preconstruction Manager", email: "luis@meridian.example" });

  const vistaReady = { projectType: "COLD", estimatorCode: "RCHEN", bidDueDate: daysFromNow(21) };
  const mk = (userId: number, data: Record<string, unknown>) =>
    createOpportunity(ctx(userId), { ownerId: userId, ...data });

  await mk(bd1.id, { name: "Northgate cold storage phase 3", accountId: northgate.id, stage: "02", estimatedValue: 6_500_000, city: "Detroit", state: "MI", marketSector: "FOOD" });
  await mk(bd1.id, { name: "Arctic Bay processing line", accountId: arctic.id, stage: "00", city: "Toledo", state: "OH", marketSector: "FOOD" });
  await mk(bd2.id, { name: "Meridian - Troy distribution cooler", accountId: meridian.id, stage: "04", estimatedValue: 3_200_000, city: "Troy", state: "MI", marketSector: "LOGISTICS" });
  await mk(bd2.id, { name: "Summit vaccine storage", accountId: summit.id, stage: "05", estimatedValue: 8_900_000, city: "Columbus", state: "OH", marketSector: "PHARMA" });
  const budget = await mk(bd1.id, { name: "Lakeshore freezer addition", accountId: lakeshore.id, stage: "06", estimatedValue: 4_750_000, city: "Grand Rapids", state: "MI", marketSector: "LOGISTICS", ...vistaReady });
  const proposal = await mk(bd2.id, { name: "Great Lakes Dairy aging room", accountId: dairy.id, stage: "07", estimatedValue: 2_300_000, city: "Lansing", state: "MI", marketSector: "FOOD", ...vistaReady, projectType: "FOODPROC", estimatorCode: "TNGUYEN" });
  const pending = await mk(bd1.id, { name: "Northgate dock door retrofit", accountId: northgate.id, stage: "07", estimatedValue: 900_000, city: "Detroit", state: "MI", marketSector: "FOOD", ...vistaReady, projectType: "RETRO" });
  const won = await mk(bd2.id, { name: "Lakeshore dock canopy", accountId: lakeshore.id, stage: "07", estimatedValue: 1_400_000, city: "Grand Rapids", state: "MI", marketSector: "LOGISTICS", ...vistaReady, projectType: "DIST" });
  const lost = await mk(bd1.id, { name: "Northgate ammonia upgrade", accountId: northgate.id, stage: "07", estimatedValue: 2_750_000, city: "Detroit", state: "MI", marketSector: "FOOD", ...vistaReady, projectType: "RETRO" });
  const arcticBid = await mk(bd1.id, { name: "Arctic Bay blast freezer", accountId: arctic.id, stage: "07", estimatedValue: 3_100_000, city: "Toledo", state: "OH", marketSector: "FOOD", ...vistaReady });

  // Simulate App Xchange: deliver everything once, with one rejection from Vista.
  for (const m of await claimDue(ictx, 50)) {
    if (m.opportunityId === arcticBid.id) {
      await reportFailure(ictx, m.id, m.lockToken, {
        code: "VISTA_VALIDATION",
        message: "Invalid value for ProjectType: 'COLD' is not set up in company " + config.vistaCompany,
        retryable: false,
      });
    } else {
      const p = m.payload as { PotentialProject: string; customer: { mode: string } };
      await reportSuccess(ictx, m.id, m.lockToken, {
        potentialProject: p.PotentialProject,
        customerNumber: p.customer.mode === "create" ? 1005 : undefined,
      });
    }
  }

  const move = async (id: number, userId: number, stage: "08" | "09" | "10", reason?: string) => {
    const current = await repo.opportunities.get(id);
    if (current) await changeStage(ctx(userId), id, current.version, stage, reason);
  };
  await move(pending.id, bd1.id, "08");
  await move(won.id, bd2.id, "09");
  await move(lost.id, bd1.id, "10", "Lost on price; owner went with incumbent");
  for (const m of await claimDue(ictx, 50)) {
    const p = m.payload as { PotentialProject: string };
    await reportSuccess(ictx, m.id, m.lockToken, { potentialProject: p.PotentialProject });
  }

  await logActivity(ctx(bd1.id), { type: "MEETING", subject: "Site walk with Dana", occurredAt: daysFromNow(-6), opportunityId: budget.id, notes: "Confirmed 2 freezer bays, -10F." });
  await logActivity(ctx(bd2.id), { type: "CALL", subject: "Proposal review call", occurredAt: daysFromNow(-2), opportunityId: proposal.id });
  await logActivity(ctx(bd1.id), { type: "FOLLOW_UP", subject: "Send revised schedule", occurredAt: daysFromNow(0), dueAt: daysFromNow(3), opportunityId: pending.id });

  return { admin };
}
