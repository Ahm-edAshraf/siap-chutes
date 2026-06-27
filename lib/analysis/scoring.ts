export function calculateReadiness(
  requirements: Array<{
    state: "confirmed" | "needs_verification" | "incomplete" | "not_met";
    weight: number;
  }>,
  actions: Array<{ completed: boolean }>,
) {
  const totalWeight = requirements.reduce(
    (sum, requirement) => sum + requirement.weight,
    0,
  );
  const evidence = requirements.reduce((sum, requirement) => {
    const factor =
      requirement.state === "confirmed"
        ? 1
        : requirement.state === "needs_verification"
          ? 0.5
          : 0;
    return sum + requirement.weight * factor;
  }, 0);
  const evidenceScore =
    totalWeight === 0 ? 0 : Math.round((evidence / totalWeight) * 80);
  const completed = actions.filter((action) => action.completed).length;
  const actionScore =
    actions.length === 0 ? 20 : Math.round((completed / actions.length) * 20);
  return {
    evidenceScore,
    actionScore,
    readinessScore: Math.min(100, evidenceScore + actionScore),
  };
}
