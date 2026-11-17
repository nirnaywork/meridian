import { NextResponse } from "next/server";
import { z } from "zod";
import {
  dashboardActionSchema,
  timeZoneSchema,
  databaseTimeZone,
} from "@/lib/personal-dashboard";
import { session, checked, adminClient, rate } from "@/lib/server/db";
import { failure, jsonBody, sameOrigin } from "@/lib/server/http";
export async function GET(request: Request) {
  try {
    const { db } = await session();
    const query = z
      .object({
        zone: timeZoneSchema.default("UTC"),
        day: z.string().date().optional(),
      })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json(
      checked(
        await db.database.rpc("personal_dashboard", {
          zone: databaseTimeZone(query.zone),
          selected_day: query.day ?? null,
        }),
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
    const input = dashboardActionSchema.parse(await jsonBody(request));
    await rate("personal-dashboard:" + user.id, 60, 60);
    return NextResponse.json(
      checked(
        await adminClient().database.rpc("personal_dashboard_action", {
          actor: user.id,
          input,
        }),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
