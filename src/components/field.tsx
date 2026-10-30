import type { ReactNode } from "react";

/** Label + control + hint/error, wired for screen readers. */
export function Field({
  name,
  label,
  errors,
  hint,
  vista,
  children,
  className = "",
}: {
  name: string;
  label: string;
  errors?: string[];
  hint?: string;
  /** Show the "Needed for Vista" marker. */
  vista?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="mb-1 flex items-baseline justify-between gap-2 text-sm font-medium">
        {label}
        {vista && <span className="text-xs font-normal text-accent-strong">Needed for Vista</span>}
      </label>
      {children}
      {errors?.length ? (
        <p id={`${name}-error`} className="mt-1 text-sm text-danger">
          {errors.join(". ")}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormMessage({ ok, message }: { ok?: boolean; message?: string }) {
  if (!message) return null;
  return (
    <p
      role={ok ? "status" : "alert"}
      className={`rounded-md px-3 py-2 text-sm ${ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}
    >
      {message}
    </p>
  );
}
