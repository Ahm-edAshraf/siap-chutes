import { cookies } from "next/headers";
import { AUTH_COOKIES, authCookieOptions, encodeCookieJson } from "./cookies";
import { fetchChutesUser, refreshTokens } from "./chutes";
import type { ChutesSession, ChutesUser } from "./types";

const REFRESH_WINDOW_MS = 2 * 60 * 1_000;

export async function setChutesSession(
  tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  },
  user: ChutesUser,
) {
  const store = await cookies();
  const expiresAt = Date.now() + tokens.expires_in * 1_000;
  store.set(AUTH_COOKIES.access, tokens.access_token, {
    ...authCookieOptions,
    maxAge: tokens.expires_in,
  });
  store.set(AUTH_COOKIES.refresh, tokens.refresh_token, {
    ...authCookieOptions,
    maxAge: 30 * 24 * 60 * 60,
  });
  store.set(AUTH_COOKIES.expiresAt, String(expiresAt), {
    ...authCookieOptions,
    maxAge: 30 * 24 * 60 * 60,
  });
  store.set(AUTH_COOKIES.user, encodeCookieJson(user), {
    ...authCookieOptions,
    maxAge: 30 * 24 * 60 * 60,
  });
}

export async function clearChutesSession() {
  const store = await cookies();
  for (const name of Object.values(AUTH_COOKIES)) {
    store.set(name, "", { ...authCookieOptions, maxAge: 0 });
  }
}

export async function getValidChutesSession(
  forceRefresh = false,
): Promise<ChutesSession | null> {
  const store = await cookies();
  const accessToken = store.get(AUTH_COOKIES.access)?.value;
  const refreshToken = store.get(AUTH_COOKIES.refresh)?.value;
  const expiresAt = Number(store.get(AUTH_COOKIES.expiresAt)?.value ?? 0);
  if (!accessToken && !refreshToken) return null;

  if (
    !forceRefresh &&
    accessToken &&
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now() + REFRESH_WINDOW_MS
  ) {
    try {
      const user = await fetchChutesUser(accessToken);
      store.set(AUTH_COOKIES.user, encodeCookieJson(user), {
        ...authCookieOptions,
        maxAge: 30 * 24 * 60 * 60,
      });
      return { user, accessToken, expiresAt };
    } catch {
      if (!refreshToken) {
        await clearChutesSession();
        return null;
      }
    }
  }
  if (!refreshToken) return null;

  try {
    const tokens = await refreshTokens(refreshToken);
    const user = await fetchChutesUser(tokens.access_token);
    await setChutesSession(tokens, user);
    return {
      user,
      accessToken: tokens.access_token,
      expiresAt: Date.now() + tokens.expires_in * 1_000,
    };
  } catch {
    await clearChutesSession();
    return null;
  }
}

export async function readRawChutesTokens() {
  const store = await cookies();
  return {
    accessToken: store.get(AUTH_COOKIES.access)?.value,
    refreshToken: store.get(AUTH_COOKIES.refresh)?.value,
  };
}
