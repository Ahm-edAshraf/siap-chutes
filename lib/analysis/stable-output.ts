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
  return {
    ...output,
    programme: {
      ...output.programme,
      deadline: normalizeDeadline(output.programme.deadline),
    },
    requirements: output.requirements.map((requirement, index) => ({
      ...requirement,
      key: `req_${String(index + 1).padStart(3, "0")}`,
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
