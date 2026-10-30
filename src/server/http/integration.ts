/**
 * Handlers for the App Xchange integration API. Plain (Request, ctx) → Response
 * functions so they can be tested without Next.js; route files just call them.
 * Contract: docs/openapi.yaml.
 */
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { IntegrationContext } from "../context";
import { ValidationError } from "../errors";
import { ConcurrencyError, NotFoundError } from "../repo/types";
import { claimDue, reportFailure, reportSuccess } from "../services/outbox";
import { ingestCustomers, ingestJobs, ingestLookups } from "../services/vistaInbound";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const problem = (status: number, code: string, message: string, details?: unknown) =>
  json(status, { error: { code, message, ...(details ? { details } : {}) } });

/**
 * App Xchange's HTTP connector sends the API key configured on the connection.
 * Accept it as `x-api-key` or `Authorization: Bearer <key>`.
 */
export function checkApiKey(request: Request, expected: string | undefined): Response | null {
  if (!expected || expected.length < 32) {
    return problem(503, "INTEGRATION_DISABLED", "INTEGRATION_API_KEY is not configured (32+ characters)");
  }
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supplied = request.headers.get("x-api-key") ?? bearer ?? "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return problem(401, "UNAUTHORIZED", "Missing or invalid API key");
  }
  return null;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Request body must be JSON");
  }
}

async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ValidationError) return problem(400, "VALIDATION", err.message, err.fieldErrors);
    if (err instanceof NotFoundError) return problem(404, "NOT_FOUND", err.message);
    if (err instanceof ConcurrencyError) {
      return problem(409, "LOCK_LOST", "This message was reclaimed or already completed; discard this result");
    }
    console.error("Integration API error", err);
    return problem(500, "INTERNAL", "Unexpected error");
  }
}

const claimSchema = z.object({ limit: z.number().int().min(1).max(50).default(10) }).default({ limit: 10 });

export function postClaim(request: Request, ctx: IntegrationContext): Promise<Response> {
  return handle(async () => {
    const parsed = claimSchema.safeParse(await readJson(request).catch(() => ({})));
    if (!parsed.success) throw new ValidationError("limit must be 1-50");
    const messages = await claimDue(ctx, parsed.data.limit);
    return json(200, { messages });
  });
}

const resultSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    lockToken: z.string().min(1),
    potentialProject: z.string().trim().min(1).max(20),
    customerNumber: z.number().int().positive().optional(),
  }),
  z.object({
    success: z.literal(false),
    lockToken: z.string().min(1),
    error: z.object({
      code: z.string().trim().min(1).max(100),
      message: z.string().trim().min(1).max(2000),
      retryable: z.boolean(),
    }),
  }),
]);

export function postResult(request: Request, ctx: IntegrationContext, idParam: string): Promise<Response> {
  return handle(async () => {
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError("Invalid message id");
    const parsed = resultSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new ValidationError("Invalid result body", { body: parsed.error.issues.map((i) => i.message) });
    const body = parsed.data;
    if (body.success) {
      await reportSuccess(ctx, id, body.lockToken, {
        potentialProject: body.potentialProject,
        customerNumber: body.customerNumber,
      });
      return json(200, { status: "SUCCEEDED" });
    }
    const failed = await reportFailure(ctx, id, body.lockToken, body.error);
    return json(200, { status: failed.status, nextAttemptAt: failed.status === "FAILED" ? failed.nextAttemptAt : null });
  });
}

const batchSchema = z.object({ rows: z.array(z.unknown()).max(1000) });

export function postInbound(
  request: Request,
  ctx: IntegrationContext,
  kind: "customers" | "jobs" | "lookups",
): Promise<Response> {
  return handle(async () => {
    const parsed = batchSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new ValidationError("Body must be { rows: [...] } with at most 1000 rows");
    if (kind === "customers") return json(200, { received: await ingestCustomers(ctx, parsed.data.rows) });
    if (kind === "lookups") return json(200, { received: await ingestLookups(ctx, parsed.data.rows) });
    return json(200, await ingestJobs(ctx, parsed.data.rows));
  });
}
