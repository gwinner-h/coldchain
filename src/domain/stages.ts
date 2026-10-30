/**
 * Pipeline stages, in order. Codes match the company's existing stage names.
 * Stage rules live here and nowhere else: UI, services and reports import them.
 */

export type StageGroup = "open" | "won" | "closed";

export interface StageDef {
  code: string;
  label: string;
  group: StageGroup;
  /** Reaching this stage requires the opportunity to exist in Vista. */
  requiresVista: boolean;
  /** Moving into this stage requires a closed reason. */
  requiresClosedReason: boolean;
}

export const STAGES = [
  { code: "00", label: "Lead", group: "open", requiresVista: false, requiresClosedReason: false },
  { code: "01", label: "Heard About", group: "open", requiresVista: false, requiresClosedReason: false },
  { code: "02", label: "Confirmed Lead", group: "open", requiresVista: false, requiresClosedReason: false },
  { code: "03", label: "Qualification", group: "open", requiresVista: false, requiresClosedReason: false },
  { code: "04", label: "RFQ 90 Day Out", group: "open", requiresVista: false, requiresClosedReason: false },
  { code: "05", label: "Go/No-Go", group: "open", requiresVista: false, requiresClosedReason: false },
  { code: "06", label: "Budget", group: "open", requiresVista: true, requiresClosedReason: false },
  { code: "07", label: "Proposal", group: "open", requiresVista: true, requiresClosedReason: false },
  { code: "08", label: "Pending Client Decision", group: "open", requiresVista: true, requiresClosedReason: false },
  { code: "09", label: "Win", group: "won", requiresVista: true, requiresClosedReason: false },
  { code: "09A", label: "PO Pending", group: "won", requiresVista: true, requiresClosedReason: false },
  { code: "10", label: "Lose", group: "closed", requiresVista: false, requiresClosedReason: true },
  { code: "11", label: "Cancel", group: "closed", requiresVista: false, requiresClosedReason: true },
  { code: "12", label: "Inactive/Did Not Pursue", group: "closed", requiresVista: false, requiresClosedReason: true },
] as const satisfies readonly StageDef[];

export type StageCode = (typeof STAGES)[number]["code"];

export const STAGE_CODES: readonly StageCode[] = STAGES.map((s) => s.code);

/** The first stage at which an opportunity is pushed to Vista. */
export const VISTA_PUSH_STAGE: StageCode = "06";

export function isStageCode(value: unknown): value is StageCode {
  return typeof value === "string" && (STAGE_CODES as readonly string[]).includes(value);
}

export function getStage(code: StageCode): StageDef {
  const stage = STAGES.find((s) => s.code === code);
  if (!stage) throw new Error(`Unknown stage: ${code}`);
  return stage;
}

export function stageIndex(code: StageCode): number {
  return STAGE_CODES.indexOf(code);
}

export function stageLabel(code: StageCode): string {
  const stage = getStage(code);
  return `${stage.code}-${stage.label}`;
}

/** True for stages 06 through 09A: an opportunity here must be in Vista. */
export function requiresVista(code: StageCode): boolean {
  return getStage(code).requiresVista;
}

export function isClosed(code: StageCode): boolean {
  return getStage(code).group === "closed";
}

export function isWon(code: StageCode): boolean {
  return getStage(code).group === "won";
}

export function isOpen(code: StageCode): boolean {
  return getStage(code).group === "open";
}
