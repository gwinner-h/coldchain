import type { User } from "@/domain/types";
import type { Repo } from "./repo/types";
import { can, type Permission } from "@/domain/permissions";
import { ForbiddenError } from "./errors";

export interface AppConfig {
  /** Vista JC company the CRM pushes to: 9 in production, 201 for testing. */
  vistaCompany: number;
}

/** Everything a service needs. Passing it explicitly keeps services pure and testable. */
export interface ServiceContext {
  repo: Repo;
  user: User;
  now: () => Date;
  config: AppConfig;
}

/** Context for App Xchange calls, which act as the integration, not a person. */
export interface IntegrationContext {
  repo: Repo;
  now: () => Date;
  config: AppConfig;
}

export function requirePermission(ctx: ServiceContext, permission: Permission): void {
  if (!can(ctx.user.role, permission)) throw new ForbiddenError();
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const company = Number(env.VISTA_COMPANY ?? "201");
  if (!Number.isInteger(company) || company <= 0) throw new Error("VISTA_COMPANY must be a positive integer");
  return { vistaCompany: company };
}
