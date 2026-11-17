"use client";
import {ProfileLinksEditor} from "./public-profile";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@insforge/sdk/ssr";
import {
  ArrowRight,
  ArrowLeft,
  Compass,
  Flag,
  Check,
  Upload,
} from "lucide-react";
import { api, useResource, ErrorState, Logo, ThemeToggle } from "./ui";
import { UnderTheHood } from "./under-the-hood";
import { DomainPicker } from "./domain-picker";
import { DomainSuggestions,LegacyDomainBanner } from "./domain-guidance";
import { SkillsPicker } from "./skills-picker";
import type { Profile } from "@/lib/types";
import {requiredDomains} from '@/lib/validation';
const blank: Profile = {
  id: "",
  display_name: "",
  headline: "",
  bio: "",
  university: "",
  interests: "",
  avatar_url: null,
  avatar_key: null,
  is_member: true,
  is_team_lead: false,
  onboarding_complete: false,
  is_demo: false,
  revision: 0,
  domains: [],
  skills: [],
};
export function ProfileEditor({
  onboarding = false,
  ownerId,
}: {
  onboarding?: boolean;
  ownerId?: string;
}) {
  const router = useRouter(),
    resource = useResource<Profile>("/api/data/profile");
  const [form, setForm] = useState<Profile>(blank),
    [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  useEffect(() => {
    if (resource.data) setForm(resource.data);
  }, [resource.data]);
  const field = (key: keyof Profile, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  async function upload(file: File) {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setError("Use a JPG, PNG or WebP smaller than 2 MB.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const client = createBrowserClient();
      const { data, error } = await client.auth.getCurrentUser();
      if (error || !data.user) throw new Error("Please sign in again");
      const key = `${data.user.id}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
      const result = await client.storage.from("avatars").upload(key, file);
      if (result.error) throw result.error;
      setForm((f) => ({
        ...f,
        avatar_url: result.data!.url,
        avatar_key: result.data!.key,
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (onboarding && step === 0) {
      if (!form.display_name.trim() || form.headline.trim().length < 3) {
        setError("Add your name and a short headline.");
        return;
      }
      setStep(1);
      return;
    }
    if (onboarding && step === 1) {
      if(!requiredDomains.safeParse(form.domains??[]).success){setError('Choose at least one domain.');return;}
      if (!form.skills.length) {
        setError("Add at least one skill.");
        return;
      }
      setBusy(true);
      try {
        await api("/api/data/profile", { ...form, onboarding_complete: false });
        const saved = await api<Profile>("/api/data/profile");
        setForm(saved);
        setStep(2);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }
    if((onboarding||!resource.data?.onboarding_complete)&&!requiredDomains.safeParse(form.domains??[]).success){setError('Choose at least one domain.');return;}
    setBusy(true);
    try {
      await api("/api/data/profile", { ...form, onboarding_complete: true });
      if (onboarding)
        window.location.href = form.is_member ? "/projects" : "/my-projects";
      else {
        setSuccess("Your profile is up to date.");
        resource.refresh();
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const content = (
    <div className="profile-editor">
      <div className="page-heading">
        <span className="eyebrow">
          {onboarding ? "LET’S FIND YOUR DIRECTION" : "YOUR CORNER OF MERIDIAN"}
        </span>
        <h1>
          {onboarding
            ? [
                "First, a little about you.",
                "What do you bring to the table?",
                "Where would you like to go?",
              ][step]
            : "Your profile"}
        </h1>
        <p>
          {onboarding
            ? [
                "The best collaborations start with a hello.",
                "Every skill is a starting point. Add what you know and what you’re learning.",
                "Find a project, lead a team, or follow both paths.",
              ][step]
            : "Keep your skills and interests current to find better connections."}
        </p>
      </div>
      {onboarding && (
        <div className="steps">
          {["The basics", "Your skills", "Your direction"].map((s, i) => (
            <span key={s} className={i <= step ? "done" : ""}>
              <i>{i < step ? <Check size={14} /> : i + 1}</i>
              {s}
            </span>
          ))}
        </div>
      )}
      {resource.error && (
        <ErrorState message={resource.error} retry={resource.refresh} />
      )}
      <form className="form-panel" onSubmit={save}>
        {!onboarding&&resource.data?.onboarding_complete&&!resource.data.domains?.length&&<LegacyDomainBanner id={'profile:'+resource.data.id} href="#skills-editor"/>}
        {(!onboarding || step === 0) && (
          <>
            <div className="avatar-upload">
              <span className="avatar big">
                {form.avatar_url ? (
                  <img src={form.avatar_url} alt="Your avatar" />
                ) : (
                  form.display_name.slice(0, 2).toUpperCase() || "YOU"
                )}
              </span>
              <label className="btn secondary small">
                <Upload size={15} />
                Add a photo
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    if (e.target.files?.[0]) void upload(e.target.files[0]);
                  }}
                />
              </label>
              <small>Optional · JPG, PNG, WebP · 2 MB max</small>
            </div>
            <div className="form-grid">
              <label>
                Display name
                <input
                  required
                  maxLength={80}
                  value={form.display_name}
                  onChange={(e) => field("display_name", e.target.value)}
                  placeholder="What should we call you?"
                />
              </label>
              <label>
                University <span className="optional">optional</span>
                <input
                  maxLength={120}
                  value={form.university}
                  onChange={(e) => field("university", e.target.value)}
                  placeholder="Where you’re learning"
                />
              </label>
            </div>
            <label>
              Your headline
              <input
                required
                minLength={3}
                maxLength={140}
                value={form.headline}
                onChange={(e) => field("headline", e.target.value)}
                placeholder="3rd-year CS student, curious about the intersection of tech and design"
              />
            </label>
            <label>
              A little about you
              <textarea
                maxLength={1500}
                value={form.bio}
                onChange={(e) => field("bio", e.target.value)}
                placeholder="What gets you excited? What would you love to build?"
                rows={4}
              />
            </label>
          </>
        )}
        {(!onboarding || step === 1) && (
          <>
            <label className="section-label">Your skills</label>
            <DomainSuggestions skills={form.skills} value={form.domains??[]} onConfirm={v=>field('domains',v)}/>
            <DomainPicker
              value={form.domains ?? []}
              onChange={(v) => field("domains", v)}
            />
            <div id="skills-editor" />
            <SkillsPicker
              domains={form.domains}
              value={form.skills}
              onChange={(s) => field("skills", s)}
            />
            <label>
              Interests <span className="optional">optional</span>
              <input
                value={form.interests}
                maxLength={200}
                onChange={(e) => field("interests", e.target.value)}
                placeholder="Climate tech, accessible education, open source…"
              />
            </label>
            <div className="info-note">
              Your skills help us find projects that fit. Be honest about your
              level — every team needs people who are ready to learn.
            </div>
          </>
        )}
        {(!onboarding || step === 2) && (
          <div className="intent-grid">
            {[
              {
                key: "is_member" as const,
                title: "Find projects",
                copy: "Bring your skills to an idea you believe in.",
                icon: Compass,
              },
              {
                key: "is_team_lead" as const,
                title: "Lead a team",
                copy: "Bring the right people around your idea.",
                icon: Flag,
              },
            ].map((x) => (
              <label
                key={x.key}
                className={`intent-card ${form[x.key] ? "selected" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={form[x.key]}
                  onChange={(e) => field(x.key, e.target.checked)}
                />
                <x.icon size={25} />
                <b>{x.title}</b>
                <p>{x.copy}</p>
              </label>
            ))}
          </div>
        )}
        {error && <ErrorState message={error} />}
        {success && (
          <p className="success-box" role="status">
            {success}
          </p>
        )}
        <div className="form-actions">
          {onboarding && step > 0 && (
            <button
              type="button"
              className="text-btn"
              disabled={busy}
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft size={16} />
              Back
            </button>
          )}
          <button className="btn" disabled={busy || resource.loading}>
            {busy
              ? "Aligning your skills…"
              : !onboarding
                ? "Save profile"
                : step === 2
                  ? "Find my direction"
                  : "Continue"}
            <ArrowRight size={17} />
          </button>
        </div>
        {busy && (
          <p className="muted" role="status">
            Saving your profile and preparing your matches. This may take a
            moment.
          </p>
        )}
      </form>
    </div>
  );
  return onboarding ? (
    <div className="onboarding">
      <header>
        <Logo />
        <ThemeToggle />
      </header>
      {content}
    </div>
  ) : (
    <>
      {content}
      {(ownerId || resource.data?.id) && <ProfileLinksEditor id={ownerId ?? resource.data!.id}/>}
      {!resource.loading && (ownerId || resource.data?.id) && (
        <UnderTheHood
          key={`${ownerId ?? resource.data?.id}:${resource.data?.revision ?? 0}`}
          viewerId={ownerId ?? resource.data!.id}
          kind="profile"
        />
      )}
    </>
  );
}
