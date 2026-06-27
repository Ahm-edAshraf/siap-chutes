/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function runArgs(run: { generation: number; attempt: number }) {
  return { generation: run.generation, attempt: run.attempt };
}

async function createApplication(subject = "alice") {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({
    subject,
    tokenIdentifier: `issuer|${subject}`,
    username: subject,
    role: "user",
  });
  await user.mutation(api.users.sync);
  await user.mutation(api.profiles.upsert, {
    name: "Aina Demo",
    citizenship: "Malaysian",
    dateOfBirth: "2004-03-12",
    institution: "Demo University",
    course: "Computer Science",
    studyLevel: "Undergraduate",
    householdIncome: 4_500,
    documentFlags: {
      hasTranscript: false,
      hasIcCopy: true,
      hasIncomeStatement: false,
      hasRefereeLetter: false,
    },
  });
  const applicationId = await user.mutation(api.applications.create, {
    sourceFileName: "demo.pdf",
  });
  return { t, user, applicationId };
}

describe("Convex authorization", () => {
  test("requires authentication and isolates users", async () => {
    const { t, applicationId } = await createApplication();
    await expect(t.query(api.users.current)).resolves.toBeNull();
    const bob = t.withIdentity({
      subject: "bob",
      tokenIdentifier: "issuer|bob",
      username: "bob",
      role: "user",
    });
    await bob.mutation(api.users.sync);
    await expect(
      bob.query(api.applications.get, { id: applicationId }),
    ).resolves.toBeNull();
    await expect(
      bob.mutation(api.applications.remove, { id: applicationId }),
    ).rejects.toThrow("Application not found");
  });

  test("enforces the analysis-service role", async () => {
    const { t, user, applicationId } = await createApplication();
    await expect(
      user.mutation(api.analysis.beginStage, {
        applicationId,
        stage: "requirement_compiler",
      }),
    ).rejects.toThrow("Unauthorized");
    const service = t.withIdentity({
      subject: "alice",
      tokenIdentifier: "issuer|alice-service",
      username: "alice",
      role: "analysis_service",
    });
    await expect(
      service.mutation(api.analysis.beginStage, {
        applicationId,
        stage: "requirement_compiler",
      }),
    ).resolves.toMatchObject({ status: "started" });
    const bobService = t.withIdentity({
      subject: "bob",
      tokenIdentifier: "issuer|bob-service",
      username: "bob",
      role: "analysis_service",
    });
    await bobService.mutation(api.users.sync);
    await expect(
      bobService.mutation(api.analysis.beginStage, {
        applicationId,
        stage: "requirement_compiler",
      }),
    ).rejects.toThrow("Application not found");
  });

  test("rejects malformed profile and oversized persistent fields", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({
      subject: "validation-user",
      tokenIdentifier: "issuer|validation-user",
      username: "validation-user",
      role: "user",
    });
    await user.mutation(api.users.sync);
    const baseProfile = {
      name: "Aina Demo",
      citizenship: "Malaysian",
      dateOfBirth: "2004-03-12",
      institution: "Demo University",
      course: "Computer Science",
      studyLevel: "Undergraduate",
      householdIncome: 4_500,
      documentFlags: {
        hasTranscript: false,
        hasIcCopy: true,
        hasIncomeStatement: false,
        hasRefereeLetter: false,
      },
    };
    await expect(
      user.mutation(api.profiles.upsert, {
        ...baseProfile,
        dateOfBirth: "2004-02-30",
      }),
    ).rejects.toThrow("valid past ISO date");
    await user.mutation(api.profiles.upsert, baseProfile);
    await expect(
      user.mutation(api.applications.create, {
        sourceFileName: `${"x".repeat(256)}.pdf`,
      }),
    ).rejects.toThrow("1-255 characters");
    await expect(
      user.mutation(api.inventory.upsert, {
        name: "x".repeat(201),
        status: "ready",
      }),
    ).rejects.toThrow("must not exceed 200");
  });
});

describe("Convex analysis lifecycle", () => {
  test("persists a safe failure and resets every stage for retry", async () => {
    const { t, user, applicationId } = await createApplication();
    const service = t.withIdentity({
      subject: "alice",
      tokenIdentifier: "issuer|alice-service",
      username: "alice",
      role: "analysis_service",
    });
    const failedRun = await service.mutation(api.analysis.beginStage, {
      applicationId,
      stage: "requirement_compiler",
    });
    await service.mutation(api.analysis.failStage, {
      applicationId,
      stage: "requirement_compiler",
      ...runArgs(failedRun),
      errorCode: "MALFORMED_MODEL_OUTPUT",
      model: "primary-tee",
      confidentialCompute: true,
      durationMs: 10,
      promptVersion: "test",
    });
    const failed = await user.query(api.applications.getProgress, {
      id: applicationId,
    });
    expect(failed?.application).toMatchObject({
      state: "failed",
      outcome: "failed",
      errorCode: "MALFORMED_MODEL_OUTPUT",
    });

    await user.mutation(api.applications.retry, {
      id: applicationId,
      sourceFileName: "reselected.pdf",
    });
    const retried = await user.query(api.applications.getProgress, {
      id: applicationId,
    });
    expect(retried?.application).toMatchObject({
      state: "draft",
      outcome: "analysing",
      readinessScore: 0,
      evidenceScore: 0,
      actionScore: 0,
      sourceFileName: "reselected.pdf",
    });
    expect(retried?.stages).toHaveLength(4);
    expect(retried?.stages.every((stage) => stage.status === "pending")).toBe(
      true,
    );
    expect(retried?.events).toHaveLength(0);
  });

  test("restarts an interrupted stage after source files are reselected", async () => {
    const { t, user, applicationId } = await createApplication();
    const service = t.withIdentity({
      subject: "alice",
      tokenIdentifier: "issuer|alice-service",
      username: "alice",
      role: "analysis_service",
    });
    const staleRun = await service.mutation(api.analysis.beginStage, {
      applicationId,
      stage: "requirement_compiler",
    });
    await user.mutation(api.applications.retry, {
      id: applicationId,
      sourceFileName: "reselected.pdf",
    });
    const progress = await user.query(api.applications.getProgress, {
      id: applicationId,
    });
    expect(progress?.application).toMatchObject({
      state: "draft",
      sourceFileName: "reselected.pdf",
    });
    expect(progress?.stages).toHaveLength(4);
    expect(progress?.stages.every((stage) => stage.status === "pending")).toBe(
      true,
    );
    expect(progress?.events).toHaveLength(0);
    await expect(
      service.mutation(api.analysis.failStage, {
        applicationId,
        stage: "requirement_compiler",
        ...runArgs(staleRun),
        errorCode: "LATE_STALE_FAILURE",
        promptVersion: "test",
      }),
    ).rejects.toThrow("STALE_ANALYSIS_RUN");
  });

  test("is sequential, idempotent, and cascades deletion", async () => {
    const { t, user, applicationId } = await createApplication();
    const service = t.withIdentity({
      subject: "alice",
      tokenIdentifier: "issuer|alice-service",
      username: "alice",
      role: "analysis_service",
    });
    await expect(
      service.mutation(api.analysis.beginStage, {
        applicationId,
        stage: "eligibility_mapper",
      }),
    ).rejects.toThrow("sequentially");
    const compilerRun = await service.mutation(api.analysis.beginStage, {
      applicationId,
      stage: "requirement_compiler",
    });
    await service.mutation(api.analysis.applyRequirementCompiler, {
      applicationId,
      ...runArgs(compilerRun),
      programme: { name: "Demo Award", summary: "Fictional award" },
      requirements: [
        {
          key: "citizenship",
          label: "Malaysian citizen",
          kind: "citizenship",
          weight: 1,
          mandatory: true,
          condition: {
            type: "citizenship_equals",
            expectedString: "Malaysian",
          },
          citation: {
            documentName: "demo.pdf",
            pageNumber: 1,
            excerpt: "must be a Malaysian citizen",
            confidence: "high",
            verified: true,
            matchKind: "document",
          },
        },
      ],
    });
    await service.mutation(api.analysis.finishStage, {
      applicationId,
      stage: "requirement_compiler",
      ...runArgs(compilerRun),
      model: "tee-model",
      confidentialCompute: true,
      durationMs: 10,
      promptVersion: "test",
    });
    await expect(
      service.mutation(api.analysis.finishStage, {
        applicationId,
        stage: "requirement_compiler",
        ...runArgs(compilerRun),
        model: "tee-model",
        confidentialCompute: true,
        durationMs: 10,
        promptVersion: "test",
      }),
    ).resolves.toBeNull();
    expect(
      await t.run(
        async (ctx) => (await ctx.db.query("modelRuns").collect()).length,
      ),
    ).toBe(1);
    await expect(
      service.mutation(api.analysis.beginStage, {
        applicationId,
        stage: "requirement_compiler",
      }),
    ).resolves.toMatchObject({ status: "already_complete" });

    await user.mutation(api.applications.remove, { id: applicationId });
    const counts = await t.run(async (ctx) => ({
      applications: (await ctx.db.query("applications").collect()).length,
      stages: (await ctx.db.query("analysisStages").collect()).length,
      requirements: (await ctx.db.query("requirements").collect()).length,
      evidence: (await ctx.db.query("requirementEvidence").collect()).length,
      modelRuns: (await ctx.db.query("modelRuns").collect()).length,
    }));
    expect(counts).toEqual({
      applications: 0,
      stages: 0,
      requirements: 0,
      evidence: 0,
      modelRuns: 0,
    });
  });

  test("enforces action dependencies and recalculates action readiness", async () => {
    const { t, user, applicationId } = await createApplication();
    const ids = await t.run(async (ctx) => {
      const owner = await ctx.db
        .query("users")
        .withIndex("by_subject", (q) => q.eq("subject", "alice"))
        .unique();
      const first = await ctx.db.insert("actionItems", {
        userId: owner!._id,
        applicationId,
        clientKey: "first",
        description: "Collect evidence",
        status: "pending",
        position: 0,
        createdAt: Date.now(),
      });
      const second = await ctx.db.insert("actionItems", {
        userId: owner!._id,
        applicationId,
        clientKey: "second",
        description: "Submit",
        status: "pending",
        position: 1,
        createdAt: Date.now(),
      });
      await ctx.db.insert("actionDependencies", {
        userId: owner!._id,
        applicationId,
        actionId: second,
        dependsOnActionId: first,
        createdAt: Date.now(),
      });
      return { first, second };
    });
    await expect(
      user.mutation(api.actions.setCompleted, {
        id: ids.second,
        completed: true,
      }),
    ).rejects.toThrow("dependent actions");
    await user.mutation(api.actions.setCompleted, {
      id: ids.first,
      completed: true,
    });
    await user.mutation(api.actions.setCompleted, {
      id: ids.second,
      completed: true,
    });
    await expect(
      user.mutation(api.actions.setCompleted, {
        id: ids.first,
        completed: false,
      }),
    ).rejects.toThrow("dependent actions incomplete");
    const application = await t.run((ctx) =>
      ctx.db.get("applications", applicationId),
    );
    expect(application?.actionScore).toBe(20);
  });

  test("deleteAllData removes every owned record and the user", async () => {
    const { t, user } = await createApplication();
    await user.mutation(api.inventory.upsert, {
      name: "IC copy",
      status: "ready",
    });
    await user.mutation(api.profiles.deleteAllData);
    const counts = await t.run(async (ctx) => ({
      users: (await ctx.db.query("users").collect()).length,
      profiles: (await ctx.db.query("profiles").collect()).length,
      applications: (await ctx.db.query("applications").collect()).length,
      inventory: (await ctx.db.query("inventoryDocuments").collect()).length,
      stages: (await ctx.db.query("analysisStages").collect()).length,
    }));
    expect(counts).toEqual({
      users: 0,
      profiles: 0,
      applications: 0,
      inventory: 0,
      stages: 0,
    });
  });

  test("completes all four stages with server-computed readiness and metadata", async () => {
    const { t, user, applicationId } = await createApplication();
    const service = t.withIdentity({
      subject: "alice",
      tokenIdentifier: "issuer|alice-service",
      username: "alice",
      role: "analysis_service",
    });
    const finish = async (
      stage:
        | "requirement_compiler"
        | "eligibility_mapper"
        | "red_team_reviewer"
        | "action_planner",
      run: { generation: number; attempt: number },
      model = "primary-tee",
    ) => {
      await service.mutation(api.analysis.finishStage, {
        applicationId,
        stage,
        ...runArgs(run),
        model,
        confidentialCompute: true,
        durationMs: 10,
        inputTokens: 100,
        outputTokens: 20,
        promptVersion: "test",
      });
    };

    const compilerRun = await service.mutation(api.analysis.beginStage, {
      applicationId,
      stage: "requirement_compiler",
    });
    await service.mutation(api.analysis.applyRequirementCompiler, {
      applicationId,
      ...runArgs(compilerRun),
      programme: {
        name: "Demo Award",
        deadline: "30 September 2026",
        summary: "Fictional award",
      },
      requirements: [
        {
          key: "citizenship",
          label: "Malaysian citizen",
          kind: "citizenship",
          weight: 1,
          mandatory: true,
          condition: {
            type: "citizenship_equals",
            expectedString: "Malaysian",
          },
          citation: {
            documentName: "demo.pdf",
            pageNumber: 1,
            excerpt: "must be a Malaysian citizen",
            confidence: "high",
            verified: true,
            matchKind: "document",
          },
        },
      ],
    });
    await finish("requirement_compiler", compilerRun);

    const mapperRun = await service.mutation(api.analysis.beginStage, {
      applicationId,
      stage: "eligibility_mapper",
    });
    await service.mutation(api.analysis.applyEligibilityMapper, {
      applicationId,
      ...runArgs(mapperRun),
      mappings: [
        {
          requirementKey: "citizenship",
          state: "confirmed",
          deterministicResult: true,
          citation: {
            documentName: "demo.pdf",
            pageNumber: 1,
            excerpt: "must be a Malaysian citizen",
            confidence: "high",
            verified: true,
            matchKind: "deterministic",
          },
        },
      ],
    });
    await finish("eligibility_mapper", mapperRun);

    const reviewerRun = await service.mutation(api.analysis.beginStage, {
      applicationId,
      stage: "red_team_reviewer",
    });
    await service.mutation(api.analysis.applyRedTeamReviewer, {
      applicationId,
      ...runArgs(reviewerRun),
      reviews: [
        {
          requirementKey: "citizenship",
          state: "confirmed",
          reason: "Evidence and deterministic result agree",
        },
      ],
    });
    await finish("red_team_reviewer", reviewerRun, "independent-reviewer-tee");

    const plannerRun = await service.mutation(api.analysis.beginStage, {
      applicationId,
      stage: "action_planner",
    });
    await service.mutation(api.analysis.applyActionPlanner, {
      applicationId,
      ...runArgs(plannerRun),
      missingDocuments: [],
      actions: [
        {
          key: "submit_application",
          description: "Submit the completed application",
          dependsOn: [],
        },
      ],
    });
    await finish("action_planner", plannerRun);

    const initialReport = await user.query(api.applications.get, {
      id: applicationId,
    });
    expect(initialReport).not.toBeNull();
    if (!initialReport) {
      throw new Error("Expected completed application report");
    }
    expect(initialReport.application).toMatchObject({
      state: "complete",
      outcome: "action_required",
      evidenceScore: 80,
      actionScore: 0,
      readinessScore: 80,
    });
    await user.mutation(api.actions.setCompleted, {
      id: initialReport.actions[0]._id,
      completed: true,
    });
    const report = await user.query(api.applications.get, {
      id: applicationId,
    });
    expect(report?.application).toMatchObject({
      state: "complete",
      outcome: "ready_to_submit",
      evidenceScore: 80,
      actionScore: 20,
      readinessScore: 100,
    });
    if (!report) throw new Error("Expected updated application report");
    expect(report.modelRuns).toHaveLength(4);
    expect(
      report.modelRuns.every(
        (run: { confidentialCompute: boolean }) => run.confidentialCompute,
      ),
    ).toBe(true);
    await expect(
      user.mutation(api.applications.retry, { id: applicationId }),
    ).rejects.toThrow("cannot be restarted");
  });
});
