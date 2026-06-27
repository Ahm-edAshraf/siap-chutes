import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AUTH_COOKIES, decodeCookieJson } from "@/lib/auth/cookies";
import { getValidChutesSession } from "@/lib/auth/session";

const { cookieValues } = vi.hoisted(() => ({
  cookieValues: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieValues.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      if (value) cookieValues.set(name, value);
      else cookieValues.delete(name);
    },
  }),
}));

describe("session identity validation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    cookieValues.clear();
    process.env.CHUTES_OAUTH_CLIENT_ID = "cid_test";
    process.env.CHUTES_OAUTH_CLIENT_SECRET = "secret";
    process.env.CHUTES_OAUTH_SCOPES = "openid profile chutes:invoke";
    process.env.CHUTES_IDP_BASE_URL = "https://api.chutes.ai";
    process.env.NEXT_PUBLIC_APP_URL = "https://siap.test";
    cookieValues.set(AUTH_COOKIES.access, "valid-access-token");
    cookieValues.set(
      AUTH_COOKIES.expiresAt,
      String(Date.now() + 10 * 60 * 1_000),
    );
  });

  test("uses authoritative userinfo instead of a modified cached user", async () => {
    cookieValues.set(
      AUTH_COOKIES.user,
      Buffer.from(
        JSON.stringify({ sub: "victim", username: "victim" }),
        "utf8",
      ).toString("base64url"),
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

    const session = await getValidChutesSession();

    expect(session?.user).toMatchObject({ sub: "owner", username: "owner" });
    expect(
      decodeCookieJson<{ sub: string }>(
        cookieValues.get(AUTH_COOKIES.user) ?? "",
      ),
    ).toMatchObject({ sub: "owner" });
  });

  test("refreshes when userinfo rejects a nominally unexpired access token", async () => {
    cookieValues.set(AUTH_COOKIES.refresh, "refresh-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            token_type: "bearer",
            expires_in: 3600,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sub: "owner", username: "owner" }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const session = await getValidChutesSession();

    expect(session?.accessToken).toBe("new-access-token");
    expect(cookieValues.get(AUTH_COOKIES.access)).toBe("new-access-token");
    expect(cookieValues.get(AUTH_COOKIES.refresh)).toBe("new-refresh-token");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
