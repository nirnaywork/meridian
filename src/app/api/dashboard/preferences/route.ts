import { NextResponse } from "next/server";
import { session, checked } from "@/lib/server/db";
import { failure } from "@/lib/server/http";
export async function GET() {
  try {
    const { db } = await session();
    return NextResponse.json(
      checked(await db.database.rpc("personal_preferences")),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
