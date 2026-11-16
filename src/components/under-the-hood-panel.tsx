"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { Maximize2, Minimize2, X } from "lucide-react";
import { UNDER_THE_HOOD, type HoodTab } from "@/lib/under-the-hood";
import type { HoodProps } from "./under-the-hood";
const Content = dynamic(() => import("./under-the-hood-content"), {
  ssr: false,
  loading: () => (
    <div className="hood-skeleton" role="status">
      Loading saved explanation…
    </div>
  ),
});
type Props = HoodProps & {
  open: boolean;
  present: boolean;
  tab: HoodTab;
  role: string;
  close: () => void;
  select: (tab: HoodTab, role?: string) => void;
  navigate:(href:string)=>void;
};
export default function UnderTheHoodPanel(props: Props) {
  const { open, present, close, tab, select } = props;
  const [expanded, setExpanded] = useState(false),
    [toc, setToc] = useState<{ id: string; text: string }[]>([]),
    [active, setActive] = useState("");
  const panel = useRef<HTMLDivElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    title = useId(),
    intro = useId();
  useEffect(() => {
    if (!present) return;
    const oldOverflow = document.body.style.overflow,
      oldPadding = document.body.style.paddingRight;
    const width = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (width) document.body.style.paddingRight = `${width}px`;
    const background = Array.from(document.body.children).filter(
      (el) => el !== panel.current?.parentElement && el.tagName !== "SCRIPT",
    ) as HTMLElement[];
    const previous = background.map((el) => el.inert);
    background.forEach((el) => (el.inert = true));
    panel.current?.querySelector<HTMLElement>("button")?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
      if (event.key !== "Tab") return;
      const candidates = Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"]),summary',
        ) ?? [],
      ).filter(
        (el) => el.getClientRects().length && !el.closest("[hidden],[inert]"),
      );
      const first = candidates[0],
        last = candidates.at(-1);
      if (!first) {
        event.preventDefault();
        panel.current?.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !panel.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !panel.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    const focus = (event: FocusEvent) => {
      if (!panel.current?.contains(event.target as Node))
        panel.current?.querySelector<HTMLElement>("button")?.focus();
    };
    document.addEventListener("keydown", keys, true);
    document.addEventListener("focusin", focus);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.body.style.paddingRight = oldPadding;
      background.forEach((el, i) => (el.inert = previous[i]));
      document.removeEventListener("keydown", keys, true);
      document.removeEventListener("focusin", focus);
    };
  }, [present, close]);
  useEffect(() => {
    if (!present || !scroll.current) return;
    const host = scroll.current;
    const collect = () => {
      const headings = Array.from(host.querySelectorAll<HTMLElement>("h3"));
      setToc(
        headings.map((h, i) => {
          h.id = `hood-step-${i}`;
          return { id: h.id, text: h.textContent ?? "" };
        }),
      );
    };
    collect();
    const observer = new MutationObserver(collect);
    observer.observe(host, { childList: true, subtree: true });
    const spy = () => {
      const headings = Array.from(host.querySelectorAll<HTMLElement>("h3")),
        top = host.getBoundingClientRect().top;
      const current =
        headings
          .filter((h) => h.getBoundingClientRect().top <= top + 110)
          .at(-1) ?? headings[0];
      setActive(current?.id ?? "");
    };
    host.addEventListener("scroll", spy, { passive: true });
    spy();
    return () => {
      observer.disconnect();
      host.removeEventListener("scroll", spy);
    };
  }, [present, tab, props.role]);
  useEffect(() => {
    if (present) scroll.current?.scrollTo({ top: 0 });
  }, [tab, props.role, present]);
  const entries = (
    <nav aria-label="Explanation steps">
      {toc.map((t) => (
        <a
          key={t.id}
          href={`#${t.id}`}
          aria-current={active === t.id ? "step" : undefined}
          onClick={(e) => {
            e.preventDefault();
            scroll.current
              ?.querySelector(`#${t.id}`)
              ?.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                  .matches
                  ? "instant"
                  : "smooth",
                block: "start",
              });
            setActive(t.id);
          }}
        >
          {t.text}
        </a>
      ))}
    </nav>
  );
  return createPortal(
    <div className="hood-layer" hidden={!present}>
      <div
        className={`hood-backdrop ${open ? "is-open" : ""}`}
        data-testid="hood-backdrop"
        onClick={close}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title}
        aria-describedby={intro}
        tabIndex={-1}
        className={`hood-panel ${open ? "is-open" : ""} ${expanded ? "is-expanded" : ""}`}
      >
        <header className="hood-header">
          <div>
            <h2 id={title}>{UNDER_THE_HOOD.title}</h2>
            <p id={intro}>{UNDER_THE_HOOD.intro}</p>
          </div>
          <div className="hood-header-actions">
            <button
              type="button"
              className="icon-btn"
              aria-label={expanded ? "Collapse panel" : "Expand panel"}
              aria-pressed={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 /> : <Maximize2 />}
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Close ${UNDER_THE_HOOD.label}`}
              onClick={close}
            >
              <X />
            </button>
          </div>
        </header>
        <div
          className="hood-tabs"
          role="tablist"
          aria-label={`${UNDER_THE_HOOD.label} sections`}
          onKeyDown={(e) => {
            const tabs = Array.from(
              e.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="tab"]',
              ),
            );
            const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              e.key === "ArrowRight"
                ? (i + 1) % tabs.length
                : e.key === "ArrowLeft"
                  ? (i - 1 + tabs.length) % tabs.length
                  : e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? tabs.length - 1
                      : -1;
            if (next >= 0) {
              e.preventDefault();
              tabs[next].click();
              tabs[next].focus();
            }
          }}
        >
          {(props.kind === "profile"
            ? [{ key: "embedding", label: "Your embedding" }]
            : [
                { key: "embedding", label: "Project embedding" },
                { key: "roles", label: "Role embeddings" },
                { key: "similarity", label: "Similarity" },
              ]
          ).map((t) => (
            <button
              type="button"
              role="tab"
              key={t.key}
              id={`${title}-${t.key}`}
              aria-controls={`${title}-content`}
              aria-selected={tab === t.key}
              tabIndex={tab === t.key ? 0 : -1}
              onClick={() => select(t.key as HoodTab)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="hood-body">
          <aside className="hood-toc">
            <span className="eyebrow">STEP BY STEP</span>
            {entries}
          </aside>
          <div className="hood-scroll" ref={scroll}>
            <details className="hood-mobile-toc">
              <summary>Jump to a step</summary>
              {entries}
            </details>
            <div
              role="tabpanel"
              id={`${title}-content`}
              aria-labelledby={`${title}-${tab}`}
              tabIndex={0}
            >
              <Content {...props} />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
