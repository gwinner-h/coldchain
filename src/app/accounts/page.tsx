import Link from "next/link";
import { getRuntime } from "@/server/runtime";
import { ACCOUNT_TYPE_LABELS } from "@/lib/labels";

export const metadata = { title: "Accounts" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { repo } = await getRuntime();
  const [accounts, opps] = await Promise.all([repo.accounts.list(q), repo.opportunities.list()]);
  const openCount = (id: number) =>
    opps.filter((o) => o.accountId === id && !["09", "09A", "10", "11", "12"].includes(o.stage)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1>Accounts</h1>
        <Link href="/accounts/new" className="btn btn-primary no-underline">
          New account
        </Link>
      </div>
      <form role="search" className="flex gap-2">
        <label htmlFor="q" className="sr-only">
          Search accounts
        </label>
        <input id="q" name="q" defaultValue={q} placeholder="Search accounts" className="w-72" />
        <button className="btn">Search</button>
      </form>
      <div className="panel overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Type</th>
              <th>Location</th>
              <th className="text-right">Open opportunities</th>
              <th>Vista customer</th>
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted">
                  No accounts found.
                </td>
              </tr>
            )}
            {accounts.map((a) => (
              <tr key={a.id} className="hover:bg-sunken">
                <td>
                  <Link href={`/accounts/${a.id}`} className="font-medium">
                    {a.name}
                  </Link>
                </td>
                <td>{ACCOUNT_TYPE_LABELS[a.type]}</td>
                <td>{[a.city, a.state].filter(Boolean).join(", ") || "—"}</td>
                <td className="figures text-right">{openCount(a.id)}</td>
                <td>
                  {a.vistaCustomerNumber ? (
                    <span className="figures">{a.vistaCustomerNumber}</span>
                  ) : (
                    <span className="text-muted">Not linked</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
