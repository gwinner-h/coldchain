/**
 * Data flowing from Vista into the CRM (App Xchange cache events → CRM API).
 * Everything here is read-only reference data: customers, jobs and pick lists.
 */
import { z } from "zod";
import { LOOKUP_KINDS, type VistaCustomer, type VistaJob } from "@/domain/types";
import type { IntegrationContext } from "../context";
import { fieldErrorsFromZod, ValidationError } from "../errors";

/** Only jobs that started in 2020 or later are kept. Jobs with no start date are kept. */
export const JOB_HISTORY_START = new Date(Date.UTC(2020, 0, 1));

const customerSchema = z.object({
  customerNumber: z.number().int().positive(),
  name: z.string().trim().min(1).max(60),
  city: z.string().trim().max(30).nullable().optional(),
  state: z.string().trim().max(4).nullable().optional(),
  active: z.boolean().default(true),
});

const jobSchema = z.object({
  company: z.number().int().positive(),
  job: z.string().trim().min(1).max(10),
  description: z.string().trim().max(60).default(""),
  customerNumber: z.number().int().positive().nullable().optional(),
  status: z.string().trim().max(20),
  contractAmount: z.number().nullable().optional(),
  billedToDate: z.number().nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  potentialProject: z.string().trim().max(20).nullable().optional(),
});

const lookupSchema = z.object({
  kind: z.enum(LOOKUP_KINDS),
  code: z.string().trim().min(1).max(20),
  description: z.string().trim().min(1).max(60),
  active: z.boolean().default(true),
});

function parseBatch<T extends z.ZodTypeAny>(schema: T, rows: unknown, max = 1000): z.infer<T>[] {
  const parsed = z.array(schema).max(max).safeParse(rows);
  if (!parsed.success) {
    throw new ValidationError("Invalid batch", fieldErrorsFromZod(parsed.error.issues));
  }
  return parsed.data;
}

export async function ingestCustomers(ctx: IntegrationContext, rows: unknown): Promise<number> {
  const now = ctx.now();
  const data: VistaCustomer[] = parseBatch(customerSchema, rows).map((r) => ({
    customerNumber: r.customerNumber,
    name: r.name,
    city: r.city ?? null,
    state: r.state ?? null,
    active: r.active,
    syncedAt: now,
  }));
  const count = await ctx.repo.vista.upsertCustomers(data);
  await ctx.repo.events.add({
    direction: "INBOUND",
    kind: "VISTA_CUSTOMERS",
    status: "SUCCESS",
    message: `Received ${count} customer(s) from Vista`,
    outboxId: null,
    opportunityId: null,
  });
  return count;
}

export async function ingestJobs(ctx: IntegrationContext, rows: unknown): Promise<{ kept: number; skipped: number }> {
  const now = ctx.now();
  const parsed = parseBatch(jobSchema, rows);
  const kept: VistaJob[] = parsed
    .filter((r) => !r.startDate || r.startDate >= JOB_HISTORY_START)
    .map((r) => ({
      company: r.company,
      job: r.job,
      description: r.description,
      customerNumber: r.customerNumber ?? null,
      status: r.status,
      contractAmount: r.contractAmount ?? null,
      billedToDate: r.billedToDate ?? null,
      startDate: r.startDate ?? null,
      potentialProject: r.potentialProject ?? null,
      syncedAt: now,
    }));
  await ctx.repo.vista.upsertJobs(kept);
  const skipped = parsed.length - kept.length;
  await ctx.repo.events.add({
    direction: "INBOUND",
    kind: "VISTA_JOBS",
    status: "SUCCESS",
    message: `Received ${kept.length} job(s) from Vista${skipped ? `, skipped ${skipped} started before 2020` : ""}`,
    outboxId: null,
    opportunityId: null,
  });
  return { kept: kept.length, skipped };
}

export async function ingestLookups(ctx: IntegrationContext, rows: unknown): Promise<number> {
  const count = await ctx.repo.lookups.upsert(parseBatch(lookupSchema, rows));
  await ctx.repo.events.add({
    direction: "INBOUND",
    kind: "VISTA_LOOKUPS",
    status: "SUCCESS",
    message: `Received ${count} pick-list value(s) from Vista`,
    outboxId: null,
    opportunityId: null,
  });
  return count;
}
