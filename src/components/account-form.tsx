"use client";

import { useActionState } from "react";
import Link from "next/link";
import { saveAccountAction, type FormState } from "@/app/actions";
import { ACCOUNT_TYPES } from "@/domain/types";
import { ACCOUNT_TYPE_LABELS } from "@/lib/labels";
import { Field, FormMessage } from "./field";

export interface AccountFormValues {
  id?: number;
  name: string;
  type: string;
  phone: string;
  website: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  vistaCustomerNumber: string;
}

export function AccountForm({
  initial,
  vistaCustomers,
  linked,
}: {
  initial: AccountFormValues;
  vistaCustomers: { value: string; label: string }[];
  linked: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAccountAction, { ok: true });
  const v = { ...initial, ...(state.values as Partial<AccountFormValues> | undefined) };
  const err = (f: string) => state.fieldErrors?.[f];

  return (
    <form action={action} className="space-y-6" noValidate>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <FormMessage ok={state.ok} message={state.ok ? undefined : state.message} />
      <fieldset className="panel grid gap-4 p-5 md:grid-cols-2">
        <legend className="sr-only">Account</legend>
        <Field name="name" label="Name" errors={err("name")} className="md:col-span-2">
          <input id="name" name="name" defaultValue={v.name} maxLength={60} required />
        </Field>
        <Field name="type" label="Type" errors={err("type")}>
          <select id="type" name="type" defaultValue={v.type}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          name="vistaCustomerNumber"
          label="Vista customer"
          errors={err("vistaCustomerNumber")}
          hint={
            linked
              ? "Linked. Ask an admin to change it."
              : "Pick the matching Vista customer. Leave blank for a new customer; Vista creates it at the first push."
          }
        >
          {linked && <input type="hidden" name="vistaCustomerNumber" value={v.vistaCustomerNumber} />}
          <select id="vistaCustomerNumber" name={linked ? undefined : "vistaCustomerNumber"} defaultValue={v.vistaCustomerNumber} disabled={linked}>
            <option value="">Not linked</option>
            {vistaCustomers.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field name="street" label="Street" errors={err("street")} className="md:col-span-2">
          <input id="street" name="street" defaultValue={v.street} maxLength={60} />
        </Field>
        <Field name="city" label="City" errors={err("city")}>
          <input id="city" name="city" defaultValue={v.city} maxLength={30} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field name="state" label="State" errors={err("state")}>
            <input id="state" name="state" defaultValue={v.state} maxLength={2} className="uppercase" />
          </Field>
          <Field name="zip" label="ZIP" errors={err("zip")}>
            <input id="zip" name="zip" defaultValue={v.zip} maxLength={12} />
          </Field>
        </div>
        <Field name="phone" label="Phone" errors={err("phone")}>
          <input id="phone" name="phone" type="tel" defaultValue={v.phone} maxLength={30} />
        </Field>
        <Field name="website" label="Website" errors={err("website")}>
          <input id="website" name="website" defaultValue={v.website} maxLength={200} />
        </Field>
      </fieldset>
      <div className="flex gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : initial.id ? "Save changes" : "Create account"}
        </button>
        <Link href={initial.id ? `/accounts/${initial.id}` : "/accounts"} className="btn no-underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
