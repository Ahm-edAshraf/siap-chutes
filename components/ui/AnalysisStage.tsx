"use client";

import React from "react";
import { motion } from "motion/react";
import { CheckCircle2, Loader2, Circle, ShieldCheck } from "lucide-react";

export type StageStatus = "queued" | "running" | "ready" | "complete";

export interface Stage {
  id: string;
  label: string;
  status: StageStatus;
  subEvents: string[];
}

interface AnalysisStageProps {
  stage: Stage;
  isActive: boolean;
}

export function AnalysisStage({ stage, isActive }: AnalysisStageProps) {
  return (
    <div
      className={`flex gap-4 p-4 rounded border transition-colors ${
        isActive
          ? "border-siap-ink bg-white shadow-sm"
          : stage.status === "complete" || stage.status === "ready"
            ? "border-siap-gray/50 bg-siap-gray/5"
            : "border-siap-gray/30 opacity-50"
      }`}
    >
      <div className="flex-shrink-0 mt-1">
        {stage.status === "complete" && (
          <CheckCircle2 className="w-5 h-5 text-siap-green" />
        )}
        {stage.status === "running" && (
          <Loader2 className="w-5 h-5 text-siap-teal animate-spin" />
        )}
        {stage.status === "ready" && (
          <ShieldCheck className="w-5 h-5 text-siap-teal" />
        )}
        {stage.status === "queued" && (
          <Circle className="w-5 h-5 text-siap-gray" />
        )}
      </div>

      <div className="flex-1">
        <h3
          className={`font-medium ${isActive ? "text-siap-ink" : "text-siap-ink/70"}`}
        >
          {stage.label}
        </h3>

        {stage.subEvents.length > 0 && (
          <div className="mt-3 space-y-2">
            {stage.subEvents.map((event, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-siap-ink/70 flex items-start gap-2"
              >
                <div className="w-1 h-1 rounded-full bg-siap-gray mt-2 flex-shrink-0" />
                <span>{event}</span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
