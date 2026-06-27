"use client";

import React from "react";
import { AlertOctagon, RotateCcw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface ErrorStateProps {
  title: string;
  description: string;
  onRetry?: () => void;
}

export function ErrorState({ title, description, onRetry }: ErrorStateProps) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center border border-siap-red/20 bg-siap-red/5 rounded">
      <div className="w-12 h-12 bg-white rounded flex items-center justify-center border border-siap-red/20 shadow-sm mb-4 text-siap-red">
        <AlertOctagon className="w-6 h-6" />
      </div>
      <h3 className="font-medium text-lg mb-1 text-siap-ink">{title}</h3>
      <p className="text-siap-ink/70 max-w-sm mb-6 text-sm">{description}</p>

      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 justify-center px-4 py-2 bg-white border border-siap-gray text-siap-ink font-medium rounded text-sm hover:bg-siap-gray/10 transition-colors shadow-sm"
        >
          <RotateCcw className="w-4 h-4" />
          {t("Try again", "Cuba lagi")}
        </button>
      )}
    </div>
  );
}
