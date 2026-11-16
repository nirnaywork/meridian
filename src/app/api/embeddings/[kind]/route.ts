import { NextResponse } from "next/server";
import { session, checked, HttpError,rate } from "@/lib/server/db";
import { failure,sameOrigin,jsonBody } from "@/lib/server/http";
import {z} from 'zod';
import {regenerateSavedEmbedding} from '@/lib/server/regenerate';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  try {
    const { kind } = await params;
    if (kind !== "me") throw new HttpError("Not found", 404);
    const { db, user } = await session(false);
    const embedding =
      checked(
        await db.database
          .from("profile_embeddings")
          .select("*")
          .eq("profile_id", user.id)
          .limit(1),
      )[0] ?? null;
    return NextResponse.json(
      { embedding },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request:Request,{params}:{params:Promise<{kind:string}>}){
 try{sameOrigin(request);if((await params).kind!=='regenerate')throw new HttpError('Not found',404);const {user}=await session(false);await rate('embed:'+user.id,12,60);
 const body=z.discriminatedUnion('kind',[z.object({kind:z.literal('profile')}),z.object({kind:z.literal('project'),id:z.string().uuid()})]).parse(await jsonBody(request));
 return NextResponse.json({id:await regenerateSavedEmbedding(user.id,body.kind,body.kind==='project'?body.id:undefined)});
 }catch(error){return failure(error)}
}
