import { ProfileEditor } from "@/components/profile-editor";
import { session } from "@/lib/server/db";
export default async function Profile() {
  const { user } = await session(false);
  return <ProfileEditor ownerId={user.id} />;
}
