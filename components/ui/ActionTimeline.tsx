"use client";

import React from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ActionView } from "@/lib/presentation";
import { CheckCircle2, Circle } from "lucide-react";

interface ActionTimelineProps {
  actions: ActionView[];
  onToggleAction?: (id: string) => void;
  className?: string;
}

export function ActionTimeline({
  actions,
  onToggleAction,
  className = "",
}: ActionTimelineProps) {
  const { t } = useLanguage();
  return (
    <div className={`relative ${className}`}>
      <div className="absolute left-[11px] top-3 bottom-4 w-px bg-siap-gray" />

      <ul className="relative space-y-4">
        {actions.map((action, index) => {
          const isCompleted = action.status === "completed";
          const isBlocked = action.dependencies.some(
            (depId) =>
              actions.find((a) => a.id === depId)?.status !== "completed",
          );
          const numberStr = (index + 1).toString();

          return (
            <li key={action.id} className="relative flex gap-4">
              <button
                onClick={() => onToggleAction && onToggleAction(action.id)}
                disabled={!onToggleAction || isBlocked}
                aria-disabled={isBlocked}
                className={`relative z-10 flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-siap-paper ${
                  isCompleted
                    ? "text-siap-green"
                    : isBlocked
                      ? "text-siap-ink/20 cursor-not-allowed"
                      : "text-siap-ink/50 hover:text-siap-ink transition-colors"
                }`}
                title={
                  isBlocked
                    ? t(
                        "Complete previous actions first",
                        "Lengkapkan tindakan sebelumnya dahulu",
                      )
                    : isCompleted
                      ? t("Mark incomplete", "Tandakan belum lengkap")
                      : t("Mark complete", "Tandakan lengkap")
                }
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : (
                  <Circle className="w-6 h-6" />
                )}

                {/* Number overlay */}
                {!isCompleted && (
                  <span className="absolute text-[10px] font-medium font-sans">
                    {numberStr}
                  </span>
                )}
              </button>

              <div className="pt-0.5 pb-2">
                <p
                  className={`font-medium ${isCompleted ? "text-siap-ink/50 line-through" : "text-siap-ink"}`}
                >
                  {action.description}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
