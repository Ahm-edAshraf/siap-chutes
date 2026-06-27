"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ExtractedDocument } from "@/lib/analysis/schemas";

interface DocumentSessionValue {
  documents: ExtractedDocument[] | null;
  setDocuments: (documents: ExtractedDocument[]) => void;
  clearDocuments: () => void;
}

const DocumentSessionContext = createContext<DocumentSessionValue | null>(null);

export function DocumentSessionProvider({ children }: { children: ReactNode }) {
  const [documents, setDocumentsState] = useState<ExtractedDocument[] | null>(
    null,
  );
  const setDocuments = useCallback((value: ExtractedDocument[]) => {
    setDocumentsState(value);
  }, []);
  const clearDocuments = useCallback(() => {
    setDocumentsState((current) => {
      if (current) {
        for (const document of current) {
          for (const page of document.pages) page.text = "";
          document.pages.length = 0;
        }
        current.length = 0;
      }
      return null;
    });
  }, []);
  const value = useMemo(
    () => ({ documents, setDocuments, clearDocuments }),
    [documents, setDocuments, clearDocuments],
  );
  return (
    <DocumentSessionContext.Provider value={value}>
      {children}
    </DocumentSessionContext.Provider>
  );
}

export function useDocumentSession() {
  const value = useContext(DocumentSessionContext);
  if (!value) {
    throw new Error(
      "useDocumentSession must be used inside DocumentSessionProvider",
    );
  }
  return value;
}
