import { v } from "convex/values";

export const applicationState = v.union(
  v.literal("draft"),
  v.literal("reading_requirements"),
  v.literal("checking_eligibility"),
  v.literal("challenging_assumptions"),
  v.literal("building_plan"),
  v.literal("complete"),
  v.literal("failed"),
);

export const applicationOutcome = v.union(
  v.literal("analysing"),
  v.literal("action_required"),
  v.literal("ready_to_submit"),
  v.literal("likely_ineligible"),
  v.literal("failed"),
);

export const stageName = v.union(
  v.literal("requirement_compiler"),
  v.literal("eligibility_mapper"),
  v.literal("red_team_reviewer"),
  v.literal("action_planner"),
);

export const stageStatus = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("complete"),
  v.literal("failed"),
);

export const requirementState = v.union(
  v.literal("confirmed"),
  v.literal("needs_verification"),
  v.literal("incomplete"),
  v.literal("not_met"),
);

export const requirementKind = v.union(
  v.literal("citizenship"),
  v.literal("age"),
  v.literal("income"),
  v.literal("study_level"),
  v.literal("document"),
  v.literal("deadline"),
  v.literal("numeric"),
  v.literal("other"),
);

export const documentStatus = v.union(
  v.literal("ready"),
  v.literal("expiring"),
  v.literal("missing"),
  v.literal("needs_certification"),
);

export const urgency = v.union(
  v.literal("critical"),
  v.literal("required"),
  v.literal("optional"),
);

export const confidence = v.union(
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
);

export const documentFlags = v.object({
  hasTranscript: v.boolean(),
  hasIcCopy: v.boolean(),
  hasIncomeStatement: v.boolean(),
  hasRefereeLetter: v.boolean(),
});

export const profileFields = {
  name: v.string(),
  citizenship: v.string(),
  dateOfBirth: v.string(),
  institution: v.string(),
  course: v.string(),
  studyLevel: v.string(),
  householdIncome: v.number(),
  documentFlags,
};
