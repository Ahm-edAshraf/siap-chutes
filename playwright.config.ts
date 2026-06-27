import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.E2E_BASE_URL?.trim();

export default defineConfig({
  testDir: "./e2e",
  timeout: 5 * 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "bun run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
          NEXT_PUBLIC_APP_URL: "http://localhost:3000",
          CHUTES_OAUTH_CLIENT_ID: "cid_e2e_public",
          CHUTES_OAUTH_CLIENT_SECRET: "e2e-public-only",
          CHUTES_OAUTH_SCOPES: "openid profile chutes:invoke",
          CHUTES_IDP_BASE_URL: "https://api.chutes.ai",
        },
      },
});
