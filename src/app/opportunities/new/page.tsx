import { getServiceContext } from "@/server/auth";
import { opportunityFormOptions } from "@/server/queries";
import { OpportunityForm } from "@/components/opportunity-form";

export const metadata = { title: "New opportunity" };

export default async function NewOpportunityPage({ searchParams }: { searchParams: Promise<{ accountId?: string }> }) {
  const { repo, user } = await getServiceContext();
  const options = await opportunityFormOptions(repo);
  const { accountId } = await searchParams;
  return (
    <div className="max-w-3xl space-y-5">
      <h1>New opportunity</h1>
      <OpportunityForm
        {...options}
        alreadyInVista={false}
        initial={{
          name: "",
          accountId: accountId ?? "",
          stage: "00",
          estimatedValue: "",
          marketSector: "",
          projectType: "",
          deliveryMethod: "",
          city: "",
          state: "",
          bidDueDate: "",
          expectedAwardDate: "",
          description: "",
          ownerId: String(user.id),
          estimatorCode: "",
          closedReason: "",
        }}
      />
    </div>
  );
}
