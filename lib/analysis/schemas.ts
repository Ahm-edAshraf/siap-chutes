import { z } from "zod";

export const stageNames = [
  "requirement_compiler",
  "eligibility_mapper",
  "red_team_reviewer",
  "action_planner",
] as const;

export const stageNameSchema = z.enum(stageNames);
export type StageName = z.infer<typeof stageNameSchema>;

export const documentPageSchema = z.object({
  pageNumber: z.number().int().positive(),
  text: z.string(),
});

export const extractedDocumentSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  pages: z.array(documentPageSchema).min(1).max(50),
});

export const stageRequestSchema = z.object({
  documents: z.array(extractedDocumentSchema).min(1).max(6),
});

export type ExtractedDocument = z.infer<typeof extractedDocumentSchema>;

export const conditionSchema = z.object({
  type: z.enum([
    "citizenship_equals",
    "age_max_on",
    "income_max",
    "study_level_in",
    "document_present",
    "deadline_after",
    "numeric",
    "other",
  ]),
  expectedString: z.string().optional(),
  threshold: z.number().finite().optional(),
  operator: z.enum(["lt", "lte", "eq", "gte", "gt"]).optional(),
  profileField: z.literal("householdIncome").optional(),
  comparisonDate: z.iso.date().optional(),
  acceptedValues: z.array(z.string()).max(20).optional(),
  documentNames: z.array(z.string()).max(20).optional(),
});

export const modelCitationSchema = z.object({
  documentName: z.string().min(1).max(255),
  pageNumber: z.number().int().positive().optional(),
  quote: z.string().min(1).max(500),
  confidence: z.enum(["high", "medium", "low"]).default("medium"),
});

export const compilerOutputSchema = z.object({
  programme: z.object({
    name: z.string().min(1).max(200),
    deadline: z.string().max(100).optional(),
    summary: z.string().min(1).max(500),
  }),
  requirements: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z0-9_]{1,64}$/),
        label: z.string().min(1).max(200),
        description: z.string().max(500).optional(),
        kind: z.enum([
          "citizenship",
          "age",
          "income",
          "study_level",
          "document",
          "deadline",
          "numeric",
          "other",
        ]),
        weight: z.number().positive().max(100),
        mandatory: z.boolean(),
        condition: conditionSchema.optional(),
        citation: modelCitationSchema,
      }),
    )
    .min(1)
    .max(100),
});

export const mapperOutputSchema = z.object({
  mappings: z
    .array(
      z.object({
        requirementKey: z.string().min(1).max(64),
        proposedState: z.enum([
          "confirmed",
          "needs_verification",
          "incomplete",
          "not_met",
        ]),
        reason: z.string().min(1).max(500),
        citation: modelCitationSchema,
      }),
    )
    .max(100),
});

export const reviewerOutputSchema = z.object({
  reviews: z
    .array(
      z.object({
        requirementKey: z.string().min(1).max(64),
        state: z.enum([
          "confirmed",
          "needs_verification",
          "incomplete",
          "not_met",
        ]),
        reason: z.string().min(1).max(500),
      }),
    )
    .max(100),
});

export const plannerOutputSchema = z.object({
  missingDocuments: z
    .array(
      z.object({
        requirementKey: z.string().max(64).optional(),
        name: z.string().min(1).max(200),
        urgency: z.enum(["critical", "required", "optional"]),
        owner: z.string().min(1).max(100),
        suggestedDate: z.string().min(1).max(100),
        action: z.string().min(1).max(200),
      }),
    )
    .max(100),
  actions: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z0-9_]{1,64}$/),
        description: z.string().min(1).max(300),
        owner: z.string().max(100).optional(),
        urgency: z.enum(["critical", "required", "optional"]).optional(),
        dependsOn: z.array(z.string().max(64)).max(20),
        emailDraft: z.string().max(2_000).optional(),
      }),
    )
    .max(100),
});

export const outputSchemas = {
  requirement_compiler: compilerOutputSchema,
  eligibility_mapper: mapperOutputSchema,
  red_team_reviewer: reviewerOutputSchema,
  action_planner: plannerOutputSchema,
} as const;

export type CompilerOutput = z.infer<typeof compilerOutputSchema>;
export type MapperOutput = z.infer<typeof mapperOutputSchema>;
export type ReviewerOutput = z.infer<typeof reviewerOutputSchema>;
export type PlannerOutput = z.infer<typeof plannerOutputSchema>;
