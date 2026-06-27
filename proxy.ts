import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIES } from "@/lib/auth/cookies";

export function proxy(request: NextRequest) {
  if (
    !request.cookies.has(AUTH_COOKIES.access) &&
    !request.cookies.has(AUTH_COOKIES.refresh)
  ) {
    const login = new URL("/api/auth/chutes/login", request.url);
    login.searchParams.set(
      "returnTo",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
