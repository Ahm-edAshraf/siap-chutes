import { expect, test } from "@playwright/test";

const enabled =
  process.env.RUN_CHUTES_SMOKE_TEST === "true" &&
  Boolean(process.env.E2E_AUTH_STATE);

test.describe("paid authenticated flow", () => {
  test.skip(!enabled, "Requires RUN_CHUTES_SMOKE_TEST and E2E_AUTH_STATE");
  test.use({
    storageState: process.env.E2E_AUTH_STATE,
  });

  test("runs the real sample through Chutes and persists the report", async ({
    page,
  }) => {
    const runtimeErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(message.text());
    });
    page.on("pageerror", (error) => runtimeErrors.push(error.message));

    await page.goto("/app/new");
    await page
      .getByRole("button", {
        name: "Toggle Language. Current language is English",
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "Analisis baru" }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Toggle Language. Current language is Bahasa Melayu",
      })
      .click();
    await page.route(
      "**/api/analyses/*/stages/*",
      async (route) => {
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ error: "E2E_TRANSIENT_FAILURE" }),
        });
      },
      { times: 1 },
    );
    await page
      .getByRole("button", { name: "Use fictional Siap demo pack" })
      .click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Full name").fill("Aina Demo");
    await page.getByLabel("Date of birth").fill("2004-03-12");
    await page.getByLabel("Institution").fill("Demo University");
    await page.getByLabel("Course").fill("Computer Science");
    await page.getByLabel("Household income (RM)").fill("4500");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Extract and analyse" }).click();
    await expect(page).toHaveURL(/\/app\/analysing\//);
    await expect(
      page.getByRole("heading", { name: "Analysing application" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Analysis failed safely" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(
      page.getByRole("heading", { name: "Analysing application" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/app\/reports\//, { timeout: 5 * 60_000 });
    const reportUrl = page.url();
    await expect(
      page.getByRole("heading", { name: "Eligibility checks" }),
    ).toBeVisible();
    await expect(page.getByText("/80 evidence readiness")).toBeVisible();

    const firstAction = page.getByTitle("Mark complete").first();
    if ((await firstAction.count()) > 0) {
      const completedBefore = await page.getByTitle("Mark incomplete").count();
      await firstAction.click();
      await expect
        .poll(() => page.getByTitle("Mark incomplete").count())
        .toBe(completedBefore + 1);
    }

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export" }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const exported = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
      application: { state: string };
      modelRuns: Array<{
        stage: string;
        model: string;
        confidentialCompute: boolean;
      }>;
      requirements: Array<{
        evidence: Array<{ excerpt: string }>;
      }>;
    };
    expect(exported.application.state).toBe("complete");
    expect(exported.modelRuns).toHaveLength(4);
    expect(exported.modelRuns.every((run) => run.confidentialCompute)).toBe(
      true,
    );
    const primaryModel = exported.modelRuns.find(
      (run) => run.stage === "requirement_compiler",
    )?.model;
    const reviewerModel = exported.modelRuns.find(
      (run) => run.stage === "red_team_reviewer",
    )?.model;
    expect(primaryModel).toBeTruthy();
    expect(reviewerModel).toBeTruthy();
    expect(reviewerModel).not.toBe(primaryModel);
    expect(
      exported.requirements
        .flatMap((requirement) => requirement.evidence)
        .every((evidence) => evidence.excerpt.length <= 240),
    ).toBe(true);

    await page.goto("/app/documents");
    await page.getByPlaceholder("Document name").fill("E2E inventory record");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("E2E inventory record")).toBeVisible();
    await page.reload();
    await expect(page.getByText("E2E inventory record")).toBeVisible();
    await page
      .getByRole("button", { name: "Delete E2E inventory record" })
      .click();
    await expect(page.getByText("E2E inventory record")).toHaveCount(0);

    await page.goto(reportUrl);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/app\/reports$/);
    await page.goto(reportUrl);
    await expect(
      page.getByText("It may have been deleted or belongs to another account."),
    ).toBeVisible();

    await page.goto("/app");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Delete all my data" }).click();
    await expect(page).toHaveURL("/", { timeout: 30_000 });
    const session = await page.request.get("/api/auth/chutes/session");
    await expect(session.json()).resolves.toMatchObject({
      isSignedIn: false,
      user: null,
    });
    expect(runtimeErrors).toEqual([]);
  });
});
