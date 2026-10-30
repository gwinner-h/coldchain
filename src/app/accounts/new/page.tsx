import { getServiceContext } from "@/server/auth";
import { toAccountValues, vistaCustomerOptions } from "@/server/account-options";
import { AccountForm } from "@/components/account-form";

export const metadata = { title: "New account" };

export default async function NewAccountPage() {
  const { repo } = await getServiceContext();
  return (
    <div className="max-w-3xl space-y-5">
      <h1>New account</h1>
      <AccountForm initial={toAccountValues()} vistaCustomers={await vistaCustomerOptions(repo)} linked={false} />
    </div>
  );
}
