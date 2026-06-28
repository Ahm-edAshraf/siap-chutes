import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  applicationOutcome,
  applicationState,
  confidence,
  documentFlags,
  documentStatus,
  requirementKind,
  requirementState,
  stageName,
  stageStatus,
  urgency,
} from "./validators";

export default defineSchema({
  users: defineTable({
    subject: v.string(),
    username: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    createdAt: v.number(),
    lastSeenAt: v.number(),
  }).index("by_subject", ["subject"]),

  profiles: defineTable({
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
  }).index("by_user", ["userId"]),

  applications: defineTable({
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
  })
    .index("by_user", ["userId"])
    .index("by_user_updated", ["userId", "updatedAt"])
    .index("by_user_state", ["userId", "state"]),

  analysisStages: defineTable({
    userId: v.id("users"),
    applicationId: v.id("applications"),
    stage: stageName,
    order: v.number(),
    generation: v.optional(v.number()),
    status: stageStatus,
    attempt: v.number(),
    errorCode: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    readyAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_application", ["applicationId", "order"])
    .index("by_application_stage", ["applicationId", "stage"])
    .index("by_user_status", ["userId", "status"]),

  analysisEvents: defineTable({
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
  })
    .index("by_application", ["applicationId", "createdAt"])
    .index("by_user", ["userId", "createdAt"]),

  modelRuns: defineTable({
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
  })
    .index("by_application", ["applicationId", "createdAt"])
    .index("by_user", ["userId", "createdAt"]),

  requirements: defineTable({
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
  })
    .index("by_application", ["applicationId"])
    .index("by_application_key", ["applicationId", "key"])
    .index("by_application_state", ["applicationId", "state"])
    .index("by_user", ["userId"]),

  requirementEvidence: defineTable({
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
  })
    .index("by_requirement", ["requirementId"])
    .index("by_application", ["applicationId"])
    .index("by_user", ["userId"]),

  missingDocuments: defineTable({
    userId: v.id("users"),
    applicationId: v.id("applications"),
    requirementId: v.optional(v.id("requirements")),
    name: v.string(),
    urgency,
    owner: v.string(),
    suggestedDate: v.string(),
    action: v.string(),
    createdAt: v.number(),
  })
    .index("by_application", ["applicationId"])
    .index("by_user", ["userId"]),

  actionItems: defineTable({
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
  })
    .index("by_application", ["applicationId", "position"])
    .index("by_application_key", ["applicationId", "clientKey"])
    .index("by_user_status", ["userId", "status"]),

  actionDependencies: defineTable({
    userId: v.id("users"),
    applicationId: v.id("applications"),
    actionId: v.id("actionItems"),
    dependsOnActionId: v.id("actionItems"),
    createdAt: v.number(),
  })
    .index("by_action", ["actionId"])
    .index("by_application", ["applicationId"])
    .index("by_user", ["userId"]),

  inventoryDocuments: defineTable({
    userId: v.id("users"),
    name: v.string(),
    status: documentStatus,
    lastUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_name", ["userId", "name"]),
});
