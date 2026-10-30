"use server";

/**
 * Server actions for forms. Each one: build the service context for the signed-in
 * user, call one service, and turn known errors into form state. No business
 * rules live here.
 */
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServiceContext, DEV_USER_COOKIE, authMode } from "@/server/auth";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { ConcurrencyError, NotFoundError } from "@/server/repo/types";
import { changeStage, createOpportunity, updateOpportunity } from "@/server/services/opportunities";
import { createAccount, createContact, completeActivity, logActivity, updateAccount } from "@/server/services/crm";
import { replayMessage } from "@/server/services/outbox";
import { isStageCode } from "@/domain/stages";

export interface FormState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** Echo of the submitted values so the form keeps what the user typed. */
  values?: Record<string, string>;
}

function values(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

function toState(err: unknown, form?: FormData): FormState {
  const v = form ? values(form) : undefined;
  if (err instanceof ValidationError) return { ok: false, message: err.message, fieldErrors: err.fieldErrors, values: v };
  if (err instanceof ConcurrencyError || err instanceof ForbiddenError || err instanceof NotFoundError) {
    return { ok: false, message: err.message, values: v };
  }
  throw err;
}

export async function saveOpportunityAction(_prev: FormState, form: FormData): Promise<FormState> {
  const raw = values(form);
  let id: number;
  try {
    const ctx = await getServiceContext();
    const opp = raw.id
      ? await updateOpportunity(ctx, Number(raw.id), Number(raw.version), raw)
      : await createOpportunity(ctx, raw);
    id = opp.id;
  } catch (err) {
    return toState(err, form);
  }
  revalidatePath("/", "layout");
  redirect(`/opportunities/${id}`);
}

export async function changeStageAction(_prev: FormState, form: FormData): Promise<FormState> {
  const raw = values(form);
  if (!isStageCode(raw.stage)) return { ok: false, message: "Pick a stage" };
  try {
    const ctx = await getServiceContext();
    await changeStage(ctx, Number(raw.id), Number(raw.version), raw.stage, raw.closedReason || null);
  } catch (err) {
    return toState(err, form);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Stage updated" };
}

export async function saveAccountAction(_prev: FormState, form: FormData): Promise<FormState> {
  const raw = values(form);
  let id: number;
  try {
    const ctx = await getServiceContext();
    const input = { ...raw, vistaCustomerNumber: raw.vistaCustomerNumber || null };
    const account = raw.id ? await updateAccount(ctx, Number(raw.id), input) : await createAccount(ctx, input);
    id = account.id;
  } catch (err) {
    return toState(err, form);
  }
  revalidatePath("/", "layout");
  redirect(`/accounts/${id}`);
}

export async function addContactAction(_prev: FormState, form: FormData): Promise<FormState> {
  try {
    await createContact(await getServiceContext(), values(form));
  } catch (err) {
    return toState(err, form);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Contact added" };
}

export async function logActivityAction(_prev: FormState, form: FormData): Promise<FormState> {
  const raw = values(form);
  try {
    await logActivity(await getServiceContext(), {
      ...raw,
      opportunityId: raw.opportunityId || null,
      accountId: raw.accountId || null,
      dueAt: raw.dueAt || null,
    });
  } catch (err) {
    return toState(err, form);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Activity logged" };
}

export async function completeActivityAction(form: FormData): Promise<void> {
  await completeActivity(await getServiceContext(), Number(form.get("id")));
  revalidatePath("/", "layout");
}

export async function retryOutboxAction(form: FormData): Promise<void> {
  await replayMessage(await getServiceContext(), Number(form.get("id")));
  revalidatePath("/", "layout");
}

/** Development only: switch which seeded user you are. */
export async function switchUserAction(form: FormData): Promise<void> {
  if (authMode() !== "dev") throw new ForbiddenError("User switching is only available in development");
  (await cookies()).set(DEV_USER_COOKIE, String(form.get("email")), { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}
