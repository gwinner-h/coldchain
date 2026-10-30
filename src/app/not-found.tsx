import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-xl space-y-3">
      <h1>Not found</h1>
      <p className="text-muted">That record doesn&apos;t exist or was removed.</p>
      <Link href="/" className="btn no-underline">
        Back to the pipeline
      </Link>
    </div>
  );
}
