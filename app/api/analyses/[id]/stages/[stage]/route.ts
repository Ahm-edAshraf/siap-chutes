import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  listApprovedTeeModels,
  runStructuredStage,
} from "@/lib/analysis/chutes-client";
import {
  isEvidenceClaimGrounded,
  claimMatchesSubject,
  evidencePageMatchesSubject,
  isSupportingDocument,
} from "@/lib/analysis/evidence-claims";
import { verifiedCitation } from "@/lib/analysis/citations";
import {
  rankModelsByPerformance,
  stageModelCandidates,
  type ModelPerformance,
} from "@/lib/analysis/model-selection";
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
  type PlannerAgentOutput,
  type ReviewerOutput,
  type StageName,
} from "@/lib/analysis/schemas";
import { selectStageDocuments } from "@/lib/analysis/stage-payload";
import { canonicalizeCompilerOutput } from "@/lib/analysis/stable-output";
import { validateExtractedDocuments } from "@/lib/analysis/limits";
import { mintConvexToken } from "@/lib/auth/jwt";
import { hasValidOrigin } from "@/lib/auth/origin";
import { getValidChutesSession } from "@/lib/auth/session";

export const maxDuration = 100;

const STAGE_BUDGET_MS = 88_000;
const CATALOG_BUDGET_MS = 8_000;
const REQUIRED_HEDGE_DELAY_MS: Partial<Record<StageName, number>> = {
  requirement_compiler: 45_000,
  eligibility_mapper: 35_000,
};

const MAX_TOKENS: Record<StageName, number> = {
  requirement_compiler: 2_400,
  eligibility_mapper: 2_400,
  red_team_reviewer: 1_800,
  action_planner: 500,
};

type StageOutputByName = {
  requirement_compiler: CompilerOutput;
  eligibility_mapper: MapperOutput;
  red_team_reviewer: ReviewerOutput;
  action_planner: PlannerAgentOutput;
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
    "EMPTY_STAGE_PAYLOAD",
  ];
  if (allowed.includes(message)) return message;
  if (message.startsWith("CHUTES_MODEL_CATALOG_")) return message;
  if (message.startsWith("CHUTES_COMPLETION_")) return message;
  return "ANALYSIS_STAGE_FAILED";
}

function promptContext(context: Awaited<ReturnType<ConvexHttpClient["query"]>>) {
  const typed = context as {
    application: { sourceFileName: string };
    profile: {
      name: string;
      citizenship: string;
      dateOfBirth: string;
      institution: string;
      course: string;
      studyLevel: string;
      householdIncome: number;
      documentFlags: Record<string, boolean>;
    };
  };
  return {
    sourceFileName: typed.application.sourceFileName,
    applicant: {
      name: typed.profile.name,
      citizenship: typed.profile.citizenship,
      dateOfBirth: typed.profile.dateOfBirth,
      institution: typed.profile.institution,
      course: typed.profile.course,
      studyLevel: typed.profile.studyLevel,
      householdIncome: typed.profile.householdIncome,
      documentFlags: typed.profile.documentFlags,
    },
  };
}

async function persistStageOutput<T extends StageName>({
  convex,
  applicationId,
  stage,
  run,
  output,
  documents,
  context,
}: {
  convex: ConvexHttpClient;
  applicationId: Id<"applications">;
  stage: T;
  run: { generation: number; attempt: number };
  output: StageOutputByName[T];
  documents: ReturnType<typeof stageRequestSchema.parse>["documents"];
  context: Awaited<ReturnType<ConvexHttpClient["query"]>>;
}) {
  if (stage === "requirement_compiler") {
    const compiler = canonicalizeCompilerOutput(output as CompilerOutput);
    await convex.mutation(api.analysis.applyRequirementCompiler, {
      applicationId,
      ...run,
      promptVersion: PROMPT_VERSION,
      programme: compiler.programme,
      requirements: compiler.requirements.map((requirement) => ({
        ...requirement,
        citation: verifiedCitation(documents, requirement.citation),
      })),
    });
    return;
  }

  if (stage === "eligibility_mapper") {
    const mapper = output as MapperOutput;
    const typedContext = context as {
      application: { sourceFileName: string };
      profile: { name: string };
    };
    await convex.mutation(api.analysis.saveMapperCandidates, {
      applicationId,
      ...run,
      mappings: mapper.mappings.map((mapping) => {
        const citation = verifiedCitation(documents, mapping.citation);
        const citedDocument = documents.find(
          (document) => document.name === mapping.citation.documentName,
        );
        const citedPageText =
          mapping.citation.pageNumber === undefined
            ? citedDocument?.pages.map((page) => page.text).join("\n")
            : citedDocument?.pages.find(
                (page) => page.pageNumber === mapping.citation.pageNumber,
              )?.text;
        const claimValidated =
          mapping.claim !== undefined &&
          citation.verified &&
          isEvidenceClaimGrounded(mapping.claim, mapping.citation.quote) &&
          claimMatchesSubject(
            mapping.claim,
            typedContext.profile.name,
            citedPageText,
          );
        return {
          requirementKey: mapping.requirementKey,
          requirementLabel: mapping.requirementLabel,
          proposedState: mapping.proposedState,
          citation,
          citationIsSupporting: isSupportingDocument(
            typedContext.application.sourceFileName,
            mapping.citation.documentName,
          ),
          citationSubjectValidated: evidencePageMatchesSubject(
            typedContext.profile.name,
            citedPageText,
          ),
          claimValidated,
          claim: mapping.claim,
        };
      }),
    });
    return;
  }

  if (stage === "red_team_reviewer") {
    const reviewer = output as ReviewerOutput;
    await convex.mutation(api.analysis.saveReviewerCandidates, {
      applicationId,
      ...run,
      reviews: reviewer.reviews.map(
        ({
          requirementKey,
          requirementLabel,
          state,
          evidenceVerdict,
        }) => ({
          requirementKey,
          requirementLabel,
          state,
          evidenceVerdict,
        }),
      ),
    });
    return;
  }

  const planner = output as PlannerAgentOutput;
  await convex.mutation(api.analysis.savePlannerCandidate, {
    applicationId,
    ...run,
    recommendation: planner.recommendation,
    priorityRequirementKeys: planner.priorityRequirementKeys,
  });
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{ id: string; stage: string }>;
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
  const parsedStage = stageNameSchema.safeParse(params.stage);
  if (!parsedStage.success) {
    return NextResponse.json({ error: "Unknown analysis stage" }, { status: 404 });
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
  const stageStartedAt = Date.now();
  const deadlineAt = Math.min(
    stageStartedAt + STAGE_BUDGET_MS,
    Math.max(stageStartedAt + 1_000, requestData.deadlineAt ?? Infinity),
  );
  let run: { generation: number; attempt: number } | undefined;

  try {
    const begin = await convex.mutation(api.analysis.beginStage, {
      applicationId,
      stage,
    });
    run = { generation: begin.generation, attempt: begin.attempt };
    if (
      begin.status === "already_complete" ||
      begin.status === "already_ready"
    ) {
      return NextResponse.json({ ok: true, idempotent: true, stage });
    }
    if (begin.status === "already_running") {
      return NextResponse.json(
        { ok: true, running: true, stage },
        { status: 202 },
      );
    }

    const analysisContext = await convex.query(api.analysis.getContext, {
      applicationId,
    });
    const documents = selectStageDocuments(stage, requestData.documents);
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

    const candidates = stageModelCandidates(stage);
    const [performance, approved] = await Promise.all([
      convex.query(api.analysis.getModelPerformance, {
        stage,
        models: candidates,
      }) as Promise<ModelPerformance[]>,
      listApprovedTeeModels(getAccessToken, {
        deadlineAt: Math.min(deadlineAt, Date.now() + CATALOG_BUDGET_MS),
        requestTimeoutMs: CATALOG_BUDGET_MS,
      }),
    ]);
    const approvedSet = new Set(approved);
    const models = rankModelsByPerformance(candidates, performance)
      .filter((model) => approvedSet.has(model))
      .slice(
        0,
        stage === "requirement_compiler" ||
          stage === "eligibility_mapper"
          ? 2
          : 1,
      );
    if (models.length === 0) throw new Error("NO_APPROVED_TEE_MODEL");
    if (!run) throw new Error("STALE_ANALYSIS_RUN");
    const activeRun = run;

    const prompt = buildPrompt(
      stage,
      documents,
      promptContext(analysisContext),
    );
    type Winner = {
      model: string;
      modelAttempt: number;
      durationMs: number;
      result: Awaited<
        ReturnType<
          typeof runStructuredStage<StageOutputByName[typeof stage]>
        >
      >;
    };
    let winner: Winner | undefined;
    let lastError: unknown = new Error("ANALYSIS_STAGE_FAILED");
    let winnerSelected = false;
    const controllers = models.map(() => new AbortController());
    const runModel = async (modelAttempt: number): Promise<Winner> => {
      const model = models[modelAttempt];
      const modelStartedAt = Date.now();
      try {
        const result = await runStructuredStage<StageOutputByName[typeof stage]>(
          model,
          prompt,
          outputSchemas[stage] as unknown as ZodType<
            StageOutputByName[typeof stage]
          >,
          OUTPUT_FORMATS[stage],
          getAccessToken,
          {
            deadlineAt,
            requestTimeoutMs: Math.max(1, deadlineAt - Date.now()),
            maxTokens: MAX_TOKENS[stage],
            repairMalformed: true,
            signal: controllers[modelAttempt].signal,
          },
        );
        return {
          model,
          modelAttempt,
          durationMs: Date.now() - modelStartedAt,
          result,
        };
      } catch (error) {
        const cancelledByWinner =
          winnerSelected && controllers[modelAttempt].signal.aborted;
        if (!cancelledByWinner) {
          lastError = error;
          await refreshConvexAuth();
          await convex.mutation(api.analysis.recordModelAttemptFailure, {
            applicationId,
            stage,
            ...activeRun,
            modelAttempt,
            model,
            confidentialCompute: true,
            durationMs: Date.now() - modelStartedAt,
            errorCode: errorCode(error),
            promptVersion: PROMPT_VERSION,
          });
        }
        throw error;
      }
    };

    const attempts: Array<Promise<Winner>> = [runModel(0)];
    if (models.length === 1) {
      winner = await attempts[0];
    } else {
      let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
      const hedgeDelay =
        REQUIRED_HEDGE_DELAY_MS[stage] ?? REQUIRED_HEDGE_DELAY_MS.eligibility_mapper!;
      const firstResult = await Promise.race([
        attempts[0].then(
          (value) => ({ kind: "winner" as const, value }),
          () => ({ kind: "failed" as const }),
        ),
        new Promise<{ kind: "hedge" }>((resolve) => {
          hedgeTimer = setTimeout(() => resolve({ kind: "hedge" }), hedgeDelay);
        }),
      ]);
      if (hedgeTimer !== undefined) clearTimeout(hedgeTimer);
      if (firstResult.kind === "winner") {
        winner = firstResult.value;
      } else {
        attempts.push(runModel(1));
        try {
          winner = await Promise.any(attempts);
        } catch {
          throw lastError;
        }
      }
    }
    if (!winner) throw lastError;
    winnerSelected = true;
    controllers.forEach((controller, modelAttempt) => {
      if (modelAttempt !== winner?.modelAttempt) controller.abort();
    });
    await Promise.allSettled(attempts);
    await refreshConvexAuth();
    await persistStageOutput({
      convex,
      applicationId,
      stage,
      run: activeRun,
      output: winner.result.data,
      documents,
      context: analysisContext,
    });
    await convex.mutation(api.analysis.markAgentReady, {
      applicationId,
      stage,
      ...activeRun,
      model: winner.model,
      confidentialCompute: true,
      durationMs: winner.durationMs,
      inputTokens: winner.result.usage.inputTokens,
      outputTokens: winner.result.usage.outputTokens,
      promptVersion: PROMPT_VERSION,
      modelAttempt: winner.modelAttempt,
      fallbackUsed: winner.modelAttempt > 0,
    });
    return NextResponse.json({
      ok: true,
      stage,
      model: winner.model,
      fallbackUsed: winner.modelAttempt > 0,
      durationMs: Date.now() - stageStartedAt,
    });
  } catch (error) {
    const code = errorCode(error);
    if (run) {
      try {
        await refreshConvexAuth();
        await convex.mutation(api.analysis.markStageRetryableFailure, {
          applicationId,
          stage,
          ...run,
          errorCode: code,
        });
      } catch {
        // Preserve the original bounded failure response.
      }
    }
    return NextResponse.json(
      { error: code, stage, durationMs: Date.now() - stageStartedAt },
      { status: 502 },
    );
  }
}
