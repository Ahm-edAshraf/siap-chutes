import { describe, expect, test } from "vitest";
import {
  clampReviewerStates,
  reconcileOptionalRequirementKeys,
  reconcileRequirementCoverage,
} from "@/lib/analysis/reconcile";

describe("parallel agent reconciliation", () => {
  const requirements = [
    { key: "req_001", label: "Malaysian citizenship" },
    { key: "req_002", label: "Household income below RM5,000" },
  ];

  test("uses normalized labels when independent keys differ", () => {
    expect(
      reconcileRequirementCoverage(requirements, [
        {
          requirementKey: "citizenship",
          requirementLabel: "Malaysian citizenship",
          state: "confirmed",
        },
        {
          requirementKey: "income",
          requirementLabel: "Household income below RM5,000!",
          state: "needs_verification",
        },
      ]),
    ).toEqual([
      {
        requirementKey: "req_001",
        requirementLabel: "Malaysian citizenship",
        state: "confirmed",
      },
      {
        requirementKey: "req_002",
        requirementLabel: "Household income below RM5,000",
        state: "needs_verification",
      },
    ]);
  });

  test("fails closed when an independent agent misses coverage", () => {
    expect(() =>
      reconcileRequirementCoverage(requirements, [
        {
          requirementKey: "req_001",
          requirementLabel: "Malaysian citizenship",
        },
      ]),
    ).toThrow("INCOMPLETE_REQUIREMENT_COVERAGE");
  });

  test("uses an explicit conservative fallback when supplied", () => {
    expect(
      reconcileRequirementCoverage(
        requirements,
        [
          {
            requirementKey: "req_001",
            requirementLabel: "Malaysian citizenship",
            state: "confirmed",
          },
        ],
        (requirement) => ({
          requirementKey: requirement.key,
          requirementLabel: requirement.label,
          state: "needs_verification",
        }),
      ),
    ).toEqual([
      {
        requirementKey: "req_001",
        requirementLabel: "Malaysian citizenship",
        state: "confirmed",
      },
      {
        requirementKey: "req_002",
        requirementLabel: "Household income below RM5,000",
        state: "needs_verification",
      },
    ]);
  });

  test("drops planner references that cannot be reconciled safely", () => {
    expect(
      reconcileOptionalRequirementKeys(requirements, [
        { requirementKey: "req_002", name: "Income statement" },
        { requirementKey: "unknown", name: "Other document" },
      ]),
    ).toEqual([
      { requirementKey: "req_002", name: "Income statement" },
      { requirementKey: undefined, name: "Other document" },
    ]);
  });

  test("allows the reviewer to preserve or downgrade but never upgrade", () => {
    expect(
      clampReviewerStates(
        [
          { key: "req_001", state: "needs_verification" },
          { key: "req_002", state: "confirmed" },
        ],
        [
          {
            requirementKey: "req_001",
            state: "confirmed",
            reason: "optimistic",
          },
          { requirementKey: "req_002", state: "incomplete", reason: "missing" },
        ],
      ),
    ).toEqual([
      {
        requirementKey: "req_001",
        state: "needs_verification",
        reason: "optimistic",
      },
      { requirementKey: "req_002", state: "incomplete", reason: "missing" },
    ]);
  });
});
