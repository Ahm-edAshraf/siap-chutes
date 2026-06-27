import { NextResponse } from "next/server";
import { getValidChutesSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getValidChutesSession();
  if (!session) {
    return NextResponse.json(
      { isSignedIn: false, user: null },
      { headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.json(
    { isSignedIn: true, user: session.user },
    { headers: { "cache-control": "no-store" } },
  );
}
