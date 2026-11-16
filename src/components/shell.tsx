"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Compass,
  Layers,
  Mail,
  UserRound,
  Plus,
  LogOut,
  ArrowUpRight,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { Logo, ThemeToggle, ToastProvider, api } from "./ui";
type Me = {
  display_name: string;
  headline: string;
  is_member: boolean;
  is_team_lead: boolean;
  avatar_url: string | null;
};
export function Shell({
  children,
  profile,
}: {
  children: React.ReactNode;
  profile: Me;
}) {
  const path = usePathname(),
    [open, setOpen] = useState(false);
  const links = [
    ...[
      { href: "/projects", label: "Explore projects", icon: Compass },
      { href: "/applications", label: "My applications", icon: Layers },
      { href: "/invitations", label: "Invitations", icon: Mail },
    ],
    ...(profile.is_team_lead
      ? [{ href: "/my-projects", label: "My projects", icon: Layers }]
      : []),
  ];
  return (
    <ToastProvider>
      <div className="app-shell">
        <button
          className="mobile-menu icon-btn"
          onClick={() => setOpen(!open)}
          aria-label="Toggle navigation"
        >
          {open ? <X /> : <Menu />}
        </button>
        <aside className={`sidebar ${open ? "is-open" : ""}`}>
          <Logo />
          <div className="workspace-label">
            YOUR WORKSPACE <span>✦</span>
          </div>
          <nav aria-label="Main navigation">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={path === l.href ? "active" : ""}
              >
                <l.icon size={18} />
                {l.label}
                {path === l.href && <span className="nav-dot" />}
              </Link>
            ))}
          </nav>
          {profile.is_team_lead && (
            <Link href="/projects/new" className="sidebar-create">
              <Plus size={17} />
              Start a project
            </Link>
          )}
          <div className="sidebar-note">
            <span className="tiny-orbit">✳</span>
            <h3>
              Good things start
              <br />
              with the right people.
            </h3>
            <p>Your next big idea could be one connection away.</p>
            <Link href="/profile">
              Fine-tune your profile <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="sidebar-bottom">
            <Link href="/profile" className="profile-link">
              <span className="avatar">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" />
                ) : (
                  profile.display_name.slice(0, 2).toUpperCase()
                )}
              </span>
              <span>
                <b>{profile.display_name}</b>
                <small>View your profile</small>
              </span>
              <UserRound size={16} />
            </Link>
            <div className="sidebar-tools">
              <ThemeToggle />
              <button
                className="text-btn"
                onClick={async () => {
                  await api("/api/auth/sign-out", {});
                  window.location.href = "/";
                }}
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          </div>
        </aside>
        <main className="app-main">{children}</main>
      </div>
    </ToastProvider>
  );
}
