import type { ExtractedDocument, StageName } from "./schemas";

const RULE_TERMS = [
  "eligib",
  "criteria",
  "require",
  "must",
  "document",
  "deadline",
  "application",
  "syarat",
  "kelayakan",
  "dokumen",
  "tarikh",
];

const EVIDENCE_TERMS = [
  "name",
  "date of birth",
  "citizen",
  "income",
  "gpa",
  "grade",
  "enrol",
  "study",
  "scholarship",
  "certif",
  "signature",
  "nama",
  "pendapatan",
  "warganegara",
];

const LIMITS: Record<
  StageName,
  { totalCharacters: number; rulePages: number; evidencePages: number }
> = {
  requirement_compiler: {
    totalCharacters: 80_000,
    rulePages: 20,
    evidencePages: 0,
  },
  eligibility_mapper: {
    totalCharacters: 100_000,
    rulePages: 14,
    evidencePages: 5,
  },
  red_team_reviewer: {
    totalCharacters: 90_000,
    rulePages: 14,
    evidencePages: 4,
  },
  action_planner: {
    totalCharacters: 30_000,
    rulePages: 8,
    evidencePages: 0,
  },
};

function pageScore(text: string, terms: string[]) {
  const normalized = text.toLocaleLowerCase("en");
  return terms.reduce(
    (score, term) => score + (normalized.includes(term) ? 1 : 0),
    0,
  );
}

function selectPages(
  document: ExtractedDocument,
  maximum: number,
  terms: string[],
) {
  if (maximum <= 0) return [];
  if (document.pages.length <= maximum) return document.pages;
  const selected = [...document.pages]
    .map((page, index) => ({
      page,
      index,
      score: pageScore(page.text, terms),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, maximum)
    .sort((left, right) => left.index - right.index);
  return selected.map(({ page }) => page);
}

function compactText(text: string) {
  return text.trim().slice(0, 9_000);
}

export function selectStageDocuments(
  stage: StageName,
  documents: ExtractedDocument[],
): ExtractedDocument[] {
  const limits = LIMITS[stage];
  const selected: ExtractedDocument[] = [];
  let remaining = limits.totalCharacters;
  for (let index = 0; index < documents.length; index += 1) {
    if (index > 0 && limits.evidencePages === 0) break;
    const document = documents[index];
    const pages = selectPages(
      document,
      index === 0 ? limits.rulePages : limits.evidencePages,
      index === 0 ? RULE_TERMS : EVIDENCE_TERMS,
    );
    const compacted = [];
    for (const page of pages) {
      if (remaining <= 0) break;
      const text = compactText(page.text).slice(0, remaining);
      if (!text) continue;
      compacted.push({ pageNumber: page.pageNumber, text });
      remaining -= text.length;
    }
    if (compacted.length > 0) {
      selected.push({
        name: document.name,
        mimeType: document.mimeType,
        pages: compacted,
      });
    }
  }
  if (selected.length === 0) {
    throw new Error("EMPTY_STAGE_PAYLOAD");
  }
  return selected;
}
