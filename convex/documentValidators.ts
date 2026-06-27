import { v } from "convex/values";
import {
  applicationOutcome,
  applicationState,
  confidence,
  documentFlags,
  requirementKind,
  requirementState,
  stageName,
  stageStatus,
  urgency,
} from "./validators";

export const applicationDoc = v.object({
  _id: v.id("applications"),
  _creationTime: v.number(),
  userId: v.id("users"),
  name: v.string(),
  sourceFileName: v.string(),
  state: applicationState,
  outcome: applicationOutcome,
  deadline: v.optional(v.string()),
  summary: v.optional(v.string()),
  readinessScore: v.number(),
  evidenceScore: v.number(),
  actionScore: v.number(),
  analysisGeneration: v.optional(v.number()),
  promptVersion: v.string(),
  errorCode: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
});

export const profileDoc = v.object({
  _id: v.id("profiles"),
  _creationTime: v.number(),
  userId: v.id("users"),
  name: v.string(),
  citizenship: v.string(),
  dateOfBirth: v.string(),
  institution: v.string(),
  course: v.string(),
  studyLevel: v.string(),
  householdIncome: v.number(),
  documentFlags,
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const stageDoc = v.object({
  _id: v.id("analysisStages"),
  _creationTime: v.number(),
  userId: v.id("users"),
  applicationId: v.id("applications"),
  stage: stageName,
  order: v.number(),
  generation: v.optional(v.number()),
  status: stageStatus,
  attempt: v.number(),
  errorCode: v.optional(v.string()),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  updatedAt: v.number(),
});

export const eventDoc = v.object({
  _id: v.id("analysisEvents"),
  _creationTime: v.number(),
  userId: v.id("users"),
  applicationId: v.id("applications"),
  stage: stageName,
  type: v.union(
    v.literal("started"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("retrying"),
  ),
  messageKey: v.string(),
  createdAt: v.number(),
});

export const modelRunDoc = v.object({
  _id: v.id("modelRuns"),
  _creationTime: v.number(),
  userId: v.id("users"),
  applicationId: v.id("applications"),
  stage: stageName,
  model: v.string(),
  confidentialCompute: v.boolean(),
  durationMs: v.number(),
  inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
  promptVersion: v.string(),
  outcome: v.union(v.literal("success"), v.literal("failed")),
  createdAt: v.number(),
});

const requirementFields = {
  _id: v.id("requirements"),
  _creationTime: v.number(),
  userId: v.id("users"),
  applicationId: v.id("applications"),
  key: v.string(),
  label: v.string(),
  description: v.optional(v.string()),
  kind: requirementKind,
  state: requirementState,
  weight: v.number(),
  mandatory: v.boolean(),
  conditionType: v.optional(
    v.union(
      v.literal("citizenship_equals"),
      v.literal("age_max_on"),
      v.literal("income_max"),
      v.literal("study_level_in"),
      v.literal("document_present"),
      v.literal("deadline_after"),
      v.literal("numeric"),
      v.literal("other"),
    ),
  ),
  expectedString: v.optional(v.string()),
  threshold: v.optional(v.number()),
  operator: v.optional(
    v.union(
      v.literal("lt"),
      v.literal("lte"),
      v.literal("eq"),
      v.literal("gte"),
      v.literal("gt"),
    ),
  ),
  profileField: v.optional(v.literal("householdIncome")),
  comparisonDate: v.optional(v.string()),
  acceptedValues: v.optional(v.array(v.string())),
  documentNames: v.optional(v.array(v.string())),
  citationVerified: v.boolean(),
  deterministicResult: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const requirementDoc = v.object(requirementFields);

export const evidenceDoc = v.object({
  _id: v.id("requirementEvidence"),
  _creationTime: v.number(),
  userId: v.id("users"),
  applicationId: v.id("applications"),
  requirementId: v.id("requirements"),
  documentName: v.string(),
  pageNumber: v.optional(v.number()),
  excerpt: v.string(),
  matchKind: v.union(
    v.literal("document"),
    v.literal("profile"),
    v.literal("deterministic"),
    v.literal("none"),
  ),
  confidence,
  citationVerified: v.boolean(),
  createdAt: v.number(),
});

export const requirementWithEvidenceDoc = v.object({
  ...requirementFields,
  evidence: v.array(evidenceDoc),
});

export const missingDocumentDoc = v.object({
  _id: v.id("missingDocuments"),
  _creationTime: v.number(),
  userId: v.id("users"),
  applicationId: v.id("applications"),
  requirementId: v.optional(v.id("requirements")),
  name: v.string(),
  urgency,
  owner: v.string(),
  suggestedDate: v.string(),
  action: v.string(),
  createdAt: v.number(),
});

const actionFields = {
  _id: v.id("actionItems"),
  _creationTime: v.number(),
  userId: v.id("users"),
  applicationId: v.id("applications"),
  clientKey: v.string(),
  description: v.string(),
  owner: v.optional(v.string()),
  urgency: v.optional(urgency),
  status: v.union(v.literal("pending"), v.literal("completed")),
  position: v.number(),
  emailDraft: v.optional(v.string()),
  createdAt: v.number(),
  completedAt: v.optional(v.number()),
};

export const actionWithDependenciesDoc = v.object({
  ...actionFields,
  dependencies: v.array(v.id("actionItems")),
});

export const reportBundle = v.object({
  application: applicationDoc,
  requirements: v.array(requirementWithEvidenceDoc),
  missingDocuments: v.array(missingDocumentDoc),
  actions: v.array(actionWithDependenciesDoc),
  modelRuns: v.array(modelRunDoc),
});

export const analysisContext = v.object({
  application: applicationDoc,
  profile: profileDoc,
  requirements: v.array(requirementDoc),
  evidence: v.array(evidenceDoc),
  modelRuns: v.array(modelRunDoc),
});
