import { normalizeEvidence } from "./citations";
import type { MapperOutput, ReviewerOutput } from "./schemas";

type RequirementState =
  | "confirmed"
  | "needs_verification"
  | "incomplete"
  | "not_met";

type RequirementLike = {
  kind: string;
  mandatory: boolean;
  conditionType?: string;
  expectedString?: string;
  threshold?: number;
  operator?: "lt" | "lte" | "eq" | "gte" | "gt";
  acceptedValues?: string[];
};

type Claim = NonNullable<MapperOutput["mappings"][number]["claim"]>;
type Mapping = MapperOutput["mappings"][number];
type Review = ReviewerOutput["reviews"][number];

export type EvidenceResolution = {
  state: RequirementState;
  deterministicResult?: boolean;
  usedSupportingEvidence: boolean;
};

function normalizedSemantic(value: string) {
  return normalizeEvidence(value)
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .trim();
}

function numericValues(value: string) {
  return [...value.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)]
    .map((match) => Number(match[0].replaceAll(",", "")))
    .filter(Number.isFinite);
}

function claimHasTypedValue(claim: Claim) {
  if (claim.valueType === "number") return claim.numberValue !== undefined;
  if (claim.valueType === "boolean") return claim.booleanValue !== undefined;
  if (claim.valueType === "string") return claim.stringValue !== undefined;
  return claim.dateValue !== undefined;
}

export function isSupportingDocument(
  sourceFileName: string,
  citedDocumentName: string,
) {
  return (
    normalizeEvidence(sourceFileName) !==
    normalizeEvidence(citedDocumentName)
  );
}

export function isEvidenceClaimGrounded(claim: Claim, citationQuote: string) {
  if (!claimHasTypedValue(claim)) return false;
  const quote = normalizedSemantic(citationQuote);
  const verbatim = normalizedSemantic(claim.verbatimValue);
  if (verbatim.length < 4 || !quote.includes(verbatim)) return false;
  if (claim.valueType === "number") {
    return numericValues(claim.verbatimValue).some(
      (value) => Math.abs(value - claim.numberValue!) < 1e-9,
    );
  }
  if (claim.valueType === "string") {
    return verbatim.includes(normalizedSemantic(claim.stringValue!));
  }
  if (claim.valueType === "date") {
    const [year, month, day] = claim.dateValue!.split("-").map(Number);
    const dateNumbers = numericValues(claim.verbatimValue);
    return (
      dateNumbers.includes(year) &&
      (dateNumbers.includes(month) || dateNumbers.includes(day))
    );
  }
  return true;
}

export function claimMatchesSubject(
  claim: Claim,
  expectedSubject: string,
  citedPageText = "",
) {
  const actual = normalizedSemantic(claim.subject);
  const expected = normalizedSemantic(expectedSubject);
  if (
    actual === expected ||
    (actual.length >= 4 && expected.length >= 4 && actual.includes(expected))
  ) {
    return true;
  }
  return (
    ["applicant", "student", "candidate"].includes(actual) &&
    normalizedSemantic(citedPageText).includes(expected)
  );
}

export function evidencePageMatchesSubject(
  expectedSubject: string,
  citedPageText = "",
) {
  const expected = normalizedSemantic(expectedSubject);
  return (
    expected.length >= 4 &&
    normalizedSemantic(citedPageText).includes(expected)
  );
}

function compareNumeric(
  value: number,
  threshold: number,
  operator: RequirementLike["operator"],
) {
  if (operator === "lt") return value < threshold;
  if (operator === "lte") return value <= threshold;
  if (operator === "eq") return value === threshold;
  if (operator === "gte") return value >= threshold;
  if (operator === "gt") return value > threshold;
  return null;
}

export function evaluateEvidenceClaim(
  requirement: RequirementLike,
  claim: Claim,
): true | false | null {
  if (
    claim.valueType === "number" &&
    claim.numberValue !== undefined &&
    requirement.threshold !== undefined
  ) {
    return compareNumeric(
      claim.numberValue,
      requirement.threshold,
      requirement.operator,
    );
  }
  if (
    claim.valueType === "string" &&
    claim.stringValue &&
    requirement.acceptedValues?.length
  ) {
    const actual = normalizedSemantic(claim.stringValue);
    return requirement.acceptedValues
      .map(normalizedSemantic)
      .includes(actual);
  }
  if (
    claim.valueType === "string" &&
    claim.stringValue &&
    requirement.expectedString
  ) {
    return (
      normalizedSemantic(claim.stringValue) ===
      normalizedSemantic(requirement.expectedString)
    );
  }
  return null;
}

export function evaluateNumericCitation(
  requirement: RequirementLike,
  citationQuote: string,
): true | false | null {
  if (
    requirement.threshold === undefined ||
    (requirement.kind !== "numeric" &&
      requirement.conditionType !== "numeric")
  ) {
    return null;
  }
  const comparisons = numericValues(citationQuote)
    .map((value) =>
      compareNumeric(value, requirement.threshold!, requirement.operator),
    )
    .filter((value): value is boolean => value !== null);
  if (comparisons.length === 0) return null;
  return comparisons.every((value) => value === comparisons[0])
    ? comparisons[0]
    : null;
}

export function resolveEvidenceConsensus({
  requirement,
  mapping,
  profileResult,
  citationVerified,
  citationIsSupporting,
  expectedSubject,
  citedPageText,
  claimValidated,
  citationSubjectValidated,
}: {
  requirement: RequirementLike;
  mapping: Mapping;
  review: Review | undefined;
  profileResult: true | false | null;
  citationVerified: boolean;
  citationIsSupporting: boolean;
  expectedSubject?: string;
  citedPageText?: string;
  claimValidated?: boolean;
  citationSubjectValidated?: boolean;
}): EvidenceResolution {
  if (profileResult === false) {
    return {
      state:
        requirement.kind === "document" ||
        requirement.conditionType === "document_present" ||
        !requirement.mandatory
          ? "incomplete"
          : "not_met",
      deterministicResult: false,
      usedSupportingEvidence: false,
    };
  }
  if (profileResult === true) {
    return {
      state: citationVerified ? "confirmed" : "needs_verification",
      deterministicResult: true,
      usedSupportingEvidence: false,
    };
  }

  const claimGrounded =
    claimValidated ??
    (mapping.claim !== undefined &&
      isEvidenceClaimGrounded(mapping.claim, mapping.citation.quote));
  const groundedSupportingClaim =
    citationVerified &&
    citationIsSupporting &&
    claimGrounded &&
    (claimValidated !== undefined ||
      expectedSubject === undefined ||
      claimMatchesSubject(mapping.claim!, expectedSubject, citedPageText));
  if (!groundedSupportingClaim) {
    const numericResult =
      citationVerified &&
      citationIsSupporting &&
      citationSubjectValidated
        ? evaluateNumericCitation(requirement, mapping.citation.quote)
        : null;
    const mappingAgrees =
      numericResult === true
        ? mapping.proposedState === "confirmed"
        : numericResult === false
          ? mapping.proposedState === "not_met" ||
            mapping.proposedState === "incomplete"
          : false;
    if (numericResult !== null && mappingAgrees) {
      return {
        state: numericResult
          ? "confirmed"
          : requirement.mandatory
            ? "not_met"
            : "incomplete",
        deterministicResult: numericResult,
        usedSupportingEvidence: true,
      };
    }
    return {
      state: "needs_verification",
      deterministicResult: undefined,
      usedSupportingEvidence: false,
    };
  }

  const claimResult = evaluateEvidenceClaim(requirement, mapping.claim!);
  if (claimResult !== null) {
    return {
      state: claimResult
        ? "confirmed"
        : requirement.mandatory
          ? "not_met"
          : "incomplete",
      deterministicResult: claimResult,
      usedSupportingEvidence: true,
    };
  }

  if (mapping.proposedState === "confirmed") {
    return {
      state: "confirmed",
      usedSupportingEvidence: true,
    };
  }
  if (mapping.proposedState === "not_met") {
    return {
      state: requirement.mandatory ? "not_met" : "incomplete",
      usedSupportingEvidence: true,
    };
  }
  if (mapping.proposedState === "incomplete") {
    return {
      state: "incomplete",
      usedSupportingEvidence: true,
    };
  }
  return {
    state: "needs_verification",
    usedSupportingEvidence: true,
  };
}
