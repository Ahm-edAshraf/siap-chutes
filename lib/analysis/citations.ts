import type { ExtractedDocument } from "./schemas";

export function normalizeEvidence(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en");
}

export function verifyCitation(
  documents: ExtractedDocument[],
  citation: { documentName: string; pageNumber?: number; quote: string },
) {
  const document = documents.find(
    (candidate) =>
      normalizeEvidence(candidate.name) ===
      normalizeEvidence(citation.documentName),
  );
  if (!document) return false;
  const pages =
    citation.pageNumber === undefined
      ? document.pages
      : document.pages.filter(
          (page) => page.pageNumber === citation.pageNumber,
        );
  const quote = normalizeEvidence(citation.quote);
  if (quote.length < 4) return false;
  return pages.some((page) => normalizeEvidence(page.text).includes(quote));
}

export function verifiedCitation(
  documents: ExtractedDocument[],
  citation: {
    documentName: string;
    pageNumber?: number;
    quote: string;
    confidence: "high" | "medium" | "low";
  },
  matchKind: "document" | "profile" | "deterministic" | "none" = "document",
) {
  const verified = verifyCitation(documents, citation);
  return {
    documentName: citation.documentName,
    pageNumber: citation.pageNumber,
    excerpt: citation.quote.slice(0, 240),
    confidence: citation.confidence,
    verified,
    matchKind,
  };
}
