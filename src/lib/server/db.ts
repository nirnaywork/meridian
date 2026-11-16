import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@insforge/sdk/ssr";
import { createAdminClient } from "@insforge/sdk";
export async function userClient() {
  return createServerClient({ cookies: await cookies() });
}
export function adminClient() {
  if (!process.env.INSFORGE_API_KEY)
    throw new Error("Server configuration missing");
  return createAdminClient({
    baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
    apiKey: process.env.INSFORGE_API_KEY,
  });
}
export function checked<T>(result: {
  data: T;
  error: unknown;
}): NonNullable<T> {
  if (result.error) throw result.error;
  if (result.data === null) throw new Error("Not found");
  return result.data as NonNullable<T>;
}
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function session(onboarded = true) {
  const db = await userClient();
  const { data, error } = await db.auth.getCurrentUser();
  if (error || !data.user) throw new HttpError("Please sign in", 401);
  if (!data.user.emailVerified)
    throw new HttpError("Verify your email first", 403);
  const p = checked(
    await db.database
      .from("profiles")
      .select(
        "id,display_name,headline,is_member,is_team_lead,onboarding_complete,avatar_url,revision",
      )
      .eq("id", data.user.id)
      .limit(1),
  );
  if (onboarded && !p[0]?.onboarding_complete)
    throw new HttpError("Finish onboarding", 428);
  return { db, user: data.user, profile: p[0] ?? null };
}
export async function rate(key: string, limit = 30, seconds = 60) {
  const allow = checked(
    await adminClient().database.rpc("consume_rate", {
      p_key: key,
      p_limit: limit,
      p_seconds: seconds,
    }),
  );
  if (!allow)
    throw new HttpError("Too many attempts. Please wait and try again.", 429);
}
