import { describe, expect, test } from "vitest";
import {
  claimMatchesSubject,
  evaluateEvidenceClaim,
  isEvidenceClaimGrounded,
  isSupportingDocument,
  resolveEvidenceConsensus,
} from "@/lib/analysis/evidence-claims";

const academicRequirement = {
  kind: "numeric",
  mandatory: true,
  label: "Academic standing",
  conditionType: "numeric",
  threshold: 3,
  operator: "gte" as const,
};

const academicMapping = {
  requirementKey: "req_005",
  requirementLabel: "Academic standing",
  proposedState: "confirmed" as const,
  reason: "The certified transcript records a GPA above the threshold.",
  citation: {
    documentName: "D2-certified-academic-transcript.pdf",
    pageNumber: 1,
    quote: "Latest cumulative GPA 3.72 / 4.00",
    confidence: "high" as const,
  },
  claim: {
    field: "cumulative_gpa",
    valueType: "number" as const,
    numberValue: 3.72,
    unit: "4.00 scale",
    subject: "Applicant",
    qualifiers: ["certified"],
    verbatimValue: "GPA 3.72 / 4.00",
  },
};

const supportingReview = {
  requirementKey: "req_005",
  requirementLabel: "Academic standing",
  state: "confirmed" as const,
  evidenceVerdict: "supports_mapping" as const,
  reason: "The exact transcript value exceeds the threshold.",
};

describe("typed evidence claims", () => {
  test("grounds a typed number in the exact cited text", () => {
    expect(
      isEvidenceClaimGrounded(
        academicMapping.claim,
        academicMapping.citation.quote,
      ),
    ).toBe(true);
    expect(
      evaluateEvidenceClaim(academicRequirement, academicMapping.claim),
    ).toBe(true);
  });

  test("rejects evidence belonging to a different applicant", () => {
    expect(
      claimMatchesSubject(
        { ...academicMapping.claim, subject: "Aina Demo" },
        "Aina Demo",
      ),
    ).toBe(true);
    expect(
      claimMatchesSubject(
        { ...academicMapping.claim, subject: "Different Person" },
        "Aina Demo",
      ),
    ).toBe(false);
    expect(
      claimMatchesSubject(
        { ...academicMapping.claim, subject: "Applicant" },
        "Aina Demo",
        "Certified transcript for Aina Demo. GPA 3.72 / 4.00.",
      ),
    ).toBe(true);
    expect(
      claimMatchesSubject(
        { ...academicMapping.claim, subject: "Applicant" },
        "Aina Demo",
        "Certified transcript for Different Person.",
      ),
    ).toBe(false);
    expect(
      resolveEvidenceConsensus({
        requirement: academicRequirement,
        mapping: {
          ...academicMapping,
          claim: { ...academicMapping.claim, subject: "Different Person" },
        },
        review: supportingReview,
        profileResult: null,
        citationVerified: true,
        citationIsSupporting: true,
        expectedSubject: "Aina Demo",
      }).state,
    ).toBe("needs_verification");
  });

  test("rejects values that are absent from the citation", () => {
    expect(
      isEvidenceClaimGrounded(
        { ...academicMapping.claim, numberValue: 3.95 },
        academicMapping.citation.quote,
      ),
    ).toBe(false);
  });

  test("confirms grounded numeric evidence with deterministic comparison", () => {
    expect(
      resolveEvidenceConsensus({
        requirement: academicRequirement,
        mapping: academicMapping,
        review: supportingReview,
        profileResult: null,
        citationVerified: true,
        citationIsSupporting: true,
      }),
    ).toEqual({
      state: "confirmed",
      deterministicResult: true,
      usedSupportingEvidence: true,
    });
    expect(
      resolveEvidenceConsensus({
        requirement: academicRequirement,
        mapping: academicMapping,
        review: undefined,
        profileResult: null,
        citationVerified: true,
        citationIsSupporting: true,
      }).state,
    ).toBe("confirmed");
  });

  test("does not treat programme rules as applicant evidence", () => {
    expect(
      isSupportingDocument(
        "Siap Demo Scholarship Pack 2026.pdf",
        "Siap Demo Scholarship Pack 2026.pdf",
      ),
    ).toBe(false);
    expect(
      resolveEvidenceConsensus({
        requirement: academicRequirement,
        mapping: {
          ...academicMapping,
          citation: {
            ...academicMapping.citation,
            documentName: "Siap Demo Scholarship Pack 2026.pdf",
          },
        },
        review: supportingReview,
        profileResult: null,
        citationVerified: true,
        citationIsSupporting: false,
      }).state,
    ).toBe("needs_verification");
  });

  test("keeps semantic facts deterministic through independent agreement", () => {
    const mapping = {
      ...academicMapping,
      requirementKey: "req_006",
      requirementLabel: "Other funding",
      citation: {
        ...academicMapping.citation,
        documentName: "D1-demo-identity-copy.pdf",
        quote: "Applicant does not hold another full scholarship for 2026.",
      },
      claim: {
        field: "holds_other_full_scholarship",
        valueType: "boolean" as const,
        booleanValue: false,
        subject: "Applicant",
        qualifiers: ["academic_year_2026"],
        verbatimValue: "does not hold another full scholarship",
      },
    };
    expect(
      resolveEvidenceConsensus({
        requirement: {
          kind: "other",
          mandatory: true,
          conditionType: "other",
        },
        mapping,
        review: {
          ...supportingReview,
          requirementKey: "req_006",
          requirementLabel: "Other funding",
        },
        profileResult: null,
        citationVerified: true,
        citationIsSupporting: true,
      }).state,
    ).toBe("confirmed");
    expect(
      resolveEvidenceConsensus({
        requirement: {
          kind: "other",
          mandatory: true,
          conditionType: "other",
        },
        mapping,
        review: {
          ...supportingReview,
          requirementKey: "req_006",
          requirementLabel: "Other funding",
          state: "needs_verification",
          evidenceVerdict: "unclear",
        },
        profileResult: null,
        citationVerified: true,
        citationIsSupporting: true,
      }).state,
    ).toBe("needs_verification");
  });

  test("evaluates normalized categorical evidence", () => {
    expect(
      evaluateEvidenceClaim(
        {
          kind: "study_level",
          mandatory: true,
          acceptedValues: ["Full time"],
        },
        {
          field: "attendance",
          valueType: "string",
          stringValue: "Full-time",
          subject: "Aina Demo",
          qualifiers: [],
          verbatimValue: "Attendance: Full-time",
        },
      ),
    ).toBe(true);
  });
});
