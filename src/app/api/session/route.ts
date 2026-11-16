import { NextResponse } from "next/server";
import { userClient } from "@/lib/server/db";
export async function GET() {
  const { data, error } = await (await userClient()).auth.getCurrentUser();
  return NextResponse.json(
    { signedIn: !error && !!data.user?.emailVerified },
    { headers: { "Cache-Control": "no-store" } },
  );
}
