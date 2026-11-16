import { redirect } from "next/navigation";
import { session, HttpError } from "@/lib/server/db";

export default async function StartPage() {
  let auth;
  try {
    auth = await session(false);
  } catch (error) {
    if (error instanceof HttpError)
      redirect(error.status === 403 ? "/verify" : "/sign-in");
    throw error;
  }
  const { profile } = auth;

  redirect("/projects");
}
