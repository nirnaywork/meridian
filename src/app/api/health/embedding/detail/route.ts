import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { detailedEmbeddingHealth } from "@/lib/server/embedding-health";
export async function GET(request:Request){
 const expected=process.env.HEALTH_TOKEN,provided=request.headers.get("x-health-token")??"";
 if(!expected||Buffer.byteLength(expected)!==Buffer.byteLength(provided)||!timingSafeEqual(Buffer.from(expected),Buffer.from(provided)))return NextResponse.json({message:"Unauthorized"},{status:401});
 const body=await detailedEmbeddingHealth();return NextResponse.json(body,{status:body.selectionReason==="error"?503:200,headers:{"Cache-Control":"private, no-store"}});
}
