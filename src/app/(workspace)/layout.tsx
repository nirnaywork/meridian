import { redirect } from "next/navigation";
import { session, HttpError } from "@/lib/server/db";
import { Shell } from "@/components/shell";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let auth;
  try {
    auth = await session(false);
  } catch (e) {
    if (e instanceof HttpError) {
      if (e.status === 428) redirect("/onboarding");
      if (e.status === 403) redirect("/verify");
      redirect("/sign-in");
    }
    throw e;
  }
  return (
    <Shell
      profile={
        auth.profile ?? {
          display_name: "New member",
          headline: "",
          is_member: true,
          is_team_lead: false,
          avatar_url: null,
        }
      }
    >
      {children}
    </Shell>
  );
}
