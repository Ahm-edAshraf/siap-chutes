"use client";

import React from "react";
import { FileText } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface SourceChipProps {
  source: string;
  onClick?: () => void;
  className?: string;
}

export function SourceChip({
  source,
  onClick,
  className = "",
}: SourceChipProps) {
  const { t } = useLanguage();
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs text-siap-teal bg-siap-teal/5 border border-siap-teal/20 rounded hover:bg-siap-teal/10 transition-colors ${className}`}
      title={t("View source document", "Lihat dokumen sumber")}
    >
      <FileText className="w-3 h-3" />
      <span className="font-medium">{source}</span>
    </button>
  );
}
