"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ErrorState } from "./ui";
import { useDashboardPreferences } from "./dashboard-preferences";
import {
  freshTimer,
  toggleTimer,
  advanceTimer,
  remainingTime,
  resetTimer,
  timerStorageSchema,
  timerSettingsSchema,
  defaultTimerSettings,
  type TimerState,
} from "@/lib/personal-dashboard";
export function FocusTimer({
  userId,
  onComplete,
}: {
  userId: string;
  onComplete: () => void;
}) {
  const { preferences, quiet, save } = useDashboardPreferences();
  const settings = preferences?.settings ?? defaultTimerSettings;
  const [timer, setTimer] = useState<TimerState | null>(null),
    [savingSettings,setSavingSettings]=useState(false),
    [settingsSaved,setSettingsSaved]=useState(false),
    [now, setNow] = useState(0),
    [error, setError] = useState(""),
    [sound, setSound] = useState(false);
  const audio = useRef<AudioContext | null>(null),
    sending = useRef(false),
    retryAt = useRef(0),
    quietRef = useRef(quiet);
  quietRef.current = quiet;
  const key = "meridian-focus:" + userId;
  useEffect(() => {
    let restored: TimerState | null = null;
    try {
      const value = localStorage.getItem(key);
      if (value) {
        const parsed = timerStorageSchema.safeParse(JSON.parse(value));
        if (parsed.success) restored = parsed.data;
      }
    } catch {}
    setTimer(restored ?? freshTimer(settings));
    setNow(Date.now());
    let timeout: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      timeout = setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    tick();
    return () => {
      clearTimeout(timeout);
      void audio.current?.close();
    };
  }, [key]);
  useEffect(() => {
    if (timer) localStorage.setItem(key, JSON.stringify(timer));
  }, [key, timer]);
  useEffect(() => {
    if (!timer?.endAt || remainingTime(timer, now) > 0) return;
    if (sound && !quietRef.current && audio.current) {
      const oscillator = audio.current.createOscillator(),
        gain = audio.current.createGain();
      oscillator.connect(gain);
      gain.connect(audio.current.destination);
      gain.gain.setValueAtTime(0.06, audio.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audio.current.currentTime + 0.4,
      );
      oscillator.start();
      oscillator.stop(audio.current.currentTime + 0.4);
    }
    setTimer(advanceTimer(timer, settings, true));
  }, [timer, now, settings, sound]);
  useEffect(() => {
    if (
      !timer?.pending.length ||
      sending.current ||
      Date.now() < retryAt.current
    )
      return;
    sending.current = true;
    const completed = timer.pending[0];
    void api("/api/dashboard", { action: "focus_complete", ...completed })
      .then(() => {
        setTimer((state) =>
          state
            ? {
                ...state,
                pending: state.pending.filter((p) => p.id !== completed.id),
              }
            : state,
        );
        setError("");
        onComplete();
      })
      .catch((e) => {
        retryAt.current = Date.now() + 15000;
        setError(
          "Session is saved on this device. Retrying shortly. " +
            (e as Error).message,
        );
      })
      .finally(() => {
        sending.current = false;
      });
  }, [timer, now]);
  useEffect(() => {
    const original = document.title;
    return () => {
      document.title = original;
    };
  }, []);
  useEffect(() => {
    if (timer)
      document.title = timer.endAt
        ? format(remainingTime(timer, now)) +
          " · " +
          timer.phase +
          " · Meridian"
        : "Dashboard · Meridian";
  }, [timer, now]);
  const toggle = () => {
    const instant=Date.now();setNow(instant);
    setTimer((state) => (state ? toggleTimer(state, instant) : state));
  };
  useEffect(() => {
    const handler = () => toggle();
    window.addEventListener("meridian-toggle-focus", handler);
    return () => window.removeEventListener("meridian-toggle-focus", handler);
  }, []);
  async function configure(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingSettings(true);setSettingsSaved(false);
    try {
      const values = Object.fromEntries(
        Array.from(new FormData(e.currentTarget), ([key, value]) => [
          key,
          Number(value),
        ]),
      );
      await save({ settings: timerSettingsSchema.parse(values) });
      setError("");
      setSettingsSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }finally{setSavingSettings(false)}
  }
  function enableSound() {
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
      setSound(true);
    } catch {
      setError("Sound is unavailable in this browser.");
    }
  }
  return (
    <section className="day-card focus-card" aria-label="Focus timer">
      <header className="section-heading">
        <h2>Focus timer</h2>
        <label>
          Timer mode
          <select
            aria-label="Timer mode"
            value={timer?.mode ?? "pomodoro"}
            onChange={(e) =>
              setTimer((state) => ({
                ...freshTimer(
                  settings,
                  e.target.value as TimerState["mode"],
                  state?.rounds ?? 0,
                ),
                pending: state?.pending ?? [],
              }))
            }
          >
            <option value="pomodoro">Pomodoro</option>
            <option value="custom">Custom countdown</option>
          </select>
        </label>
      </header>
      <p>
        {timer?.phase === "short"
          ? "Short break"
          : timer?.phase === "long"
            ? "Long break"
            : timer?.phase === "custom"
              ? "Countdown"
              : "Focus"}{" "}
        · {timer?.rounds ?? 0} completed focus sessions
      </p>
      <output className="focus-digits" aria-label="Time remaining">
        {timer ? format(remainingTime(timer, now)) : "25:00"}
      </output>
      <div className="day-actions">
        <button
          className="btn"
          aria-label={timer?.endAt ? "Pause timer" : "Start timer"}
          disabled={!timer}
          onClick={toggle}
        >
          {timer?.endAt ? "Pause" : "Start"}
        </button>
        <button
          className="btn secondary"
          disabled={savingSettings}
          onClick={() =>
            setTimer((state) => state?resetTimer(state,settings):freshTimer(settings))
          }
        >
          Reset
        </button>
        <button
          className="text-btn"
          onClick={() =>
            setTimer((state) =>
              state ? advanceTimer(state, settings, false) : state,
            )
          }
        >
          Skip
        </button>
      </div>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={sound}
          onChange={(e) => (e.target.checked ? enableSound() : setSound(false))}
        />
        Sound on completion
      </label>
      <details>
        <summary>Timer settings</summary>
        <form onSubmit={configure} onChange={()=>setSettingsSaved(false)} className="timer-settings">
          {(["focus", "short", "long", "custom"] as const).map((name) => (
            <label key={name}>
              {name === "focus"
                ? "Focus minutes"
                : name === "short"
                  ? "Short break minutes"
                  : name === "long"
                    ? "Long break minutes"
                    : "Countdown minutes"}
              <input
                aria-label={name + " minutes"}
                name={name}
                type="number"
                min={1}
                max={120}
                defaultValue={settings[name]}
              />
            </label>
          ))}
          <button className="btn secondary" disabled={savingSettings}>{savingSettings?'Saving…':'Save durations'}</button>
        </form>
        {settingsSaved&&<p role="status">Timer settings saved</p>}
        <p className="muted">
          Saved durations apply to the next interval or Reset. Breaks start when
          you press Start.
        </p>
      </details>
      {error && <ErrorState message={error} />}
    </section>
  );
}
function format(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  return (
    String(Math.floor(seconds / 60)).padStart(2, "0") +
    ":" +
    String(seconds % 60).padStart(2, "0")
  );
}
