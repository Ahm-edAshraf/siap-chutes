import { NextResponse } from "next/server";
import { mintConvexToken } from "@/lib/auth/jwt";
import { getValidChutesSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getValidChutesSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json(
    { token: await mintConvexToken(session.user, "user") },
    { headers: { "cache-control": "no-store" } },
  );
}
