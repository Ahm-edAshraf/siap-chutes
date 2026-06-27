export function assertExactRequirementCoverage(
  requiredKeys: string[],
  returnedKeys: string[],
) {
  const required = new Set(requiredKeys);
  const returned = new Set(returnedKeys);
  if (
    required.size !== requiredKeys.length ||
    returned.size !== returnedKeys.length ||
    required.size !== returned.size ||
    requiredKeys.some((key) => !returned.has(key))
  ) {
    throw new Error("INCOMPLETE_REQUIREMENT_COVERAGE");
  }
}
