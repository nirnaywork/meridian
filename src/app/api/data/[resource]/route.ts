import { NextResponse } from "next/server";
import { z } from "zod";
import { session, checked, rate, HttpError } from "@/lib/server/db";
import { failure, jsonBody, sameOrigin } from "@/lib/server/http";
import { saveProfile, saveProject } from "@/lib/server/save";
import { normalizeSkill } from "@/data/taxonomy";
const projectSelect =
  "id,owner_id,title,description,category,tags,commitment,duration,team_size,status,auto_approve_strong_matches,revision,is_demo,profiles!projects_owner_id_fkey(display_name),project_roles(id,title,description,slots,filled_count,project_role_skills(importance,skills(id,name,category,is_verified)))";
function projectShape(p: Record<string, any>) {
  return {
    ...p,
    lead_name: p.profiles?.display_name,
    roles: p.project_roles?.map((r: Record<string, any>) => ({
      ...r,
      skills: r.project_role_skills.map((s: Record<string, any>) => ({
        ...s.skills,
        importance: s.importance,
      })),
    })),
  };
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    const { resource } = await params;
    const { db, user, profile } = await session(
      resource !== "profile" && resource !== "skills",
    );
    const q = new URL(request.url).searchParams;
    if (resource === "profile") {
      const rows = checked(
        await db.database
          .from("profiles")
          .select(
            "id,display_name,headline,bio,university,interests,avatar_url,avatar_key,is_member,is_team_lead,onboarding_complete,is_demo,revision,profile_skills(proficiency,skills(id,name,category,is_verified))",
          )
          .eq("id", user.id)
          .limit(1),
      );
      const p = rows[0];
      return NextResponse.json(
        p
          ? {
              ...p,
              skills: p.profile_skills.map((s: Record<string, any>) => ({
                ...s.skills,
                proficiency: s.proficiency,
              })),
            }
          : null,
      );
    }
    if (resource === "skills") {
      const query = normalizeSkill(
        z
          .string()
          .max(70)
          .parse(q.get("q") ?? ""),
      ).replace(/[%_,()]/g, "");
      return NextResponse.json(
        checked(
          await db.database
            .from("skills")
            .select("id,name,category,is_verified")
            .ilike("name", `%${query}%`)
            .order("is_verified", { ascending: false })
            .order("name")
            .limit(25),
        ),
      );
    }
    if (resource === "feed") {
      let cursor = null;
      if (q.get("cursor"))
        cursor = z
          .object({ id: z.string().uuid(), score: z.number().finite() })
          .parse(JSON.parse(q.get("cursor")!));
      const args = {
        p_user: user.id,
        p_limit: 12,
        p_cursor: cursor,
        p_search: z
          .string()
          .max(100)
          .parse(q.get("search") ?? ""),
        p_skill: z
          .string()
          .max(70)
          .parse(q.get("skill") ?? ""),
        p_role: z
          .string()
          .max(100)
          .parse(q.get("role") ?? ""),
        p_commitment: z
          .enum(["", "casual", "part-time", "intensive"])
          .parse(q.get("commitment") ?? ""),
      };
      return NextResponse.json(
        checked(await db.database.rpc("match_projects_for_user", args)),
      );
    }
    if (resource === "project") {
      const id = z.string().uuid().parse(q.get("id"));
      const p = checked(
        await db.database
          .from("projects")
          .select(projectSelect)
          .eq("id", id)
          .single(),
      );
      const matches = checked(
        await db.database.rpc("project_matches", { p_project: id }),
      );
      return NextResponse.json({
        ...projectShape(p),
        matches,
        user_id: user.id,
      });
    }
    if (resource === "my-projects")
      return NextResponse.json(
        checked(
          await db.database
            .from("projects")
            .select(projectSelect)
            .eq("owner_id", user.id)
            .order("created_at", { ascending: false })
            .limit(100),
        ).map(projectShape),
      );
    if (resource === "applications")
      return NextResponse.json(
        checked(
          await db.database
            .from("applications")
            .select(
              "id,project_id,role_id,status,message,band,final_score,breakdown,created_at,projects(title),project_roles(title)",
            )
            .eq("applicant_id", user.id)
            .order("created_at", { ascending: false })
            .limit(100),
        ),
      );
    if (resource === "invitations")
      return NextResponse.json(
        checked(
          await db.database
            .from("invitations")
            .select(
              "id,project_id,role_id,status,message,band,final_score,breakdown,created_at,projects(title),project_roles(title)",
            )
            .eq("invitee_id", user.id)
            .order("created_at", { ascending: false })
            .limit(100),
        ),
      );
    if (resource === "talent")
      return NextResponse.json(
        checked(
          await db.database.rpc("match_candidates_for_role", {
            p_role: z.string().uuid().parse(q.get("role")),
            p_limit: 50,
          }),
        ),
      );
    if (resource === "applicants" || resource === "team") {
      const id = z.string().uuid().parse(q.get("id"));
      const owner = checked(
        await db.database
          .from("projects")
          .select("owner_id")
          .eq("id", id)
          .single(),
      );
      if (owner.owner_id !== user.id) throw new HttpError("Forbidden", 403);
      if (resource === "applicants")
        return NextResponse.json(
          checked(
            await db.database
              .from("applications")
              .select(
                "id,project_id,role_id,applicant_id,status,message,band,final_score,breakdown,created_at,projects(title),project_roles(title),profiles!applications_applicant_id_fkey(display_name,headline)",
              )
              .eq("project_id", id)
              .order("final_score", { ascending: false })
              .limit(100),
          ),
        );
      return NextResponse.json(
        checked(
          await db.database
            .from("project_members")
            .select(
              "user_id,role_id,joined_at,profiles(display_name,headline,avatar_url),project_roles(title)",
            )
            .eq("project_id", id)
            .limit(50),
        ),
      );
    }
    if (resource === "session")
      return NextResponse.json({ user_id: user.id, profile });
    throw new HttpError("Not found", 404);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    sameOrigin(request);
    const { resource } = await params;
    const { user } = await session(resource !== "profile");
    await rate("embed:" + user.id, 12, 60);
    const input = await jsonBody(request);
    let id;
    if (resource === "profile") id = await saveProfile(user.id, input);
    else if (resource === "project") id = await saveProject(user.id, input);
    else throw new HttpError("Not found", 404);
    return NextResponse.json({ id });
  } catch (e) {
    return failure(e);
  }
}
