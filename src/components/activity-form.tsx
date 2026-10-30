"use client";

import { useActionState } from "react";
import { logActivityAction, type FormState } from "@/app/actions";
import { ACTIVITY_TYPES } from "@/domain/types";
import { FormMessage } from "./field";
import { ACTIVITY_LABELS } from "@/lib/labels";


export function ActivityForm({ opportunityId, accountId }: { opportunityId?: number; accountId?: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(logActivityAction, { ok: true });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="space-y-3">
      {opportunityId && <input type="hidden" name="opportunityId" value={opportunityId} />}
      {accountId && <input type="hidden" name="accountId" value={accountId} />}
      <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
        <div>
          <label htmlFor="activity-type" className="mb-1 block text-sm font-medium">
            Type
          </label>
          <select id="activity-type" name="type" defaultValue="CALL">
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="activity-subject" className="mb-1 block text-sm font-medium">
            What happened
          </label>
          <input id="activity-subject" name="subject" maxLength={200} required />
        </div>
        <div>
          <label htmlFor="activity-date" className="mb-1 block text-sm font-medium">
            Date
          </label>
          <input id="activity-date" name="occurredAt" type="date" defaultValue={today} />
        </div>
        <div>
          <label htmlFor="activity-due" className="mb-1 block text-sm font-medium">
            Follow up by <span className="font-normal text-muted">(optional)</span>
          </label>
          <input id="activity-due" name="dueAt" type="date" />
        </div>
      </div>
      <div>
        <label htmlFor="activity-notes" className="mb-1 block text-sm font-medium">
          Notes <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea id="activity-notes" name="notes" rows={2} maxLength={4000} />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Logging…" : "Log activity"}
        </button>
      </div>
      <FormMessage ok={state.ok} message={state.message} />
    </form>
  );
}

