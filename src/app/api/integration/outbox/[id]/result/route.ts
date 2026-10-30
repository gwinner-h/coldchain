import { integrationRequest } from "@/server/http/route-helpers";
import { postResult } from "@/server/http/integration";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await integrationRequest(request);
  return ctx instanceof Response ? ctx : postResult(request, ctx, (await params).id);
}
