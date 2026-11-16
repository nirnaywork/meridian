import { createAdminClient, createClient } from "@insforge/sdk";
import { randomBytes } from "node:crypto";
export const admin = createAdminClient({
  baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
  apiKey: process.env.INSFORGE_API_KEY!,
});
export function must<T>({
  data,
  error,
}: {
  data: T;
  error: unknown;
}): NonNullable<T> {
  if (error) throw error;
  return data as NonNullable<T>;
}
export async function createTestUser(
  name: string,
  email: string,
  password = "Meridian1!" + randomBytes(24).toString("hex"),
) {
  const find = async () => {
    const response = await fetch(
      process.env.NEXT_PUBLIC_INSFORGE_URL +
        "/api/auth/users?limit=20&search=" +
        encodeURIComponent(email),
      { headers: { Authorization: "Bearer " + process.env.INSFORGE_API_KEY } },
    );
    const payload = await response.json();
    if (!response.ok) throw new Error("Cannot inspect demo users");
    return payload.data?.find((u: { email: string }) => u.email === email);
  };
  const existing = await find();
  if (existing) return { id: existing.id as string, email, password };
  // Verified against InsForge backend/src/api/routes/auth/index.routes.ts and shared schema.
  const res = await fetch(
    process.env.NEXT_PUBLIC_INSFORGE_URL + "/api/auth/users?client_type=server",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.INSFORGE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, email, password, autoConfirm: true }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? JSON.stringify(data));
  const id =
    data.user?.id ??
    data.data?.user?.id ??
    data.id ??
    data.data?.id ??
    (await find())?.id;
  if (!id)
    throw new Error(
      "Unexpected admin response fields: " + Object.keys(data).join(","),
    );
  return { id: id as string, email, password };
}
export async function login(email: string, password: string) {
  const client = createClient({
    baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
    anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY!,
    isServerMode: true,
  });
  const auth = must(await client.auth.signInWithPassword({ email, password }));
  return { client, user: auth.user, token: auth.accessToken };
}
