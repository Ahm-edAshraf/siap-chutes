import { expect, test } from "@playwright/test";

test("landing, privacy, sample PDF, and protected route are production-safe", async ({
  page,
  request,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: /Paperwork/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in with Chutes" }).first(),
  ).toBeVisible();
  const landingResponse = await request.get("/");
  expect(landingResponse.headers()["x-content-type-options"]).toBe("nosniff");
  expect(landingResponse.headers()["x-frame-options"]).toBe("DENY");
  expect(landingResponse.headers()["referrer-policy"]).toBe("same-origin");
  expect(landingResponse.headers()["permissions-policy"]).toContain(
    "camera=()",
  );

  await page.goto("/?auth_error=invalid_oauth_state");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Sign-in could not be completed" }),
  ).toBeVisible();

  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "2. Transient inference",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("browser-to-enclave end-to-end encryption", {
      exact: false,
    }),
  ).toBeVisible();

  const pdf = await request.get(
    "/sample/Siap%20Demo%20Scholarship%20Pack%202026.pdf",
  );
  expect(pdf.ok()).toBe(true);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  const ocrAsset = await request.get("/tesseract/worker.min.js");
  expect(ocrAsset.headers()["cache-control"]).toContain("max-age=604800");

  const extracted = await page.evaluate(async () => {
    const loadModule = new Function(
      "return import('/unpdf/index.mjs')",
    ) as () => Promise<{
      getDocumentProxy: (data: Uint8Array) => Promise<{
        destroy: () => Promise<void>;
      }>;
      definePDFJSModule: (loader: () => Promise<unknown>) => Promise<void>;
      extractText: (
        pdf: unknown,
      ) => Promise<{ totalPages: number; text: string[] }>;
    }>;
    const { definePDFJSModule, getDocumentProxy, extractText } =
      await loadModule();
    await definePDFJSModule(
      new Function(
        "return import('/unpdf/pdfjs.mjs')",
      ) as () => Promise<unknown>,
    );
    const response = await fetch(
      "/sample/Siap%20Demo%20Scholarship%20Pack%202026.pdf",
    );
    const document = await getDocumentProxy(
      new Uint8Array(await response.arrayBuffer()),
    );
    const result = await extractText(document);
    await document.destroy();
    return result;
  });
  expect(extracted.totalPages).toBe(4);
  expect(extracted.text.join(" ")).toContain(
    "DEMO ONLY - NOT A REAL SCHOLARSHIP",
  );

  await page.addScriptTag({ url: "/tesseract/tesseract.min.js" });
  const ocrText = await page.evaluate(async () => {
    const tesseract = (
      window as unknown as {
        Tesseract: {
          createWorker: (
            languages: string[],
            oem: number,
            options: Record<string, unknown>,
          ) => Promise<{
            recognize: (
              canvas: HTMLCanvasElement,
            ) => Promise<{ data: { text: string } }>;
            terminate: () => Promise<void>;
          }>;
          OEM: { LSTM_ONLY: number };
        };
      }
    ).Tesseract;
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 180;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "black";
    context.font = "bold 64px Arial";
    context.fillText("MALAYSIAN CITIZEN", 40, 110);
    const worker = await tesseract.createWorker(
      ["eng", "msa"],
      tesseract.OEM.LSTM_ONLY,
      {
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract/core",
        langPath: "/tesseract/lang",
        cacheMethod: "none",
      },
    );
    const result = await worker.recognize(canvas);
    await worker.terminate();
    canvas.width = 0;
    canvas.height = 0;
    return result.data.text;
  });
  expect(ocrText.toUpperCase()).toContain("MALAYSIAN CITIZEN");

  const login = await request.get("/api/auth/chutes/login?returnTo=/app/new", {
    maxRedirects: 0,
  });
  expect(login.status()).toBe(307);
  expect(login.headers().location).toContain(
    "https://api.chutes.ai/idp/authorize",
  );
  expect(login.headers()["set-cookie"]).toContain("HttpOnly");
  expect(login.headers()["set-cookie"]).toContain("Secure");
  expect(login.headers()["set-cookie"]).toContain("SameSite=lax");

  const protectedResponse = await request.get("/app", { maxRedirects: 0 });
  expect(protectedResponse.status()).toBe(307);
  expect(protectedResponse.headers().location).toContain(
    "/api/auth/chutes/login",
  );
  expect(consoleErrors).toEqual([]);
});
