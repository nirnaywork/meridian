import { NextResponse } from "next/server";
import { publicEmbeddingHealth } from "@/lib/server/embedding-health";
export async function GET(){const {body,available}=await publicEmbeddingHealth();return NextResponse.json(body,{status:available?200:503,headers:{"Cache-Control":"no-store"}});}
