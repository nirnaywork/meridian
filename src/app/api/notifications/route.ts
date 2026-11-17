import { NextResponse } from "next/server";
import { z } from "zod";
import { session, checked, rate } from "@/lib/server/db";
import { failure, jsonBody, sameOrigin } from "@/lib/server/http";
export async function GET(request: Request) {
  try {
    const { db, user } = await session();
    const q = z
      .object({
        page: z.coerce.number().int().min(1).max(10000).default(1),
        unread: z.enum(["true", "false"]).default("false"),
        limit: z.coerce.number().int().min(1).max(30).default(15),
      })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    let rows = db.database
      .from("notifications")
      .select("id,type,title,body,link,read_at,created_at", { count: "exact" })
      .eq("recipient_id", user.id);
    if (q.unread === "true") rows = rows.is("read_at", null);
    const result = await rows
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range((q.page - 1) * q.limit, q.page * q.limit - 1);
    return NextResponse.json(
      {
        data: checked(result),
        total: result.count ?? 0,
        page: q.page,
        limit: q.limit,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { db, user } = await session();
    await rate("notifications:" + user.id, 90, 60);
    const action = z
      .object({
        id: z.string().uuid().optional(),
        all: z.boolean().default(false),
      })
      .refine((x) => x.all || x.id, "Choose a notification")
      .parse(await jsonBody(request));
    let update = db.database
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", user.id)
      .is("read_at", null);
    if (!action.all) update = update.eq("id", action.id!);
    checked(await update.select("id"));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
