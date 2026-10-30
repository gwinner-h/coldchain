import Link from "next/link";
import { getServiceContext } from "@/server/auth";
import { completeActivityAction } from "@/app/actions";
import { date } from "@/lib/format";
import { ACTIVITY_LABELS } from "@/lib/labels";

export const metadata = { title: "Follow-ups" };

export default async function FollowUpsPage() {
  const { repo, user } = await getServiceContext();
  const [open, opps, accounts] = await Promise.all([
    repo.activities.list({ ownerId: user.id, openOnly: true }),
    repo.opportunities.list(),
    repo.accounts.list(),
  ]);
  const oppName = new Map(opps.map((o) => [o.id, o.name]));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const sorted = [...open].sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime());

  return (
    <div className="max-w-4xl space-y-5">
      <h1>Your follow-ups</h1>
      {sorted.length === 0 ? (
        <p className="panel p-5 text-muted">
          Nothing due. Add a follow-up date when you log a call or meeting and it shows up here.
        </p>
      ) : (
        <ul className="panel divide-y divide-line">
          {sorted.map((a) => {
            const overdue = a.dueAt! < today;
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                <div className={`w-28 shrink-0 text-sm ${overdue ? "font-medium text-danger" : "text-muted"}`}>
                  {overdue ? `Overdue, ${date(a.dueAt)}` : date(a.dueAt)}
                </div>
                <div className="min-w-0 flex-1">
                  <p>
                    <span className="font-medium">{ACTIVITY_LABELS[a.type]}:</span> {a.subject}
                  </p>
                  <p className="text-sm text-muted">
                    {a.opportunityId ? (
                      <Link href={`/opportunities/${a.opportunityId}`}>{oppName.get(a.opportunityId)}</Link>
                    ) : (
                      a.accountId && <Link href={`/accounts/${a.accountId}`}>{accountName.get(a.accountId)}</Link>
                    )}
                  </p>
                </div>
                <form action={completeActivityAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="btn text-sm">Mark done</button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
