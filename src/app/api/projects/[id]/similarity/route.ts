import { NextResponse } from "next/server";
import {
  projectEmbeddingContext,
  targetEmbedding,
} from "@/lib/server/embedding-data";
import { checked } from "@/lib/server/db";
import { failure } from "@/lib/server/http";
import {readRoleComparisons,presentRoleMatch} from '@/lib/server/role-matches';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { db, user, project, role } = await projectEmbeddingContext(
      id,
      request,
    );
    const headers = { "Cache-Control": "private, no-store" };
    if (project.owner_id === user.id) {
      let query = db.database
        .from("applications")
        .select(
          "id,cosine,match_percent,calibration_version,breakdown,profiles!applications_applicant_id_fkey(display_name),project_roles(title)",
        )
        .eq("project_id", project.id)
        .order("created_at", { ascending: false });
      if (role) query = query.eq("role_id", role);
      const rows = checked(await query);
      // Deliberately never query any profile embedding in owner mode.
      return NextResponse.json(
        {
          mode: "owner",
          applicants: rows.map((r) => ({
            id: r.id,
            name:
              (Array.isArray(r.profiles) ? r.profiles[0] : (r.profiles as any))
                ?.display_name ?? "Applicant",
            role:
              (Array.isArray(r.project_roles)
                ? r.project_roles[0]
                : (r.project_roles as any)
              )?.title ?? "Whole project",
            cosine: r.cosine,
            angle:
              r.cosine == null
                ? null
                : (Math.acos(Math.max(-1, Math.min(1, r.cosine))) * 180) /
                  Math.PI,
            matched_skills: r.breakdown?.matched_skills ?? [],
            missing_skills: r.breakdown?.missing_skills ?? [],
            matchPercent:r.match_percent??null,
            calibrationVersion:r.calibration_version??null,
            provider:r.breakdown?.model??null,
          })),
        },
        { headers },
      );
    }
    const profile =
      checked(
        await db.database
          .from("profile_embeddings")
          .select("*")
          .eq("profile_id", user.id)
          .limit(1),
      )[0] ?? null;
    const target = await targetEmbedding(db, project.id, role);
    const values = checked(
      await db.database.rpc("viewer_similarity", { pid: project.id }),
    );
    let query = db.database
      .from("applications")
      .select("cosine,created_at")
      .eq("applicant_id", user.id)
      .eq("project_id", project.id);
    query = role ? query.eq("role_id", role) : query.is("role_id", null);
    const snapshot = checked(await query.limit(1))[0] ?? null;
    const roles=checked(await db.database.from('project_roles').select('id,title').eq('project_id',project.id).order('title').order('id'));
    const details=await readRoleComparisons(db,user.id,roles.map(r=>r.id));
    return NextResponse.json(
      {
        mode: "member",
        profile,
        target,
        cosine: values.find((v: any) => v.role_id === role)?.cosine ?? null,
        snapshot,
        selectedRoleId:role,
        rolePercentages:roles.map(r=>{const raw=details.find(d=>d.role_id===r.id),match=raw?presentRoleMatch(raw):null;return {roleId:r.id,title:r.title,cosine:raw?.cosine??null,matchPercent:match?.matchPercent??null,provider:raw?.model??null,state:match?.state??'missing_role'}}),
      },
      { headers },
    );
  } catch (e) {
    return failure(e);
  }
}
