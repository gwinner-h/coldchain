import { notFound } from "next/navigation";
import { getServiceContext } from "@/server/auth";
import { opportunityFormOptions, toFormValues } from "@/server/queries";
import { OpportunityForm } from "@/components/opportunity-form";

export const metadata = { title: "Edit opportunity" };

export default async function EditOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { repo } = await getServiceContext();
  const opp = await repo.opportunities.get(Number((await params).id));
  if (!opp) notFound();
  const options = await opportunityFormOptions(repo);
  const unfinished = await repo.outbox.listUnfinishedFor([opp.id]);
  return (
    <div className="max-w-3xl space-y-5">
      <h1>Edit {opp.name}</h1>
      <OpportunityForm
        {...options}
        initial={toFormValues(opp)}
        alreadyInVista={opp.vistaPotentialProject !== null || unfinished.length > 0}
      />
    </div>
  );
}
