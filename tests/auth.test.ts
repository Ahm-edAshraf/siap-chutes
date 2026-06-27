import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import {
  decodeJwt,
  decodeProtectedHeader,
  exportJWK,
  generateKeyPair,
} from "jose";
import {
  buildAuthorizeUrl,
  generatePkce,
  oauthStatesMatch,
  refreshTokens,
  revokeToken,
} from "@/lib/auth/chutes";
import { mintConvexToken } from "@/lib/auth/jwt";
import { hasValidOrigin, safeReturnTo } from "@/lib/auth/origin";

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  process.env.AUTH_JWT_PRIVATE_JWK = JSON.stringify(
    await exportJWK(privateKey),
  );
  process.env.AUTH_JWT_ISSUER = "https://siap.test";
  process.env.AUTH_JWT_AUDIENCE = "siap-test";
  process.env.AUTH_JWT_KID = "test-key";
  process.env.NEXT_PUBLIC_APP_URL = "https://siap.test";
  process.env.CHUTES_OAUTH_CLIENT_ID = "cid_test";
  process.env.CHUTES_OAUTH_CLIENT_SECRET = "secret";
  process.env.CHUTES_OAUTH_SCOPES = "openid profile chutes:invoke";
  process.env.CHUTES_IDP_BASE_URL = "https://api.chutes.ai";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OAuth and Convex auth", () => {
  test("creates PKCE and the minimal authorization request", async () => {
    const pkce = await generatePkce();
    expect(pkce.verifier.length).toBeGreaterThanOrEqual(43);
    const url = buildAuthorizeUrl("state", pkce.challenge);
    expect(url.pathname).toBe("/idp/authorize");
    expect(url.searchParams.get("scope")).toBe("openid profile chutes:invoke");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  test("mints five-minute ES256 role tokens with required claims", async () => {
    const token = await mintConvexToken(
      { sub: "user-1", username: "aina" },
      "analysis_service",
    );
    const claims = decodeJwt(token);
    expect(decodeProtectedHeader(token)).toMatchObject({
      alg: "ES256",
      typ: "JWT",
      kid: "test-key",
    });
    expect(claims).toMatchObject({
      sub: "user-1",
      iss: "https://siap.test",
      aud: "siap-test",
      role: "analysis_service",
    });
    expect(Number(claims.exp) - Number(claims.iat)).toBe(300);
  });

  test("rejects cross-origin writes and unsafe return URLs", () => {
    expect(
      hasValidOrigin(
        new Request("https://siap.test/api", {
          headers: { origin: "https://attacker.test" },
        }),
      ),
    ).toBe(false);
    expect(safeReturnTo("//attacker.test")).toBe("/app");
    expect(safeReturnTo("/app/new?sample=1")).toBe("/app/new?sample=1");
  });

  test("compares OAuth state without accepting length or content mismatch", () => {
    expect(oauthStatesMatch("same-state", "same-state")).toBe(true);
    expect(oauthStatesMatch("same-state", "other-stat")).toBe(false);
    expect(oauthStatesMatch("short", "longer")).toBe(false);
  });

  test("refreshes and revokes through the documented OAuth endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "new-access",
            refresh_token: "new-refresh",
            token_type: "bearer",
            expires_in: 3600,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(refreshTokens("refresh")).resolves.toMatchObject({
      access_token: "new-access",
    });
    await revokeToken("new-access", "access_token");
    expect(fetchMock.mock.calls[0][0]).toContain("/idp/token");
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain(
      "grant_type=refresh_token",
    );
    expect(fetchMock.mock.calls[1][0]).toContain("/idp/token/revoke");
  });
});
