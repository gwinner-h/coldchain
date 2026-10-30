import Link from "next/link";
import { getRuntime } from "@/server/runtime";
import { STAGES, isStageCode, type StageCode } from "@/domain/stages";
import { StageBadge, SyncBadge } from "@/components/badges";
import { money, date } from "@/lib/format";

export const metadata = { title: "Opportunities" };

const VIEWS: { key: string; label: string; stages?: StageCode[] }[] = [
  { key: "open", label: "Open", stages: STAGES.filter((s) => s.group === "open").map((s) => s.code) },
  { key: "vista", label: "In Vista stages", stages: STAGES.filter((s) => s.requiresVista).map((s) => s.code) },
  { key: "won", label: "Won", stages: ["09", "09A"] },
  { key: "closed", label: "Closed", stages: ["10", "11", "12"] },
  { key: "all", label: "All" },
];

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; stage?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === sp.view) ?? VIEWS[0];
  const stages = sp.stage && isStageCode(sp.stage) ? [sp.stage] : view.stages;
  const { repo } = await getRuntime();
  const [opps, accounts, users] = await Promise.all([
    repo.opportunities.list({ stages, search: sp.q }),
    repo.accounts.list(),
    repo.users.list(),
  ]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const userName = new Map(users.map((u) => [u.id, u.name]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1>Opportunities</h1>
        <Link href="/opportunities/new" className="btn btn-primary no-underline">
          New opportunity
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <nav aria-label="Views" className="flex flex-wrap gap-1">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={`/opportunities?view=${v.key}`}
              aria-current={!sp.stage && v.key === view.key ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 no-underline ${!sp.stage && v.key === view.key ? "bg-ink text-white" : "hover:bg-surface"}`}
            >
              {v.label}
            </Link>
          ))}
        </nav>
        <form className="ml-auto flex gap-2" role="search">
          <input type="hidden" name="view" value={view.key} />
          <label htmlFor="q" className="sr-only">
            Search by name
          </label>
          <input id="q" name="q" defaultValue={sp.q} placeholder="Search by name" className="w-60" />
          <button className="btn">Search</button>
        </form>
      </div>

      <div className="panel overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Opportunity</th>
              <th>Stage</th>
              <th className="text-right">Value</th>
              <th>Bid due</th>
              <th>Owner</th>
              <th>Vista</th>
            </tr>
          </thead>
          <tbody>
            {opps.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted">
                  No opportunities match. Try another view or clear the search.
                </td>
              </tr>
            )}
            {opps.map((o) => (
              <tr key={o.id} className="hover:bg-sunken">
                <td>
                  <Link href={`/opportunities/${o.id}`} className="font-medium">
                    {o.name}
                  </Link>
                  <div className="text-sm text-muted">{accountName.get(o.accountId)}</div>
                </td>
                <td>
                  <StageBadge code={o.stage} />
                </td>
                <td className="figures text-right">{money(o.estimatedValue)}</td>
                <td className="whitespace-nowrap">{date(o.bidDueDate)}</td>
                <td className="whitespace-nowrap">{userName.get(o.ownerId)}</td>
                <td className="whitespace-nowrap">
                  <SyncBadge status={o.vistaSyncStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
