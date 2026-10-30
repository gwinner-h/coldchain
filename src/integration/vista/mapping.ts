/**
 * THE Vista field map. Every CRM -> Vista field translation lives in this file.
 *
 * The App Xchange flow passes this payload straight to the Vista connector's
 * Pre-Construction > Potential Projects Add / Change action, so the flow does
 * no mapping of its own (Unanet's sync errors were mostly field mapping).
 *
 * ASSUMPTIONS to verify against the connector's action schema
 * (https://app.xchange.trimble.com/connectors/vista/details):
 *   - property names below (modelled on Vista column names)
 *   - PotentialProject code format, within Vista's 20 characters
 *   - status values (VISTA_STATUS)
 *   - ud_CRMId: a user-defined field on the potential project holding the CRM id
 * When the schema is confirmed, change this file and its tests only.
 */
import type { StageCode } from "@/domain/stages";
import type { Account, Opportunity } from "@/domain/types";

/** ASSUMPTION: Vista potential project status values. Stages 00-05 never reach Vista. */
const VISTA_STATUS: Partial<Record<StageCode, string>> = {
  "06": "Budget",
  "07": "Proposal",
  "08": "Pending",
  "09": "Awarded",
  "09A": "Awarded",
  "10": "Lost",
  "11": "Cancelled",
  "12": "Inactive",
};

export function toVistaStatus(stage: StageCode): string {
  const status = VISTA_STATUS[stage];
  if (!status) throw new Error(`Stage ${stage} is never sent to Vista`);
  return status;
}

/** CRM opportunity 42 -> "CRM000042". Stable, so a retry never creates a duplicate. */
export function potentialProjectCode(opportunityId: number): string {
  const code = `CRM${String(opportunityId).padStart(6, "0")}`;
  if (code.length > 20) throw new Error(`Potential project code too long for Vista: ${code}`);
  return code;
}

export type VistaCustomerRef =
  | { mode: "existing"; Customer: number }
  | { mode: "create"; Name: string; Address: string; City: string; State: string; Zip: string; Phone: string | null };

export interface VistaPotentialProjectPayload {
  JCCo: number;
  PotentialProject: string;
  Description: string;
  Status: string;
  ProjectType: string | null;
  City: string | null;
  State: string | null;
  EstimatedValue: number | null;
  BidDueDate: string | null;
  Estimator: string | null;
  Notes: string | null;
  /** Existing AR customer, or the data the flow uses to create one first. */
  customer: VistaCustomerRef;
  ud_CRMId: number;
}

function isoDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function buildPotentialProjectPayload(
  opp: Opportunity,
  account: Account,
  company: number,
): VistaPotentialProjectPayload {
  const customer: VistaCustomerRef =
    account.vistaCustomerNumber !== null
      ? { mode: "existing", Customer: account.vistaCustomerNumber }
      : {
          mode: "create",
          Name: account.name.slice(0, 60),
          Address: account.street ?? "",
          City: account.city ?? "",
          State: account.state ?? "",
          Zip: account.zip ?? "",
          Phone: account.phone,
        };

  return {
    JCCo: company,
    PotentialProject: potentialProjectCode(opp.id),
    Description: opp.name.slice(0, 60),
    Status: toVistaStatus(opp.stage),
    ProjectType: opp.projectType,
    City: opp.city,
    State: opp.state,
    EstimatedValue: opp.estimatedValue,
    BidDueDate: isoDate(opp.bidDueDate),
    Estimator: opp.estimatorCode,
    Notes: opp.closedReason ? `Closed: ${opp.closedReason}` : opp.description,
    customer,
    ud_CRMId: opp.id,
  };
}
