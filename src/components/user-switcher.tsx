"use client";

import { switchUserAction } from "@/app/actions";

/** Development only. Production uses Microsoft Entra ID sign-in. */
export function UserSwitcher({ users, current }: { users: { email: string; label: string }[]; current: string }) {
  return (
    <form action={switchUserAction} className="flex items-center gap-2">
      <label htmlFor="dev-user" className="text-muted">
        Signed in as
      </label>
      <select
        id="dev-user"
        name="email"
        defaultValue={current}
        className="w-auto py-1"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {users.map((u) => (
          <option key={u.email} value={u.email}>
            {u.label}
          </option>
        ))}
      </select>
    </form>
  );
}
