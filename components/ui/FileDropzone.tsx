"use client";

import { useRef, useState } from "react";
import { File as FileIcon, UploadCloud, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  selectedFile?: File | null;
  onClearFile?: () => void;
}

export function FileDropzone({
  onFileSelect,
  selectedFile,
  onClearFile,
}: FileDropzoneProps) {
  const { t } = useLanguage();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const select = (file?: File) => {
    if (
      file &&
      (file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf"))
    ) {
      onFileSelect(file);
    }
  };
  if (selectedFile) {
    return (
      <div className="border border-siap-ink p-4 rounded bg-siap-gray/5 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-siap-red/10 text-siap-red rounded grid place-items-center shrink-0">
            <FileIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate">{selectedFile.name}</p>
            <p className="text-xs text-siap-ink/60">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB ·{" "}
              {t("PDF document", "Dokumen PDF")}
            </p>
          </div>
        </div>
        <button
          onClick={onClearFile}
          aria-label={t("Remove file", "Buang fail")}
          className="p-2 hover:text-siap-red"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    );
  }
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        select(event.dataTransfer.files[0]);
      }}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed cursor-pointer rounded p-12 text-center ${dragging ? "border-siap-teal bg-siap-teal/5" : "border-siap-gray hover:border-siap-ink"}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(event) => select(event.target.files?.[0])}
      />
      <UploadCloud className="w-7 h-7 text-siap-ink/60 mx-auto mb-3" />
      <p className="font-medium">
        {t(
          "Drag and drop the application PDF",
          "Seret dan lepaskan PDF permohonan",
        )}
      </p>
      <p className="text-sm text-siap-ink/60 mt-1">
        {t(
          "or click to browse on this device",
          "atau klik untuk menyemak imbas peranti ini",
        )}
      </p>
    </div>
  );
}
