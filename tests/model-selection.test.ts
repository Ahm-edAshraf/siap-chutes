import { expect, test } from "vitest";
import {
  rankModelsByPerformance,
  stageModelCandidates,
} from "@/lib/analysis/model-selection";

test("required stages hedge with the other proven model", () => {
  expect(stageModelCandidates("requirement_compiler").slice(0, 2)).toEqual([
    "zai-org/GLM-5.1-TEE",
    "moonshotai/Kimi-K2.6-TEE",
  ]);
  expect(stageModelCandidates("eligibility_mapper").slice(0, 2)).toEqual([
    "moonshotai/Kimi-K2.6-TEE",
    "google/gemma-4-31B-turbo-TEE",
  ]);
});

test("keeps configured model first until enough performance data exists", () => {
  expect(
    rankModelsByPerformance(["configured", "fallback"], [
      {
        model: "configured",
        samples: 1,
        failures: 1,
        failureRate: 1,
        p95DurationMs: undefined,
      },
    ]),
  ).toEqual(["configured", "fallback"]);
});

test("uses measurements to rank fallbacks without replacing the assigned role", () => {
  expect(
    rankModelsByPerformance(["assigned", "slow", "fast"], [
      {
        model: "slow",
        samples: 10,
        failures: 6,
        failureRate: 0.6,
        p95DurationMs: 70_000,
      },
      {
        model: "fast",
        samples: 10,
        failures: 0,
        failureRate: 0,
        p95DurationMs: 18_000,
      },
    ]),
  ).toEqual(["assigned", "fast", "slow"]);
});
