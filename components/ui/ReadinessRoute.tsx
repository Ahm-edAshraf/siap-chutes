"use client";

import React from "react";
import { CheckCircle2, Circle, AlertCircle } from "lucide-react";

export type RouteStepStatus = "complete" | "current" | "attention" | "upcoming";

export interface RouteStep {
  id: string;
  label: string;
  status: RouteStepStatus;
  description?: string;
}

interface ReadinessRouteProps {
  steps: RouteStep[];
  className?: string;
}

export function ReadinessRoute({ steps, className = "" }: ReadinessRouteProps) {
  return (
    <div className={`relative ${className}`}>
      {/* Vertical line connecting steps */}
      <div className="absolute left-[11px] top-3 bottom-4 w-px bg-siap-gray" />

      <ul className="relative space-y-6">
        {steps.map((step) => {
          return (
            <li key={step.id} className="relative flex gap-4">
              <div className="relative z-10 flex-shrink-0 bg-siap-paper py-1">
                {step.status === "complete" && (
                  <CheckCircle2 className="w-6 h-6 text-siap-green" />
                )}
                {step.status === "current" && (
                  <div className="w-6 h-6 rounded-full border-2 border-siap-ink flex items-center justify-center bg-siap-paper">
                    <div className="w-2 h-2 rounded-full bg-siap-ink" />
                  </div>
                )}
                {step.status === "attention" && (
                  <AlertCircle className="w-6 h-6 text-siap-red" />
                )}
                {step.status === "upcoming" && (
                  <Circle className="w-6 h-6 text-siap-gray" />
                )}
              </div>

              <div className="pt-1">
                <p
                  className={`font-medium ${
                    step.status === "attention"
                      ? "text-siap-red"
                      : step.status === "upcoming"
                        ? "text-siap-ink/50"
                        : "text-siap-ink"
                  }`}
                >
                  {step.label}
                </p>
                {step.description && (
                  <p
                    className={`text-sm mt-0.5 ${
                      step.status === "attention"
                        ? "text-siap-red/80"
                        : "text-siap-ink/70"
                    }`}
                  >
                    {step.description}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
