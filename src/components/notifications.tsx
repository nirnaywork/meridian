"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {useDashboardPreferences} from "./dashboard-preferences";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import type { Notification } from "@/lib/collaboration";
import { api, Empty, ErrorState, Skeleton, useResource } from "./ui";
import { usePollingResource } from "./collaboration-ui";
type Page = {
  data: Notification[];
  total: number;
  page: number;
  limit: number;
};
function NotificationRows({
  rows,
  onRead,
}: {
  rows: Notification[];
  onRead: (n: Notification) => void;
}) {
  return (
    <ul className="notification-list">
      {rows.map((n) => (
        <li key={n.id} className={n.read_at ? "" : "unread"}>
          <button onClick={() => onRead(n)}>
            <b>{n.title}</b>
            <span>{n.body}</span>
            <time dateTime={n.created_at}>
              {new Date(n.created_at).toLocaleString()}
            </time>
            {!n.read_at && <span className="sr-only">Unread</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
export function NotificationBell() {
  const {quiet,preferences}=useDashboardPreferences();
  const [open, setOpen] = useState(false);
  const count = usePollingResource<{ count: number }>(
    "/api/notifications/unread-count",
    45000,
  );
  const unread=preferences&&!quiet?count.data?.count??0:0;
  const ref = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="notification-bell" ref={ref}>
      <button
        className="text-btn"
        ref={button}
        aria-label={`Notifications${quiet?", Do not disturb is on":unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        aria-controls="notification-popover"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={18} />
        Notifications{" "}
        <span aria-live="polite">
          {unread ? (
            <b className="count-badge">
              {unread > 9 ? "9+" : unread}
            </b>
          ) : null}
        </span>
      </button>
      {open && (
        <section
          id="notification-popover"
          className="notification-popover"
          aria-label="Recent notifications"
        >
          {quiet?<p>Do not disturb is on</p>:<RecentNotifications
            onClose={() => {
              setOpen(false);
              count.refresh();
            }}
            onUpdate={count.refresh}
          />}
        </section>
      )}
    </div>
  );
}
function RecentNotifications({
  onClose,
  onUpdate,
}: {
  onClose: () => void;
  onUpdate: () => void;
}) {
  const r = useResource<Page>("/api/notifications?limit=6");
  const router = useRouter();
  const [error, setError] = useState("");
  async function read(n: Notification) {
    try {
      await api("/api/notifications", { id: n.id });
      onClose();
      router.push(n.link);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="section-heading">
        <h3>Notifications</h3>
        <button
          className="text-btn"
          onClick={async () => {
            try {
              await api("/api/notifications", { all: true });
              r.refresh();
              onUpdate();
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Mark all as read
        </button>
      </div>
      {(error || r.error) && (
        <ErrorState message={error || r.error} retry={r.refresh} />
      )}{" "}
      {r.loading ? (
        <Skeleton />
      ) : r.data?.data.length ? (
        <NotificationRows rows={r.data.data} onRead={read} />
      ) : (
        <p className="muted">You’re all caught up.</p>
      )}
      <Link href="/notifications" onClick={onClose}>
        View all notifications →
      </Link>
    </>
  );
}
export function NotificationsPage() {
  const [page, setPage] = useState(1),
    [unread, setUnread] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();
  const r = usePollingResource<Page>(
    `/api/notifications?page=${page}&unread=${unread}`,
    45000,
  );
  async function mark(n?: Notification) {
    try {
      await api("/api/notifications", n ? { id: n.id } : { all: true });
      r.refresh();
      if (n) router.push(n.link);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <header className="page-heading">
        <span className="eyebrow">STAY IN THE LOOP</span>
        <h1>Notifications</h1>
        <p>Applications, invitations and updates from your teams.</p>
      </header>
      <div className="section-heading">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={unread}
            onChange={(e) => {
              setUnread(e.target.checked);
              setPage(1);
            }}
          />
          Unread only
        </label>
        <button className="btn secondary" onClick={() => mark()}>
          Mark all as read
        </button>
      </div>
      {(error || r.error) && (
        <ErrorState message={error || r.error} retry={r.refresh} />
      )}{" "}
      {r.loading ? (
        <Skeleton />
      ) : r.data?.data.length ? (
        <NotificationRows rows={r.data.data} onRead={mark} />
      ) : (
        <Empty
          title="You’re all caught up"
          description="Team updates will appear here."
        />
      )}
      <div className="form-actions">
        <button
          className="btn secondary"
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          className="btn secondary"
          disabled={!r.data || page * r.data.limit >= r.data.total}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}
