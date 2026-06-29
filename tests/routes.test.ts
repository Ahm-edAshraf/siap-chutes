import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { decodeJwt, exportJWK, generateKeyPair } from "jose";
import { NextRequest } from "next/server";
import { GET as login } from "@/app/api/auth/chutes/login/route";
import { GET as callback } from "@/app/api/auth/chutes/callback/route";
import { POST as logout } from "@/app/api/auth/chutes/logout/route";
import { GET as convexToken } from "@/app/api/auth/convex-token/route";
import { POST as runEnsemble } from "@/app/api/analyses/[id]/ensemble/route";
import { POST as runStage } from "@/app/api/analyses/[id]/stages/[stage]/route";
import { AUTH_COOKIES } from "@/lib/auth/cookies";

const { cookieValues, cookieOptions } = vi.hoisted(() => ({
  cookieValues: new Map<string, string>(),
  cookieOptions: new Map<string, Record<string, unknown>>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieValues.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      cookieOptions.set(name, options ?? {});
      if (value) cookieValues.set(name, value);
      else cookieValues.delete(name);
    },
  }),
}));

describe("authentication route handlers", () => {
  beforeAll(async () => {
    const { privateKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    process.env.AUTH_JWT_PRIVATE_JWK = JSON.stringify(
      await exportJWK(privateKey),
    );
    process.env.AUTH_JWT_ISSUER = "https://siap.test";
    process.env.AUTH_JWT_AUDIENCE = "siap-test";
    process.env.AUTH_JWT_KID = "test-key";
  });

  beforeEach(() => {
    cookieValues.clear();
    cookieOptions.clear();
    process.env.NEXT_PUBLIC_APP_URL = "https://siap.test";
    process.env.CHUTES_OAUTH_CLIENT_ID = "cid_test";
    process.env.CHUTES_OAUTH_CLIENT_SECRET = "secret";
    process.env.CHUTES_OAUTH_SCOPES = "openid profile chutes:invoke";
    process.env.CHUTES_IDP_BASE_URL = "https://api.chutes.ai";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("login creates secure PKCE cookies and rejects an open return URL", async () => {
    const response = await login(
      new NextRequest(
        "https://siap.test/api/auth/chutes/login?returnTo=//attacker.test",
      ),
    );
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(307);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(location.origin).toBe("https://api.chutes.ai");
    expect(location.pathname).toBe("/idp/authorize");
    expect(location.searchParams.get("scope")).toBe(
      "openid profile chutes:invoke",
    );
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(cookieValues.get(AUTH_COOKIES.state)?.length).toBeGreaterThan(32);
    expect(
      cookieValues.get(AUTH_COOKIES.verifier)?.length,
    ).toBeGreaterThanOrEqual(43);
    expect(cookieValues.get(AUTH_COOKIES.returnTo)).toBe("/app");
    expect(cookieOptions.get(AUTH_COOKIES.state)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 600,
    });
  });

  test("callback rejects a mismatched origin and OAuth state", async () => {
    const wrongOrigin = await callback(
      new NextRequest(
        "https://attacker.test/api/auth/chutes/callback?code=code&state=state",
      ),
    );
    expect(wrongOrigin.headers.get("location")).toBe(
      "https://siap.test/?auth_error=invalid_callback_origin",
    );

    cookieValues.set(AUTH_COOKIES.state, "expected-state");
    cookieValues.set(AUTH_COOKIES.verifier, "verifier");
    const wrongState = await callback(
      new NextRequest(
        "https://siap.test/api/auth/chutes/callback?code=code&state=wrong-state",
      ),
    );
    expect(wrongState.headers.get("location")).toBe(
      "https://siap.test/?auth_error=invalid_oauth_state",
    );
    expect(cookieValues.has(AUTH_COOKIES.state)).toBe(false);
    expect(cookieValues.has(AUTH_COOKIES.verifier)).toBe(false);
  });

  test("logout enforces origin, clears cookies, and revokes both tokens", async () => {
    cookieValues.set(AUTH_COOKIES.access, "access-token");
    cookieValues.set(AUTH_COOKIES.refresh, "refresh-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const denied = await logout(
      new Request("https://siap.test/api/auth/chutes/logout", {
        method: "POST",
        headers: { origin: "https://attacker.test" },
      }),
    );
    expect(denied.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();

    const response = await logout(
      new Request("https://siap.test/api/auth/chutes/logout", {
        method: "POST",
        headers: { origin: "https://siap.test" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(cookieValues.has(AUTH_COOKIES.access)).toBe(false);
    expect(cookieValues.has(AUTH_COOKIES.refresh)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(([url]) =>
        String(url).endsWith("/idp/token/revoke"),
      ),
    ).toBe(true);
  });

  test("convex-token revalidates userinfo and returns a short user-role JWT", async () => {
    cookieValues.set(AUTH_COOKIES.access, "valid-access-token");
    cookieValues.set(
      AUTH_COOKIES.expiresAt,
      String(Date.now() + 10 * 60 * 1_000),
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ sub: "owner", username: "owner", name: "Owner" }),
            { status: 200 },
          ),
        ),
    );

    const response = await convexToken();
    const body = (await response.json()) as { token: string };
    const claims = decodeJwt(body.token);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(claims).toMatchObject({
      sub: "owner",
      role: "user",
      iss: "https://siap.test",
      aud: "siap-test",
    });
    expect(Number(claims.exp) - Number(claims.iat)).toBe(300);
  });

  test("analysis ensemble handler rejects cross-origin requests before processing", async () => {
    const response = await runEnsemble(
      new Request("https://siap.test/api/analyses/not-an-id/ensemble", {
        method: "POST",
        headers: {
          origin: "https://attacker.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ documents: [] }),
      }),
      {
        params: Promise.resolve({
          id: "not-an-id",
        }),
      },
    );
    expect(response.status).toBe(403);
  });

  test("independent stage handler rejects cross-origin requests before processing", async () => {
    const response = await runStage(
      new Request(
        "https://siap.test/api/analyses/not-an-id/stages/requirement_compiler",
        {
          method: "POST",
          headers: {
            origin: "https://attacker.test",
            "content-type": "application/json",
          },
          body: JSON.stringify({ documents: [] }),
        },
      ),
      {
        params: Promise.resolve({
          id: "not-an-id",
          stage: "requirement_compiler",
        }),
      },
    );
    expect(response.status).toBe(403);
  });
});
