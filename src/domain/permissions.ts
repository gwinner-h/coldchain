import type { Role } from "./types";

export type Permission =
  | "opportunity:edit"
  | "account:edit"
  | "activity:edit"
  | "integration:replay"
  | "integration:view";

const GRANTS: Record<Role, readonly Permission[]> = {
  BD: ["opportunity:edit", "account:edit", "activity:edit", "integration:view"],
  ESTIMATOR: ["opportunity:edit", "account:edit", "activity:edit", "integration:view"],
  PM: ["activity:edit"],
  ADMIN: ["opportunity:edit", "account:edit", "activity:edit", "integration:replay", "integration:view"],
  EXECUTIVE: ["integration:view"],
};

export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}
