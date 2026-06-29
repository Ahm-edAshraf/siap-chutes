import { FALLBACK_MODELS } from "./chutes-client";
import type { StageName } from "./schemas";

export type ModelPerformance = {
  model: string;
  samples: number;
  failures: number;
  failureRate: number;
  p95DurationMs?: number;
};

const DEFAULT_MODELS: Record<StageName, string> = {
  requirement_compiler: "zai-org/GLM-5.1-TEE",
  eligibility_mapper: "moonshotai/Kimi-K2.6-TEE",
  red_team_reviewer: "google/gemma-4-31B-turbo-TEE",
  action_planner: "Qwen/Qwen3-32B-TEE",
};

const ROLE_FALLBACKS: Record<StageName, string[]> = {
  requirement_compiler: [
    "moonshotai/Kimi-K2.6-TEE",
    "google/gemma-4-31B-turbo-TEE",
    "Qwen/Qwen3-32B-TEE",
  ],
  eligibility_mapper: [
    "google/gemma-4-31B-turbo-TEE",
    "zai-org/GLM-5.1-TEE",
    "Qwen/Qwen3-32B-TEE",
  ],
  red_team_reviewer: [
    "Qwen/Qwen3-32B-TEE",
    "moonshotai/Kimi-K2.6-TEE",
    "zai-org/GLM-5.1-TEE",
  ],
  action_planner: [
    "zai-org/GLM-5.1-TEE",
    "google/gemma-4-31B-turbo-TEE",
    "moonshotai/Kimi-K2.6-TEE",
  ],
};

export function configuredStageModel(stage: StageName) {
  if (stage === "requirement_compiler") {
    return process.env.CHUTES_PRIMARY_MODEL ?? DEFAULT_MODELS[stage];
  }
  if (stage === "eligibility_mapper") {
    return process.env.CHUTES_MAPPER_MODEL ?? DEFAULT_MODELS[stage];
  }
  if (stage === "red_team_reviewer") {
    return process.env.CHUTES_REVIEW_MODEL ?? DEFAULT_MODELS[stage];
  }
  return process.env.CHUTES_PLANNER_MODEL ?? DEFAULT_MODELS[stage];
}

export function stageModelCandidates(stage: StageName) {
  return [
    ...new Set([
      configuredStageModel(stage),
      DEFAULT_MODELS[stage],
      ...ROLE_FALLBACKS[stage],
      ...FALLBACK_MODELS,
    ]),
  ];
}

export function rankModelsByPerformance(
  candidates: string[],
  performance: ModelPerformance[],
) {
  const [preferred, ...fallbacks] = candidates;
  const stats = new Map(performance.map((entry) => [entry.model, entry]));
  const rankedFallbacks = fallbacks
    .map((model, configuredIndex) => {
      const observed = stats.get(model);
      const hasSignal = (observed?.samples ?? 0) >= 2;
      const latency = observed?.p95DurationMs ?? 35_000;
      const failurePenalty = hasSignal
        ? (observed?.failureRate ?? 0) * 90_000
        : 0;
      const configuredPenalty = hasSignal
        ? configuredIndex * 2_000
        : configuredIndex * 20_000;
      return {
        model,
        score: latency + failurePenalty + configuredPenalty,
        configuredIndex,
      };
    })
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.configuredIndex - right.configuredIndex,
    );
  return [preferred, ...rankedFallbacks.map(({ model }) => model)];
}
