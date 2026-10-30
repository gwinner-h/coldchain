import { connection } from "next/server";
import { getRuntime } from "@/server/runtime";


/** Liveness plus outbox health, for Azure monitoring and the App Xchange admin. */
export async function GET() {
  await connection();
  try {
    const { repo } = await getRuntime();
    const dead = await repo.outbox.list({ statuses: ["DEAD"], limit: 1000 });
    const waiting = await repo.outbox.list({ statuses: ["PENDING", "FAILED", "IN_PROGRESS"], limit: 1000 });
    return Response.json({ status: dead.length ? "degraded" : "ok", outbox: { waiting: waiting.length, needsAttention: dead.length } });
  } catch (err) {
    console.error("Health check failed", err);
    return Response.json({ status: "down" }, { status: 503 });
  }
}
