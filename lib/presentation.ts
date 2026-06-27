export type RequirementView = {
  id: string;
  label: string;
  status: "confirmed" | "needs_verification" | "incomplete" | "not_met";
  evidence: string;
  confidence: "high" | "medium" | "low";
  source: string;
  pageNumber?: number;
  citationVerified: boolean;
};

export type ActionView = {
  id: string;
  description: string;
  dependencies: string[];
  status: "pending" | "completed";
  emailDraft?: string;
};

export function outcomeLabel(outcome: string) {
  switch (outcome) {
    case "ready_to_submit":
      return "Ready to submit";
    case "action_required":
      return "Action required";
    case "likely_ineligible":
      return "Likely ineligible";
    case "failed":
      return "Failed";
    default:
      return "Analysing";
  }
}

export function outcomeVariant(outcome: string) {
  if (outcome === "ready_to_submit") return "success" as const;
  if (outcome === "likely_ineligible" || outcome === "failed")
    return "error" as const;
  if (outcome === "action_required") return "warning" as const;
  return "info" as const;
}

export function requirementStatus(state: string): RequirementView["status"] {
  if (state === "confirmed") return "confirmed";
  if (state === "incomplete") return "incomplete";
  if (state === "not_met") return "not_met";
  return "needs_verification";
}
