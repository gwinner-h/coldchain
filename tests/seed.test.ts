import { describe, expect, it } from "vitest";
import { createMemoryRepo } from "@/server/repo/memory";
import { seed } from "@/server/seed";

describe("demo seed", () => {
  it("produces synced, pending-free and errored opportunities through the real services", async () => {
    const repo = createMemoryRepo();
    await seed(repo, { vistaCompany: 201 });
    const opps = await repo.opportunities.list();
    expect(opps).toHaveLength(10);
    const byStatus = (s: string) => opps.filter((o) => o.vistaSyncStatus === s).length;
    expect(byStatus("SYNCED")).toBe(5);
    expect(byStatus("ERROR")).toBe(1);
    expect(byStatus("PENDING")).toBe(0);
    expect(await repo.outbox.list({ statuses: ["DEAD"] })).toHaveLength(1);
  });
});
