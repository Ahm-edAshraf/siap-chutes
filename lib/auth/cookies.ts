import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

export const AUTH_COOKIES = {
  access: "siap_chutes_access",
  refresh: "siap_chutes_refresh",
  expiresAt: "siap_chutes_expires_at",
  user: "siap_chutes_user",
  state: "siap_oauth_state",
  verifier: "siap_oauth_verifier",
  returnTo: "siap_oauth_return_to",
} as const;

export const authCookieOptions: Partial<ResponseCookie> = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  priority: "high",
};

export const transientCookieOptions: Partial<ResponseCookie> = {
  ...authCookieOptions,
  maxAge: 10 * 60,
};

export function encodeCookieJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCookieJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
