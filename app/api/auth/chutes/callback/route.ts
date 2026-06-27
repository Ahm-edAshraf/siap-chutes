import { cookies } from "next/headers";
import { ConvexHttpClient } from "convex/browser";
import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeCode,
  fetchChutesUser,
  oauthStatesMatch,
} from "@/lib/auth/chutes";
import { api } from "@/convex/_generated/api";
import { getAppOrigin } from "@/lib/auth/config";
import { AUTH_COOKIES, authCookieOptions } from "@/lib/auth/cookies";
import { safeReturnTo } from "@/lib/auth/origin";
import { clearChutesSession, setChutesSession } from "@/lib/auth/session";
import { mintConvexToken } from "@/lib/auth/jwt";

function callbackRedirect(error?: string, returnTo = "/app") {
  const url = new URL(error ? "/" : safeReturnTo(returnTo), getAppOrigin());
  if (error) url.searchParams.set("auth_error", error);
  const response = NextResponse.redirect(url);
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.origin !== getAppOrigin()) {
    return callbackRedirect("invalid_callback_origin");
  }
  const error = request.nextUrl.searchParams.get("error");
  if (error) return callbackRedirect("authorization_denied");
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const store = await cookies();
  const expectedState = store.get(AUTH_COOKIES.state)?.value;
  const verifier = store.get(AUTH_COOKIES.verifier)?.value;
  const returnTo = safeReturnTo(
    store.get(AUTH_COOKIES.returnTo)?.value ?? null,
  );
  for (const name of [
    AUTH_COOKIES.state,
    AUTH_COOKIES.verifier,
    AUTH_COOKIES.returnTo,
  ]) {
    store.set(name, "", { ...authCookieOptions, maxAge: 0 });
  }

  if (!code || !state || !expectedState || !verifier) {
    return callbackRedirect("missing_oauth_state");
  }
  if (!oauthStatesMatch(state, expectedState)) {
    return callbackRedirect("invalid_oauth_state");
  }

  try {
    const tokens = await exchangeCode(code, verifier);
    const user = await fetchChutesUser(tokens.access_token);
    await setChutesSession(tokens, user);
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) throw new Error("Missing NEXT_PUBLIC_CONVEX_URL");
    const convex = new ConvexHttpClient(convexUrl);
    convex.setAuth(await mintConvexToken(user, "user"));
    await convex.mutation(api.users.sync);
    return callbackRedirect(undefined, returnTo);
  } catch {
    await clearChutesSession();
    return callbackRedirect("authentication_failed");
  }
}
