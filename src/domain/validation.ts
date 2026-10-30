/**
 * Input validation (zod) and the Vista readiness check.
 *
 * Unanet's Vista sync failed mostly on field mapping, so nothing reaches Vista
 * unless the readiness check passes. Codes (project type, estimator, customer)
 * are picked in the UI from lists synced from Vista, never typed.
 */
import { z } from "zod";
import { isClosed, isStageCode, type StageCode } from "./stages";
import { ACCOUNT_TYPES, ACTIVITY_TYPES, type Account, type Opportunity } from "./types";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this to ${max} characters`)
    .nullish()
    .transform((v) => (v === undefined || v === null || v === "" ? null : v));

const optionalDate = z
  .union([z.date(), z.string()])
  .nullish()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const d = v instanceof Date ? v : new Date(`${v.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date" });
      return z.NEVER;
    }
    return d;
  });

const optionalMoney = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Enter a dollar amount of 0 or more" });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

const optionalId = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.coerce.number().int().positive().nullable(),
);

/** 2-letter US state, upper-cased. ASSUMPTION: Vista stores state as 2 characters. */
const stateCode = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v.toUpperCase() : null))
  .refine((v) => v === null || /^[A-Z]{2}$/.test(v), "Use a 2-letter state code");

export const opportunityInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60, "Keep the name to 60 characters (Vista limit)"),
  accountId: z.coerce.number().int().positive("Pick an account"),
  stage: z
    .string()
    .refine(isStageCode, "Unknown stage")
    .transform((v) => v as StageCode),
  estimatedValue: optionalMoney,
  marketSector: optionalText(20),
  projectType: optionalText(20),
  deliveryMethod: optionalText(40),
  city: optionalText(30),
  state: stateCode,
  bidDueDate: optionalDate,
  expectedAwardDate: optionalDate,
  description: optionalText(2000),
  ownerId: z.coerce.number().int().positive("Pick an owner"),
  estimatorCode: optionalText(20),
  closedReason: optionalText(500),
});
export type OpportunityInput = z.output<typeof opportunityInputSchema>;

export const accountInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  type: z.enum(ACCOUNT_TYPES),
  phone: optionalText(20),
  website: optionalText(200),
  street: optionalText(60),
  city: optionalText(30),
  state: stateCode,
  zip: optionalText(12),
  vistaCustomerNumber: optionalId,
});
export type AccountInput = z.output<typeof accountInputSchema>;

export const contactInputSchema = z.object({
  accountId: z.coerce.number().int().positive(),
  firstName: z.string().trim().min(1, "First name is required").max(40),
  lastName: z.string().trim().min(1, "Last name is required").max(40),
  title: optionalText(60),
  email: optionalText(120).refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email"),
  phone: optionalText(20),
});
export type ContactInput = z.output<typeof contactInputSchema>;

export const activityInputSchema = z.object({
  type: z.enum(ACTIVITY_TYPES),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  notes: optionalText(4000),
  occurredAt: optionalDate.transform((d) => d ?? new Date()),
  dueAt: optionalDate,
  opportunityId: optionalId,
  accountId: optionalId,
  contactId: optionalId,
});
export type ActivityInput = z.output<typeof activityInputSchema>;

export type ReadinessField =
  | "name"
  | "estimatedValue"
  | "projectType"
  | "city"
  | "state"
  | "bidDueDate"
  | "estimatorCode"
  | "customer";

export interface Readiness {
  ready: boolean;
  missing: ReadinessField[];
}

const FIELD_LABELS: Record<ReadinessField, string> = {
  name: "Name",
  estimatedValue: "Estimated value",
  projectType: "Project type",
  city: "City",
  state: "State",
  bidDueDate: "Bid due date",
  estimatorCode: "Estimator",
  customer: "Customer address (or link the account to a Vista customer)",
};

/**
 * Fields Vista needs before a potential project can be created or updated.
 * ASSUMPTION: confirm against the connector's Potential Projects Add schema
 * and change the list here (and only here).
 */
export function checkVistaReadiness(
  opp: Pick<Opportunity, "name" | "estimatedValue" | "projectType" | "city" | "state" | "bidDueDate" | "estimatorCode">,
  account: Pick<Account, "vistaCustomerNumber" | "street" | "city" | "state" | "zip">,
): Readiness {
  const missing: ReadinessField[] = [];
  if (!opp.name) missing.push("name");
  if (opp.estimatedValue === null) missing.push("estimatedValue");
  if (!opp.projectType) missing.push("projectType");
  if (!opp.city) missing.push("city");
  if (!opp.state) missing.push("state");
  if (!opp.bidDueDate) missing.push("bidDueDate");
  if (!opp.estimatorCode) missing.push("estimatorCode");
  const canCreateCustomer = Boolean(account.street && account.city && account.state && account.zip);
  if (account.vistaCustomerNumber === null && !canCreateCustomer) missing.push("customer");
  return { ready: missing.length === 0, missing };
}

export function describeMissing(missing: ReadinessField[]): string {
  return missing.map((f) => FIELD_LABELS[f]).join(", ");
}

/** Stage rules that don't depend on Vista. Returns a message, or null when fine. */
export function checkStageRequirements(stage: StageCode, closedReason: string | null): string | null {
  if (isClosed(stage) && !closedReason) {
    return "Add a closed reason when moving to Lose, Cancel or Inactive";
  }
  return null;
}
