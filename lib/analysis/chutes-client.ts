import { z } from "zod";
import type { ZodType } from "zod";
import { extractJson } from "./json";
import { buildRepairPrompt } from "./prompt";

const MODEL_ENDPOINT = "https://llm.chutes.ai/v1/models";
const COMPLETIONS_ENDPOINT = "https://llm.chutes.ai/v1/chat/completions";

const FALLBACK_MODELS = [
  "Qwen/Qwen3.6-27B-TEE",
  "MiniMaxAI/MiniMax-M2.5-TEE",
] as const;

const modelCatalogSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      confidential_compute: z.boolean().default(false),
      supported_features: z.array(z.string()).optional(),
    }),
  ),
});

const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string() }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
    })
    .optional(),
});

export type AccessTokenProvider = (
  forceRefresh: boolean,
) => Promise<string | null>;

export interface ChutesRequestOptions {
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

async function requestWithRetry(
  url: string,
  init: RequestInit,
  getAccessToken: AccessTokenProvider,
  options: ChutesRequestOptions = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let refreshed = false;
  let transientAttempts = 0;
  let token = await getAccessToken(false);
  if (!token) throw new Error("CHUTES_AUTH_REQUIRED");
  while (true) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        ...init,
        headers: {
          ...init.headers,
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      if (transientAttempts >= 2) throw error;
      transientAttempts += 1;
      await sleep(250 * 2 ** (transientAttempts - 1));
      continue;
    }
    if (response.status === 401 && !refreshed) {
      token = await getAccessToken(true);
      if (!token) throw new Error("CHUTES_AUTH_REQUIRED");
      refreshed = true;
      continue;
    }
    if (
      (response.status === 429 || response.status >= 500) &&
      transientAttempts < 2
    ) {
      transientAttempts += 1;
      await sleep(250 * 2 ** (transientAttempts - 1));
      continue;
    }
    return response;
  }
}

export async function selectTeeModel(
  requestedModel: string,
  getAccessToken: AccessTokenProvider,
  excludedModels: string[] = [],
  options: ChutesRequestOptions = {},
) {
  const response = await requestWithRetry(
    MODEL_ENDPOINT,
    { method: "GET" },
    getAccessToken,
    options,
  );
  if (!response.ok) {
    throw new Error(`CHUTES_MODEL_CATALOG_${response.status}`);
  }
  const catalog = modelCatalogSchema.parse(await response.json());
  const approved = new Map(
    catalog.data
      .filter((model) => model.confidential_compute)
      .map((model) => [model.id, model]),
  );
  const candidates = [requestedModel, ...FALLBACK_MODELS];
  const selected = candidates.find(
    (model) => approved.has(model) && !excludedModels.includes(model),
  );
  if (!selected) throw new Error("NO_APPROVED_TEE_MODEL");
  return selected;
}

async function createCompletion(
  model: string,
  prompt: string,
  getAccessToken: AccessTokenProvider,
  options: ChutesRequestOptions,
) {
  const response = await requestWithRetry(
    COMPLETIONS_ENDPOINT,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "Follow the developer instructions exactly and return valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 8_000,
      }),
    },
    getAccessToken,
    options,
  );
  if (!response.ok) {
    throw new Error(`CHUTES_COMPLETION_${response.status}`);
  }
  return completionSchema.parse(await response.json());
}

export async function runStructuredStage<T>(
  model: string,
  prompt: string,
  schema: ZodType<T>,
  schemaDescription: string,
  getAccessToken: AccessTokenProvider,
  options: ChutesRequestOptions = {},
) {
  const parse = (content: string) => {
    try {
      return schema.safeParse(extractJson(content));
    } catch {
      return schema.safeParse(undefined);
    }
  };
  let completion = await createCompletion(
    model,
    prompt,
    getAccessToken,
    options,
  );
  const firstContent = completion.choices[0].message.content;
  let parsed = parse(firstContent);
  if (!parsed.success) {
    completion = await createCompletion(
      model,
      buildRepairPrompt(prompt, firstContent, schemaDescription),
      getAccessToken,
      options,
    );
    parsed = parse(completion.choices[0].message.content);
  }
  if (!parsed.success) throw new Error("MALFORMED_MODEL_OUTPUT");
  return {
    data: parsed.data,
    usage: {
      inputTokens: completion.usage?.prompt_tokens,
      outputTokens: completion.usage?.completion_tokens,
    },
  };
}
