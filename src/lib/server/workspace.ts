import "server-only";
import { checked, HttpError, session } from "./db";
export async function workspaceSession(id: string) {
  const context = await session();
  if (
    !checked(
      await context.db.database.rpc("team_access", {
        pid: id,
        uid: context.user.id,
      }),
    )
  )
    throw new HttpError(
      "Only the lead and active team members can enter this workspace.",
      403,
    );
  return context;
}
