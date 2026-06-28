interface CanonicalRequirement {
  key: string;
  label: string;
}

interface RequirementReference {
  requirementKey: string;
  requirementLabel: string;
}

type RequirementState =
  | "confirmed"
  | "needs_verification"
  | "incomplete"
  | "not_met";

const STATE_RANK: Record<RequirementState, number> = {
  not_met: 0,
  incomplete: 1,
  needs_verification: 2,
  confirmed: 3,
};

function normalizedLabel(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function reconcileRequirementCoverage<T extends RequirementReference>(
  requirements: CanonicalRequirement[],
  assessments: T[],
  fallback?: (requirement: CanonicalRequirement) => T,
): T[] {
  const byKey = new Map(requirements.map((item) => [item.key, item]));
  const byLabel = new Map(
    requirements.map((item) => [normalizedLabel(item.label), item]),
  );
  const matched = new Map<string, T>();

  for (const assessment of assessments) {
    const requirement =
      byKey.get(assessment.requirementKey) ??
      byLabel.get(normalizedLabel(assessment.requirementLabel));
    if (!requirement) continue;
    if (matched.has(requirement.key)) continue;
    matched.set(requirement.key, {
      ...assessment,
      requirementKey: requirement.key,
      requirementLabel: requirement.label,
    });
  }

  if (
    !fallback &&
    requirements.some((requirement) => !matched.has(requirement.key))
  ) {
    throw new Error("INCOMPLETE_REQUIREMENT_COVERAGE");
  }
  return requirements.map((requirement) => {
    const assessment = matched.get(requirement.key);
    if (assessment) return assessment;
    if (!fallback) throw new Error("INCOMPLETE_REQUIREMENT_COVERAGE");
    return fallback(requirement);
  });
}

export function reconcileOptionalRequirementKeys<
  T extends { requirementKey?: string },
>(requirements: CanonicalRequirement[], items: T[]): T[] {
  const keys = new Set(requirements.map((requirement) => requirement.key));
  return items.map((item) => ({
    ...item,
    requirementKey:
      item.requirementKey && keys.has(item.requirementKey)
        ? item.requirementKey
        : undefined,
  }));
}

export function clampReviewerStates<
  T extends { requirementKey: string; state: RequirementState },
>(
  requirements: Array<{ key: string; state: RequirementState }>,
  reviews: T[],
): T[] {
  const currentState = new Map(
    requirements.map((requirement) => [requirement.key, requirement.state]),
  );
  return reviews.map((review) => {
    const state = currentState.get(review.requirementKey);
    if (!state) throw new Error("INCOMPLETE_REQUIREMENT_COVERAGE");
    return STATE_RANK[review.state] > STATE_RANK[state]
      ? { ...review, state }
      : review;
  });
}
