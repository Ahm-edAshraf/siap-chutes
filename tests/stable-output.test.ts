import { describe, expect, test } from "vitest";
import {
  buildStablePlan,
  canonicalizeCompilerOutput,
} from "@/lib/analysis/stable-output";

describe("stable ensemble output", () => {
  test("canonicalizes source-order keys and deadline storage", () => {
    const output = canonicalizeCompilerOutput({
      programme: {
        name: "Scholarship 2026",
        deadline: "2026-09-30T23:59:00",
        summary: "Summary",
      },
      requirements: [
        {
          key: "citizenship",
          label: "Citizenship",
          kind: "citizenship",
          weight: 1,
          mandatory: true,
          citation: {
            documentName: "pack.pdf",
            pageNumber: 1,
            quote: "Malaysian citizen",
            confidence: "high",
          },
        },
        {
          key: "transcript",
          label: "Registrar-certified transcript",
          kind: "document",
          weight: 1,
          mandatory: true,
          condition: {
            type: "document_present",
            documentNames: ["Certified transcript"],
          },
          citation: {
            documentName: "pack.pdf",
            pageNumber: 2,
            quote: "Certified transcript",
            confidence: "high",
          },
        },
        {
          key: "deadline",
          label: "Application deadline",
          kind: "deadline",
          weight: 1,
          mandatory: true,
          condition: {
            type: "deadline_after",
            comparisonDate: "2026-09-30",
          },
          citation: {
            documentName: "pack.pdf",
            pageNumber: 2,
            quote: "Apply by 30 September 2026",
            confidence: "high",
          },
        },
      ],
    });
    expect(output.programme.name).toBe("Scholarship");
    expect(output.programme.deadline).toBe("2026-09-30T15:59:00.000Z");
    expect(output.requirements.map((requirement) => requirement.key)).toEqual([
      "req_001",
      "req_002",
    ]);
    expect(output.requirements.map((requirement) => requirement.label)).toEqual([
      "Citizenship",
      "Certified transcript",
    ]);
  });

  test("creates one predictable action per unresolved requirement", () => {
    const plan = buildStablePlan(
      [
        {
          key: "req_001",
          label: "Citizenship",
          kind: "citizenship",
          mandatory: true,
          state: "confirmed",
        },
        {
          key: "req_002",
          label: "Certified transcript",
          kind: "document",
          mandatory: true,
          state: "incomplete",
        },
        {
          key: "req_003",
          label: "Other funding",
          kind: "other",
          mandatory: true,
          state: "needs_verification",
        },
      ],
      "2026-09-30T15:59:00.000Z",
    );
    expect(plan.missingDocuments).toEqual([
      {
        requirementKey: "req_002",
        name: "Certified transcript",
        urgency: "critical",
        owner: "Applicant",
        suggestedDate: "9 September 2026",
        action: "Obtain and upload Certified transcript.",
      },
    ]);
    expect(plan.actions).toEqual([
      {
        key: "resolve_req_002",
        description: "Obtain and upload Certified transcript.",
        owner: "Applicant",
        urgency: "required",
        dependsOn: [],
      },
      {
        key: "resolve_req_003",
        description: "Verify Other funding with supporting evidence.",
        owner: "Applicant",
        urgency: "required",
        dependsOn: [],
      },
    ]);
  });
});
