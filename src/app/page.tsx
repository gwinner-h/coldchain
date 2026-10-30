import Link from "next/link";
import { STAGES, isClosed, requiresVista } from "@/domain/stages";
import type { Opportunity } from "@/domain/types";
import { getRuntime } from "@/server/runtime";
import { pipelineDashboard } from "@/server/queries";
import { moneyShort, date } from "@/lib/format";
import { StageBadge, SyncBadge } from "@/components/badges";


export default async function PipelinePage() {
  const { repo } = await getRuntime();
  const { opps, accountName, totals, wins, summary } = await pipelineDashboard(repo);

  const early = opps
    .filter((o) => !requiresVista(o.stage) && !isClosed(o.stage))
    .sort((a, b) => b.stage.localeCompare(a.stage));
  const vistaStages = STAGES.filter((s) => s.requiresVista);
  const closedStages = summary.filter((s) => ["10", "11", "12"].includes(s.code));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1>Pipeline</h1>
        <Link href="/opportunities/new" className="btn btn-primary no-underline">
          New opportunity
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
        {[
          { label: "Open pipeline", value: moneyShort(totals.openValue), note: `${totals.openCount} opportunities` },
          { label: "Budget to pending decision", value: moneyShort(totals.proposalValue), note: "Stages 06 to 08" },
          { label: "Won", value: moneyShort(totals.wonValue), note: "Stages 09 and 09A" },
          {
            label: "Win rate, last 12 months",
            value: wins.rate === null ? "—" : `${Math.round(wins.rate * 100)}%`,
            note: `${wins.won} won, ${wins.lost} lost`,
          },
        ].map((k) => (
          <div key={k.label} className="bg-surface px-5 py-4">
            <dt className="text-sm text-muted">{k.label}</dt>
            <dd className="figures mt-1 text-3xl font-semibold">{k.value}</dd>
            <dd className="text-sm text-muted">{k.note}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="board-heading">
        <h2 id="board-heading" className="sr-only">
          Opportunities by stage
        </h2>
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max items-stretch gap-0">
            <Lane
              title="Before Vista"
              sub={`Stages 00 to 05, ${early.length} ${early.length === 1 ? "opportunity" : "opportunities"}`}
              value={early.reduce((s, o) => s + (o.estimatedValue ?? 0), 0)}
              wide
            >
              {early.map((o) => (
                <Card key={o.id} opp={o} account={accountName.get(o.accountId)} showStage />
              ))}
            </Lane>

            <div className="relative ml-4 border-l-[3px] border-accent pl-4">
              <p className="mb-2 text-sm font-medium text-accent-strong">
                Sent to Vista as a potential project from 06 on
              </p>
              <div className="flex">
                {vistaStages.map((stage) => {
                  const inStage = opps.filter((o) => o.stage === stage.code);
                  return (
                    <Lane
                      key={stage.code}
                      title={`${stage.code} ${stage.label}`}
                      sub={`${inStage.length} ${inStage.length === 1 ? "opportunity" : "opportunities"}`}
                      value={inStage.reduce((s, o) => s + (o.estimatedValue ?? 0), 0)}
                      tinted
                    >
                      {inStage.map((o) => (
                        <Card key={o.id} opp={o} account={accountName.get(o.accountId)} showSync />
                      ))}
                    </Lane>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="closed-heading" className="panel px-5 py-4">
        <h2 id="closed-heading" className="mb-2">
          Closed
        </h2>
        <ul className="flex flex-wrap gap-x-8 gap-y-2">
          {closedStages.map((s) => (
            <li key={s.code}>
              <Link href={`/opportunities?stage=${s.code}`} className="no-underline hover:underline">
                <span className="figures font-semibold">{s.code}</span> {s.label}:{" "}
                <span className="figures">{s.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Lane({
  title,
  sub,
  value,
  wide = false,
  tinted = false,
  children,
}: {
  title: string;
  sub: string;
  value: number;
  wide?: boolean;
  tinted?: boolean;
  children: React.ReactNode;
}) {
  const empty = Array.isArray(children) && children.length === 0;
  return (
    <section className={`flex flex-col pr-2 ${wide ? "w-72" : "w-52"}`} aria-label={title}>
      <header className={`mb-2 rounded-md px-3 py-2 ${tinted ? "bg-accent-soft" : "bg-sunken"}`}>
        <h3 className="truncate font-[family-name:var(--font-condensed)] font-semibold">{title}</h3>
        <p className="flex justify-between gap-2 text-sm text-muted">
          <span>{sub}</span>
          <span className="figures text-ink">{moneyShort(value)}</span>
        </p>
      </header>
      <ul className="flex flex-col gap-2">
        {empty ? <li className="px-3 py-2 text-sm text-muted">None</li> : children}
      </ul>
    </section>
  );
}

function Card({
  opp,
  account,
  showStage = false,
  showSync = false,
}: {
  opp: Opportunity;
  account?: string;
  showStage?: boolean;
  showSync?: boolean;
}) {
  return (
    <li>
      <Link
        href={`/opportunities/${opp.id}`}
        className={`block rounded-md border bg-surface px-3 py-2.5 no-underline hover:border-accent ${
          opp.vistaSyncStatus === "ERROR" ? "border-danger" : "border-line"
        }`}
      >
        {showStage && (
          <span className="mb-1 block">
            <StageBadge code={opp.stage} />
          </span>
        )}
        <span className="block leading-snug font-medium">{opp.name}</span>
        <span className="block text-sm text-muted">{account}</span>
        <span className="mt-1.5 flex items-center justify-between gap-2">
          <span className="figures font-medium">{moneyShort(opp.estimatedValue)}</span>
          {showSync ? (
            <SyncBadge status={opp.vistaSyncStatus} compact={opp.vistaSyncStatus === "SYNCED"} />
          ) : (
            opp.bidDueDate && <span className="text-sm text-muted">Bid {date(opp.bidDueDate)}</span>
          )}
        </span>
      </Link>
    </li>
  );
}
