"use client";

/** Shown when the layout itself fails, e.g. the user isn't signed in or has no CRM access. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem", maxWidth: "36rem", color: "#16262b" }}>
        <h1 style={{ fontSize: "1.5rem" }}>The CRM couldn&apos;t load</h1>
        <p>
          {error.name === "ForbiddenError"
            ? error.message
            : "Try again. If it keeps happening, send IT this reference: " + (error.digest ?? "none")}
        </p>
        <button onClick={reset} style={{ padding: "0.4rem 0.9rem" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
