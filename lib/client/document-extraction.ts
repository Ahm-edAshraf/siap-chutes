"use client";

import {
  DOCUMENT_LIMITS,
  inferSupportedMimeType,
  validateSelectedFiles,
  type SupportedDocumentMime,
} from "@/lib/analysis/limits";
import type { ExtractedDocument } from "@/lib/analysis/schemas";

export interface ExtractionProgress {
  fileName: string;
  currentPage: number;
  totalPages: number;
  phase: "extracting" | "ocr";
}

type ProgressCallback = (progress: ExtractionProgress) => void;
type RecognizeImage = (image: File | HTMLCanvasElement) => Promise<string>;

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException("Extraction cancelled", "AbortError");
}

async function createOcrWorker() {
  const { createWorker, OEM } = await import("tesseract.js");
  return await createWorker(["eng", "msa"], OEM.LSTM_ONLY, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/core",
    langPath: "/tesseract/lang",
    cacheMethod: "none",
  });
}

async function renderPdfPage(
  pdf: Awaited<ReturnType<(typeof import("unpdf"))["getDocumentProxy"]>>,
  pageNumber: number,
) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas is unavailable for local OCR");
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  page.cleanup();
  return canvas;
}

async function extractPdf(
  file: File,
  recognizeImage: RecognizeImage,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<ExtractedDocument> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const buffer = new Uint8Array(await file.arrayBuffer());
  assertNotAborted(signal);
  const pdf = await getDocumentProxy(buffer);
  try {
    if (pdf.numPages > DOCUMENT_LIMITS.maxPages) {
      throw new Error(
        `Documents exceed the ${DOCUMENT_LIMITS.maxPages}-page limit`,
      );
    }
    const extracted = await extractText(pdf);
    const pages: ExtractedDocument["pages"] = [];
    for (let index = 0; index < extracted.text.length; index += 1) {
      assertNotAborted(signal);
      const pageNumber = index + 1;
      let text = extracted.text[index] ?? "";
      onProgress?.({
        fileName: file.name,
        currentPage: pageNumber,
        totalPages: extracted.totalPages,
        phase: "extracting",
      });
      if (text.replace(/\s/g, "").length < 40) {
        onProgress?.({
          fileName: file.name,
          currentPage: pageNumber,
          totalPages: extracted.totalPages,
          phase: "ocr",
        });
        const canvas = await renderPdfPage(pdf, pageNumber);
        try {
          text = await recognizeImage(canvas);
        } finally {
          canvas.width = 0;
          canvas.height = 0;
          canvas.remove();
        }
      }
      pages.push({ pageNumber, text });
    }
    return { name: file.name, mimeType: "application/pdf", pages };
  } finally {
    await pdf.cleanup();
    await pdf.destroy();
    buffer.fill(0);
  }
}

async function extractImage(
  file: File,
  mimeType: Exclude<SupportedDocumentMime, "application/pdf">,
  recognizeImage: RecognizeImage,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<ExtractedDocument> {
  assertNotAborted(signal);
  onProgress?.({
    fileName: file.name,
    currentPage: 1,
    totalPages: 1,
    phase: "ocr",
  });
  const text = await recognizeImage(file);
  assertNotAborted(signal);
  return {
    name: file.name,
    mimeType,
    pages: [{ pageNumber: 1, text }],
  };
}

export async function extractFilesLocally(
  applicationPack: File,
  supportingFiles: File[],
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
) {
  validateSelectedFiles(applicationPack, supportingFiles);
  const files = [applicationPack, ...supportingFiles];
  const documents: ExtractedDocument[] = [];
  const ocr = {
    workerPromise: null as ReturnType<typeof createOcrWorker> | null,
  };
  const recognizeImage: RecognizeImage = async (image) => {
    ocr.workerPromise ??= createOcrWorker();
    const worker = await ocr.workerPromise;
    const result = await worker.recognize(image);
    return result.data.text;
  };
  const terminateOcr = async () => {
    const workerPromise = ocr.workerPromise;
    ocr.workerPromise = null;
    if (workerPromise) await (await workerPromise).terminate();
  };
  const abortOcr = () => {
    void terminateOcr().catch(() => undefined);
  };
  signal?.addEventListener("abort", abortOcr, { once: true });
  let totalPages = 0;
  let totalCharacters = 0;
  try {
    for (const file of files) {
      assertNotAborted(signal);
      const mimeType = inferSupportedMimeType(file);
      if (!mimeType) throw new Error(`${file.name} is not supported`);
      const document =
        mimeType === "application/pdf"
          ? await extractPdf(file, recognizeImage, onProgress, signal)
          : await extractImage(
              file,
              mimeType,
              recognizeImage,
              onProgress,
              signal,
            );
      totalPages += document.pages.length;
      totalCharacters += document.pages.reduce(
        (sum, page) => sum + page.text.length,
        0,
      );
      if (totalPages > DOCUMENT_LIMITS.maxPages) {
        throw new Error(
          `Documents exceed the ${DOCUMENT_LIMITS.maxPages}-page limit`,
        );
      }
      if (totalCharacters > DOCUMENT_LIMITS.maxCharacters) {
        throw new Error(
          `Extracted text exceeds the ${DOCUMENT_LIMITS.maxCharacters.toLocaleString()}-character limit`,
        );
      }
      documents.push(document);
    }
    return documents;
  } finally {
    signal?.removeEventListener("abort", abortOcr);
    await terminateOcr();
  }
}
