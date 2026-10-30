import { integrationRequest } from "@/server/http/route-helpers";
import { postClaim } from "@/server/http/integration";

export async function POST(request: Request) {
  const ctx = await integrationRequest(request);
  return ctx instanceof Response ? ctx : postClaim(request, ctx);
}
