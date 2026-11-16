import { NextResponse } from "next/server";
import { session, adminClient, checked, rate } from "@/lib/server/db";
import { actionSchema } from "@/lib/validation";
import { failure, jsonBody, sameOrigin } from "@/lib/server/http";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { user } = await session();
    await rate("actions:" + user.id);
    const input = actionSchema.parse(await jsonBody(request));
    const args =
      input.action === "respond"
        ? {
            actor: user.id,
            record_id: input.id,
            kind: input.kind,
            decision: input.decision,
          }
        : {
            actor: user.id,
            pid: input.project_id,
            rid: input.role_id,
            kind: input.action,
            target: input.action === "invite" ? input.target : null,
            note: input.message,
          };
    const result = checked(
      await adminClient().database.rpc(
        input.action === "respond" ? "respond_match" : "submit_match",
        args,
      ),
    );
    return NextResponse.json(result);
  } catch (e) {
    return failure(e);
  }
}
