import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceContext } from "@/server/auth";
import { can } from "@/domain/permissions";
import { stageLabel } from "@/domain/stages";
import { StageBadge, SyncBadge, OutboxBadge } from "@/components/badges";
import { StageMover } from "@/components/stage-mover";
import { ActivityForm } from "@/components/activity-form";
import { completeActivityAction, retryOutboxAction } from "@/app/actions";
import { money, date, dateTime } from "@/lib/format";
import { ACTIVITY_LABELS } from "@/lib/labels";

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { repo, user } = await getServiceContext();
  const opp = await repo.opportunities.get(Number((await params).id));
  if (!opp) notFound();

  const [account, owner, history, activities, outbox, users, projectTypes, estimators] = await Promise.all([
    repo.accounts.get(opp.accountId),
    repo.users.get(opp.ownerId),
    repo.stageChanges.listByOpportunity(opp.id),
    repo.activities.list({ opportunityId: opp.id }),
    repo.outbox.list({ opportunityId: opp.id, limit: 20 }),
    repo.users.list(),
    repo.lookups.list("PROJECT_TYPE"),
    repo.lookups.list("ESTIMATOR"),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const lookup = (list: { code: string; description: string }[], code: string | null) =>
    code ? (list.find((l) => l.code === code)?.description ?? code) : "—";
  const canEdit = can(user.role, "opportunity:edit");
  const canLog = can(user.role, "activity:edit");
  const canRetry = can(user.role, "integration:replay");

  const facts: [string, React.ReactNode][] = [
    ["Account", account ? <Link href={`/accounts/${account.id}`}>{account.name}</Link> : "—"],
    ["Estimated value", <span key="v" className="figures">{money(opp.estimatedValue)}</span>],
    ["Location", [opp.city, opp.state].filter(Boolean).join(", ") || "—"],
    ["Project type", lookup(projectTypes, opp.projectType)],
    ["Bid due", date(opp.bidDueDate)],
    ["Expected award", date(opp.expectedAwardDate)],
    ["Estimator", lookup(estimators, opp.estimatorCode)],
    ["BD owner", owner?.name ?? "—"],
    ["Delivery method", opp.deliveryMethod ?? "—"],
    ...(opp.closedReason ? ([["Why it closed", opp.closedReason]] as [string, React.ReactNode][]) : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1>{opp.name}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <StageBadge code={opp.stage} />
            <SyncBadge status={opp.vistaSyncStatus} />
          </div>
        </div>
        {canEdit && (
          <Link href={`/opportunities/${opp.id}/edit`} className="btn no-underline">
            Edit details
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          {canEdit && (
            <section className="panel p-5">
              <StageMover id={opp.id} version={opp.version} stage={opp.stage} />
            </section>
          )}

          <section className="panel p-5" aria-labelledby="details">
            <h2 id="details" className="mb-3">
              Details
            </h2>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {opp.description && <p className="mt-4 max-w-prose whitespace-pre-line">{opp.description}</p>}
          </section>

          <section className="panel p-5" aria-labelledby="activity">
            <h2 id="activity" className="mb-3">
              Activity
            </h2>
            {canLog && (
              <div className="mb-5 border-b border-line pb-5">
                <ActivityForm opportunityId={opp.id} />
              </div>
            )}
            {activities.length === 0 ? (
              <p className="text-muted">No activity yet. Log the first call or meeting above.</p>
            ) : (
              <ul className="space-y-4">
                {activities.map((a) => (
                  <li key={a.id} className="flex gap-4">
                    <div className="w-24 shrink-0 text-sm text-muted">{date(a.occurredAt)}</div>
                    <div className="min-w-0 flex-1">
                      <p>
                        <span className="font-medium">{ACTIVITY_LABELS[a.type]}:</span> {a.subject}
                      </p>
                      {a.notes && <p className="text-sm text-muted">{a.notes}</p>}
                      <p className="text-sm text-muted">
                        {userName.get(a.ownerId)}
                        {a.dueAt && !a.completedAt && `, follow up by ${date(a.dueAt)}`}
                        {a.completedAt && `, done ${date(a.completedAt)}`}
                      </p>
                    </div>
                    {a.dueAt && !a.completedAt && canLog && (
                      <form action={completeActivityAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <button className="btn text-sm">Mark done</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="panel p-5" aria-labelledby="vista">
            <h2 id="vista" className="mb-3">
              Vista
            </h2>
            <dl className="space-y-2">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Potential project</dt>
                <dd className="figures">{opp.vistaPotentialProject ?? "Not created yet"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Last synced</dt>
                <dd>{dateTime(opp.vistaLastSyncedAt)}</dd>
              </div>
            </dl>
            {opp.vistaSyncStatus === "NOT_REQUIRED" && (
              <p className="mt-3 text-sm text-muted">Sent to Vista automatically when it reaches stage 06-Budget.</p>
            )}
            {outbox.length > 0 && (
              <ul className="mt-4 space-y-3 border-t border-line pt-4">
                {outbox.map((m) => (
                  <li key={m.id} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span>{m.operation === "CREATE_POTENTIAL_PROJECT" ? "Create" : "Update"}</span>
                      <OutboxBadge status={m.status} />
                    </div>
                    <div className="text-muted">{dateTime(m.updatedAt)}</div>
                    {m.lastError && m.status !== "SUCCEEDED" && (
                      <p className="mt-1 rounded-md bg-danger-soft px-2 py-1.5 text-danger">{m.lastError}</p>
                    )}
                    {m.status === "DEAD" && (
                      <p className="mt-1 text-muted">
                        Fix the details and save; the CRM resends automatically.
                        {canRetry ? " Or retry as is:" : ""}
                      </p>
                    )}
                    {canRetry && (m.status === "DEAD" || m.status === "FAILED") && (
                      <form action={retryOutboxAction} className="mt-1">
                        <input type="hidden" name="id" value={m.id} />
                        <button className="btn text-sm">Retry now</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel p-5" aria-labelledby="history">
            <h2 id="history" className="mb-3">
              Stage history
            </h2>
            <ol className="space-y-2 text-sm">
              {history.map((h) => (
                <li key={h.id}>
                  <span className="font-medium">{stageLabel(h.toStage)}</span>
                  <span className="block text-muted">
                    {dateTime(h.changedAt)}, {userName.get(h.changedById)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
