/** Accounts, contacts and activities. */
import {
  accountInputSchema,
  activityInputSchema,
  contactInputSchema,
} from "@/domain/validation";
import type { Account, Activity, Contact } from "@/domain/types";
import { requirePermission, type ServiceContext } from "../context";
import { fieldErrorsFromZod, ValidationError } from "../errors";
import { NotFoundError } from "../repo/types";

function parse<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } }, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (!r.success) throw new ValidationError("Please fix the highlighted fields", fieldErrorsFromZod(r.error.issues));
  return r.data;
}

async function checkVistaCustomer(ctx: ServiceContext, customerNumber: number | null | undefined) {
  if (customerNumber == null) return;
  const customer = await ctx.repo.vista.getCustomer(customerNumber);
  if (!customer) {
    throw new ValidationError("That Vista customer isn't in the synced list", {
      vistaCustomerNumber: ["Pick a customer from Vista"],
    });
  }
}

export async function createAccount(ctx: ServiceContext, raw: unknown): Promise<Account> {
  requirePermission(ctx, "account:edit");
  const input = parse(accountInputSchema, raw);
  await checkVistaCustomer(ctx, input.vistaCustomerNumber);
  return ctx.repo.accounts.create({
    name: input.name,
    type: input.type,
    phone: input.phone ?? null,
    website: input.website ?? null,
    street: input.street ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    zip: input.zip ?? null,
    vistaCustomerNumber: input.vistaCustomerNumber ?? null,
    ownerId: ctx.user.id,
  });
}

export async function updateAccount(ctx: ServiceContext, id: number, raw: unknown): Promise<Account> {
  requirePermission(ctx, "account:edit");
  const input = parse(accountInputSchema, raw);
  const existing = await ctx.repo.accounts.get(id);
  if (!existing) throw new NotFoundError("Account", id);
  if (existing.vistaCustomerNumber !== null && input.vistaCustomerNumber !== existing.vistaCustomerNumber) {
    throw new ValidationError("This account is already linked to a Vista customer; ask an admin to relink it", {
      vistaCustomerNumber: ["Already linked"],
    });
  }
  await checkVistaCustomer(ctx, input.vistaCustomerNumber);
  return ctx.repo.accounts.update(id, {
    name: input.name,
    type: input.type,
    phone: input.phone ?? null,
    website: input.website ?? null,
    street: input.street ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    zip: input.zip ?? null,
    vistaCustomerNumber: input.vistaCustomerNumber ?? null,
  });
}

export async function createContact(ctx: ServiceContext, raw: unknown): Promise<Contact> {
  requirePermission(ctx, "account:edit");
  const input = parse(contactInputSchema, raw);
  if (!(await ctx.repo.accounts.get(input.accountId))) throw new NotFoundError("Account", input.accountId);
  return ctx.repo.contacts.create({
    accountId: input.accountId,
    firstName: input.firstName,
    lastName: input.lastName,
    title: input.title ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
  });
}

export async function logActivity(ctx: ServiceContext, raw: unknown): Promise<Activity> {
  requirePermission(ctx, "activity:edit");
  const input = parse(activityInputSchema, raw);
  let accountId = input.accountId ?? null;
  if (input.opportunityId) {
    const opp = await ctx.repo.opportunities.get(input.opportunityId);
    if (!opp) throw new NotFoundError("Opportunity", input.opportunityId);
    accountId ??= opp.accountId;
  }
  if (!input.opportunityId && !accountId) {
    throw new ValidationError("Link the activity to an opportunity or account");
  }
  return ctx.repo.activities.create({
    type: input.type,
    subject: input.subject,
    notes: input.notes ?? null,
    occurredAt: input.occurredAt,
    dueAt: input.dueAt ?? null,
    completedAt: null,
    opportunityId: input.opportunityId ?? null,
    accountId,
    contactId: input.contactId ?? null,
    ownerId: ctx.user.id,
    source: "MANUAL",
    externalId: null,
  });
}

export async function completeActivity(ctx: ServiceContext, id: number): Promise<Activity> {
  requirePermission(ctx, "activity:edit");
  return ctx.repo.activities.complete(id, ctx.now());
}
