import { describe, expect, test } from "vitest";
import { selectStageDocuments } from "@/lib/analysis/stage-payload";

const documents = [
  {
    name: "rules.pdf",
    mimeType: "application/pdf" as const,
    pages: [
      { pageNumber: 1, text: "Welcome and contents" },
      { pageNumber: 2, text: "Eligibility requirements and deadline" },
    ],
  },
  {
    name: "evidence.pdf",
    mimeType: "application/pdf" as const,
    pages: [{ pageNumber: 1, text: "Certified GPA 3.72" }],
  },
];

describe("stage payload selection", () => {
  test("keeps supporting evidence away from compiler and planner prompts", () => {
    expect(
      selectStageDocuments("requirement_compiler", documents).map(
        (document) => document.name,
      ),
    ).toEqual(["rules.pdf"]);
    expect(
      selectStageDocuments("action_planner", documents).map(
        (document) => document.name,
      ),
    ).toEqual(["rules.pdf"]);
  });

  test("keeps programme rules and supporting evidence for evidence agents", () => {
    expect(
      selectStageDocuments("eligibility_mapper", documents).map(
        (document) => document.name,
      ),
    ).toEqual(["rules.pdf", "evidence.pdf"]);
  });
});
