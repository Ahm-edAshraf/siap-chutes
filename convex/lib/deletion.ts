import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";

export async function deleteApplicationChildren(
  ctx: GenericMutationCtx<DataModel>,
  applicationId: Id<"applications">,
) {
  const analysisStages = await ctx.db
    .query("analysisStages")
    .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
    .collect();
  for (const row of analysisStages)
    await ctx.db.delete("analysisStages", row._id);

  const analysisEvents = await ctx.db
    .query("analysisEvents")
    .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
    .collect();
  for (const row of analysisEvents)
    await ctx.db.delete("analysisEvents", row._id);

  const modelRuns = await ctx.db
    .query("modelRuns")
    .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
    .collect();
  for (const row of modelRuns) await ctx.db.delete("modelRuns", row._id);

  const evidence = await ctx.db
    .query("requirementEvidence")
    .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
    .collect();
  for (const row of evidence)
    await ctx.db.delete("requirementEvidence", row._id);

  const missing = await ctx.db
    .query("missingDocuments")
    .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
    .collect();
  for (const row of missing) await ctx.db.delete("missingDocuments", row._id);

  const dependencies = await ctx.db
    .query("actionDependencies")
    .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
    .collect();
  for (const row of dependencies)
    await ctx.db.delete("actionDependencies", row._id);

  const actions = await ctx.db
    .query("actionItems")
    .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
    .collect();
  for (const row of actions) await ctx.db.delete("actionItems", row._id);

  const requirements = await ctx.db
    .query("requirements")
    .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
    .collect();
  for (const row of requirements) await ctx.db.delete("requirements", row._id);
}
