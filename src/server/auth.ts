/**
 * Who is signed in.
 *
 * AUTH_MODE=dev (default outside production): a "Sign in as" switcher picks a
 * seeded user, stored in a cookie. For local development and demos only.
 *
 * AUTH_MODE=entra (ASSUMPTION: hosted on Azure App Service with Authentication
 * turned on): production single sign-on with Microsoft Entra ID. Azure App
 * Service Authentication ("Easy Auth") signs the user in before the request
 * reaches the app and forwards their identity in the X-MS-CLIENT-PRINCIPAL-NAME
 * header. The app then maps that email to a CRM user and role. Azure strips this
 * header from outside requests, so it can't be spoofed when Easy Auth is enabled.
 */
import "server-only";
import { cookies, headers } from "next/headers";
import type { User } from "@/domain/types";
import { ForbiddenError } from "./errors";
import { getRuntime } from "./runtime";
import type { ServiceContext } from "./context";

export const DEV_USER_COOKIE = "crm_dev_user";

export function authMode(): "dev" | "entra" {
  const demo = process.env.ALLOW_DEMO_DATA === "true";
  const mode = process.env.AUTH_MODE ?? (process.env.NODE_ENV === "production" && !demo ? "entra" : "dev");
  if (mode !== "dev" && mode !== "entra") throw new Error(`Unknown AUTH_MODE "${mode}"`);
  if (mode === "dev" && process.env.NODE_ENV === "production" && !demo) {
    throw new Error("AUTH_MODE=dev is not allowed in production");
  }
  return mode;
}

export async function getCurrentUser(): Promise<User> {
  const { repo } = await getRuntime();
  let user: User | null = null;

  if (authMode() === "entra") {
    const email = (await headers()).get("x-ms-client-principal-name");
    if (!email) throw new ForbiddenError("Not signed in");
    user = await repo.users.getByEmail(email);
    if (!user) throw new ForbiddenError(`${email} has no CRM access. Ask an admin to add you.`);
  } else {
    const email = (await cookies()).get(DEV_USER_COOKIE)?.value ?? "bd1@example.com";
    user = (await repo.users.getByEmail(email)) ?? (await repo.users.list())[0] ?? null;
    if (!user) throw new ForbiddenError("No users exist yet. Run the seed.");
  }

  if (!user.active) throw new ForbiddenError("Your CRM access is disabled");
  return user;
}

export async function getServiceContext(): Promise<ServiceContext> {
  const { repo, config } = await getRuntime();
  return { repo, config, user: await getCurrentUser(), now: () => new Date() };
}
