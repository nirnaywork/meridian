"use client";
import Link from "next/link";
import { usePollingResource } from "./collaboration-ui";
export function WorkspaceLink({ id }: { id: string }) {
  const r = usePollingResource<{ unread_chat: number }>(
    `/api/projects/${id}/workspace?resource=unread`,
    45000,
  );
  if (r.loading || r.error || !r.data) return null;
  return (
    <Link className="btn secondary" href={`/projects/${id}/workspace`}>
      Team Dashboard{" "}
      {r.data.unread_chat > 0 && (
        <span className="count-badge">
          {r.data.unread_chat > 9 ? "9+" : r.data.unread_chat} unread
        </span>
      )}
    </Link>
  );
}
