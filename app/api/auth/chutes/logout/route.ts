import { NextResponse } from "next/server";
import { revokeToken } from "@/lib/auth/chutes";
import { hasValidOrigin } from "@/lib/auth/origin";
import { clearChutesSession, readRawChutesTokens } from "@/lib/auth/session";

export async function POST(request: Request) {
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const { accessToken, refreshToken } = await readRawChutesTokens();
  await clearChutesSession();
  await Promise.all([
    accessToken ? revokeToken(accessToken, "access_token") : Promise.resolve(),
    refreshToken
      ? revokeToken(refreshToken, "refresh_token")
      : Promise.resolve(),
  ]);
  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
}
