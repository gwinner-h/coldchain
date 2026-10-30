import type { AccountType, ActivityType } from "@/domain/types";

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  CALL: "Call",
  MEETING: "Meeting",
  EMAIL: "Email",
  SITE_VISIT: "Site visit",
  NOTE: "Note",
  FOLLOW_UP: "Follow-up",
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  OWNER: "Owner",
  GENERAL_CONTRACTOR: "General contractor",
  DEVELOPER: "Developer",
  ARCHITECT: "Architect",
  ENGINEER: "Engineer",
  SUBCONTRACTOR: "Subcontractor",
  OTHER: "Other",
};
