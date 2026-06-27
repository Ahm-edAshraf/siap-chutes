"use client";

import React from "react";
import { motion } from "motion/react";

interface ReadinessScoreProps {
  score: number;
  className?: string;
  label?: string;
}

export function ReadinessScore({
  score,
  className = "",
  label = "Ready",
}: ReadinessScoreProps) {
  // 0-49: red, 50-79: amber, 80-100: green
  const color =
    score >= 80
      ? "text-siap-green"
      : score >= 50
        ? "text-siap-amber"
        : "text-siap-red";

  // Circumference of the circle
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: 96, height: 96 }}
    >
      <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 96 96">
        <circle
          className="text-siap-gray/30"
          strokeWidth="6"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="48"
          cy="48"
        />
        <motion.circle
          className={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx="48"
          cy="48"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className={`text-2xl font-serif font-medium ${color}`}>
          {score}%
        </span>
        <span className="text-[10px] uppercase tracking-widest text-siap-ink/60">
          {label}
        </span>
      </div>
    </div>
  );
}
