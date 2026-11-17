import { NextResponse } from "next/server";
import { profileMetadataSchema } from "@/lib/collaboration";
import { session, adminClient, checked, rate } from "@/lib/server/db";
import { failure, sameOrigin, jsonBody } from "@/lib/server/http";
export async function GET() {
  try {
    const { db, user } = await session();
    return NextResponse.json(
      checked(
        await db.database
          .from("profiles")
          .select("links,visibility")
          .eq("id", user.id)
          .single(),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { user } = await session();
    await rate("profile-metadata:" + user.id, 20, 60);
    const { visibility, ...links } = profileMetadataSchema.parse(
      await jsonBody(request),
    );
    // A deliberately separate metadata write: no embedding provider, canonical text, source fields or hash are touched.
    checked(
      await adminClient()
        .database.from("profiles")
        .update({ links, visibility })
        .eq("id", user.id)
        .select("id"),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
