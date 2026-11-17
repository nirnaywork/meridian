import { NextResponse } from "next/server";
import { z } from "zod";
import { session, checked, rate, HttpError } from "@/lib/server/db";
import { failure, jsonBody, sameOrigin } from "@/lib/server/http";
import { saveProfile, saveProject } from "@/lib/server/save";
import { normalizeSkill } from "@/data/taxonomy";
import { rankDomains } from "@/lib/domain-suggestions";
import {attachRoleMatches,getRoleMatchesForViewer} from '@/lib/server/role-matches';
import {presentParticipation,presentCandidate,presentExploreProject} from '@/lib/server/match-presentation';
import {orderRolesForDisplay} from '@/lib/matching/roleMatch';
const projectSelect =
  "id,owner_id,title,description,category,tags,commitment,duration,team_size,status,revision,is_demo,domains,profiles!projects_owner_id_fkey(display_name),project_roles(id,title,description,slots,filled_count,domains,project_role_skills(importance,skills(id,name,category,is_verified)))";
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
    const { db, user, profile } = await session(false);
    const q = new URL(request.url).searchParams;
    if (resource === "profile") {
      const rows = checked(
        await db.database
          .from("profiles")
          .select(
            "id,display_name,headline,bio,university,interests,domains,avatar_url,avatar_key,is_member,is_team_lead,onboarding_complete,is_demo,revision,profile_skills(proficiency,skills(id,name,category,is_verified))",
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
    if(resource==='domain-suggestions'){
      const names=z.array(z.string().max(70)).max(450).parse(JSON.parse(q.get('skills')??'[]')).map(normalizeSkill);
      if(!names.length)return NextResponse.json([]);
      const skills=checked(await db.database.from('skills').select('id').in('name',[...new Set(names)]));
      if(!skills.length)return NextResponse.json([]);
      const rows=checked(await db.database.from('skill_domains').select('skill_id,domain_id,domains(name)').in('skill_id',skills.map(s=>s.id)).limit(5000));
      return NextResponse.json(rankDomains(rows));
    }
    if (resource === "projects") {
      const filters = z
        .object({
          sort: z.enum(["newest", "oldest", "roles"]).default("newest"),
          search: z.string().max(100).default(""),
          field: z.string().max(100).default(""),
          domain: z.string().max(100).default(""),
          skill: z.string().max(70).default(""),
          role: z.string().max(100).default(""),
          commitment: z
            .enum(["", "casual", "part-time", "intensive"])
            .default(""),
          status: z
            .enum(["open", "closed", "in_progress", "completed", "cancelled", "archived", "all"])
            .default("open"),
        })
        .parse(Object.fromEntries(q));
      const cursor = q.get("cursor")
        ? z
            .object({ id: z.string().uuid(), key: z.number().finite() })
            .parse(JSON.parse(q.get("cursor")!))
        : null;
      const page=checked(await db.database.rpc("explore_projects", {
            p_filters: filters,
            p_cursor: cursor,
            p_limit: 12,
          }));
      return NextResponse.json(await attachRoleMatches(db,user.id,page.map(presentExploreProject)));
    }
    if (resource === "taxonomy")
      return NextResponse.json({
        fields: checked(await db.database.from("fields").select("*")),
        domains: checked(await db.database.from("domains").select("*")),
        templates: checked(
          await db.database.from("role_templates").select("*"),
        ),
      });
    if (resource === "project") {
      const id = z.string().uuid().parse(q.get("id"));
      const p = checked(
        await db.database
          .from("projects")
          .select(projectSelect)
          .eq("id", id)
          .single(),
      );
      const identity=checked(await db.database.rpc("profile_identities",{ids:[p.owner_id]})) as any[];
      p.profiles=identity[0]??null;
      const shaped=projectShape(p);shaped.roles=orderRolesForDisplay(shaped.roles);
      const matches=await getRoleMatchesForViewer(db,user.id,shaped.roles.map((r:any)=>r.id));
      return NextResponse.json({
        ...shaped,
        roles:shaped.roles.map((r:any)=>({...r,match:matches.find(m=>m.roleId===r.id)})),
        user_id: user.id,
        is_team_member:checked(await db.database.rpc("team_access",{pid:id,uid:user.id})),
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
              "id,project_id,role_id,status,message,match_percent,calibration_version,breakdown,created_at,projects(title),project_roles(title)",
            )
            .eq("applicant_id", user.id)
            .order("created_at", { ascending: false })
            .limit(100),
        ).map(presentParticipation),
      );
    if (resource === "invitations")
      return NextResponse.json(
        checked(
          await db.database
            .from("invitations")
            .select(
              "id,project_id,role_id,inviter_id,status,message,breakdown,created_at,projects(title),project_roles(title),profiles!invitations_inviter_id_fkey(display_name)",
            )
            .eq("invitee_id", user.id)
            .order("created_at", { ascending: false })
            .limit(100),
        ).map(presentParticipation),
      );
    if (resource === "talent") {
      const role = z.string().uuid("Choose a valid project role.").parse(q.get("role"));
      return NextResponse.json(
        checked(
          await db.database.rpc("match_candidates_for_role", {
            p_role: role,
            p_limit: 50,
          }),
        ).map((r: any) => presentCandidate(r, role)),
      );
    }
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
                "id,project_id,role_id,applicant_id,status,message,match_percent,calibration_version,breakdown,created_at,projects(title),project_roles(title),profiles!applications_applicant_id_fkey(display_name,headline)",
              )
              .eq("project_id", id)
              .order("created_at", { ascending: false })
              .limit(100),
          ).map(presentParticipation),
        );
      return NextResponse.json(
        checked(
          await db.database
            .from("project_members")
            .select(
              "user_id,role_id,joined_at,profiles!project_members_user_id_fkey(display_name,headline,avatar_url),project_roles(title)",
            )
            .eq("project_id", id)
            .is("left_at",null)
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
