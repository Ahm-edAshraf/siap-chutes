import { z } from "zod";
import { getOAuthConfig } from "./config";
import type { ChutesUser } from "./types";

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.string().default("bearer"),
  expires_in: z.coerce.number().int().positive(),
});

const userSchema = z.object({
  sub: z.string().min(1).max(200),
  username: z.string().min(1).max(100),
  email: z.string().email().max(320).optional(),
  name: z.string().max(200).optional(),
});

export type ChutesTokenResponse = z.infer<typeof tokenResponseSchema>;

export function generatePkce() {
  const verifier =
    crypto.randomUUID().replaceAll("-", "") +
    crypto.randomUUID().replaceAll("-", "");
  return crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(verifier))
    .then((digest) => ({
      verifier,
      challenge: Buffer.from(digest).toString("base64url"),
    }));
}

export function generateState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

export function oauthStatesMatch(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < actualBytes.length; index += 1) {
    difference |= actualBytes[index] ^ expectedBytes[index];
  }
  return difference === 0;
}

export function buildAuthorizeUrl(state: string, challenge: string) {
  const config = getOAuthConfig();
  const url = new URL("/idp/authorize", config.idpBaseUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

async function parseTokenResponse(response: Response) {
  if (!response.ok) {
    throw new Error(`Chutes token request failed (${response.status})`);
  }
  return tokenResponseSchema.parse(await response.json());
}

export async function exchangeCode(code: string, verifier: string) {
  const config = getOAuthConfig();
  const response = await fetch(`${config.idpBaseUrl}/idp/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
      code_verifier: verifier,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  return await parseTokenResponse(response);
}

export async function refreshTokens(refreshToken: string) {
  const config = getOAuthConfig();
  const response = await fetch(`${config.idpBaseUrl}/idp/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  return await parseTokenResponse(response);
}

export async function fetchChutesUser(
  accessToken: string,
): Promise<ChutesUser> {
  const config = getOAuthConfig();
  const response = await fetch(`${config.idpBaseUrl}/idp/userinfo`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Chutes userinfo request failed (${response.status})`);
  }
  return userSchema.parse(await response.json());
}

export async function revokeToken(
  token: string,
  hint: "access_token" | "refresh_token",
) {
  const config = getOAuthConfig();
  try {
    await fetch(`${config.idpBaseUrl}/idp/token/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token,
        token_type_hint: hint,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Revocation is best-effort. Local credentials are always cleared.
  }
}
