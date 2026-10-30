"use client";

import { useActionState, useState } from "react";
import { changeStageAction, type FormState } from "@/app/actions";
import { STAGES, getStage, type StageCode } from "@/domain/stages";
import { FormMessage } from "./field";

export function StageMover({ id, version, stage }: { id: number; version: number; stage: StageCode }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeStageAction, { ok: true });
  const [target, setTarget] = useState<StageCode>(stage);
  const needsReason = getStage(target).requiresClosedReason;

  return (
    <form action={action} className="space-y-3" key={version}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="version" value={version} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <label htmlFor="move-stage" className="mb-1 block text-sm font-medium">
            Move to stage
          </label>
          <select id="move-stage" name="stage" value={target} onChange={(e) => setTarget(e.target.value as StageCode)}>
            {STAGES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code}-{s.label}
              </option>
            ))}
          </select>
        </div>
        {needsReason && (
          <div className="min-w-56 flex-1">
            <label htmlFor="move-reason" className="mb-1 block text-sm font-medium">
              Why it closed
            </label>
            <input id="move-reason" name="closedReason" maxLength={200} required />
          </div>
        )}
        <button type="submit" className="btn btn-primary" disabled={pending || target === stage}>
          {pending ? "Moving…" : "Move"}
        </button>
      </div>
      <FormMessage ok={state.ok} message={state.message} />
    </form>
  );
}
