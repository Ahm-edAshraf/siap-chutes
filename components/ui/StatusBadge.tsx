import React from "react";
import { useLanguage } from "@/contexts/LanguageContext";

type BadgeVariant = "success" | "warning" | "error" | "neutral" | "info";

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  className?: string;
}

export function StatusBadge({
  label,
  variant = "neutral",
  className = "",
}: StatusBadgeProps) {
  const { t } = useLanguage();

  // Try to translate common labels if matched, otherwise fallback to original
  let translatedLabel = label;
  switch (label) {
    case "Action required":
      translatedLabel = t("Action required", "Tindakan diperlukan");
      break;
    case "Ready to submit":
      translatedLabel = t("Ready to submit", "Sedia untuk dihantar");
      break;
    case "Analysing":
      translatedLabel = t("Analysing", "Sedang dianalisis");
      break;
    case "Ready":
      translatedLabel = t("Ready", "Sedia");
      break;
    case "Missing":
      translatedLabel = t("Missing", "Hilang");
      break;
    case "Needs certification":
      translatedLabel = t("Needs certification", "Perlu pengesahan");
      break;
    case "Expiring":
      translatedLabel = t("Expiring", "Akan tamat tempoh");
      break;
    case "Required":
      translatedLabel = t("Required", "Diperlukan");
      break;
    case "Critical":
      translatedLabel = t("Critical", "Kritikal");
      break;
    case "Pending":
      translatedLabel = t("Pending", "Tertunggak");
      break;
    case "Likely ineligible":
      translatedLabel = t("Likely ineligible", "Kemungkinan tidak layak");
      break;
    case "Failed":
      translatedLabel = t("Failed", "Gagal");
      break;
    case "Not met":
      translatedLabel = t("Not met", "Tidak dipenuhi");
      break;
  }

  const baseClasses =
    "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium tracking-wide border";

  const variants: Record<BadgeVariant, string> = {
    success: "bg-siap-green/10 text-siap-green border-siap-green/20",
    warning: "bg-siap-amber/10 text-siap-amber border-siap-amber/20",
    error: "bg-siap-red/10 text-siap-red border-siap-red/20",
    info: "bg-siap-teal/10 text-siap-teal border-siap-teal/20",
    neutral: "bg-siap-gray/20 text-siap-ink border-siap-gray",
  };

  return (
    <span className={`${baseClasses} ${variants[variant]} ${className}`}>
      {translatedLabel}
    </span>
  );
}
