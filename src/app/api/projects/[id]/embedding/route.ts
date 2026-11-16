import { NextResponse } from "next/server";
import {
  projectEmbeddingContext,
  targetEmbedding,
} from "@/lib/server/embedding-data";
import { failure } from "@/lib/server/http";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { db, project, role } = await projectEmbeddingContext(id, request);
    return NextResponse.json(
      { embedding: await targetEmbedding(db, project.id, role) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
