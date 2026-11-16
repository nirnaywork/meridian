import { redirect } from "next/navigation";
import { session } from "@/lib/server/db";
import { ProfileEditor } from "@/components/profile-editor";
export default async function Onboarding() {
  try {
    await session(false);
  } catch {
    redirect("/sign-in");
  }
  return <ProfileEditor onboarding />;
}
