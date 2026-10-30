import "server-only";
import { getRuntime } from "../runtime";
import type { IntegrationContext } from "../context";
import { checkApiKey } from "./integration";

/** Authenticate an App Xchange call and build its context, or return the error response. */
export async function integrationRequest(request: Request): Promise<IntegrationContext | Response> {
  const denied = checkApiKey(request, process.env.INTEGRATION_API_KEY);
  if (denied) return denied;
  const { repo, config } = await getRuntime();
  return { repo, config, now: () => new Date() };
}
