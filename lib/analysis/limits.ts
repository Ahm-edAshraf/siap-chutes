import type { ExtractedDocument } from "./schemas";

export const DOCUMENT_LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
  maxFiles: 6,
  maxSupportingFiles: 5,
  maxPages: 50,
  maxCharacters: 240_000,
} as const;

export type SupportedDocumentMime =
  | "application/pdf"
  | "image/jpeg"
  | "image/png";

export function inferSupportedMimeType(
  file: Pick<File, "name" | "type">,
): SupportedDocumentMime | null {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    return "application/pdf";
  }
  if (file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name)) {
    return "image/jpeg";
  }
  if (file.type === "image/png" || /\.png$/i.test(file.name)) {
    return "image/png";
  }
  return null;
}

export function validateExtractedDocuments(documents: ExtractedDocument[]) {
  if (documents.length < 1 || documents.length > DOCUMENT_LIMITS.maxFiles) {
    throw new Error(
      "Select one application pack and up to five supporting files",
    );
  }
  const pages = documents.reduce(
    (sum, document) => sum + document.pages.length,
    0,
  );
  if (pages > DOCUMENT_LIMITS.maxPages) {
    throw new Error(
      `Documents exceed the ${DOCUMENT_LIMITS.maxPages}-page limit`,
    );
  }
  const characters = documents.reduce(
    (total, document) =>
      total + document.pages.reduce((sum, page) => sum + page.text.length, 0),
    0,
  );
  if (characters > DOCUMENT_LIMITS.maxCharacters) {
    throw new Error(
      `Extracted text exceeds the ${DOCUMENT_LIMITS.maxCharacters.toLocaleString()}-character limit`,
    );
  }
  return { pages, characters };
}

export function validateSelectedFiles(
  applicationPack: File,
  supportingFiles: File[],
) {
  const files = [applicationPack, ...supportingFiles];
  if (inferSupportedMimeType(applicationPack) !== "application/pdf") {
    throw new Error("The application pack must be a PDF");
  }
  if (supportingFiles.length > DOCUMENT_LIMITS.maxSupportingFiles) {
    throw new Error("You can add at most five supporting files");
  }
  for (const file of files) {
    if (!inferSupportedMimeType(file)) {
      throw new Error(`${file.name} is not a supported PDF, JPG, or PNG file`);
    }
    if (file.size > DOCUMENT_LIMITS.maxFileBytes) {
      throw new Error(`${file.name} exceeds the 10 MB file limit`);
    }
  }
}
