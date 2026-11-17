import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "./db";
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new HttpError("Invalid request origin", 403);
}
export async function jsonBody(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 100000)
    throw new HttpError("Request too large", 413);
  const text = await request.text();
  if (text.length > 100000) throw new HttpError("Request too large", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError("Invalid JSON");
  }
}
export function failure(error: unknown) {
  if (error instanceof ZodError)
    return NextResponse.json(
      { message: error.issues[0]?.message ?? "Check the form" },
      { status: 400 },
    );
  const e = error as {
    message?: string;
    status?: number;
    statusCode?: number;
    code?: string;
  };
  const databaseStatus = e.code === '42501' ? 403 : ['40001','PT409'].includes(e.code ?? '') ? 409 : undefined;
  const status = e.status ?? databaseStatus ?? e.statusCode ?? 400;
  let message = e.message ?? "Something went wrong. Please retry.";
  if (e.code === "23505") message = "This record already exists.";
  if (e.code === "23503")
    message =
      "This role has history and cannot be removed. Keep the role or close the project.";
  if (e.code === "23514")
    message = "The change conflicts with existing team slots.";
  return NextResponse.json(
    { message },
    { status: status >= 400 && status < 600 ? status : 400 },
  );
}
