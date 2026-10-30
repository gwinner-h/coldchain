"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveOpportunityAction, type FormState } from "@/app/actions";
import { STAGES, getStage, type StageCode } from "@/domain/stages";
import { Field, FormMessage } from "./field";

export interface OpportunityFormValues {
  id?: number;
  version?: number;
  name: string;
  accountId: string;
  stage: StageCode;
  estimatedValue: string;
  marketSector: string;
  projectType: string;
  deliveryMethod: string;
  city: string;
  state: string;
  bidDueDate: string;
  expectedAwardDate: string;
  description: string;
  ownerId: string;
  estimatorCode: string;
  closedReason: string;
}

type Option = { value: string; label: string };

export function OpportunityForm({
  initial,
  accounts,
  owners,
  projectTypes,
  estimators,
  marketSectors,
  alreadyInVista,
}: {
  initial: OpportunityFormValues;
  accounts: Option[];
  owners: Option[];
  projectTypes: Option[];
  estimators: Option[];
  marketSectors: Option[];
  alreadyInVista: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveOpportunityAction, { ok: true });
  const v = { ...initial, ...(state.values as Partial<OpportunityFormValues> | undefined) };
  const [stage, setStage] = useState<StageCode>(v.stage);
  const vista = alreadyInVista || getStage(stage).requiresVista;
  const closed = getStage(stage).requiresClosedReason;
  const err = (f: string) => state.fieldErrors?.[f];
  const invalid = (f: string) => (err(f) ? true : undefined);

  const select = (name: keyof OpportunityFormValues, options: Option[], placeholder: string) => (
    <select id={name} name={name} defaultValue={v[name] as string} aria-invalid={invalid(name)}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <form action={action} className="space-y-6" noValidate>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {initial.version && <input type="hidden" name="version" value={initial.version} />}
      <FormMessage ok={state.ok} message={state.ok ? undefined : state.message} />

      {vista && (
        <p className="rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent-strong">
          {alreadyInVista
            ? "This opportunity is in Vista. Saving sends your changes there."
            : `Saving at stage ${stage} sends this opportunity to Vista as a potential project, so the fields marked for Vista must be filled in.`}
        </p>
      )}

      <fieldset className="panel grid gap-4 p-5 md:grid-cols-2">
        <legend className="sr-only">The project</legend>
        <Field name="name" label="Project name" errors={err("name")} vista={vista} className="md:col-span-2">
          <input id="name" name="name" defaultValue={v.name} maxLength={60} required aria-invalid={invalid("name")} />
        </Field>
        <Field
          name="accountId"
          label="Account"
          errors={err("accountId")}
          vista={vista}
          hint="New to Vista? The account needs a full street address so Vista can create the customer."
        >
          {select("accountId", accounts, "Pick an account")}
        </Field>
        <Field name="stage" label="Stage" errors={err("stage")}>
          <select id="stage" name="stage" value={stage} onChange={(e) => setStage(e.target.value as StageCode)}>
            {STAGES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code}-{s.label}
              </option>
            ))}
          </select>
        </Field>
        {closed && (
          <Field name="closedReason" label="Why it closed" errors={err("closedReason")} className="md:col-span-2">
            <input id="closedReason" name="closedReason" defaultValue={v.closedReason} maxLength={200} aria-invalid={invalid("closedReason")} />
          </Field>
        )}
        <Field name="estimatedValue" label="Estimated value" errors={err("estimatedValue")} vista={vista}>
          <input id="estimatedValue" name="estimatedValue" inputMode="decimal" defaultValue={v.estimatedValue} placeholder="$" aria-invalid={invalid("estimatedValue")} />
        </Field>
        <Field name="projectType" label="Project type" errors={err("projectType")} vista={vista} hint="From Vista's project types">
          {select("projectType", projectTypes, "Pick a type")}
        </Field>
        <Field name="city" label="City" errors={err("city")} vista={vista}>
          <input id="city" name="city" defaultValue={v.city} maxLength={30} aria-invalid={invalid("city")} />
        </Field>
        <Field name="state" label="State" errors={err("state")} vista={vista}>
          <input id="state" name="state" defaultValue={v.state} maxLength={2} autoCapitalize="characters" className="uppercase" aria-invalid={invalid("state")} />
        </Field>
        <Field name="bidDueDate" label="Bid due" errors={err("bidDueDate")} vista={vista}>
          <input id="bidDueDate" name="bidDueDate" type="date" defaultValue={v.bidDueDate} aria-invalid={invalid("bidDueDate")} />
        </Field>
        <Field name="estimatorCode" label="Estimator" errors={err("estimatorCode")} vista={vista} hint="From Vista's estimator list">
          {select("estimatorCode", estimators, "Pick an estimator")}
        </Field>
      </fieldset>

      <fieldset className="panel grid gap-4 p-5 md:grid-cols-2">
        <legend className="sr-only">Pursuit details</legend>
        <Field name="ownerId" label="BD owner" errors={err("ownerId")}>
          {select("ownerId", owners, "Pick an owner")}
        </Field>
        <Field name="expectedAwardDate" label="Expected award" errors={err("expectedAwardDate")}>
          <input id="expectedAwardDate" name="expectedAwardDate" type="date" defaultValue={v.expectedAwardDate} />
        </Field>
        <Field name="marketSector" label="Market sector" errors={err("marketSector")}>
          {select("marketSector", marketSectors, "Pick a sector")}
        </Field>
        <Field name="deliveryMethod" label="Delivery method" errors={err("deliveryMethod")} hint="For example design-build or CM at risk">
          <input id="deliveryMethod" name="deliveryMethod" defaultValue={v.deliveryMethod} maxLength={40} />
        </Field>
        <Field name="description" label="Notes" errors={err("description")} className="md:col-span-2">
          <textarea id="description" name="description" rows={4} defaultValue={v.description} maxLength={2000} />
        </Field>
      </fieldset>

      <div className="flex gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : initial.id ? "Save changes" : "Create opportunity"}
        </button>
        <Link href={initial.id ? `/opportunities/${initial.id}` : "/opportunities"} className="btn no-underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
