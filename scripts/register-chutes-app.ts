import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { z } from "zod";

const responseSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
});

async function readApiKey() {
  const fromEnvironment = process.env.CHUTES_REGISTRATION_API_KEY?.trim();
  if (fromEnvironment) return fromEnvironment;
  if (!stdin.isTTY || !stdin.setRawMode) {
    throw new Error(
      "Set CHUTES_REGISTRATION_API_KEY when running without an interactive terminal",
    );
  }
  stdout.write("Chutes API key (used once, input hidden): ");
  stdin.setEncoding("utf8");
  stdin.setRawMode(true);
  stdin.resume();
  return await new Promise<string>((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdout.write("\n");
    };
    const onData = (input: string) => {
      for (const character of input) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Registration cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value.trim());
          return;
        }
        if (character === "\u0008" || character === "\u007f") {
          if (value.length) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }
        value += character;
        stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}

const apiKey = await readApiKey();
const terminal = createInterface({ input: stdin, output: stdout });
try {
  const origin =
    (
      await terminal.question("Application origin [http://localhost:3000]: ")
    ).trim() || "http://localhost:3000";
  const productionOrigin = (
    await terminal.question("Production origin (optional): ")
  ).trim();
  const origins = [
    ...new Set(
      [origin, productionOrigin]
        .filter(Boolean)
        .map((value) => new URL(value).origin),
    ),
  ];
  if (!apiKey) throw new Error("A Chutes API key is required");
  const response = await fetch("https://api.chutes.ai/idp/apps", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: "Siap",
      description:
        "Privacy-first bureaucracy compiler for Malaysian applications",
      redirect_uris: origins.map(
        (value) => `${value}/api/auth/chutes/callback`,
      ),
      homepage_url: origins.at(-1),
      allowed_scopes: ["openid", "profile", "chutes:invoke"],
      public: false,
    }),
  });
  if (!response.ok) {
    throw new Error(`Registration failed (${response.status})`);
  }
  const credentials = responseSchema.parse(await response.json());
  stdout.write(
    [
      "",
      "Registration complete. Add these values to .env.local / Vercel:",
      `CHUTES_OAUTH_CLIENT_ID=${credentials.client_id}`,
      `CHUTES_OAUTH_CLIENT_SECRET=${credentials.client_secret}`,
      "",
      "The registration API key was not written to disk.",
      "",
    ].join("\n"),
  );
} finally {
  terminal.close();
}
