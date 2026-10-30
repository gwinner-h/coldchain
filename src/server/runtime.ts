/**
 * Process-wide singletons: which repository to use and the app config.
 *
 *   DATA_BACKEND=memory     in-memory store seeded with demo data (default when no DATABASE_URL)
 *   DATA_BACKEND=sqlserver  Azure SQL / SQL Server via DATABASE_URL
 *
 * The memory backend is refused in production unless ALLOW_DEMO_DATA=true.
 */
import "server-only";
import { connection } from "next/server";
import { createMemoryRepo } from "./repo/memory";
import { createPrismaRepo } from "./repo/prisma";
import type { Repo } from "./repo/types";
import { loadConfig, type AppConfig } from "./context";
import { seed } from "./seed";

type Runtime = { repo: Repo; config: AppConfig; ready: Promise<void> };

const globalForRuntime = globalThis as unknown as { __crmRuntime?: Runtime };

function createRuntime(): Runtime {
  const config = loadConfig();
  const backend = process.env.DATA_BACKEND ?? (process.env.DATABASE_URL ? "sqlserver" : "memory");

  if (backend === "sqlserver") {
    return { repo: createPrismaRepo(), config, ready: Promise.resolve() };
  }
  if (backend !== "memory") throw new Error(`Unknown DATA_BACKEND "${backend}"`);
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_DATA !== "true") {
    throw new Error("The in-memory demo backend is not allowed in production. Set DATABASE_URL.");
  }
  const repo = createMemoryRepo();
  const ready = seed(repo, config).then(() => undefined);
  return { repo, config, ready };
}

/** Survives Next.js hot reloads in development so demo data isn't reseeded on every edit. */
export async function getRuntime(): Promise<{ repo: Repo; config: AppConfig }> {
  // CRM data is always live: never prerender anything that reads it.
  await connection();
  globalForRuntime.__crmRuntime ??= createRuntime();
  await globalForRuntime.__crmRuntime.ready;
  return globalForRuntime.__crmRuntime;
}
