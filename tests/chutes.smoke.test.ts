import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { z } from "zod";
import {
  runStructuredStage,
  selectTeeModel,
} from "@/lib/analysis/chutes-client";
import { AUTH_COOKIES } from "@/lib/auth/cookies";

const enabled =
  process.env.RUN_CHUTES_SMOKE_TEST === "true" &&
  Boolean(process.env.CHUTES_SMOKE_ACCESS_TOKEN || process.env.E2E_AUTH_STATE);

async function getSmokeToken() {
  const direct = process.env.CHUTES_SMOKE_ACCESS_TOKEN?.trim();
  if (direct) return direct;
  const path = process.env.E2E_AUTH_STATE;
  if (!path) throw new Error("A smoke-test OAuth session is required");
  const state = JSON.parse(await readFile(path, "utf8")) as {
    cookies?: Array<{ name: string; value: string }>;
  };
  const token = state.cookies?.find(
    (cookie) => cookie.name === AUTH_COOKIES.access,
  )?.value;
  if (!token) {
    throw new Error("E2E_AUTH_STATE does not contain a Chutes access token");
  }
  return token;
}

test.skipIf(!enabled)(
  "live OAuth token invokes a verified TEE model with structured output",
  async () => {
    const token = await getSmokeToken();
    const getToken = async () => token;
    const requested =
      process.env.CHUTES_PRIMARY_MODEL ?? "google/gemma-4-31B-turbo-TEE";
    const model = await selectTeeModel(requested, getToken);
    expect(model).toMatch(/-TEE$/);
    const result = await runStructuredStage(
      model,
      'Return exactly one JSON object with {"ok":true}.',
      z.object({ ok: z.literal(true) }),
      "{ok:true}",
      getToken,
    );
    expect(result.data).toEqual({ ok: true });
    expect(
      (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
    ).toBeGreaterThan(0);
  },
  300_000,
);
