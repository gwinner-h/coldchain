import "server-only";
import type { Repo } from "./repo/types";
import type { Account } from "@/domain/types";
import type { AccountFormValues } from "@/components/account-form";

export async function vistaCustomerOptions(repo: Repo) {
  const customers = await repo.vista.searchCustomers("", 2000);
  return customers.map((c) => ({
    value: String(c.customerNumber),
    label: `${c.name} (${c.customerNumber}${c.city ? `, ${c.city}` : ""})`,
  }));
}

export function toAccountValues(a?: Account): AccountFormValues {
  return {
    id: a?.id,
    name: a?.name ?? "",
    type: a?.type ?? "OWNER",
    phone: a?.phone ?? "",
    website: a?.website ?? "",
    street: a?.street ?? "",
    city: a?.city ?? "",
    state: a?.state ?? "",
    zip: a?.zip ?? "",
    vistaCustomerNumber: a?.vistaCustomerNumber ? String(a.vistaCustomerNumber) : "",
  };
}
