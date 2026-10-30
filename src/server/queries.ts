import "server-only";
import type { Repo } from "./repo/types";
import type { Opportunity } from "@/domain/types";
import type { OpportunityFormValues } from "@/components/opportunity-form";
import { dateInput } from "@/lib/format";
import { pipelineTotals, summarizeByStage, winRate } from "./services/reports";

export async function opportunityFormOptions(repo: Repo) {
  const [accounts, users, projectTypes, estimators, marketSectors] = await Promise.all([
    repo.accounts.list(),
    repo.users.list(),
    repo.lookups.list("PROJECT_TYPE"),
    repo.lookups.list("ESTIMATOR"),
    repo.lookups.list("MARKET_SECTOR"),
  ]);
  const opt = (l: { code: string; description: string }) => ({ value: l.code, label: l.description });
  return {
    accounts: accounts.map((a) => ({
      value: String(a.id),
      label: a.vistaCustomerNumber ? `${a.name} (Vista ${a.vistaCustomerNumber})` : a.name,
    })),
    owners: users
      .filter((u) => u.active && ["BD", "ESTIMATOR", "ADMIN"].includes(u.role))
      .map((u) => ({ value: String(u.id), label: u.name })),
    projectTypes: projectTypes.map(opt),
    estimators: estimators.map(opt),
    marketSectors: marketSectors.map(opt),
  };
}

export function toFormValues(o: Opportunity): OpportunityFormValues {
  return {
    id: o.id,
    version: o.version,
    name: o.name,
    accountId: String(o.accountId),
    stage: o.stage,
    estimatedValue: o.estimatedValue === null ? "" : String(o.estimatedValue),
    marketSector: o.marketSector ?? "",
    projectType: o.projectType ?? "",
    deliveryMethod: o.deliveryMethod ?? "",
    city: o.city ?? "",
    state: o.state ?? "",
    bidDueDate: dateInput(o.bidDueDate),
    expectedAwardDate: dateInput(o.expectedAwardDate),
    description: o.description ?? "",
    ownerId: String(o.ownerId),
    estimatorCode: o.estimatorCode ?? "",
    closedReason: o.closedReason ?? "",
  };
}

/** Everything the pipeline page shows. Win rate covers the 12 months before `now`. */
export async function pipelineDashboard(repo: Repo, now = new Date()) {
  const [opps, accounts, changes] = await Promise.all([
    repo.opportunities.list(),
    repo.accounts.list(),
    repo.stageChanges.listAll(),
  ]);
  const yearAgo = new Date(now.getTime() - 365 * 86_400_000);
  return {
    opps,
    accountName: new Map(accounts.map((a) => [a.id, a.name])),
    totals: pipelineTotals(opps),
    wins: winRate(changes, yearAgo),
    summary: summarizeByStage(opps),
  };
}
