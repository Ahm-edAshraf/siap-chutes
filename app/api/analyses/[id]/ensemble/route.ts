import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { evaluateCondition } from "@/lib/analysis/deterministic";
import { resolveEvidenceConsensus } from "@/lib/analysis/evidence-claims";
import {
  reconcileRequirementCoverage,
} from "@/lib/analysis/reconcile";
import { buildStablePlan } from "@/lib/analysis/stable-output";
import type {
  MapperOutput,
  ReviewerOutput,
  StageName,
} from "@/lib/analysis/schemas";
import { validateActionDag } from "@/lib/analysis/dag";
import { PROMPT_VERSION } from "@/lib/analysis/prompt";
import { mintConvexToken } from "@/lib/auth/jwt";
import { hasValidOrigin } from "@/lib/auth/origin";
import { getValidChutesSession } from "@/lib/auth/session";

export const maxDuration = 30;

const finalizeRequest = z.object({
  documentNames: z.array(z.string().min(1).max(255)).min(1).max(6),
});

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

type Progress = {
  application: {
    state:
      | "draft"
      | "reading_requirements"
      | "checking_eligibility"
      | "challenging_assumptions"
      | "building_plan"
      | "complete"
      | "failed";
  };
  stages: Array<{
    stage: StageName;
    status: "pending" | "running" | "complete" | "failed";
    generation?: number;
    attempt: number;
    readyAt?: number;
    errorCode?: string;
  }>;
  modelRuns: Array<{
    stage: StageName;
    model: string;
    confidentialCompute: boolean;
    durationMs: number;
    inputTokens?: number;
    outputTokens?: number;
    promptVersion: string;
    outcome: "success" | "failed";
    generation?: number;
    attempt?: number;
  }>;
};

function runIdentity(progress: Progress, stageName: StageName) {
  const stage = progress.stages.find((candidate) => candidate.stage === stageName);
  if (!stage) throw new Error("ANALYSIS_STAGES_INCOMPLETE");
  return {
    stage,
    run: {
      generation: stage.generation ?? 0,
      attempt: stage.attempt,
    },
  };
}

function successfulModelRun(progress: Progress, stageName: StageName) {
  const { stage, run } = runIdentity(progress, stageName);
  const modelRun = [...progress.modelRuns]
    .reverse()
    .find(
      (candidate) =>
        candidate.stage === stageName &&
        candidate.outcome === "success" &&
        (candidate.generation === undefined ||
          candidate.generation === run.generation) &&
        (candidate.attempt === undefined ||
          candidate.attempt === run.attempt),
    );
  if (!modelRun || stage.readyAt === undefined) {
    throw new Error("ANALYSIS_STAGE_RESULT_MISSING");
  }
  return { stage, run, modelRun };
}

async function finishReadyStage(
  convex: ConvexHttpClient,
  applicationId: Id<"applications">,
  progress: Progress,
  stageName: StageName,
) {
  const { run, modelRun } = successfulModelRun(progress, stageName);
  await convex.mutation(api.analysis.finishStage, {
    applicationId,
    stage: stageName,
    ...run,
    model: modelRun.model,
    confidentialCompute: modelRun.confidentialCompute,
    durationMs: modelRun.durationMs,
    inputTokens: modelRun.inputTokens,
    outputTokens: modelRun.outputTokens,
    promptVersion: modelRun.promptVersion,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const session = await getValidChutesSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  let requestData: z.infer<typeof finalizeRequest>;
  try {
    requestData = finalizeRequest.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid finalization payload" },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const applicationId = id as Id<"applications">;
  const convex = new ConvexHttpClient(required("NEXT_PUBLIC_CONVEX_URL"));
  convex.setAuth(await mintConvexToken(session.user, "analysis_service"));
  const finalizationStartedAt = Date.now();

  try {
    let progress = (await convex.query(api.applications.getProgress, {
      id: applicationId,
    })) as Progress | null;
    if (!progress) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    if (progress.application.state === "complete") {
      return NextResponse.json({ ok: true, idempotent: true, durationMs: 0 });
    }

    for (const requiredStage of [
      "requirement_compiler",
      "eligibility_mapper",
    ] as const) {
      const { stage } = runIdentity(progress, requiredStage);
      if (stage.readyAt !== undefined || stage.status === "complete") continue;
      if (stage.status === "running") {
        return NextResponse.json(
          { error: "ANALYSIS_STAGES_RUNNING", stage: requiredStage },
          { status: 409 },
        );
      }
      await convex.mutation(api.analysis.failAnalysis, {
        applicationId,
        stage: requiredStage,
        errorCode: stage.errorCode ?? "REQUIRED_STAGE_FAILED",
      });
      return NextResponse.json(
        { error: stage.errorCode ?? "REQUIRED_STAGE_FAILED", stage: requiredStage },
        { status: 502 },
      );
    }

    const initialContext = await convex.query(api.analysis.getContext, {
      applicationId,
    });
    if (initialContext.requirements.length === 0) {
      throw new Error("INCOMPLETE_REQUIREMENT_COVERAGE");
    }

    const compiler = runIdentity(progress, "requirement_compiler");
    if (compiler.stage.status !== "complete") {
      await finishReadyStage(
        convex,
        applicationId,
        progress,
        "requirement_compiler",
      );
    }

    const [compiledContext, candidates] = await Promise.all([
      convex.query(api.analysis.getContext, { applicationId }),
      convex.query(api.analysis.getStageCandidates, { applicationId }),
    ]);
    const canonicalRequirements = compiledContext.requirements.map(
      ({ key, label }) => ({ key, label }),
    );
    const mapperIdentity = runIdentity(progress, "eligibility_mapper");
    const mapperRows = candidates.mapper.filter(
      (candidate) =>
        candidate.generation === mapperIdentity.run.generation &&
        candidate.attempt === mapperIdentity.run.attempt,
    );
    const compilerEvidence = new Map(
      compiledContext.evidence
        .filter((evidence) => evidence.citationVerified)
        .map((evidence) => [evidence.requirementId, evidence]),
    );
    const mapperOutput: MapperOutput = {
      mappings: reconcileRequirementCoverage(
        canonicalRequirements,
        mapperRows.map((candidate) => ({
          requirementKey: candidate.requirementKey,
          requirementLabel: candidate.requirementLabel,
          proposedState: candidate.proposedState,
          reason: "Validated eligibility mapper conclusion.",
          citation: {
            documentName: candidate.citation.documentName,
            pageNumber: candidate.citation.pageNumber,
            quote: candidate.citation.excerpt,
            confidence: candidate.citation.confidence,
          },
          claim: candidate.claim,
        })),
        (requirement) => {
          const compiled = compiledContext.requirements.find(
            (candidate) => candidate.key === requirement.key,
          );
          const evidence = compiled
            ? compilerEvidence.get(compiled._id)
            : undefined;
          if (!compiled || !evidence) {
            throw new Error("INCOMPLETE_REQUIREMENT_COVERAGE");
          }
          return {
            requirementKey: requirement.key,
            requirementLabel: requirement.label,
            proposedState: "needs_verification" as const,
            reason: "No matching normalized mapper conclusion was available.",
            citation: {
              documentName: evidence.documentName,
              pageNumber: evidence.pageNumber,
              quote: evidence.excerpt,
              confidence: evidence.confidence,
            },
            claim: undefined,
          };
        },
      ),
    };

    const reviewerIdentity = runIdentity(progress, "red_team_reviewer");
    const reviewerReady =
      reviewerIdentity.stage.readyAt !== undefined ||
      reviewerIdentity.stage.status === "complete";
    const reviewerRows = reviewerReady
      ? candidates.reviewer.filter(
          (candidate) =>
            candidate.generation === reviewerIdentity.run.generation &&
            candidate.attempt === reviewerIdentity.run.attempt,
        )
      : [];
    const reviewerOutput: ReviewerOutput = {
      reviews: reconcileRequirementCoverage(
        canonicalRequirements,
        reviewerRows.map((candidate) => ({
          requirementKey: candidate.requirementKey,
          requirementLabel: candidate.requirementLabel,
          state: candidate.state,
          evidenceVerdict: candidate.evidenceVerdict,
          reason: "Independent reviewer conclusion.",
        })),
        (requirement) => ({
          requirementKey: requirement.key,
          requirementLabel: requirement.label,
          state: "needs_verification" as const,
          evidenceVerdict: "unclear" as const,
          reason: "Independent review was unavailable within the time budget.",
        }),
      ),
    };
    const reviewByKey = new Map(
      reviewerOutput.reviews.map((review) => [review.requirementKey, review]),
    );
    const mapperCandidateByKey = new Map(
      mapperRows.map((candidate) => [candidate.requirementKey, candidate]),
    );
    const availableDocumentNames = requestData.documentNames;
    const profile = compiledContext.profile;
    const requirementByKey = new Map(
      compiledContext.requirements.map((requirement) => [
        requirement.key,
        requirement,
      ]),
    );
    const mappings = mapperOutput.mappings.map((mapping) => {
      const requirement = requirementByKey.get(mapping.requirementKey);
      if (!requirement) {
        throw new Error("INCOMPLETE_REQUIREMENT_COVERAGE");
      }
      const candidate = mapperCandidateByKey.get(mapping.requirementKey);
      const profileResult = evaluateCondition(
        requirement,
        profile,
        availableDocumentNames,
      );
      const sourceEvidence = compilerEvidence.get(requirement._id);
      const candidateCitation = candidate?.citation;
      const resolution = resolveEvidenceConsensus({
        requirement,
        mapping,
        review: reviewerReady
          ? reviewByKey.get(mapping.requirementKey)
          : undefined,
        profileResult,
        citationVerified:
          profileResult === null
            ? (candidateCitation?.verified ?? false)
            : (sourceEvidence?.citationVerified ??
              candidateCitation?.verified ??
              false),
        citationIsSupporting: candidate?.citationIsSupporting ?? false,
        citationSubjectValidated:
          candidate?.citationSubjectValidated ?? false,
        claimValidated: candidate?.claimValidated ?? false,
      });
      const groundedCitation =
        resolution.usedSupportingEvidence || profileResult === null
          ? candidateCitation
          : sourceEvidence
            ? {
                documentName: sourceEvidence.documentName,
                pageNumber: sourceEvidence.pageNumber,
                excerpt: sourceEvidence.excerpt,
                confidence: sourceEvidence.confidence,
                verified: sourceEvidence.citationVerified,
                matchKind: "deterministic" as const,
              }
            : candidateCitation;
      if (!groundedCitation) {
        throw new Error("INCOMPLETE_REQUIREMENT_COVERAGE");
      }
      return {
        requirementKey: mapping.requirementKey,
        state: resolution.state,
        deterministicResult: resolution.deterministicResult,
        citation: groundedCitation,
      };
    });
    await convex.mutation(api.analysis.applyEligibilityMapper, {
      applicationId,
      ...mapperIdentity.run,
      mappings,
    });
    await finishReadyStage(
      convex,
      applicationId,
      progress,
      "eligibility_mapper",
    );

    const mappedContext = await convex.query(api.analysis.getContext, {
      applicationId,
    });
    const mappedStates = new Map(
      mappedContext.requirements.map((requirement) => [
        requirement.key,
        requirement.state,
      ]),
    );
    if (reviewerReady && reviewerIdentity.stage.status !== "complete") {
      await convex.mutation(api.analysis.applyRedTeamReviewer, {
        applicationId,
        ...reviewerIdentity.run,
        reviews: reviewerOutput.reviews.map((review) => ({
          requirementKey: review.requirementKey,
          state:
            mappedStates.get(review.requirementKey) ?? "needs_verification",
          reason: review.reason,
        })),
      });
      await finishReadyStage(
        convex,
        applicationId,
        progress,
        "red_team_reviewer",
      );
    } else if (!reviewerReady) {
      await convex.mutation(api.analysis.finishOptionalStageWithFallback, {
        applicationId,
        stage: "red_team_reviewer",
        ...reviewerIdentity.run,
        errorCode:
          reviewerIdentity.stage.errorCode ?? "OPTIONAL_STAGE_DEADLINE",
      });
    }

    const reviewedContext = await convex.query(api.analysis.getContext, {
      applicationId,
    });
    const plannerIdentity = runIdentity(progress, "action_planner");
    const plannerReady =
      plannerIdentity.stage.readyAt !== undefined ||
      plannerIdentity.stage.status === "complete";
    const plannerOutput = buildStablePlan(
      reviewedContext.requirements,
      reviewedContext.application.deadline,
    );
    validateActionDag(plannerOutput.actions);
    await convex.mutation(api.analysis.applyActionPlanner, {
      applicationId,
      ...plannerIdentity.run,
      missingDocuments: plannerOutput.missingDocuments,
      actions: plannerOutput.actions,
    });
    if (plannerReady && plannerIdentity.stage.status !== "complete") {
      await finishReadyStage(
        convex,
        applicationId,
        progress,
        "action_planner",
      );
    } else if (!plannerReady) {
      await convex.mutation(api.analysis.finishOptionalStageWithFallback, {
        applicationId,
        stage: "action_planner",
        ...plannerIdentity.run,
        errorCode: plannerIdentity.stage.errorCode ?? "DETERMINISTIC_PLAN_USED",
      });
    }
    await convex.mutation(api.analysis.completeAnalysis, { applicationId });

    progress = (await convex.query(api.applications.getProgress, {
      id: applicationId,
    })) as Progress;
    return NextResponse.json({
      ok: progress.application.state === "complete",
      durationMs: Date.now() - finalizationStartedAt,
      degradedStages: progress.stages
        .filter(
          (stage) =>
            stage.status === "complete" &&
            stage.errorCode !== undefined,
        )
        .map((stage) => stage.stage),
      promptVersion: PROMPT_VERSION,
    });
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "ANALYSIS_FINALIZATION_FAILED";
    return NextResponse.json({ error: code }, { status: 502 });
  }
}
