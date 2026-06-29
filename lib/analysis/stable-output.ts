import { formatCalendarDate, normalizeDeadline, parseDeadline } from "../date-time";
import type { CompilerOutput, PlannerOutput } from "./schemas";

type RequirementState =
  | "confirmed"
  | "needs_verification"
  | "incomplete"
  | "not_met";

type StableRequirement = {
  key: string;
  label: string;
  kind: string;
  mandatory: boolean;
  state: RequirementState;
};

function cleanSentence(value: string) {
  return value.trim().replace(/[.!?]+$/, "");
}

function normalizeProgrammeName(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s+(?:19|20)\d{2}$/u, "")
    .trim();
}

function stableRequirementLabel(
  requirement: CompilerOutput["requirements"][number],
) {
  if (
    requirement.kind === "citizenship" ||
    requirement.condition?.type === "citizenship_equals"
  ) {
    return "Citizenship";
  }
  if (
    requirement.kind === "age" ||
    requirement.condition?.type === "age_max_on"
  ) {
    return "Age";
  }
  if (
    requirement.kind === "income" ||
    requirement.condition?.type === "income_max"
  ) {
    return "Household income";
  }
  if (
    requirement.kind === "study_level" ||
    requirement.condition?.type === "study_level_in"
  ) {
    return "Study status";
  }
  if (
    requirement.kind === "document" ||
    requirement.condition?.type === "document_present"
  ) {
    return requirement.condition?.documentNames?.[0] ?? requirement.label;
  }
  const semanticText =
    `${requirement.label} ${requirement.description ?? ""} ${requirement.citation.quote}`.toLocaleLowerCase(
      "en",
    );
  if (/grade point average|\bgpa\b/u.test(semanticText)) {
    return "Academic standing";
  }
  if (
    /(?:other|another|full)\s+scholarship|scholarship.+same academic year/u.test(
      semanticText,
    )
  ) {
    return "Other funding";
  }
  return cleanSentence(requirement.label);
}

function requirementIdentity(
  requirement: CompilerOutput["requirements"][number],
) {
  if (
    requirement.kind === "document" ||
    requirement.condition?.type === "document_present"
  ) {
    return `document:${(requirement.condition?.documentNames ?? [
      requirement.label,
    ])
      .map((value) => value.toLocaleLowerCase("en").trim())
      .sort()
      .join("|")}`;
  }
  return [
    requirement.kind,
    requirement.condition?.type ?? "",
    requirement.citation.documentName.toLocaleLowerCase("en"),
    requirement.citation.pageNumber ?? "",
    requirement.citation.quote
      .toLocaleLowerCase("en")
      .replace(/\s+/g, " ")
      .trim(),
  ].join(":");
}

function suggestedDate(deadline: string | undefined, urgency: "critical" | "required") {
  const parsed = deadline ? parseDeadline(deadline) : null;
  if (!parsed) return "As soon as possible";
  const target = new Date(parsed.instant);
  target.setUTCDate(target.getUTCDate() - (urgency === "critical" ? 21 : 14));
  return formatCalendarDate(target.toISOString());
}

export function canonicalizeCompilerOutput(
  output: CompilerOutput,
): CompilerOutput {
  const seen = new Set<string>();
  const requirements = output.requirements.filter((requirement) => {
    if (
      requirement.kind === "deadline" ||
      requirement.condition?.type === "deadline_after"
    ) {
      return false;
    }
    const identity = requirementIdentity(requirement);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  return {
    ...output,
    programme: {
      ...output.programme,
      name: normalizeProgrammeName(output.programme.name),
      deadline: normalizeDeadline(output.programme.deadline),
    },
    requirements: requirements.map((requirement, index) => ({
      ...requirement,
      key: `req_${String(index + 1).padStart(3, "0")}`,
      label: stableRequirementLabel(requirement),
    })),
  };
}

export function buildStablePlan(
  requirements: StableRequirement[],
  deadline?: string,
): PlannerOutput {
  const unresolved = requirements.filter(
    (requirement) => requirement.state !== "confirmed",
  );
  const missingDocuments = unresolved
    .filter((requirement) => requirement.kind === "document")
    .map((requirement) => {
      const urgency =
        requirement.state === "not_met" ||
        (requirement.mandatory && requirement.state === "incomplete")
          ? ("critical" as const)
          : ("required" as const);
      return {
        requirementKey: requirement.key,
        name: requirement.label,
        urgency,
        owner: "Applicant",
        suggestedDate: suggestedDate(deadline, urgency),
        action: `Obtain and upload ${cleanSentence(requirement.label)}.`,
      };
    });

  const actions = unresolved.map((requirement) => {
    const label = cleanSentence(requirement.label);
    const description =
      requirement.kind === "document"
        ? `Obtain and upload ${label}.`
        : requirement.state === "not_met"
          ? `Resolve the eligibility issue for ${label}.`
          : requirement.state === "incomplete"
            ? `Provide missing evidence for ${label}.`
            : `Verify ${label} with supporting evidence.`;
    return {
      key: `resolve_${requirement.key}`,
      description,
      owner: "Applicant",
      urgency:
        requirement.state === "not_met" ? ("critical" as const) : ("required" as const),
      dependsOn: [],
    };
  });

  return { missingDocuments, actions };
}
