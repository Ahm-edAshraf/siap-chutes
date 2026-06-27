import { describe, expect, test, vi } from "vitest";
import { z } from "zod";
import {
  runStructuredStage,
  selectTeeModel,
} from "@/lib/analysis/chutes-client";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("Chutes reliability", () => {
  test("fails closed when no allowlisted TEE model is live", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: "google/gemma-4-31B-turbo-TEE",
            confidential_compute: false,
          },
        ],
      }),
    );
    await expect(
      selectTeeModel("google/gemma-4-31B-turbo-TEE", async () => "token", [], {
        fetchImpl,
      }),
    ).rejects.toThrow("NO_APPROVED_TEE_MODEL");
  });

  test("excludes a prior model when selecting the independent reviewer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: "deepseek-ai/DeepSeek-V3.2-TEE",
            confidential_compute: true,
            supported_features: ["json_mode", "structured_outputs"],
          },
          {
            id: "Qwen/Qwen3.6-27B-TEE",
            confidential_compute: true,
            supported_features: ["json_mode", "structured_outputs"],
          },
        ],
      }),
    );
    await expect(
      selectTeeModel(
        "deepseek-ai/DeepSeek-V3.2-TEE",
        async () => "token",
        ["deepseek-ai/DeepSeek-V3.2-TEE"],
        { fetchImpl },
      ),
    ).resolves.toBe("Qwen/Qwen3.6-27B-TEE");
  });

  test("skips a TEE model without structured-output support", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: "unsloth/Mistral-Nemo-Instruct-2407-TEE",
            confidential_compute: true,
          },
          {
            id: "Qwen/Qwen3.6-27B-TEE",
            confidential_compute: true,
            supported_features: ["json_mode", "structured_outputs"],
          },
        ],
      }),
    );
    await expect(
      selectTeeModel(
        "unsloth/Mistral-Nemo-Instruct-2407-TEE",
        async () => "token",
        [],
        { fetchImpl },
      ),
    ).resolves.toBe("Qwen/Qwen3.6-27B-TEE");
  });

  test("refreshes once after 401 and retries 429", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "google/gemma-4-31B-turbo-TEE",
              confidential_compute: true,
              supported_features: ["json_mode", "structured_outputs"],
            },
          ],
        }),
      );
    const tokenProvider = vi.fn(async (refresh: boolean) =>
      refresh ? "fresh" : "old",
    );
    await expect(
      selectTeeModel("google/gemma-4-31B-turbo-TEE", tokenProvider, [], {
        fetchImpl,
        sleep: async () => undefined,
      }),
    ).resolves.toBe("google/gemma-4-31B-turbo-TEE");
    expect(tokenProvider.mock.calls).toEqual([[false], [true]]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test("allows one schema repair and returns usage metadata", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: "not valid JSON" } }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: '{"ok":true}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 2 },
        }),
      );
    await expect(
      runStructuredStage(
        "tee-model",
        "prompt",
        z.object({ ok: z.boolean() }),
        "{ok:boolean}",
        async () => "token",
        { fetchImpl },
      ),
    ).resolves.toEqual({
      data: { ok: true },
      usage: { inputTokens: 10, outputTokens: 2 },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const request = fetchImpl.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body)) as {
      response_format: {
        type: string;
        json_schema: { strict: boolean; schema: unknown };
      };
    };
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { strict: true },
    });
    expect(body.response_format.json_schema.schema).toBeTruthy();
  });

  test("retries network and 5xx failures only twice", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "google/gemma-4-31B-turbo-TEE",
              confidential_compute: true,
              supported_features: ["json_mode", "structured_outputs"],
            },
          ],
        }),
      );
    await expect(
      selectTeeModel("google/gemma-4-31B-turbo-TEE", async () => "token", [], {
        fetchImpl,
        sleep: async () => undefined,
      }),
    ).resolves.toBe("google/gemma-4-31B-turbo-TEE");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test("stops after two retries when requests time out", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
    await expect(
      selectTeeModel("google/gemma-4-31B-turbo-TEE", async () => "token", [], {
        fetchImpl,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow("CHUTES_STAGE_TIMEOUT");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test("does not start a request after the stage deadline", async () => {
    const fetchImpl = vi.fn();
    await expect(
      selectTeeModel("google/gemma-4-31B-turbo-TEE", async () => "token", [], {
        fetchImpl,
        deadlineAt: Date.now() - 1,
      }),
    ).rejects.toThrow("CHUTES_STAGE_TIMEOUT");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("fails after the single malformed-output repair", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () =>
      jsonResponse({
        choices: [{ message: { content: "not valid JSON" } }],
      }),
    );
    await expect(
      runStructuredStage(
        "tee-model",
        "prompt",
        z.object({ ok: z.boolean() }),
        "{ok:boolean}",
        async () => "token",
        { fetchImpl },
      ),
    ).rejects.toThrow("MALFORMED_MODEL_OUTPUT");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
