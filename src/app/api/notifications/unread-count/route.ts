import { NextResponse } from "next/server";
import { session, checked } from "@/lib/server/db";
import { failure } from "@/lib/server/http";
export async function GET() {
  try {
    const { db, user } = await session();
    const result = await db.database
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .is("read_at", null);
    if (result.error) throw result.error;
    return NextResponse.json(
      { count: result.count ?? 0 },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
