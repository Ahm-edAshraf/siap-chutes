import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  runStructuredStage,
  selectDistinctTeeModels,
} from "@/lib/analysis/chutes-client";
import { verifiedCitation } from "@/lib/analysis/citations";
import { runConcurrently } from "@/lib/analysis/concurrency";
import {
  evaluateCondition,
  resolveRequirementState,
} from "@/lib/analysis/deterministic";
import { validateActionDag } from "@/lib/analysis/dag";
import { assertExactRequirementCoverage } from "@/lib/analysis/coverage";
import { validateExtractedDocuments } from "@/lib/analysis/limits";
import {
  reconcileRequirementCoverage,
} from "@/lib/analysis/reconcile";
import {
  buildStablePlan,
  canonicalizeCompilerOutput,
} from "@/lib/analysis/stable-output";
import {
  buildPrompt,
  OUTPUT_FORMATS,
  PROMPT_VERSION,
} from "@/lib/analysis/prompt";
import {
  outputSchemas,
  stageRequestSchema,
  type CompilerOutput,
  type MapperOutput,
  type PlannerOutput,
  type ReviewerOutput,
  type StageName,
} from "@/lib/analysis/schemas";
import { mintConvexToken } from "@/lib/auth/jwt";
import { hasValidOrigin } from "@/lib/auth/origin";
import { getValidChutesSession } from "@/lib/auth/session";

export const maxDuration = 300;

const MAX_TOKENS: Record<StageName, number> = {
  requirement_compiler: 3_000,
  eligibility_mapper: 6_000,
  red_team_reviewer: 6_000,
  action_planner: 3_000,
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const allowed = [
    "CHUTES_AUTH_REQUIRED",
    "NO_APPROVED_TEE_MODEL",
    "MALFORMED_MODEL_OUTPUT",
    "INCOMPLETE_REQUIREMENT_COVERAGE",
    "CHUTES_STAGE_TIMEOUT",
  ];
  if (allowed.includes(message)) return message;
  if (message.startsWith("CHUTES_MODEL_CATALOG_")) return message;
  if (message.startsWith("CHUTES_COMPLETION_")) return message;
  if (message.includes("cycle")) return "INVALID_ACTION_DEPENDENCIES";
  return "ANALYSIS_STAGE_FAILED";
}

async function applyStageOutput(
  convex: ConvexHttpClient,
  applicationId: Id<"applications">,
  stage: StageName,
  run: { generation: number; attempt: number },
  output: CompilerOutput | MapperOutput | ReviewerOutput | PlannerOutput,
  context: Awaited<ReturnType<ConvexHttpClient["query"]>>,
  documents: ReturnType<typeof stageRequestSchema.parse>["documents"],
) {
  if (stage === "requirement_compiler") {
    const value = output as CompilerOutput;
    await convex.mutation(api.analysis.applyRequirementCompiler, {
      applicationId,
      ...run,
      programme: value.programme,
      requirements: value.requirements.map((requirement) => ({
        ...requirement,
        citation: verifiedCitation(documents, requirement.citation),
      })),
    });
    return;
  }

  if (stage === "eligibility_mapper") {
    const value = output as MapperOutput;
    const typedContext = context as {
      profile: Parameters<typeof evaluateCondition>[1];
      requirements: Array<
        Parameters<typeof evaluateCondition>[0] & {
          _id: string;
          key: string;
          mandatory: boolean;
        }
      >;
      evidence: Array<{
        requirementId: string;
        documentName: string;
        pageNumber?: number;
        excerpt: string;
        confidence: "high" | "medium" | "low";
        citationVerified: boolean;
        matchKind: "document" | "profile" | "deterministic" | "none";
      }>;
    };
    const byKey = new Map(
      typedContext.requirements.map((requirement) => [
        requirement.key,
        requirement,
      ]),
    );
    assertExactRequirementCoverage(
      typedContext.requirements.map((requirement) => requirement.key),
      value.mappings.map((mapping) => mapping.requirementKey),
    );
    const availableDocumentNames = documents.map((document) => document.name);
    await convex.mutation(api.analysis.applyEligibilityMapper, {
      applicationId,
      ...run,
      mappings: value.mappings.map((mapping) => {
        const requirement = byKey.get(mapping.requirementKey);
        if (!requirement) {
          throw new Error(`Unknown requirement key: ${mapping.requirementKey}`);
        }
        const mapperCitation = verifiedCitation(documents, mapping.citation);
        const deterministicResult = evaluateCondition(
          requirement,
          typedContext.profile,
          availableDocumentNames,
        );
        const compilerCitation = typedContext.evidence.find(
          (evidence) =>
            evidence.requirementId === requirement._id &&
            evidence.citationVerified,
        );
        const groundedCitation =
          deterministicResult === null
            ? mapperCitation
            : compilerCitation
              ? {
                  documentName: compilerCitation.documentName,
                  pageNumber: compilerCitation.pageNumber,
                  excerpt: compilerCitation.excerpt,
                  confidence: compilerCitation.confidence,
                  verified: true,
                  matchKind: "deterministic" as const,
                }
              : {
                  ...mapperCitation,
                  matchKind: "deterministic" as const,
                };
        return {
          requirementKey: mapping.requirementKey,
          state: resolveRequirementState(
            mapping.proposedState,
            deterministicResult,
            requirement.mandatory,
            groundedCitation.verified,
            requirement.kind !== "document" &&
              requirement.conditionType !== "document_present",
          ),
          deterministicResult:
            deterministicResult === null ? undefined : deterministicResult,
          citation: groundedCitation,
        };
      }),
    });
    return;
  }

  if (stage === "red_team_reviewer") {
    const value = output as ReviewerOutput;
    const typedContext = context as {
      requirements: Array<{ key: string }>;
    };
    assertExactRequirementCoverage(
      typedContext.requirements.map((requirement) => requirement.key),
      value.reviews.map((review) => review.requirementKey),
    );
    await convex.mutation(api.analysis.applyRedTeamReviewer, {
      applicationId,
      ...run,
      reviews: value.reviews.map(({ requirementKey, state, reason }) => ({
        requirementKey,
        state,
        reason,
      })),
    });
    return;
  }

  const value = output as PlannerOutput;
  validateActionDag(value.actions);
  await convex.mutation(api.analysis.applyActionPlanner, {
    applicationId,
    ...run,
    missingDocuments: value.missingDocuments,
    actions: value.actions,
  });
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  },
) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  let session = await getValidChutesSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const params = await context.params;

  let requestData: ReturnType<typeof stageRequestSchema.parse>;
  try {
    requestData = stageRequestSchema.parse(await request.json());
    validateExtractedDocuments(requestData.documents);
  } catch {
    return NextResponse.json(
      { error: "Invalid or oversized document payload" },
      { status: 400 },
    );
  }

  const applicationId = params.id as Id<"applications">;
  const convex = new ConvexHttpClient(required("NEXT_PUBLIC_CONVEX_URL"));
  const serviceUser = session.user;
  const refreshConvexAuth = async () => {
    convex.setAuth(await mintConvexToken(serviceUser, "analysis_service"));
  };
  await refreshConvexAuth();
  const ensembleStartedAt = Date.now();
  let began = false;

  try {
    const begin = await convex.mutation(api.analysis.beginEnsemble, {
      applicationId,
    });
    if (begin.status === "already_complete") {
      return NextResponse.json({ ok: true, idempotent: true });
    }
    if (begin.status === "already_running") {
      return NextResponse.json(
        { ok: true, idempotent: true, running: true },
        { status: 202 },
      );
    }
    began = true;
    const runs = new Map(
      begin.runs.map((run) => [
        run.stage,
        { generation: begin.generation, attempt: run.attempt },
      ]),
    );
    const analysisContext = await convex.query(api.analysis.getContext, {
      applicationId,
    });
    let refreshPromise: ReturnType<typeof getValidChutesSession> | undefined;
    const getAccessToken = async (forceRefresh: boolean) => {
      if (forceRefresh) {
        refreshPromise ??= getValidChutesSession(true).finally(() => {
          refreshPromise = undefined;
        });
        session = await refreshPromise;
      }
      return session?.accessToken ?? null;
    };
    const primaryModel =
      process.env.CHUTES_PRIMARY_MODEL ?? "google/gemma-4-31B-turbo-TEE";
    const chutesOptions = { deadlineAt: Date.now() + 270_000 };
    const models = await selectDistinctTeeModels(
      [
        { key: "requirement_compiler", requestedModel: primaryModel },
        {
          key: "eligibility_mapper",
          requestedModel:
            process.env.CHUTES_MAPPER_MODEL ?? "Qwen/Qwen3.6-27B-TEE",
        },
        {
          key: "red_team_reviewer",
          requestedModel:
            process.env.CHUTES_REVIEW_MODEL ?? "deepseek-ai/DeepSeek-V3.2-TEE",
        },
        {
          key: "action_planner",
          requestedModel:
            process.env.CHUTES_PLANNER_MODEL ?? "MiniMaxAI/MiniMax-M2.5-TEE",
        },
      ] as const,
      getAccessToken,
      chutesOptions,
    );
    const promptContext = {
      application: analysisContext.application,
      profile: analysisContext.profile,
    };
    type StageOutputByName = {
      requirement_compiler: CompilerOutput;
      eligibility_mapper: MapperOutput;
      red_team_reviewer: ReviewerOutput;
      action_planner: PlannerOutput;
    };
    const runAgent = async <T extends StageName>(stage: T) => {
      const run = runs.get(stage);
      if (!run) throw new Error("STALE_ANALYSIS_RUN");
      const startedAt = Date.now();
      try {
        const result = await runStructuredStage<StageOutputByName[T]>(
          models[stage],
          buildPrompt(stage, requestData.documents, promptContext),
          outputSchemas[stage] as unknown as ZodType<StageOutputByName[T]>,
          OUTPUT_FORMATS[stage],
          getAccessToken,
          { ...chutesOptions, maxTokens: MAX_TOKENS[stage] },
        );
        const durationMs = Date.now() - startedAt;
        await convex.mutation(api.analysis.markAgentReady, {
          applicationId,
          stage,
          ...run,
          model: models[stage],
          confidentialCompute: true,
          durationMs,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          promptVersion: PROMPT_VERSION,
        });
        return {
          ok: true as const,
          stage,
          run,
          model: models[stage],
          durationMs,
          result,
        };
      } catch (error) {
        return {
          ok: false as const,
          stage,
          run,
          model: models[stage],
          durationMs: Date.now() - startedAt,
          error,
        };
      }
    };
    const [compiler, mapper, reviewer, planner] = await runConcurrently([
      () => runAgent("requirement_compiler"),
      () => runAgent("eligibility_mapper"),
      () => runAgent("red_team_reviewer"),
      () => runAgent("action_planner"),
    ]);
    const settled = [compiler, mapper, reviewer, planner];
    const failed = settled.find((result) => !result.ok);
    if (failed) {
      const code = errorCode(failed.error);
      await refreshConvexAuth();
      await convex.mutation(api.analysis.failStage, {
        applicationId,
        stage: failed.stage,
        ...failed.run,
        errorCode: code,
        model: failed.model,
        confidentialCompute: true,
        durationMs: failed.durationMs,
        promptVersion: PROMPT_VERSION,
      });
      return NextResponse.json({ error: code }, { status: 502 });
    }
    if (!compiler.ok || !mapper.ok || !reviewer.ok || !planner.ok) {
      throw new Error("ANALYSIS_STAGE_FAILED");
    }

    const compilerOutput = canonicalizeCompilerOutput(
      compiler.result.data as CompilerOutput,
    );
    await refreshConvexAuth();
    await applyStageOutput(
      convex,
      applicationId,
      "requirement_compiler",
      compiler.run,
      compilerOutput,
      analysisContext,
      requestData.documents,
    );
    await convex.mutation(api.analysis.finishStage, {
      applicationId,
      stage: "requirement_compiler",
      ...compiler.run,
      model: compiler.model,
      confidentialCompute: true,
      durationMs: compiler.durationMs,
      inputTokens: compiler.result.usage.inputTokens,
      outputTokens: compiler.result.usage.outputTokens,
      promptVersion: PROMPT_VERSION,
    });

    const compiledContext = await convex.query(api.analysis.getContext, {
      applicationId,
    });
    const canonicalRequirements = (
      compiledContext.requirements as Array<{ key: string; label: string }>
    ).map(({ key, label }) => ({ key, label }));
    const mapperOutput = mapper.result.data as MapperOutput;
    mapperOutput.mappings = reconcileRequirementCoverage(
      canonicalRequirements,
      mapperOutput.mappings,
      (requirement) => {
        const compiled = compilerOutput.requirements.find(
          (candidate) => candidate.key === requirement.key,
        );
        if (!compiled) throw new Error("INCOMPLETE_REQUIREMENT_COVERAGE");
        return {
          requirementKey: requirement.key,
          requirementLabel: requirement.label,
          proposedState: "needs_verification",
          reason:
            "The independent mapper did not return a matching assessment.",
          citation: compiled.citation,
        };
      },
    );
    await applyStageOutput(
      convex,
      applicationId,
      "eligibility_mapper",
      mapper.run,
      mapperOutput,
      compiledContext,
      requestData.documents,
    );
    await convex.mutation(api.analysis.finishStage, {
      applicationId,
      stage: "eligibility_mapper",
      ...mapper.run,
      model: mapper.model,
      confidentialCompute: true,
      durationMs: mapper.durationMs,
      inputTokens: mapper.result.usage.inputTokens,
      outputTokens: mapper.result.usage.outputTokens,
      promptVersion: PROMPT_VERSION,
    });

    const mappedContext = await convex.query(api.analysis.getContext, {
      applicationId,
    });
    const reviewerOutput = reviewer.result.data as ReviewerOutput;
    reviewerOutput.reviews = reconcileRequirementCoverage(
      canonicalRequirements,
      reviewerOutput.reviews,
      (requirement) => ({
        requirementKey: requirement.key,
        requirementLabel: requirement.label,
        state: "needs_verification",
        reason:
          "The independent reviewer did not return a matching conclusion.",
      }),
    );
    const mappedState = new Map(
      mappedContext.requirements.map((requirement) => [
        requirement.key,
        requirement.state,
      ]),
    );
    reviewerOutput.reviews = reviewerOutput.reviews.map((review) => ({
      ...review,
      state: mappedState.get(review.requirementKey) ?? "needs_verification",
    }));
    await applyStageOutput(
      convex,
      applicationId,
      "red_team_reviewer",
      reviewer.run,
      reviewerOutput,
      mappedContext,
      requestData.documents,
    );
    await convex.mutation(api.analysis.finishStage, {
      applicationId,
      stage: "red_team_reviewer",
      ...reviewer.run,
      model: reviewer.model,
      confidentialCompute: true,
      durationMs: reviewer.durationMs,
      inputTokens: reviewer.result.usage.inputTokens,
      outputTokens: reviewer.result.usage.outputTokens,
      promptVersion: PROMPT_VERSION,
    });

    const reviewedContext = await convex.query(api.analysis.getContext, {
      applicationId,
    });
    const plannerOutput = buildStablePlan(
      reviewedContext.requirements,
      reviewedContext.application.deadline,
    );
    await applyStageOutput(
      convex,
      applicationId,
      "action_planner",
      planner.run,
      plannerOutput,
      reviewedContext,
      requestData.documents,
    );
    await convex.mutation(api.analysis.finishStage, {
      applicationId,
      stage: "action_planner",
      ...planner.run,
      model: planner.model,
      confidentialCompute: true,
      durationMs: planner.durationMs,
      inputTokens: planner.result.usage.inputTokens,
      outputTokens: planner.result.usage.outputTokens,
      promptVersion: PROMPT_VERSION,
    });
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - ensembleStartedAt,
    });
  } catch (error) {
    const code = errorCode(error);
    try {
      if (!began) throw error;
      await refreshConvexAuth();
      const progress = await convex.query(api.applications.getProgress, {
        id: applicationId,
      });
      const running = progress?.stages.find(
        (candidate) => candidate.status === "running",
      );
      if (running) {
        await convex.mutation(api.analysis.failStage, {
          applicationId,
          stage: running.stage,
          generation: running.generation ?? 0,
          attempt: running.attempt,
          errorCode: code,
          durationMs: Date.now() - ensembleStartedAt,
          promptVersion: PROMPT_VERSION,
        });
      }
    } catch {
      // Preserve the original failure response if persistence is unavailable.
    }
    return NextResponse.json({ error: code }, { status: 502 });
  }
}
