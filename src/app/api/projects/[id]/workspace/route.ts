import { NextResponse } from "next/server";
import { z } from "zod";
import { adminClient, checked, rate } from "@/lib/server/db";
import { workspaceSession } from "@/lib/server/workspace";
import { failure, sameOrigin, jsonBody } from "@/lib/server/http";
import { workspaceActionSchema } from "@/lib/collaboration";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const { db, user } = await workspaceSession(id);
    const query = z
      .object({
        resource: z
          .enum([
            "overview",
            "messages",
            "conversations",
            "updates",
            "tickets",
            "unread",
          ])
          .default("overview"),
        thread: z
          .string()
          .max(4000)
          .refine(
            (v) =>
              v === "everyone" ||
              v
                .split(",")
                .every((id) => z.string().uuid().safeParse(id).success),
          )
          .optional(),
        before: z.string().datetime().optional(),
        before_id: z.string().uuid().optional(),
        after: z.coerce.number().int().nonnegative().optional(),
      })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json(
      checked(
        await db.database.rpc("workspace_data", {
          pid: id,
          kind:
            query.resource === "messages" && query.thread
              ? "messages:" + query.thread
              : query.resource,
          before_time: query.before ?? null,
          before_id: query.before_id ?? null,
          after_sequence: query.after ?? null,
        }),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const { user } = await workspaceSession(id);
    const action = workspaceActionSchema.parse(await jsonBody(request));
    await rate(
      `workspace:${action.action === "message" ? "message" : action.action === "post_update" ? "update" : "action"}:${user.id}`,
      action.action === "message"
        ? 25
        : action.action === "post_update"
          ? 12
          : 90,
      60,
    );
    return NextResponse.json(
      checked(
        await adminClient().database.rpc("collaboration_action", {
          actor: user.id,
          pid: id,
          p_action: action,
        }),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
