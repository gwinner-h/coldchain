import Link from "next/link";
import { getServiceContext } from "@/server/auth";
import { can } from "@/domain/permissions";
import { OUTBOX_STATUSES, type OutboxStatus } from "@/domain/types";
import { OutboxBadge } from "@/components/badges";
import { retryOutboxAction } from "@/app/actions";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Vista sync" };

const FILTERS: { key: string; label: string; statuses?: OutboxStatus[] }[] = [
  { key: "attention", label: "Needs attention", statuses: ["DEAD"] },
  { key: "waiting", label: "Waiting or retrying", statuses: ["PENDING", "IN_PROGRESS", "FAILED"] },
  { key: "delivered", label: "Delivered", statuses: ["SUCCEEDED"] },
  { key: "all", label: "All" },
];

export default async function VistaSyncPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { repo, user } = await getServiceContext();
  const { show } = await searchParams;
  const filter = FILTERS.find((f) => f.key === show) ?? FILTERS[0];
  const [messages, events, opps, all] = await Promise.all([
    repo.outbox.list({ statuses: filter.statuses, limit: 200 }),
    repo.events.list(40),
    repo.opportunities.list(),
    repo.outbox.list({ limit: 1000 }),
  ]);
  const oppName = new Map(opps.map((o) => [o.id, o.name]));
  const count = (statuses: readonly OutboxStatus[]) => all.filter((m) => statuses.includes(m.status)).length;
  const canRetry = can(user.role, "integration:replay");

  return (
    <div className="space-y-6">
      <div>
        <h1>Vista sync</h1>
        <p className="mt-1 max-w-prose text-muted">
          Every change bound for Vista is listed here until Vista confirms it. App Xchange collects waiting items every
          few minutes and retries temporary failures on its own. Items that Vista rejected need a person: fix the
          opportunity and save, and it is resent.
        </p>
      </div>

      <nav aria-label="Filter" className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/vista-sync?show=${f.key}`}
            aria-current={f.key === filter.key ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 no-underline ${f.key === filter.key ? "bg-ink text-white" : "hover:bg-surface"}`}
          >
            {f.label} <span className="figures">({count(f.statuses ?? OUTBOX_STATUSES)})</span>
          </Link>
        ))}
      </nav>

      <div className="panel overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Opportunity</th>
              <th>Change</th>
              <th>Status</th>
              <th className="text-right">Attempts</th>
              <th>Updated</th>
              <th>Problem</th>
              {canRetry && <th />}
            </tr>
          </thead>
          <tbody>
            {messages.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted">
                  {filter.key === "attention" ? "Nothing needs attention. Everything sent to Vista was accepted." : "Nothing here."}
                </td>
              </tr>
            )}
            {messages.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link href={`/opportunities/${m.opportunityId}`}>{oppName.get(m.opportunityId)}</Link>
                </td>
                <td>{m.operation === "CREATE_POTENTIAL_PROJECT" ? "Create potential project" : "Update potential project"}</td>
                <td>
                  <OutboxBadge status={m.status} />
                </td>
                <td className="figures text-right">{m.attempts}</td>
                <td className="whitespace-nowrap">{dateTime(m.updatedAt)}</td>
                <td className="max-w-md text-sm">
                  {m.status !== "SUCCEEDED" && m.lastError ? (
                    <span className="text-danger">{m.lastError}</span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                {canRetry && (
                  <td>
                    {(m.status === "DEAD" || m.status === "FAILED") && (
                      <form action={retryOutboxAction}>
                        <input type="hidden" name="id" value={m.id} />
                        <button className="btn text-sm">Retry now</button>
                      </form>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="log" className="panel p-5">
        <h2 id="log" className="mb-3">
          Recent integration log
        </h2>
        <ul className="space-y-2 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex gap-4">
              <span className="w-32 shrink-0 text-muted">{dateTime(e.createdAt)}</span>
              <span className={`w-20 shrink-0 ${e.direction === "INBOUND" ? "text-muted" : ""}`}>
                {e.direction === "INBOUND" ? "From Vista" : "To Vista"}
              </span>
              <span className={e.status === "ERROR" ? "text-danger" : e.status === "SUCCESS" ? "text-ok" : ""}>
                {e.message}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
