"use client";

import React from "react";
import { CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { RequirementView } from "@/lib/presentation";
import { SourceChip } from "./SourceChip";

interface RequirementRowProps {
  requirement: RequirementView;
  onSourceClick: (req: RequirementView) => void;
}

export function RequirementRow({
  requirement,
  onSourceClick,
}: RequirementRowProps) {
  const { t } = useLanguage();
  const isConfirmed = requirement.status === "confirmed";
  const isNeedsVerification = requirement.status === "needs_verification";
  const isIncomplete =
    requirement.status === "incomplete" || requirement.status === "not_met";
  const statusLabel =
    requirement.status === "confirmed"
      ? t("Confirmed", "Disahkan")
      : requirement.status === "needs_verification"
        ? t("Needs verification", "Perlu pengesahan")
        : requirement.status === "not_met"
          ? t("Not met", "Tidak dipenuhi")
          : t("Incomplete", "Tidak lengkap");

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 py-4 rule-bottom last:border-b-0 items-start hover:bg-siap-gray/5 transition-colors -mx-4 px-4">
      <div className="md:col-span-4 flex gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {isConfirmed && <CheckCircle2 className="w-5 h-5 text-siap-green" />}
          {isNeedsVerification && (
            <HelpCircle className="w-5 h-5 text-siap-amber" />
          )}
          {isIncomplete && <XCircle className="w-5 h-5 text-siap-red" />}
        </div>
        <div>
          <p className="font-medium text-siap-ink">{requirement.label}</p>
          <div className="flex items-center gap-2 mt-1 md:hidden">
            <span
              className={`text-xs ${
                isConfirmed
                  ? "text-siap-green"
                  : isNeedsVerification
                    ? "text-siap-amber"
                    : "text-siap-red"
              }`}
            >
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="md:col-span-5 text-sm text-siap-ink/80 pt-0.5">
        {requirement.evidence}
      </div>

      <div className="md:col-span-3 flex justify-start md:justify-end items-center pt-0.5">
        <SourceChip
          source={requirement.source}
          onClick={() => onSourceClick(requirement)}
        />
      </div>
    </div>
  );
}
