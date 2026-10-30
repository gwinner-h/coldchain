"use client";

import { useActionState } from "react";
import { addContactAction, type FormState } from "@/app/actions";
import { Field, FormMessage } from "./field";

export function ContactForm({ accountId }: { accountId: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addContactAction, { ok: true });
  const err = (f: string) => state.fieldErrors?.[f];
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2" noValidate>
      <input type="hidden" name="accountId" value={accountId} />
      <Field name="firstName" label="First name" errors={err("firstName")}>
        <input id="firstName" name="firstName" maxLength={40} required />
      </Field>
      <Field name="lastName" label="Last name" errors={err("lastName")}>
        <input id="lastName" name="lastName" maxLength={40} required />
      </Field>
      <Field name="title" label="Title" errors={err("title")}>
        <input id="title" name="title" maxLength={60} />
      </Field>
      <Field name="email" label="Email" errors={err("email")}>
        <input id="email" name="email" type="email" maxLength={200} />
      </Field>
      <Field name="phone" label="Phone" errors={err("phone")}>
        <input id="phone" name="phone" type="tel" maxLength={30} />
      </Field>
      <div className="flex items-end">
        <button className="btn" disabled={pending}>
          {pending ? "Adding…" : "Add contact"}
        </button>
      </div>
      <div className="sm:col-span-2">
        <FormMessage ok={state.ok} message={state.message} />
      </div>
    </form>
  );
}
