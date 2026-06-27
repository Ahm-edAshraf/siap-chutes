import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  applicationDoc,
  eventDoc,
  reportBundle,
  stageDoc,
} from "./documentValidators";
import { requireOwnedApplication, requireUser } from "./lib/auth";
import { deleteApplicationChildren } from "./lib/deletion";

const STAGES = [
  "requirement_compiler",
  "eligibility_mapper",
  "red_team_reviewer",
  "action_planner",
] as const;

export const create = mutation({
  args: {
    sourceFileName: v.string(),
    name: v.optional(v.string()),
  },
  returns: v.id("applications"),
  handler: async (ctx, args) => {
    const sourceFileName = args.sourceFileName.trim();
    const requestedName = args.name?.trim();
    if (!sourceFileName || sourceFileName.length > 255) {
      throw new Error("Source filename must contain 1-255 characters");
    }
    if (requestedName && requestedName.length > 200) {
      throw new Error("Application name must not exceed 200 characters");
    }
    const user = await requireUser(ctx);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!profile) throw new Error("Complete your profile before analysis");
    const now = Date.now();
    const applicationId = await ctx.db.insert("applications", {
      userId: user._id,
      name: requestedName || sourceFileName.replace(/\.pdf$/i, ""),
      sourceFileName,
      state: "draft",
      outcome: "analysing",
      readinessScore: 0,
      evidenceScore: 0,
      actionScore: 0,
      analysisGeneration: 1,
      promptVersion: "siap-2026-06-27",
      createdAt: now,
      updatedAt: now,
    });
    for (let order = 0; order < STAGES.length; order += 1) {
      await ctx.db.insert("analysisStages", {
        userId: user._id,
        applicationId,
        stage: STAGES[order],
        order,
        generation: 1,
        status: "pending",
        attempt: 0,
        updatedAt: now,
      });
    }
    return applicationId;
  },
});

export const list = query({
  args: {},
  returns: v.array(applicationDoc),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await ctx.db
      .query("applications")
      .withIndex("by_user_updated", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("applications") },
  returns: v.union(v.null(), reportBundle),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const application = await ctx.db.get("applications", args.id);
    if (!application || application.userId !== user._id) return null;

    const [
      requirements,
      evidence,
      missingDocuments,
      actions,
      dependencies,
      modelRuns,
    ] = await Promise.all([
      ctx.db
        .query("requirements")
        .withIndex("by_application", (q) => q.eq("applicationId", args.id))
        .collect(),
      ctx.db
        .query("requirementEvidence")
        .withIndex("by_application", (q) => q.eq("applicationId", args.id))
        .collect(),
      ctx.db
        .query("missingDocuments")
        .withIndex("by_application", (q) => q.eq("applicationId", args.id))
        .collect(),
      ctx.db
        .query("actionItems")
        .withIndex("by_application", (q) => q.eq("applicationId", args.id))
        .collect(),
      ctx.db
        .query("actionDependencies")
        .withIndex("by_application", (q) => q.eq("applicationId", args.id))
        .collect(),
      ctx.db
        .query("modelRuns")
        .withIndex("by_application", (q) => q.eq("applicationId", args.id))
        .collect(),
    ]);

    const evidenceByRequirement = new Map<string, typeof evidence>();
    for (const item of evidence) {
      const values = evidenceByRequirement.get(item.requirementId) ?? [];
      values.push(item);
      evidenceByRequirement.set(item.requirementId, values);
    }
    const dependencyIds = new Map<
      Id<"actionItems">,
      Array<Id<"actionItems">>
    >();
    for (const dependency of dependencies) {
      const values = dependencyIds.get(dependency.actionId) ?? [];
      values.push(dependency.dependsOnActionId);
      dependencyIds.set(dependency.actionId, values);
    }

    return {
      application,
      requirements: requirements.map((requirement) => ({
        ...requirement,
        evidence: evidenceByRequirement.get(requirement._id) ?? [],
      })),
      missingDocuments,
      actions: actions.map((action) => ({
        ...action,
        dependencies: dependencyIds.get(action._id) ?? [],
      })),
      modelRuns,
    };
  },
});

export const getProgress = query({
  args: { id: v.id("applications") },
  returns: v.union(
    v.null(),
    v.object({
      application: applicationDoc,
      stages: v.array(stageDoc),
      events: v.array(eventDoc),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const application = await ctx.db.get("applications", args.id);
    if (!application || application.userId !== user._id) return null;
    const [stages, events] = await Promise.all([
      ctx.db
        .query("analysisStages")
        .withIndex("by_application", (q) => q.eq("applicationId", args.id))
        .collect(),
      ctx.db
        .query("analysisEvents")
        .withIndex("by_application", (q) => q.eq("applicationId", args.id))
        .collect(),
    ]);
    return { application, stages, events };
  },
});

export const remove = mutation({
  args: { id: v.id("applications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOwnedApplication(ctx, args.id);
    await deleteApplicationChildren(ctx, args.id);
    await ctx.db.delete("applications", args.id);
    return null;
  },
});

export const retry = mutation({
  args: {
    id: v.id("applications"),
    sourceFileName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { application, user } = await requireOwnedApplication(ctx, args.id);
    if (application.state === "complete") {
      throw new Error("Completed applications cannot be restarted");
    }
    const sourceFileName = args.sourceFileName?.trim();
    if (
      sourceFileName !== undefined &&
      (!sourceFileName || sourceFileName.length > 255)
    ) {
      throw new Error("Source filename must contain 1-255 characters");
    }
    await deleteApplicationChildren(ctx, args.id);
    const now = Date.now();
    const generation = (application.analysisGeneration ?? 0) + 1;
    for (let order = 0; order < STAGES.length; order += 1) {
      await ctx.db.insert("analysisStages", {
        userId: user._id,
        applicationId: args.id,
        stage: STAGES[order],
        order,
        generation,
        status: "pending",
        attempt: 0,
        updatedAt: now,
      });
    }
    const patch: Partial<Doc<"applications">> = {
      state: "draft",
      outcome: "analysing",
      readinessScore: 0,
      evidenceScore: 0,
      actionScore: 0,
      analysisGeneration: generation,
      sourceFileName: sourceFileName ?? application.sourceFileName,
      updatedAt: now,
      startedAt: undefined,
      completedAt: undefined,
      errorCode: undefined,
    };
    await ctx.db.patch("applications", args.id, patch);
    return null;
  },
});
