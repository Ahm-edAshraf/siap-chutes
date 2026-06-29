import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { analysisContext } from "./documentValidators";
import { requireAnalysisService, requireOwnedApplication } from "./lib/auth";
import {
  confidence,
  requirementKind,
  requirementState,
  stageName,
  urgency,
} from "./validators";

type AnalysisStageName =
  | "requirement_compiler"
  | "eligibility_mapper"
  | "red_team_reviewer"
  | "action_planner";

const modelCitation = v.object({
  documentName: v.string(),
  pageNumber: v.optional(v.number()),
  excerpt: v.string(),
  confidence,
  verified: v.boolean(),
  matchKind: v.union(
    v.literal("document"),
    v.literal("profile"),
    v.literal("deterministic"),
    v.literal("none"),
  ),
});

const evidenceClaim = v.object({
  field: v.string(),
  valueType: v.union(
    v.literal("number"),
    v.literal("boolean"),
    v.literal("string"),
    v.literal("date"),
  ),
  numberValue: v.optional(v.number()),
  booleanValue: v.optional(v.boolean()),
  stringValue: v.optional(v.string()),
  dateValue: v.optional(v.string()),
  unit: v.optional(v.string()),
  subject: v.string(),
  qualifiers: v.array(v.string()),
  verbatimValue: v.string(),
});

const citation = v.object({
  documentName: v.string(),
  pageNumber: v.optional(v.number()),
  excerpt: v.string(),
  confidence,
  verified: v.boolean(),
  matchKind: v.union(
    v.literal("document"),
    v.literal("profile"),
    v.literal("deterministic"),
    v.literal("none"),
  ),
});

const mapperCandidate = v.object({
  requirementKey: v.string(),
  requirementLabel: v.string(),
  proposedState: requirementState,
  citation: modelCitation,
  citationIsSupporting: v.boolean(),
  citationSubjectValidated: v.boolean(),
  claimValidated: v.boolean(),
  claim: v.optional(evidenceClaim),
});

const reviewerCandidate = v.object({
  requirementKey: v.string(),
  requirementLabel: v.string(),
  state: requirementState,
  evidenceVerdict: v.union(
    v.literal("supports_mapping"),
    v.literal("contradicts_mapping"),
    v.literal("unclear"),
  ),
});

async function requireStage(
  ctx: MutationCtx,
  applicationId: Id<"applications">,
  stage: AnalysisStageName,
) {
  const row = await ctx.db
    .query("analysisStages")
    .withIndex("by_application_stage", (q) =>
      q.eq("applicationId", applicationId).eq("stage", stage),
    )
    .unique();
  if (!row) throw new Error("Analysis stage not found");
  return row;
}

async function requireCurrentStageRun(
  ctx: MutationCtx,
  applicationId: Id<"applications">,
  stageName: AnalysisStageName,
  generation: number,
  attempt: number,
) {
  const stage = await requireStage(ctx, applicationId, stageName);
  if ((stage.generation ?? 0) !== generation || stage.attempt !== attempt) {
    throw new Error("STALE_ANALYSIS_RUN");
  }
  return stage;
}

async function requireRunningStageRun(
  ctx: MutationCtx,
  applicationId: Id<"applications">,
  stageName: AnalysisStageName,
  generation: number,
  attempt: number,
) {
  const stage = await requireCurrentStageRun(
    ctx,
    applicationId,
    stageName,
    generation,
    attempt,
  );
  if (stage.status !== "running") throw new Error("STALE_ANALYSIS_RUN");
  return stage;
}

export const getContext = query({
  args: { applicationId: v.id("applications") },
  returns: analysisContext,
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    const { application, user } = await requireOwnedApplication(
      ctx,
      args.applicationId,
    );
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!profile) throw new Error("Profile not found");
    const requirements = await ctx.db
      .query("requirements")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();
    const modelRuns = await ctx.db
      .query("modelRuns")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();
    const evidence = await ctx.db
      .query("requirementEvidence")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();
    return { application, profile, requirements, evidence, modelRuns };
  },
});

export const beginEnsemble = mutation({
  args: {
    applicationId: v.id("applications"),
  },
  returns: v.object({
    status: v.union(
      v.literal("started"),
      v.literal("already_complete"),
      v.literal("already_running"),
    ),
    generation: v.number(),
    runs: v.array(
      v.object({
        stage: stageName,
        attempt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    const { application } = await requireOwnedApplication(
      ctx,
      args.applicationId,
    );
    const generation = application.analysisGeneration ?? 0;
    const stages = await ctx.db
      .query("analysisStages")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();
    if (stages.length !== 4) throw new Error("Analysis stages are incomplete");
    if (application.state === "complete") {
      return {
        status: "already_complete" as const,
        generation,
        runs: stages.map((stage) => ({
          stage: stage.stage,
          attempt: stage.attempt,
        })),
      };
    }
    if (application.state === "failed") {
      throw new Error("Retry the failed application before continuing");
    }
    if (
      stages.some(
        (stage) =>
          stage.status === "running" &&
          stage.startedAt !== undefined &&
          stage.startedAt > Date.now() - 10 * 60 * 1_000,
      )
    ) {
      return {
        status: "already_running" as const,
        generation,
        runs: stages.map((stage) => ({
          stage: stage.stage,
          attempt: stage.attempt,
        })),
      };
    }

    const now = Date.now();
    const runs: Array<{ stage: AnalysisStageName; attempt: number }> = [];
    for (const stage of stages) {
      if ((stage.generation ?? 0) !== generation) {
        throw new Error("STALE_ANALYSIS_RUN");
      }
      const attempt = stage.attempt + 1;
      runs.push({ stage: stage.stage, attempt });
      await ctx.db.patch("analysisStages", stage._id, {
        status: "running",
        generation,
        attempt,
        startedAt: now,
        readyAt: undefined,
        appliedAt: undefined,
        completedAt: undefined,
        errorCode: undefined,
        updatedAt: now,
      });
      await ctx.db.insert("analysisEvents", {
        userId: application.userId,
        applicationId: args.applicationId,
        stage: stage.stage,
        type: "started",
        messageKey: `stage.${stage.stage}.started_parallel`,
        createdAt: now,
      });
    }
    await ctx.db.patch("applications", args.applicationId, {
      state: "reading_requirements",
      outcome: "analysing",
      analysisGeneration: generation,
      startedAt: application.startedAt ?? now,
      errorCode: undefined,
      updatedAt: now,
    });
    return {
      status: "started" as const,
      generation,
      runs,
    };
  },
});

export const beginStage = mutation({
  args: {
    applicationId: v.id("applications"),
    stage: stageName,
  },
  returns: v.object({
    status: v.union(
      v.literal("started"),
      v.literal("already_ready"),
      v.literal("already_complete"),
      v.literal("already_running"),
    ),
    generation: v.number(),
    attempt: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    const { application } = await requireOwnedApplication(
      ctx,
      args.applicationId,
    );
    const generation = application.analysisGeneration ?? 0;
    const stage = await requireStage(ctx, args.applicationId, args.stage);
    if ((stage.generation ?? 0) !== generation) {
      throw new Error("STALE_ANALYSIS_RUN");
    }
    if (application.state === "complete" || stage.status === "complete") {
      return {
        status: "already_complete" as const,
        generation,
        attempt: stage.attempt,
      };
    }
    if (application.state === "failed") {
      throw new Error("Retry the failed application before continuing");
    }
    if (stage.readyAt !== undefined) {
      return {
        status: "already_ready" as const,
        generation,
        attempt: stage.attempt,
      };
    }
    if (
      stage.status === "running" &&
      stage.startedAt !== undefined &&
      stage.startedAt > Date.now() - 100_000
    ) {
      return {
        status: "already_running" as const,
        generation,
        attempt: stage.attempt,
      };
    }

    const now = Date.now();
    const attempt = stage.attempt + 1;
    await ctx.db.patch("analysisStages", stage._id, {
      status: "running",
      generation,
      attempt,
      startedAt: now,
      readyAt: undefined,
      appliedAt: undefined,
      completedAt: undefined,
      errorCode: undefined,
      updatedAt: now,
    });
    await ctx.db.insert("analysisEvents", {
      userId: application.userId,
      applicationId: args.applicationId,
      stage: args.stage,
      type: stage.attempt === 0 ? "started" : "retrying",
      messageKey:
        stage.attempt === 0
          ? `stage.${args.stage}.started_independent`
          : `stage.${args.stage}.retrying`,
      createdAt: now,
    });
    if (application.state === "draft") {
      await ctx.db.patch("applications", args.applicationId, {
        state: "reading_requirements",
        outcome: "analysing",
        startedAt: application.startedAt ?? now,
        errorCode: undefined,
        updatedAt: now,
      });
    }
    return { status: "started" as const, generation, attempt };
  },
});

export const getModelPerformance = query({
  args: {
    stage: stageName,
    models: v.array(v.string()),
  },
  returns: v.array(
    v.object({
      model: v.string(),
      samples: v.number(),
      failures: v.number(),
      failureRate: v.number(),
      p95DurationMs: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    const allowed = new Set(args.models.slice(0, 12));
    const runs = await ctx.db
      .query("modelRuns")
      .withIndex("by_stage_and_created_at", (q) =>
        q.eq("stage", args.stage),
      )
      .order("desc")
      .take(200);
    return [...allowed].map((model) => {
      const matches = runs.filter((run) => run.model === model).slice(0, 30);
      const successes = matches
        .filter((run) => run.outcome === "success")
        .map((run) => run.durationMs)
        .sort((a, b) => a - b);
      const p95Index = Math.max(0, Math.ceil(successes.length * 0.95) - 1);
      const failures = matches.length - successes.length;
      return {
        model,
        samples: matches.length,
        failures,
        failureRate: matches.length === 0 ? 0 : failures / matches.length,
        p95DurationMs:
          successes.length === 0 ? undefined : successes[p95Index],
      };
    });
  },
});

export const saveMapperCandidates = mutation({
  args: {
    applicationId: v.id("applications"),
    generation: v.number(),
    attempt: v.number(),
    mappings: v.array(mapperCandidate),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    const { application } = await requireOwnedApplication(
      ctx,
      args.applicationId,
    );
    await requireRunningStageRun(
      ctx,
      args.applicationId,
      "eligibility_mapper",
      args.generation,
      args.attempt,
    );
    const old = await ctx.db
      .query("mapperCandidates")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();
    for (const row of old) await ctx.db.delete("mapperCandidates", row._id);
    const now = Date.now();
    for (const mapping of args.mappings.slice(0, 100)) {
      await ctx.db.insert("mapperCandidates", {
        userId: application.userId,
        applicationId: args.applicationId,
        generation: args.generation,
        attempt: args.attempt,
        requirementKey: mapping.requirementKey,
        requirementLabel: mapping.requirementLabel,
        proposedState: mapping.proposedState,
        citation: {
          ...mapping.citation,
          excerpt: mapping.citation.excerpt.slice(0, 240),
        },
        citationIsSupporting: mapping.citationIsSupporting,
        citationSubjectValidated: mapping.citationSubjectValidated,
        claimValidated: mapping.claimValidated,
        claim: mapping.claim
          ? {
              ...mapping.claim,
              stringValue: mapping.claim.stringValue?.slice(0, 200),
              subject: mapping.claim.subject.slice(0, 120),
              qualifiers: mapping.claim.qualifiers
                .slice(0, 12)
                .map((value) => value.slice(0, 80)),
              verbatimValue: mapping.claim.verbatimValue.slice(0, 240),
            }
          : undefined,
        createdAt: now,
      });
    }
    return null;
  },
});

export const saveReviewerCandidates = mutation({
  args: {
    applicationId: v.id("applications"),
    generation: v.number(),
    attempt: v.number(),
    reviews: v.array(reviewerCandidate),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    const { application } = await requireOwnedApplication(
      ctx,
      args.applicationId,
    );
    await requireRunningStageRun(
      ctx,
      args.applicationId,
      "red_team_reviewer",
      args.generation,
      args.attempt,
    );
    const old = await ctx.db
      .query("reviewerCandidates")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();
    for (const row of old) await ctx.db.delete("reviewerCandidates", row._id);
    const now = Date.now();
    for (const review of args.reviews.slice(0, 100)) {
      await ctx.db.insert("reviewerCandidates", {
        userId: application.userId,
        applicationId: args.applicationId,
        generation: args.generation,
        attempt: args.attempt,
        ...review,
        createdAt: now,
      });
    }
    return null;
  },
});

export const savePlannerCandidate = mutation({
  args: {
    applicationId: v.id("applications"),
    generation: v.number(),
    attempt: v.number(),
    recommendation: v.union(
      v.literal("ready"),
      v.literal("actions_required"),
      v.literal("likely_ineligible"),
    ),
    priorityRequirementKeys: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    const { application } = await requireOwnedApplication(
      ctx,
      args.applicationId,
    );
    await requireRunningStageRun(
      ctx,
      args.applicationId,
      "action_planner",
      args.generation,
      args.attempt,
    );
    const old = await ctx.db
      .query("plannerCandidates")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();
    for (const row of old) await ctx.db.delete("plannerCandidates", row._id);
    await ctx.db.insert("plannerCandidates", {
      userId: application.userId,
      applicationId: args.applicationId,
      generation: args.generation,
      attempt: args.attempt,
      recommendation: args.recommendation,
      priorityRequirementKeys: args.priorityRequirementKeys.slice(0, 20),
      createdAt: Date.now(),
    });
    return null;
  },
});

export const getStageCandidates = query({
  args: { applicationId: v.id("applications") },
  returns: v.object({
    mapper: v.array(
      v.object({
        _id: v.id("mapperCandidates"),
        _creationTime: v.number(),
        userId: v.id("users"),
        applicationId: v.id("applications"),
        generation: v.number(),
        attempt: v.number(),
        requirementKey: v.string(),
        requirementLabel: v.string(),
        proposedState: requirementState,
        citation: modelCitation,
        citationIsSupporting: v.boolean(),
        citationSubjectValidated: v.optional(v.boolean()),
        claimValidated: v.boolean(),
        claim: v.optional(evidenceClaim),
        createdAt: v.number(),
      }),
    ),
    reviewer: v.array(
      v.object({
        _id: v.id("reviewerCandidates"),
        _creationTime: v.number(),
        userId: v.id("users"),
        applicationId: v.id("applications"),
        generation: v.number(),
        attempt: v.number(),
        requirementKey: v.string(),
        requirementLabel: v.string(),
        state: requirementState,
        evidenceVerdict: v.union(
          v.literal("supports_mapping"),
          v.literal("contradicts_mapping"),
          v.literal("unclear"),
        ),
        createdAt: v.number(),
      }),
    ),
    planner: v.array(
      v.object({
        _id: v.id("plannerCandidates"),
        _creationTime: v.number(),
        userId: v.id("users"),
        applicationId: v.id("applications"),
        generation: v.number(),
        attempt: v.number(),
        recommendation: v.union(
          v.literal("ready"),
          v.literal("actions_required"),
          v.literal("likely_ineligible"),
        ),
        priorityRequirementKeys: v.array(v.string()),
        createdAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    await requireOwnedApplication(ctx, args.applicationId);
    const [mapper, reviewer, planner] = await Promise.all([
      ctx.db
        .query("mapperCandidates")
        .withIndex("by_application", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .collect(),
      ctx.db
        .query("reviewerCandidates")
        .withIndex("by_application", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .collect(),
      ctx.db
        .query("plannerCandidates")
        .withIndex("by_application", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .collect(),
    ]);
    return { mapper, reviewer, planner };
  },
});

export const recordModelAttemptFailure = mutation({
  args: {
    applicationId: v.id("applications"),
    stage: stageName,
    generation: v.number(),
    attempt: v.number(),
    modelAttempt: v.number(),
    model: v.string(),
    confidentialCompute: v.boolean(),
    durationMs: v.number(),
    errorCode: v.string(),
    promptVersion: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    const { user } = await requireOwnedApplication(ctx, args.applicationId);
    await requireRunningStageRun(
      ctx,
      args.applicationId,
      args.stage,
      args.generation,
      args.attempt,
    );
    const existing = await ctx.db
      .query("modelRuns")
      .withIndex("by_application_stage_and_attempt", (q) =>
        q
          .eq("applicationId", args.applicationId)
          .eq("stage", args.stage)
          .eq("generation", args.generation)
          .eq("attempt", args.attempt)
          .eq("modelAttempt", args.modelAttempt),
      )
      .unique();
    if (existing) return null;
    await ctx.db.insert("modelRuns", {
      userId: user._id,
      applicationId: args.applicationId,
      stage: args.stage,
      model: args.model,
      confidentialCompute: args.confidentialCompute,
      durationMs: args.durationMs,
      promptVersion: args.promptVersion,
      outcome: "failed",
      generation: args.generation,
      attempt: args.attempt,
      modelAttempt: args.modelAttempt,
      errorCode: args.errorCode,
      fallbackUsed: args.modelAttempt > 0,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const markStageRetryableFailure = mutation({
  args: {
    applicationId: v.id("applications"),
    stage: stageName,
    generation: v.number(),
    attempt: v.number(),
    errorCode: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    const { user } = await requireOwnedApplication(ctx, args.applicationId);
    const stage = await requireRunningStageRun(
      ctx,
      args.applicationId,
      args.stage,
      args.generation,
      args.attempt,
    );
    const now = Date.now();
    await ctx.db.patch("analysisStages", stage._id, {
      status: "failed",
      errorCode: args.errorCode,
      completedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("analysisEvents", {
      userId: user._id,
      applicationId: args.applicationId,
      stage: args.stage,
      type: "failed",
      messageKey: `stage.${args.stage}.retry_available`,
      createdAt: now,
    });
    return null;
  },
});

export const markAgentReady = mutation({
  args: {
    applicationId: v.id("applications"),
    stage: stageName,
    generation: v.number(),
    attempt: v.number(),
    model: v.string(),
    confidentialCompute: v.boolean(),
    durationMs: v.number(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    promptVersion: v.string(),
    modelAttempt: v.optional(v.number()),
    fallbackUsed: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    const { user } = await requireOwnedApplication(ctx, args.applicationId);
    const stage = await requireRunningStageRun(
      ctx,
      args.applicationId,
      args.stage,
      args.generation,
      args.attempt,
    );
    if (stage.readyAt !== undefined) return null;
    if (!args.confidentialCompute) {
      throw new Error("Non-confidential model runs cannot be persisted");
    }
    const now = Date.now();
    await ctx.db.insert("modelRuns", {
      userId: user._id,
      applicationId: args.applicationId,
      stage: args.stage,
      model: args.model,
      confidentialCompute: true,
      durationMs: args.durationMs,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      promptVersion: args.promptVersion,
      outcome: "success",
      generation: args.generation,
      attempt: args.attempt,
      modelAttempt: args.modelAttempt ?? 0,
      fallbackUsed: args.fallbackUsed ?? false,
      createdAt: now,
    });
    await ctx.db.patch("analysisStages", stage._id, {
      readyAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const applyRequirementCompiler = mutation({
  args: {
    applicationId: v.id("applications"),
    generation: v.number(),
    attempt: v.number(),
    promptVersion: v.optional(v.string()),
    programme: v.object({
      name: v.string(),
      deadline: v.optional(v.string()),
      summary: v.string(),
    }),
    requirements: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        description: v.optional(v.string()),
        kind: requirementKind,
        weight: v.number(),
        mandatory: v.boolean(),
        condition: v.optional(
          v.object({
            type: v.union(
              v.literal("citizenship_equals"),
              v.literal("age_max_on"),
              v.literal("income_max"),
              v.literal("study_level_in"),
              v.literal("document_present"),
              v.literal("deadline_after"),
              v.literal("numeric"),
              v.literal("other"),
            ),
            expectedString: v.optional(v.string()),
            threshold: v.optional(v.number()),
            operator: v.optional(
              v.union(
                v.literal("lt"),
                v.literal("lte"),
                v.literal("eq"),
                v.literal("gte"),
                v.literal("gt"),
              ),
            ),
            profileField: v.optional(v.literal("householdIncome")),
            comparisonDate: v.optional(v.string()),
            acceptedValues: v.optional(v.array(v.string())),
            documentNames: v.optional(v.array(v.string())),
          }),
        ),
        citation,
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    const { application } = await requireOwnedApplication(
      ctx,
      args.applicationId,
    );
    const stage = await requireRunningStageRun(
      ctx,
      args.applicationId,
      "requirement_compiler",
      args.generation,
      args.attempt,
    );
    if (stage.appliedAt !== undefined) return null;
    const oldEvidence = await ctx.db
      .query("requirementEvidence")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();
    for (const row of oldEvidence) {
      await ctx.db.delete("requirementEvidence", row._id);
    }
    const oldRequirements = await ctx.db
      .query("requirements")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();
    for (const row of oldRequirements) {
      await ctx.db.delete("requirements", row._id);
    }

    const now = Date.now();
    const seen = new Set<string>();
    for (const requirement of args.requirements) {
      if (seen.has(requirement.key)) {
        throw new Error(`Duplicate requirement key: ${requirement.key}`);
      }
      seen.add(requirement.key);
      const requirementId = await ctx.db.insert("requirements", {
        userId: application.userId,
        applicationId: args.applicationId,
        key: requirement.key,
        label: requirement.label,
        description: requirement.description,
        kind: requirement.kind,
        state: "needs_verification",
        weight: Math.max(0.01, requirement.weight),
        mandatory: requirement.mandatory,
        conditionType: requirement.condition?.type,
        expectedString: requirement.condition?.expectedString,
        threshold: requirement.condition?.threshold,
        operator: requirement.condition?.operator,
        profileField: requirement.condition?.profileField,
        comparisonDate: requirement.condition?.comparisonDate,
        acceptedValues: requirement.condition?.acceptedValues,
        documentNames: requirement.condition?.documentNames,
        citationVerified: requirement.citation.verified,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("requirementEvidence", {
        userId: application.userId,
        applicationId: args.applicationId,
        requirementId,
        documentName: requirement.citation.documentName,
        pageNumber: requirement.citation.pageNumber,
        excerpt: requirement.citation.excerpt.slice(0, 240),
        confidence: requirement.citation.confidence,
        citationVerified: requirement.citation.verified,
        matchKind: requirement.citation.matchKind,
        createdAt: now,
      });
    }
    await ctx.db.patch("applications", args.applicationId, {
      name: args.programme.name,
      deadline: args.programme.deadline,
      summary: args.programme.summary.slice(0, 500),
      promptVersion: args.promptVersion ?? application.promptVersion,
      updatedAt: now,
    });
    await ctx.db.patch("analysisStages", stage._id, {
      appliedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const applyEligibilityMapper = mutation({
  args: {
    applicationId: v.id("applications"),
    generation: v.number(),
    attempt: v.number(),
    mappings: v.array(
      v.object({
        requirementKey: v.string(),
        state: requirementState,
        deterministicResult: v.optional(v.boolean()),
        citation,
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    const { application } = await requireOwnedApplication(
      ctx,
      args.applicationId,
    );
    const stage = await requireRunningStageRun(
      ctx,
      args.applicationId,
      "eligibility_mapper",
      args.generation,
      args.attempt,
    );
    if (stage.appliedAt !== undefined) return null;
    const requirements = await ctx.db
      .query("requirements")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();
    const byKey = new Map(requirements.map((row) => [row.key, row]));
    const now = Date.now();
    for (const mapping of args.mappings) {
      const requirement = byKey.get(mapping.requirementKey);
      if (!requirement) {
        throw new Error(`Unknown requirement key: ${mapping.requirementKey}`);
      }
      const state =
        !mapping.citation.verified && mapping.state === "confirmed"
          ? "needs_verification"
          : mapping.state;
      await ctx.db.patch("requirements", requirement._id, {
        state,
        deterministicResult: mapping.deterministicResult,
        citationVerified: mapping.citation.verified,
        updatedAt: now,
      });
      await ctx.db.insert("requirementEvidence", {
        userId: application.userId,
        applicationId: args.applicationId,
        requirementId: requirement._id,
        documentName: mapping.citation.documentName,
        pageNumber: mapping.citation.pageNumber,
        excerpt: mapping.citation.excerpt.slice(0, 240),
        confidence: mapping.citation.confidence,
        citationVerified: mapping.citation.verified,
        matchKind: mapping.citation.matchKind,
        createdAt: now,
      });
    }
    await ctx.db.patch("analysisStages", stage._id, {
      appliedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

const STATE_RANK = {
  not_met: 0,
  incomplete: 1,
  needs_verification: 2,
  confirmed: 3,
} as const;

export const applyRedTeamReviewer = mutation({
  args: {
    applicationId: v.id("applications"),
    generation: v.number(),
    attempt: v.number(),
    reviews: v.array(
      v.object({
        requirementKey: v.string(),
        state: requirementState,
        reason: v.string(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    await requireOwnedApplication(ctx, args.applicationId);
    const stage = await requireRunningStageRun(
      ctx,
      args.applicationId,
      "red_team_reviewer",
      args.generation,
      args.attempt,
    );
    if (stage.appliedAt !== undefined) return null;
    const now = Date.now();
    for (const review of args.reviews) {
      const requirement = await ctx.db
        .query("requirements")
        .withIndex("by_application_key", (q) =>
          q
            .eq("applicationId", args.applicationId)
            .eq("key", review.requirementKey),
        )
        .unique();
      if (!requirement) {
        throw new Error(`Unknown requirement key: ${review.requirementKey}`);
      }
      const state =
        STATE_RANK[review.state] > STATE_RANK[requirement.state]
          ? requirement.state
          : review.state;
      await ctx.db.patch("requirements", requirement._id, {
        state,
        updatedAt: now,
      });
    }
    await ctx.db.patch("analysisStages", stage._id, {
      appliedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

function assertAcyclic(actions: Array<{ key: string; dependsOn: string[] }>) {
  const keys = new Set(actions.map((item) => item.key));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const graph = new Map(actions.map((item) => [item.key, item.dependsOn]));
  const visit = (key: string) => {
    if (visiting.has(key))
      throw new Error("Action dependencies contain a cycle");
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of graph.get(key) ?? []) {
      if (!keys.has(dependency)) {
        throw new Error(`Unknown action dependency: ${dependency}`);
      }
      visit(dependency);
    }
    visiting.delete(key);
    visited.add(key);
  };
  for (const action of actions) visit(action.key);
}

export const applyActionPlanner = mutation({
  args: {
    applicationId: v.id("applications"),
    generation: v.number(),
    attempt: v.number(),
    missingDocuments: v.array(
      v.object({
        requirementKey: v.optional(v.string()),
        name: v.string(),
        urgency,
        owner: v.string(),
        suggestedDate: v.string(),
        action: v.string(),
      }),
    ),
    actions: v.array(
      v.object({
        key: v.string(),
        description: v.string(),
        owner: v.optional(v.string()),
        urgency: v.optional(urgency),
        dependsOn: v.array(v.string()),
        emailDraft: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    const { application } = await requireOwnedApplication(
      ctx,
      args.applicationId,
    );
    const stage = await requireCurrentStageRun(
      ctx,
      args.applicationId,
      "action_planner",
      args.generation,
      args.attempt,
    );
    if (stage.appliedAt !== undefined) return null;
    assertAcyclic(args.actions);
    const oldDependencies = await ctx.db
      .query("actionDependencies")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();
    for (const row of oldDependencies) {
      await ctx.db.delete("actionDependencies", row._id);
    }
    const oldActions = await ctx.db
      .query("actionItems")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();
    for (const row of oldActions) await ctx.db.delete("actionItems", row._id);
    const oldMissing = await ctx.db
      .query("missingDocuments")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();
    for (const row of oldMissing) {
      await ctx.db.delete("missingDocuments", row._id);
    }

    const requirements = await ctx.db
      .query("requirements")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();
    const requirementByKey = new Map(
      requirements.map((row) => [row.key, row._id]),
    );
    const now = Date.now();
    for (const missing of args.missingDocuments) {
      const requirementId = missing.requirementKey
        ? requirementByKey.get(missing.requirementKey)
        : undefined;
      if (missing.requirementKey && !requirementId) {
        throw new Error(`Unknown requirement key: ${missing.requirementKey}`);
      }
      await ctx.db.insert("missingDocuments", {
        userId: application.userId,
        applicationId: args.applicationId,
        requirementId,
        name: missing.name,
        urgency: missing.urgency,
        owner: missing.owner,
        suggestedDate: missing.suggestedDate,
        action: missing.action,
        createdAt: now,
      });
    }

    const ids = new Map<string, Id<"actionItems">>();
    for (let position = 0; position < args.actions.length; position += 1) {
      const action = args.actions[position];
      if (ids.has(action.key))
        throw new Error(`Duplicate action key: ${action.key}`);
      const id = await ctx.db.insert("actionItems", {
        userId: application.userId,
        applicationId: args.applicationId,
        clientKey: action.key,
        description: action.description,
        owner: action.owner,
        urgency: action.urgency,
        status: "pending",
        position,
        emailDraft: action.emailDraft?.slice(0, 2_000),
        createdAt: now,
      });
      ids.set(action.key, id);
    }
    for (const action of args.actions) {
      for (const dependency of action.dependsOn) {
        await ctx.db.insert("actionDependencies", {
          userId: application.userId,
          applicationId: args.applicationId,
          actionId: ids.get(action.key)!,
          dependsOnActionId: ids.get(dependency)!,
          createdAt: now,
        });
      }
    }
    await ctx.db.patch("analysisStages", stage._id, {
      appliedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const finishStage = mutation({
  args: {
    applicationId: v.id("applications"),
    stage: stageName,
    generation: v.number(),
    attempt: v.number(),
    model: v.string(),
    confidentialCompute: v.boolean(),
    durationMs: v.number(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    promptVersion: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    const { user } = await requireOwnedApplication(ctx, args.applicationId);
    const stage = await requireCurrentStageRun(
      ctx,
      args.applicationId,
      args.stage,
      args.generation,
      args.attempt,
    );
    if (stage.status === "complete") return null;
    if (stage.status !== "running") throw new Error("STALE_ANALYSIS_RUN");
    if (!args.confidentialCompute) {
      throw new Error("Non-confidential model runs cannot be persisted");
    }
    const now = Date.now();
    if (stage.readyAt === undefined) {
      await ctx.db.insert("modelRuns", {
        userId: user._id,
        applicationId: args.applicationId,
        stage: args.stage,
        model: args.model,
        confidentialCompute: true,
        durationMs: args.durationMs,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        promptVersion: args.promptVersion,
        outcome: "success",
        createdAt: now,
      });
    }
    await ctx.db.patch("analysisStages", stage._id, {
      status: "complete",
      completedAt: now,
      errorCode: undefined,
      updatedAt: now,
    });
    await ctx.db.insert("analysisEvents", {
      userId: user._id,
      applicationId: args.applicationId,
      stage: args.stage,
      type: "completed",
      messageKey: `stage.${args.stage}.completed`,
      createdAt: now,
    });

    if (args.stage !== "action_planner") {
      const nextState =
        args.stage === "requirement_compiler"
          ? "checking_eligibility"
          : args.stage === "eligibility_mapper"
            ? "challenging_assumptions"
            : "building_plan";
      await ctx.db.patch("applications", args.applicationId, {
        state: nextState,
        updatedAt: now,
      });
      return null;
    }

    const [requirements, actions, missingDocuments] = await Promise.all([
      ctx.db
        .query("requirements")
        .withIndex("by_application", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .collect(),
      ctx.db
        .query("actionItems")
        .withIndex("by_application", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .collect(),
      ctx.db
        .query("missingDocuments")
        .withIndex("by_application", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .collect(),
    ]);
    const totalWeight = requirements.reduce((sum, row) => sum + row.weight, 0);
    const earned = requirements.reduce(
      (sum, row) =>
        sum +
        row.weight *
          (row.state === "confirmed"
            ? 1
            : row.state === "needs_verification"
              ? 0.5
              : 0),
      0,
    );
    const evidenceScore =
      totalWeight === 0 ? 0 : Math.round((earned / totalWeight) * 80);
    const actionScore =
      actions.length === 0 && missingDocuments.length === 0 ? 20 : 0;
    const hasNotMet = requirements.some(
      (row) => row.mandatory && row.state === "not_met",
    );
    const outcome = hasNotMet
      ? "likely_ineligible"
      : missingDocuments.length > 0 ||
          actions.length > 0 ||
          requirements.some((row) => row.state !== "confirmed")
        ? "action_required"
        : "ready_to_submit";
    await ctx.db.patch("applications", args.applicationId, {
      state: "complete",
      outcome,
      evidenceScore,
      actionScore,
      readinessScore: evidenceScore + actionScore,
      completedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const failStage = mutation({
  args: {
    applicationId: v.id("applications"),
    stage: stageName,
    generation: v.number(),
    attempt: v.number(),
    errorCode: v.string(),
    model: v.optional(v.string()),
    confidentialCompute: v.optional(v.boolean()),
    durationMs: v.optional(v.number()),
    promptVersion: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    const { user } = await requireOwnedApplication(ctx, args.applicationId);
    const stage = await requireRunningStageRun(
      ctx,
      args.applicationId,
      args.stage,
      args.generation,
      args.attempt,
    );
    const now = Date.now();
    await ctx.db.patch("analysisStages", stage._id, {
      status: "failed",
      errorCode: args.errorCode,
      completedAt: now,
      updatedAt: now,
    });
    if (args.model && args.durationMs !== undefined) {
      await ctx.db.insert("modelRuns", {
        userId: user._id,
        applicationId: args.applicationId,
        stage: args.stage,
        model: args.model,
        confidentialCompute: args.confidentialCompute === true,
        durationMs: args.durationMs,
        promptVersion: args.promptVersion,
        outcome: "failed",
        createdAt: now,
      });
    }
    await ctx.db.insert("analysisEvents", {
      userId: user._id,
      applicationId: args.applicationId,
      stage: args.stage,
      type: "failed",
      messageKey: `stage.${args.stage}.failed`,
      createdAt: now,
    });
    await ctx.db.patch("applications", args.applicationId, {
      state: "failed",
      outcome: "failed",
      errorCode: args.errorCode,
      updatedAt: now,
    });
    return null;
  },
});

export const finishOptionalStageWithFallback = mutation({
  args: {
    applicationId: v.id("applications"),
    stage: v.union(
      v.literal("red_team_reviewer"),
      v.literal("action_planner"),
    ),
    generation: v.number(),
    attempt: v.number(),
    errorCode: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    const { user } = await requireOwnedApplication(ctx, args.applicationId);
    const stage = await requireCurrentStageRun(
      ctx,
      args.applicationId,
      args.stage,
      args.generation,
      args.attempt,
    );
    if (stage.status === "complete") return null;
    const now = Date.now();
    await ctx.db.patch("analysisStages", stage._id, {
      status: "complete",
      errorCode: args.errorCode,
      readyAt: stage.readyAt,
      completedAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("analysisEvents", {
      userId: user._id,
      applicationId: args.applicationId,
      stage: args.stage,
      type: "completed",
      messageKey: `stage.${args.stage}.deterministic_fallback`,
      createdAt: now,
    });
    return null;
  },
});

export const completeAnalysis = mutation({
  args: { applicationId: v.id("applications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    const { application } = await requireOwnedApplication(
      ctx,
      args.applicationId,
    );
    if (application.state === "complete") return null;
    const stages = await ctx.db
      .query("analysisStages")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", args.applicationId),
      )
      .collect();
    if (stages.some((stage) => stage.status !== "complete")) {
      throw new Error("ANALYSIS_STAGES_INCOMPLETE");
    }
    const [requirements, actions, missingDocuments] = await Promise.all([
      ctx.db
        .query("requirements")
        .withIndex("by_application", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .collect(),
      ctx.db
        .query("actionItems")
        .withIndex("by_application", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .collect(),
      ctx.db
        .query("missingDocuments")
        .withIndex("by_application", (q) =>
          q.eq("applicationId", args.applicationId),
        )
        .collect(),
    ]);
    const totalWeight = requirements.reduce((sum, row) => sum + row.weight, 0);
    const earned = requirements.reduce(
      (sum, row) =>
        sum +
        row.weight *
          (row.state === "confirmed"
            ? 1
            : row.state === "needs_verification"
              ? 0.5
              : 0),
      0,
    );
    const evidenceScore =
      totalWeight === 0 ? 0 : Math.round((earned / totalWeight) * 80);
    const actionScore =
      actions.length === 0 && missingDocuments.length === 0 ? 20 : 0;
    const hasNotMet = requirements.some(
      (row) => row.mandatory && row.state === "not_met",
    );
    const outcome = hasNotMet
      ? "likely_ineligible"
      : missingDocuments.length > 0 ||
          actions.length > 0 ||
          requirements.some((row) => row.state !== "confirmed")
        ? "action_required"
        : "ready_to_submit";
    const now = Date.now();
    await ctx.db.patch("applications", args.applicationId, {
      state: "complete",
      outcome,
      evidenceScore,
      actionScore,
      readinessScore: evidenceScore + actionScore,
      completedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const failAnalysis = mutation({
  args: {
    applicationId: v.id("applications"),
    stage: v.union(
      v.literal("requirement_compiler"),
      v.literal("eligibility_mapper"),
    ),
    errorCode: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAnalysisService(ctx);
    await requireOwnedApplication(ctx, args.applicationId);
    const stage = await requireStage(ctx, args.applicationId, args.stage);
    const now = Date.now();
    if (stage.status !== "complete") {
      await ctx.db.patch("analysisStages", stage._id, {
        status: "failed",
        errorCode: args.errorCode,
        completedAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.patch("applications", args.applicationId, {
      state: "failed",
      outcome: "failed",
      errorCode: args.errorCode,
      updatedAt: now,
    });
    return null;
  },
});
