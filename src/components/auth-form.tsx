"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Logo, ThemeToggle, ErrorState, api } from "./ui";
import { password as passwordSchema } from "@/lib/validation";
export function CodeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  return (
    <div
      className="code-inputs"
      onPaste={(e) => {
        e.preventDefault();
        const s = e.clipboardData
          .getData("text")
          .replace(/\D/g, "")
          .slice(0, 6);
        onChange(s);
        refs.current[Math.min(s.length, 5)]?.focus();
      }}
    >
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          aria-label={`Code digit ${i + 1}`}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={6}
          value={value[i] ?? ""}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "");
            if (digits.length > 1) {
              onChange(digits.slice(0, 6));
              refs.current[Math.min(digits.length, 5)]?.focus();
              return;
            }
            const chars = value.padEnd(6, " ").split("");
            chars[i] = digits || " ";
            onChange(chars.join("").trimEnd());
            if (digits) refs.current[Math.min(5, i + 1)]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !value[i] && i > 0)
              refs.current[i - 1]?.focus();
            if (e.key === "ArrowLeft")
              refs.current[Math.max(0, i - 1)]?.focus();
            if (e.key === "ArrowRight")
              refs.current[Math.min(5, i + 1)]?.focus();
          }}
        />
      ))}
    </div>
  );
}
export function AuthForm({ mode }: { mode: string }) {
  const q = useSearchParams(),
    router = useRouter();
  const [email, setEmail] = useState(q.get("email") ?? ""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [show, setShow] = useState(false),
    [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown > 0) {
      const t = setTimeout(() => setCooldown((n) => n - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [cooldown]);
  const isCode = mode === "verify" || mode === "reset-password",
    isPassword = ["sign-up", "sign-in", "reset-password"].includes(mode);
  const titles: Record<string, string> = {
    "sign-up": "Your next chapter starts here.",
    "sign-in": "Good to see you again.",
    verify: "Check your inbox.",
    "forgot-password": "Let’s get you back in.",
    "reset-password": "A fresh start.",
  };
  const descriptions: Record<string, string> = {
    "sign-up": "Bring your skills. Find your people. Build something real.",
    "sign-in": "Your next idea, teammate, or opportunity is waiting.",
    verify: "Enter the six-digit code we sent to your email.",
    "forgot-password":
      "We’ll send a six-digit password reset code to your email.",
    "reset-password": "Enter your reset code and choose a new password.",
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (mode !== "sign-in" && isPassword) {
      const valid = passwordSchema.safeParse(password);
      if (!valid.success) {
        setError(valid.error.issues[0].message);
        return;
      }
    }
    setBusy(true);
    try {
      const action =
        mode === "forgot-password"
          ? "forgot"
          : mode === "reset-password"
            ? "reset"
            : mode;
      await api(`/api/auth/${action}`, { email, password, code });
      if (mode === "sign-up")
        router.push("/verify?email=" + encodeURIComponent(email));
      else if (mode === "forgot-password")
        router.push("/reset-password?email=" + encodeURIComponent(email));
      else if (mode === "reset-password") {
        setSent(true);
      } else window.location.href = "/start";
    } catch (e) {
      const err = e as Error & { verify?: boolean };
      if (err.verify) router.push("/verify?email=" + encodeURIComponent(email));
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setError("");
    setBusy(true);
    try {
      await api(
        "/api/auth/" + (mode === "reset-password" ? "forgot" : "resend"),
        { email },
      );
      setCooldown(60);
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <aside className="auth-art">
        <Logo />
        <div>
          <span className="eyebrow">DIFFERENT PATHS. SHARED DIRECTION.</span>
          <h2>
            Find the people
            <br />
            who bring out
            <br />
            <em>your potential.</em>
          </h2>
          <p>
            A designer. A developer. A big-picture thinker.
            <br />
            Something incredible happens when the right skills meet.
          </p>
        </div>
        <div className="auth-orbits">
          <i />
          <i />
          <i />
          <b>✦</b>
        </div>
        <small>A little alignment goes a long way.</small>
      </aside>
      <main className="auth-content">
        <header>
          <Link href="/" className="text-btn">
            <ArrowLeft size={16} />
            Back to Meridian
          </Link>
          <ThemeToggle />
        </header>
        <div className="auth-form-wrap">
          <span className="eyebrow">
            {isCode ? "ONE SMALL STEP" : "WELCOME TO MERIDIAN"}
          </span>
          <h1>{titles[mode]}</h1>
          <p className="muted">{descriptions[mode]}</p>
          {sent && mode === "reset-password" ? (
            <div className="success-box">
              Password updated.{" "}
              <Link href="/sign-in">Sign in to continue →</Link>
            </div>
          ) : (
            <form onSubmit={submit}>
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                />
              </label>
              {isCode && (
                <label>
                  Verification code
                  <CodeInput value={code} onChange={setCode} />
                </label>
              )}
              {isPassword && (
                <label>
                  {mode === "reset-password" ? "New password" : "Password"}
                  <div className="password-field">
                    <input
                      type={show ? "text" : "password"}
                      autoComplete={
                        mode === "sign-in" ? "current-password" : "new-password"
                      }
                      required
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your password"
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={show ? "Hide password" : "Show password"}
                      onClick={() => setShow(!show)}
                    >
                      {show ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {mode !== "sign-in" && (
                    <div className="password-strength">
                      <div>
                        {[
                          password.length >= 10,
                          /[a-z]/.test(password),
                          /[A-Z]/.test(password),
                          /\d/.test(password),
                        ].map((pass, i) => (
                          <i key={i} className={pass ? "filled" : ""} />
                        ))}
                      </div>
                      <small>
                        10+ characters, uppercase, lowercase, and a number
                      </small>
                    </div>
                  )}
                </label>
              )}
              {mode === "sign-in" && (
                <Link href="/forgot-password" className="forgot-link">
                  Forgot your password?
                </Link>
              )}
              {error && <ErrorState message={error} />}
              <button
                className="btn full"
                disabled={busy || (isCode && !/^\d{6}$/.test(code))}
              >
                {busy
                  ? "One moment…"
                  : mode === "sign-up"
                    ? "Create your account"
                    : mode === "sign-in"
                      ? "Sign in"
                      : mode === "verify"
                        ? "Verify & continue"
                        : mode === "reset-password"
                          ? "Update password"
                          : "Send reset code"}
                <ArrowRight size={18} />
              </button>
              {isCode && (
                <div className="resend">
                  <span>
                    {sent
                      ? "A new code is on its way."
                      : "Didn’t get the code?"}
                  </span>
                  <button
                    type="button"
                    className="text-btn"
                    disabled={busy || cooldown > 0}
                    onClick={resend}
                  >
                    {cooldown ? `Resend in ${cooldown}s` : "Resend code"}
                  </button>
                </div>
              )}
            </form>
          )}
          <p className="auth-switch">
            {mode === "sign-in" ? (
              <>
                New around here? <Link href="/sign-up">Find your people</Link>
              </>
            ) : mode === "sign-up" ? (
              <>
                Already part of Meridian? <Link href="/sign-in">Sign in</Link>
              </>
            ) : (
              <Link href="/sign-in">Back to sign in</Link>
            )}
          </p>
          <div className="auth-footnote">
            Built for people who build things.
          </div>
        </div>
      </main>
    </div>
  );
}
