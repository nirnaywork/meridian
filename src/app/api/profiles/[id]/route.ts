import { NextResponse } from "next/server";
import { z } from "zod";
import { publicProfileColumns } from "@/lib/collaboration";
import { session, checked, HttpError } from "@/lib/server/db";
import { failure } from "@/lib/server/http";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db } = await session();
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    if (!checked(await db.database.rpc("can_view_profile", { target: id })))
      throw new HttpError(
        "This profile is private. It is visible to its owner, project teammates and application or invitation contacts.",
        403,
      );
    const profile: any = checked(
      await db.database
        .from("profiles")
        .select(
          publicProfileColumns + ",profile_skills(proficiency,skills(name))",
        )
        .eq("id", id)
        .single(),
    );
    const projects = checked(
      await db.database.rpc("profile_projects", { target: id }),
    );
    return NextResponse.json(
      {
        ...profile,
        skills: profile.profile_skills.map((s: any) => ({
          name: s.skills.name,
          proficiency: s.proficiency,
        })),
        profile_skills: undefined,
        projects,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
