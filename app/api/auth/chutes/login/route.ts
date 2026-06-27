import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  buildAuthorizeUrl,
  generatePkce,
  generateState,
} from "@/lib/auth/chutes";
import { AUTH_COOKIES, transientCookieOptions } from "@/lib/auth/cookies";
import { safeReturnTo } from "@/lib/auth/origin";

export async function GET(request: NextRequest) {
  const { verifier, challenge } = await generatePkce();
  const state = generateState();
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const store = await cookies();
  store.set(AUTH_COOKIES.state, state, transientCookieOptions);
  store.set(AUTH_COOKIES.verifier, verifier, transientCookieOptions);
  store.set(AUTH_COOKIES.returnTo, returnTo, transientCookieOptions);
  const response = NextResponse.redirect(buildAuthorizeUrl(state, challenge));
  response.headers.set("cache-control", "no-store");
  return response;
}
