import { notFound } from "next/navigation";
import { getServiceContext } from "@/server/auth";
import { toAccountValues, vistaCustomerOptions } from "@/server/account-options";
import { AccountForm } from "@/components/account-form";

export const metadata = { title: "Edit account" };

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { repo } = await getServiceContext();
  const account = await repo.accounts.get(Number((await params).id));
  if (!account) notFound();
  return (
    <div className="max-w-3xl space-y-5">
      <h1>Edit {account.name}</h1>
      <AccountForm
        initial={toAccountValues(account)}
        vistaCustomers={await vistaCustomerOptions(repo)}
        linked={account.vistaCustomerNumber !== null}
      />
    </div>
  );
}
