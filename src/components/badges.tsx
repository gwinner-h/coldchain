import { getStage, type StageCode } from "@/domain/stages";
import type { OutboxStatus, VistaSyncStatus } from "@/domain/types";

const SYNC: Record<VistaSyncStatus, { label: string; dot: string; text: string }> = {
  NOT_REQUIRED: { label: "Not in Vista yet", dot: "bg-line-strong", text: "text-muted" },
  PENDING: { label: "Sending to Vista", dot: "bg-accent", text: "text-accent-strong" },
  SYNCED: { label: "In Vista", dot: "bg-ok", text: "text-ok" },
  ERROR: { label: "Vista rejected it", dot: "bg-danger", text: "text-danger" },
};

export function SyncBadge({ status, compact = false }: { status: VistaSyncStatus; compact?: boolean }) {
  const s = SYNC[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${s.text}`}>
      <span aria-hidden className={`size-2 rounded-full ${s.dot}`} />
      {compact ? <span className="sr-only">{s.label}</span> : s.label}
    </span>
  );
}

export function StageBadge({ code }: { code: StageCode }) {
  const s = getStage(code);
  const tone =
    s.group === "won"
      ? "bg-ok-soft text-ok"
      : s.group === "closed"
        ? "bg-sunken text-muted"
        : s.requiresVista
          ? "bg-accent-soft text-accent-strong"
          : "bg-sunken text-ink";
  return (
    <span className={`inline-flex items-baseline gap-1 rounded-[4px] px-1.5 py-0.5 text-sm whitespace-nowrap ${tone}`}>
      <span className="figures font-semibold">{s.code}</span>
      {s.label}
    </span>
  );
}

const OUTBOX: Record<OutboxStatus, { label: string; cls: string }> = {
  PENDING: { label: "Waiting", cls: "bg-accent-soft text-accent-strong" },
  IN_PROGRESS: { label: "Sending", cls: "bg-accent-soft text-accent-strong" },
  SUCCEEDED: { label: "Delivered", cls: "bg-ok-soft text-ok" },
  FAILED: { label: "Retrying", cls: "bg-warn-soft text-warn" },
  DEAD: { label: "Needs attention", cls: "bg-danger-soft text-danger" },
};

export function OutboxBadge({ status }: { status: OutboxStatus }) {
  const s = OUTBOX[status];
  return <span className={`rounded-[4px] px-1.5 py-0.5 text-sm whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}
