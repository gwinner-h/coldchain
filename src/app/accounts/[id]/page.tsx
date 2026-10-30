import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceContext } from "@/server/auth";
import { can } from "@/domain/permissions";
import { StageBadge, SyncBadge } from "@/components/badges";
import { ContactForm } from "@/components/contact-form";
import { money, date } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS } from "@/lib/labels";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { repo, user } = await getServiceContext();
  const account = await repo.accounts.get(Number((await params).id));
  if (!account) notFound();

  const [contacts, opps, jobs] = await Promise.all([
    repo.contacts.listByAccount(account.id),
    repo.opportunities.list({ accountId: account.id }),
    account.vistaCustomerNumber ? repo.vista.listJobsByCustomer(account.vistaCustomerNumber) : Promise.resolve([]),
  ]);
  const canEdit = can(user.role, "account:edit");
  const contractTotal = jobs.reduce((s, j) => s + (j.contractAmount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{account.name}</h1>
          <p className="text-muted">
            {ACCOUNT_TYPE_LABELS[account.type]}
            {account.city && `, ${account.city}${account.state ? `, ${account.state}` : ""}`}
            {account.vistaCustomerNumber ? `. Vista customer ${account.vistaCustomerNumber}` : ". Not linked to Vista"}
          </p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Link href={`/accounts/${account.id}/edit`} className="btn no-underline">
              Edit account
            </Link>
          )}
          {can(user.role, "opportunity:edit") && (
            <Link href={`/opportunities/new?accountId=${account.id}`} className="btn btn-primary no-underline">
              New opportunity
            </Link>
          )}
        </div>
      </div>

      <section className="panel overflow-x-auto" aria-labelledby="opps">
        <h2 id="opps" className="px-5 pt-4 pb-2">
          Opportunities
        </h2>
        <table>
          <thead>
            <tr>
              <th>Opportunity</th>
              <th>Stage</th>
              <th className="text-right">Value</th>
              <th>Vista</th>
            </tr>
          </thead>
          <tbody>
            {opps.length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted">
                  No opportunities yet.
                </td>
              </tr>
            )}
            {opps.map((o) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/opportunities/${o.id}`}>{o.name}</Link>
                </td>
                <td>
                  <StageBadge code={o.stage} />
                </td>
                <td className="figures text-right">{money(o.estimatedValue)}</td>
                <td>
                  <SyncBadge status={o.vistaSyncStatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-5" aria-labelledby="contacts">
          <h2 id="contacts" className="mb-3">
            Contacts
          </h2>
          {contacts.length === 0 ? (
            <p className="text-muted">No contacts yet.</p>
          ) : (
            <ul className="mb-5 space-y-3">
              {contacts.map((c) => (
                <li key={c.id}>
                  <p className="font-medium">
                    {c.firstName} {c.lastName}
                    {c.title && <span className="font-normal text-muted">, {c.title}</span>}
                  </p>
                  <p className="text-sm">
                    {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
                    {c.email && c.phone && <span className="text-muted">, </span>}
                    {c.phone && <a href={`tel:${c.phone}`}>{c.phone}</a>}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {canEdit && (
            <details className="border-t border-line pt-4">
              <summary className="cursor-pointer font-medium text-accent-strong">Add a contact</summary>
              <div className="mt-3">
                <ContactForm accountId={account.id} />
              </div>
            </details>
          )}
        </section>

        <section className="panel overflow-x-auto" aria-labelledby="jobs">
          <div className="px-5 pt-4 pb-2">
            <h2 id="jobs">Work in Vista since 2020</h2>
            {jobs.length > 0 && (
              <p className="text-sm text-muted">
                {jobs.length} jobs, <span className="figures">{money(contractTotal)}</span> contracted
              </p>
            )}
          </div>
          {!account.vistaCustomerNumber ? (
            <p className="px-5 pb-5 text-muted">Link this account to a Vista customer to see its job history.</p>
          ) : jobs.length === 0 ? (
            <p className="px-5 pb-5 text-muted">No Vista jobs for this customer since 2020.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Started</th>
                  <th className="text-right">Contract</th>
                  <th className="text-right">Billed</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={`${j.company}-${j.job}`}>
                    <td>
                      <span className="figures">{j.job}</span> {j.description}
                      <div className="text-sm text-muted">{j.status}</div>
                    </td>
                    <td className="whitespace-nowrap">{date(j.startDate)}</td>
                    <td className="figures text-right">{money(j.contractAmount)}</td>
                    <td className="figures text-right">{money(j.billedToDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
