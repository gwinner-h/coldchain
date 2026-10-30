/** Pipeline reporting. Same numbers feed the dashboard and (via SQL) Power BI. */
import { STAGES, isClosed, isWon, type StageCode } from "@/domain/stages";
import type { Opportunity, StageChange } from "@/domain/types";

export interface StageSummary {
  code: StageCode;
  label: string;
  count: number;
  totalValue: number;
}

export function summarizeByStage(opps: Opportunity[]): StageSummary[] {
  return STAGES.map((s) => {
    const inStage = opps.filter((o) => o.stage === s.code);
    return {
      code: s.code,
      label: s.label,
      count: inStage.length,
      totalValue: inStage.reduce((sum, o) => sum + (o.estimatedValue ?? 0), 0),
    };
  });
}

export interface PipelineTotals {
  openCount: number;
  openValue: number;
  /** Open opportunities at 06-08: priced work waiting on the client. */
  proposalValue: number;
  wonValue: number;
}

export function pipelineTotals(opps: Opportunity[]): PipelineTotals {
  const open = opps.filter((o) => !isClosed(o.stage) && !isWon(o.stage));
  return {
    openCount: open.length,
    openValue: open.reduce((s, o) => s + (o.estimatedValue ?? 0), 0),
    proposalValue: open
      .filter((o) => ["06", "07", "08"].includes(o.stage))
      .reduce((s, o) => s + (o.estimatedValue ?? 0), 0),
    wonValue: opps.filter((o) => isWon(o.stage)).reduce((s, o) => s + (o.estimatedValue ?? 0), 0),
  };
}

/**
 * Win rate over a window: opportunities that reached 09/09A versus those that
 * reached 10-Lose, counted on the date of that stage change. Cancelled (11) and
 * did-not-pursue (12) are excluded because no bid was decided.
 */
export function winRate(changes: StageChange[], since: Date): { won: number; lost: number; rate: number | null } {
  const lastOutcome = new Map<number, "won" | "lost">();
  for (const c of [...changes].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime())) {
    if (c.changedAt < since) continue;
    if (c.toStage === "09" || c.toStage === "09A") lastOutcome.set(c.opportunityId, "won");
    else if (c.toStage === "10") lastOutcome.set(c.opportunityId, "lost");
  }
  const won = [...lastOutcome.values()].filter((v) => v === "won").length;
  const lost = lastOutcome.size - won;
  return { won, lost, rate: won + lost === 0 ? null : won / (won + lost) };
}
