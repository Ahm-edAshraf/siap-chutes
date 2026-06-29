import { expect, test } from "@playwright/test";

const enabled =
  process.env.RUN_CHUTES_SMOKE_TEST === "true" &&
  Boolean(process.env.E2E_AUTH_STATE);

test.describe("paid authenticated flow", () => {
  test.setTimeout(15 * 60_000);
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

    const initialSession = await page.request.get("/api/auth/chutes/session");
    const initialSessionBody = (await initialSession.json()) as {
      isSignedIn?: boolean;
    };
    expect(
      initialSessionBody,
      "E2E_AUTH_STATE is expired or revoked; capture a fresh authenticated state",
    ).toMatchObject({
      isSignedIn: true,
    });
    if (process.env.E2E_AUTH_STATE) {
      await page.context().storageState({ path: process.env.E2E_AUTH_STATE });
    }

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
    const analysisStartedAt = Date.now();
    await page.getByRole("button", { name: "Extract and analyse" }).click();
    await expect(page).toHaveURL(/\/app\/analysing\//);
    await expect(
      page.getByRole("heading", { name: "Analysing application" }),
    ).toBeVisible();
    const finalOutcome = await Promise.race([
      page
        .waitForURL(/\/app\/reports\//, { timeout: 100_000 })
        .then(() => "report" as const),
      page
        .getByRole("heading", { name: "Analysis failed safely" })
        .waitFor({ state: "visible", timeout: 100_000 })
        .then(() => "failed" as const),
    ]);
    expect(
      finalOutcome,
      "The retried live analysis reached a terminal failure",
    ).toBe("report");
    expect(Date.now() - analysisStartedAt).toBeLessThan(100_000);
    const reportUrl = page.url();
    await expect(
      page.getByRole("heading", { name: "Eligibility checks" }),
    ).toBeVisible();
    await expect(page.getByText("requirements confirmed")).toBeVisible();

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
        _creationTime: number;
        stage: string;
        model: string;
        confidentialCompute: boolean;
        durationMs: number;
      }>;
      requirements: Array<{
        evidence: Array<{ excerpt: string }>;
      }>;
    };
    expect(exported.application.state).toBe("complete");
    expect(exported.modelRuns.length).toBeGreaterThanOrEqual(2);
    expect(exported.modelRuns.length).toBeLessThanOrEqual(4);
    expect(exported.modelRuns.every((run) => run.confidentialCompute)).toBe(
      true,
    );
    expect(
      new Set(exported.modelRuns.map((run) => run.model)).size,
    ).toBeGreaterThanOrEqual(2);
    expect(
      exported.modelRuns.every((run) => run.durationMs < 88_000),
    ).toBe(true);
    const primaryModel = exported.modelRuns.find(
      (run) => run.stage === "requirement_compiler",
    )?.model;
    const mapperModel = exported.modelRuns.find(
      (run) => run.stage === "eligibility_mapper",
    )?.model;
    expect(primaryModel).toBeTruthy();
    expect(mapperModel).toBeTruthy();
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
    await page.getByRole("button", { name: "Delete", exact: true }).click();
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
    const expectedInjectedErrors = runtimeErrors.filter(
      (message) =>
        message.includes("Failed to load resource") &&
        message.includes("502 (Bad Gateway)"),
    );
    expect(expectedInjectedErrors.length).toBeLessThanOrEqual(2);
    expect(
      runtimeErrors.filter(
        (message) => !expectedInjectedErrors.includes(message),
      ),
    ).toEqual([]);
  });
});
