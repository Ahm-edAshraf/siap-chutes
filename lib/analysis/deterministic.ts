type RequirementLike = {
  kind: string;
  mandatory: boolean;
  conditionType?: string;
  expectedString?: string;
  threshold?: number;
  operator?: "lt" | "lte" | "eq" | "gte" | "gt";
  profileField?: "householdIncome";
  comparisonDate?: string;
  acceptedValues?: string[];
  documentNames?: string[];
};

type ProfileLike = {
  citizenship: string;
  dateOfBirth: string;
  householdIncome: number;
  studyLevel: string;
  documentFlags: {
    hasTranscript: boolean;
    hasIcCopy: boolean;
    hasIncomeStatement: boolean;
    hasRefereeLetter: boolean;
  };
};

export type DeterministicResult = true | false | null;
type RequirementState =
  | "confirmed"
  | "needs_verification"
  | "incomplete"
  | "not_met";

const MALAYSIA_END_OF_DAY_UTC = "15:59:59.999";

function parseIsoDate(value: string, endOfDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(
    `${value}T${endOfDay ? MALAYSIA_END_OF_DAY_UTC : "00:00:00"}Z`,
  );
  if (
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }
  return date;
}

export function ageOnDate(dateOfBirth: string, comparisonDate: string) {
  const birth = parseIsoDate(dateOfBirth);
  const target = parseIsoDate(comparisonDate);
  if (!birth || !target || target < birth) {
    throw new Error("Invalid date");
  }
  let age = target.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    target.getUTCMonth() < birth.getUTCMonth() ||
    (target.getUTCMonth() === birth.getUTCMonth() &&
      target.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function normalized(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const DOCUMENT_ALIASES = [
  ["identity", "identity card", "ic copy", "mykad"],
  ["academic transcript", "transcript"],
  ["household income", "income statement", "income evidence"],
  ["enrolment", "enrollment"],
  ["referee letter", "reference letter"],
] as const;

function documentNamesMatch(wanted: string, actual: string) {
  const normalizedWanted = normalized(wanted);
  const normalizedActual = normalized(actual);
  if (
    normalizedActual.includes(normalizedWanted) ||
    normalizedWanted.includes(normalizedActual)
  ) {
    return true;
  }
  return DOCUMENT_ALIASES.some(
    (aliases) =>
      aliases.some((alias) => normalizedWanted.includes(alias)) &&
      aliases.some((alias) => normalizedActual.includes(alias)),
  );
}

function availableProfileDocuments(profile: ProfileLike) {
  const names: string[] = [];
  if (profile.documentFlags.hasTranscript)
    names.push("academic transcript", "transcript");
  if (profile.documentFlags.hasIcCopy) names.push("ic copy", "identity card");
  if (profile.documentFlags.hasIncomeStatement) names.push("income statement");
  if (profile.documentFlags.hasRefereeLetter) names.push("referee letter");
  return names;
}

export function evaluateCondition(
  requirement: RequirementLike,
  profile: ProfileLike,
  availableDocumentNames: string[],
  now = new Date(),
): DeterministicResult {
  switch (requirement.conditionType) {
    case "citizenship_equals":
      return requirement.expectedString
        ? normalized(profile.citizenship) ===
            normalized(requirement.expectedString)
        : null;
    case "age_max_on":
      return requirement.threshold !== undefined && requirement.comparisonDate
        ? ageOnDate(profile.dateOfBirth, requirement.comparisonDate) <=
            requirement.threshold
        : null;
    case "income_max":
      return requirement.threshold !== undefined
        ? profile.householdIncome <= requirement.threshold
        : null;
    case "study_level_in":
      return requirement.acceptedValues?.length
        ? requirement.acceptedValues
            .map(normalized)
            .includes(normalized(profile.studyLevel))
        : null;
    case "document_present": {
      if (!requirement.documentNames?.length) return null;
      const present = [
        ...availableDocumentNames,
        ...availableProfileDocuments(profile),
      ].map(normalized);
      return requirement.documentNames.some((wanted) =>
        present.some((actual) => documentNamesMatch(wanted, actual)),
      );
    }
    case "deadline_after":
      if (!requirement.comparisonDate) return null;
      const deadline = parseIsoDate(requirement.comparisonDate, true);
      return deadline ? deadline >= now : null;
    case "numeric": {
      if (
        requirement.profileField !== "householdIncome" ||
        requirement.threshold === undefined ||
        !requirement.operator
      ) {
        return null;
      }
      const value = profile.householdIncome;
      if (requirement.operator === "lt") return value < requirement.threshold;
      if (requirement.operator === "lte") return value <= requirement.threshold;
      if (requirement.operator === "eq") return value === requirement.threshold;
      if (requirement.operator === "gte") return value >= requirement.threshold;
      return value > requirement.threshold;
    }
    default:
      return null;
  }
}

export function resolveRequirementState(
  _proposed: "confirmed" | "needs_verification" | "incomplete" | "not_met",
  deterministic: DeterministicResult,
  mandatory: boolean,
  citationVerified: boolean,
  definiteFailure = true,
): RequirementState {
  if (deterministic === false) {
    return mandatory && definiteFailure ? "not_met" : "incomplete";
  }
  if (deterministic === true && citationVerified) return "confirmed";
  return "needs_verification";
}
