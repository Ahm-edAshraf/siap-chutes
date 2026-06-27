import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  runStructuredStage,
  selectTeeModel,
} from "@/lib/analysis/chutes-client";
import { verifiedCitation } from "@/lib/analysis/citations";
import {
  evaluateCondition,
  resolveRequirementState,
} from "@/lib/analysis/deterministic";
import { validateActionDag } from "@/lib/analysis/dag";
import { assertExactRequirementCoverage } from "@/lib/analysis/coverage";
import { validateExtractedDocuments } from "@/lib/analysis/limits";
import {
  buildPrompt,
  OUTPUT_FORMATS,
  PROMPT_VERSION,
} from "@/lib/analysis/prompt";
import {
  outputSchemas,
  stageNameSchema,
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
  ];
  if (allowed.includes(message)) return message;
  if (message.startsWith("CHUTES_MODEL_CATALOG_")) return message;
  if (message.startsWith("CHUTES_COMPLETION_")) return message;
  if (message.includes("sequentially")) return "INVALID_STAGE_ORDER";
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
          key: string;
          mandatory: boolean;
        }
      >;
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
        const citation = verifiedCitation(documents, mapping.citation);
        const deterministicResult = evaluateCondition(
          requirement,
          typedContext.profile,
          availableDocumentNames,
        );
        const groundedCitation =
          deterministicResult === null
            ? citation
            : { ...citation, matchKind: "deterministic" as const };
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
      reviews: value.reviews,
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
  context: RouteContext<"/api/analyses/[id]/stages/[stage]">,
) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  let session = await getValidChutesSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const params = await context.params;
  const parsedStage = stageNameSchema.safeParse(params.stage);
  if (!parsedStage.success) {
    return NextResponse.json({ error: "Unknown stage" }, { status: 404 });
  }
  const stage = parsedStage.data;

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
  const startedAt = Date.now();
  let selectedModel: string | undefined;
  let began = false;
  let run: { generation: number; attempt: number } | undefined;

  try {
    const begin = await convex.mutation(api.analysis.beginStage, {
      applicationId,
      stage,
    });
    if (begin.status === "already_complete") {
      return NextResponse.json({ ok: true, stage, idempotent: true });
    }
    if (begin.status === "already_running") {
      return NextResponse.json(
        { ok: true, stage, idempotent: true, running: true },
        { status: 202 },
      );
    }
    began = true;
    run = { generation: begin.generation, attempt: begin.attempt };
    const analysisContext = await convex.query(api.analysis.getContext, {
      applicationId,
    });
    const getAccessToken = async (forceRefresh: boolean) => {
      if (forceRefresh) {
        session = await getValidChutesSession(true);
      }
      return session?.accessToken ?? null;
    };
    const primaryModel =
      process.env.CHUTES_PRIMARY_MODEL ?? "google/gemma-4-31B-turbo-TEE";
    const requestedModel =
      stage === "red_team_reviewer"
        ? (process.env.CHUTES_REVIEW_MODEL ?? "deepseek-ai/DeepSeek-V3.2-TEE")
        : primaryModel;
    const previousModels = (
      analysisContext.modelRuns as Array<{ stage: string; model: string }>
    )
      .filter((run) =>
        stage === "red_team_reviewer"
          ? run.stage !== "red_team_reviewer"
          : false,
      )
      .map((run) => run.model);
    selectedModel = await selectTeeModel(
      requestedModel,
      getAccessToken,
      stage === "red_team_reviewer" ? previousModels : [],
    );
    const prompt = buildPrompt(stage, requestData.documents, {
      application: analysisContext.application,
      profile: analysisContext.profile,
      requirements: analysisContext.requirements,
      evidence: analysisContext.evidence,
    });
    type StageOutput =
      | CompilerOutput
      | MapperOutput
      | ReviewerOutput
      | PlannerOutput;
    const result = await runStructuredStage<StageOutput>(
      selectedModel,
      prompt,
      outputSchemas[stage] as ZodType<StageOutput>,
      OUTPUT_FORMATS[stage],
      getAccessToken,
    );
    await refreshConvexAuth();
    await applyStageOutput(
      convex,
      applicationId,
      stage,
      run,
      result.data,
      analysisContext,
      requestData.documents,
    );
    await refreshConvexAuth();
    await convex.mutation(api.analysis.finishStage, {
      applicationId,
      stage,
      ...run,
      model: selectedModel,
      confidentialCompute: true,
      durationMs: Date.now() - startedAt,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      promptVersion: PROMPT_VERSION,
    });
    return NextResponse.json({ ok: true, stage });
  } catch (error) {
    const code = errorCode(error);
    try {
      if (!began || !run) throw error;
      await refreshConvexAuth();
      await convex.mutation(api.analysis.failStage, {
        applicationId,
        stage,
        ...run,
        errorCode: code,
        model: selectedModel,
        confidentialCompute: selectedModel ? true : undefined,
        durationMs: Date.now() - startedAt,
        promptVersion: PROMPT_VERSION,
      });
    } catch {
      // Preserve the original failure response if persistence is unavailable.
    }
    return NextResponse.json({ error: code }, { status: 502 });
  }
}
