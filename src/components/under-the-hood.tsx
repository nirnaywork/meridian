"use client";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { UNDER_THE_HOOD, type HoodTab } from "@/lib/under-the-hood";
import type { HoodRole } from "@/lib/embedding-types";
const Panel = dynamic(() => import("./under-the-hood-panel"), { ssr: false });
export type HoodProps = {
  kind: "profile" | "project";
  viewerId: string;
  projectId?: string;
  owner?: boolean;
  roles?: HoodRole[];
};
export function UnderTheHood(props: HoodProps) {
  const router=useRouter();
  const [open, setOpen] = useState(false),
    [present, setPresent] = useState(false),
    [loaded, setLoaded] = useState(false),
    [tab, setTab] = useState<HoodTab>("embedding"),
    [role, setRole] = useState("");
  const fab = useRef<HTMLButtonElement>(null),
    wasPresent = useRef(false),
    openRef = useRef(false);
  const sync = useCallback(() => {
    const q = new URL(window.location.href).searchParams,
      show = q.get("panel") === "under-the-hood";
    const selected = q.get("tab");
    if (show) {
      setTab(
        props.kind === "project" &&
          (selected === "roles" || selected === "similarity")
          ? selected
          : "embedding",
      );
      setRole(q.get("role") ?? "");
    }
    openRef.current = show;
    setOpen(show);
    if (show) {
      setLoaded(true);
      setPresent(true);
    }
  }, [props.kind]);
  useEffect(() => {
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [sync]);
  useEffect(() => {
    if (open) {setPresent(true);return;}
    if (!loaded) return;
    const timer = setTimeout(
      () => setPresent(false),
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 230,
    );
    return () => clearTimeout(timer);
  }, [open,loaded]);
  useEffect(() => {
    if (present) {
      wasPresent.current = true;
      return;
    }
    if (wasPresent.current) {
      requestAnimationFrame(() => fab.current?.focus());
      wasPresent.current = false;
    }
  }, [present]);
  function show() {
    const url = new URL(window.location.href);
    url.searchParams.set("panel", "under-the-hood");
    url.searchParams.set("tab", tab);
    if (role) url.searchParams.set("role", role);
    window.history.pushState(
      { ...window.history.state, meridianHood: true },
      "",
      url,
    );
    sync();
  }
  const close = useCallback(() => {
    if (!openRef.current) return;
    openRef.current = false;
    if (window.history.state?.meridianHood) {
      window.history.back();
    } else {
      const url = new URL(window.location.href);
      for (const key of ["panel", "tab", "role"]) url.searchParams.delete(key);
      window.history.replaceState(window.history.state, "", url);
      sync();
    }
  }, [sync]);
  function select(next: HoodTab, nextRole = role) {
    if (next === "roles" && !nextRole) nextRole = props.roles?.[0]?.id ?? "";
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    if (nextRole) url.searchParams.set("role", nextRole);
    else url.searchParams.delete("role");
    window.history.replaceState(window.history.state, "", url);
    setTab(next);
    setRole(nextRole);
  }
  function navigate(href:string){
    const target=new URL(href,window.location.href);
    if(target.pathname===window.location.pathname){
      window.history.replaceState({...window.history.state,meridianHood:false},"",target);sync();
      setTimeout(()=>{const element=document.getElementById(target.hash.slice(1));element?.scrollIntoView({block:"start"});element?.querySelector<HTMLElement>("input")?.focus();},240);
    }else router.push(href);
  }
  const Icon = UNDER_THE_HOOD.icon;
  return (
    <div className="hood-entry">
      <button
        type="button"
        ref={fab}
        hidden={present}
        className="hood-fab"
        title={UNDER_THE_HOOD.tooltip}
        aria-label={UNDER_THE_HOOD.label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={show}
      >
        <Icon size={21} />
        <span>{UNDER_THE_HOOD.label}</span>
      </button>
      {loaded && (
        <Panel
          {...props}
          open={open}
          present={present}
          tab={tab}
          role={role}
          close={close}
          select={select}
          navigate={navigate}
        />
      )}
    </div>
  );
}
