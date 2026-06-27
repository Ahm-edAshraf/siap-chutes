import { v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUser } from "./lib/auth";

function stateValue(state: string) {
  if (state === "confirmed") return 1;
  if (state === "needs_verification") return 0.5;
  return 0;
}

async function updateScore(
  ctx: MutationCtx,
  applicationId: Id<"applications">,
) {
  const [application, requirements, actions, missingDocuments] =
    await Promise.all([
      ctx.db.get("applications", applicationId),
      ctx.db
        .query("requirements")
        .withIndex("by_application", (q) =>
          q.eq("applicationId", applicationId),
        )
        .collect(),
      ctx.db
        .query("actionItems")
        .withIndex("by_application", (q) =>
          q.eq("applicationId", applicationId),
        )
        .collect(),
      ctx.db
        .query("missingDocuments")
        .withIndex("by_application", (q) =>
          q.eq("applicationId", applicationId),
        )
        .collect(),
    ]);
  const totalWeight = requirements.reduce((sum, item) => sum + item.weight, 0);
  const earned = requirements.reduce(
    (sum, item) => sum + item.weight * stateValue(item.state),
    0,
  );
  const evidenceScore =
    totalWeight === 0 ? 0 : Math.round((earned / totalWeight) * 80);
  const completed = actions.filter(
    (item) => item.status === "completed",
  ).length;
  const actionScore =
    actions.length === 0
      ? missingDocuments.length === 0
        ? 20
        : 0
      : Math.round((completed / actions.length) * 20);
  const hasNotMet = requirements.some(
    (item) => item.mandatory && item.state === "not_met",
  );
  const patch: Partial<Doc<"applications">> = {
    evidenceScore,
    actionScore,
    readinessScore: Math.min(100, evidenceScore + actionScore),
    updatedAt: Date.now(),
  };
  if (application?.state === "complete") {
    patch.outcome = hasNotMet
      ? "likely_ineligible"
      : missingDocuments.length > 0 ||
          actions.some((item) => item.status !== "completed") ||
          requirements.some((item) => item.state !== "confirmed")
        ? "action_required"
        : "ready_to_submit";
  }
  await ctx.db.patch("applications", applicationId, patch);
}

export const setCompleted = mutation({
  args: {
    id: v.id("actionItems"),
    completed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const action = await ctx.db.get("actionItems", args.id);
    if (!action || action.userId !== user._id) {
      throw new Error("Action not found");
    }

    if (args.completed) {
      const dependencies = await ctx.db
        .query("actionDependencies")
        .withIndex("by_action", (q) => q.eq("actionId", action._id))
        .collect();
      for (const dependency of dependencies) {
        const required = await ctx.db.get(
          "actionItems",
          dependency.dependsOnActionId,
        );
        if (!required || required.status !== "completed") {
          throw new Error("Complete dependent actions first");
        }
      }
    } else {
      const dependents = await ctx.db
        .query("actionDependencies")
        .withIndex("by_application", (q) =>
          q.eq("applicationId", action.applicationId),
        )
        .collect();
      for (const dependency of dependents) {
        if (dependency.dependsOnActionId !== action._id) continue;
        const dependent = await ctx.db.get("actionItems", dependency.actionId);
        if (dependent?.status === "completed") {
          throw new Error("Mark dependent actions incomplete first");
        }
      }
    }

    await ctx.db.patch("actionItems", action._id, {
      status: args.completed ? "completed" : "pending",
      completedAt: args.completed ? Date.now() : undefined,
    });
    await updateScore(ctx, action.applicationId);
    return null;
  },
});
