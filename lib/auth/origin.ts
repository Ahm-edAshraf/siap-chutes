import { getAppOrigin } from "./config";

export function hasValidOrigin(request: Request): boolean {
  const expected = getAppOrigin();
  const origin = request.headers.get("origin");
  if (origin) return origin === expected;
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === expected;
  } catch {
    return false;
  }
}

export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/app";
  try {
    const url = new URL(value, "https://siap.invalid");
    return url.origin === "https://siap.invalid"
      ? `${url.pathname}${url.search}${url.hash}`
      : "/app";
  } catch {
    return "/app";
  }
}
