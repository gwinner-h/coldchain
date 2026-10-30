"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const forbidden = error.name === "ForbiddenError" || /permission|access/i.test(error.message);
  return (
    <div className="max-w-xl space-y-3">
      <h1>{forbidden ? "No access" : "Something went wrong"}</h1>
      <p className="text-muted">
        {forbidden ? error.message : "The page couldn't load. Try again; if it keeps happening, send IT this reference:"}
        {!forbidden && error.digest && <span className="figures block text-ink">{error.digest}</span>}
      </p>
      <button className="btn" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
