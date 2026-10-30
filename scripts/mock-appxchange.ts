/**
 * Stand-in for the App Xchange flow, for local development and demos.
 * Claims outbox messages from a running CRM and "delivers" them to a fake Vista.
 *
 *   npm run mock:appxchange               # every message succeeds
 *   npm run mock:appxchange -- --fail     # Vista rejects every message (non-retryable)
 *   npm run mock:appxchange -- --flaky    # timeouts, retried with backoff
 *   npm run mock:appxchange -- --watch    # keep polling every 10 seconds
 *
 * Env: CRM_URL (default http://localhost:3000), INTEGRATION_API_KEY.
 */
import "dotenv/config";

const base = process.env.CRM_URL ?? "http://localhost:3000";
const key = process.env.INTEGRATION_API_KEY ?? "";
const args = new Set(process.argv.slice(2));
const mode = args.has("--fail") ? "fail" : args.has("--flaky") ? "flaky" : "ok";
let nextCustomer = 9000;

interface Claimed {
  id: number;
  lockToken: string;
  operation: string;
  opportunityId: number;
  attempt: number;
  payload: { PotentialProject: string; customer?: { mode: string } };
}

async function call(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function runOnce(): Promise<number> {
  const { messages } = (await call("/api/integration/outbox/claim", { limit: 10 })) as { messages: Claimed[] };
  for (const m of messages) {
    let result: unknown;
    if (mode === "fail") {
      result = {
        success: false,
        lockToken: m.lockToken,
        error: { code: "VISTA_VALIDATION", message: "Mock Vista: ProjectType is not valid for JCCo", retryable: false },
      };
    } else if (mode === "flaky") {
      result = {
        success: false,
        lockToken: m.lockToken,
        error: { code: "TIMEOUT", message: "Mock Vista: request timed out", retryable: true },
      };
    } else {
      result = {
        success: true,
        lockToken: m.lockToken,
        potentialProject: m.payload.PotentialProject,
        ...(m.payload.customer?.mode === "create" ? { customerNumber: nextCustomer++ } : {}),
      };
    }
    const outcome = await call(`/api/integration/outbox/${m.id}/result`, result);
    console.log(`#${m.id} ${m.operation} opp ${m.opportunityId} attempt ${m.attempt} ->`, JSON.stringify(outcome));
  }
  return messages.length;
}

async function main() {
  if (key.length < 32) throw new Error("Set INTEGRATION_API_KEY (32+ characters), the same value the CRM uses");
  do {
    const n = await runOnce();
    if (n === 0) console.log(`${new Date().toLocaleTimeString()} nothing due`);
    if (args.has("--watch")) await new Promise((r) => setTimeout(r, 10_000));
  } while (args.has("--watch"));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
