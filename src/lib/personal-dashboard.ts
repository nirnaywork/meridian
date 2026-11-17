import { z } from "zod";
export const timerSettingsSchema = z.object({
  focus: z.number().int().min(1).max(120),
  short: z.number().int().min(1).max(120),
  long: z.number().int().min(1).max(120),
  custom: z.number().int().min(1).max(120),
});
export type TimerSettings = z.infer<typeof timerSettingsSchema>;
export const defaultTimerSettings: TimerSettings = {
  focus: 25,
  short: 5,
  long: 15,
  custom: 10,
};
export const preferencesSchema = z.object({
  user_id: z.string().uuid(),
  dnd_enabled: z.boolean(),
  dnd_until: z.string().nullable(),
  settings: timerSettingsSchema,
});
export type DashboardPreferences = z.infer<typeof preferencesSchema>;
export const dashboardActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("preferences"),
    dnd_enabled: z.boolean().optional(),
    dnd_until: z.string().datetime({ offset: true }).nullable().optional(),
    settings: timerSettingsSchema.optional(),
  }),
  z.object({
    action: z.literal("note"),
    id: z.string().uuid(),
    day: z.string().date(),
    body: z.string().trim().min(1).max(500),
  }),
  z.object({
    action: z.literal("note_done"),
    id: z.string().uuid(),
    done: z.boolean(),
  }),
  z.object({ action: z.literal("note_delete"), id: z.string().uuid() }),
  z.object({
    action: z.literal("focus_complete"),
    id: z.string().uuid(),
    kind: z.enum(["focus", "custom"]),
    seconds: z.number().int().min(60).max(7200),
  }),
]);
export const timeZoneSchema = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid time zone");
// Browser ICU may return a legacy alias omitted by the hosted SQL catalog.
export const databaseTimeZone = (zone: string) =>
  zone === "Asia/Calcutta" ? "Asia/Kolkata" : zone;
export function dndActive(
  preferences: Pick<DashboardPreferences, "dnd_enabled" | "dnd_until"> | null,
  now: number,
) {
  return (
    !!preferences?.dnd_enabled &&
    (!preferences.dnd_until || Date.parse(preferences.dnd_until) > now)
  );
}
export function localDay(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
export function noteVisible(
  note: { day: string; done: boolean; completed_at: string | null },
  day: string,
) {
  return (
    note.day === day ||
    (!note.done && note.day < day) ||
    (!!note.completed_at && localDay(new Date(note.completed_at)) === day)
  );
}
export type Completion = {
  id: string;
  kind: "focus" | "custom";
  seconds: number;
};
export type TimerState = {
  mode: "pomodoro" | "custom";
  phase: "focus" | "short" | "long" | "custom";
  rounds: number;
  remaining: number;
  endAt: number | null;
  sessionId: string;
  duration: number;
  pending: Completion[];
};
export function freshTimer(
  settings: TimerSettings,
  mode: TimerState["mode"] = "pomodoro",
  rounds = 0,
): TimerState {
  const phase = mode === "custom" ? "custom" : "focus",
    duration = settings[phase] * 60;
  return {
    mode,
    phase,
    rounds,
    remaining: duration * 1000,
    endAt: null,
    sessionId: crypto.randomUUID(),
    duration,
    pending: [],
  };
}
export function remainingTime(state: TimerState, now: number) {
  return Math.max(
    0,
    state.endAt === null ? state.remaining : state.endAt - now,
  );
}
export function resetTimer(state:TimerState,settings:TimerSettings):TimerState{
 return {...state,remaining:settings[state.phase]*60000,duration:settings[state.phase]*60,endAt:null,sessionId:crypto.randomUUID()};
}
export function toggleTimer(state: TimerState, now: number): TimerState {
  return state.endAt === null
    ? { ...state, endAt: now + state.remaining }
    : { ...state, remaining: remainingTime(state, now), endAt: null };
}
export function advanceTimer(
  state: TimerState,
  settings: TimerSettings,
  complete: boolean,
): TimerState {
  const rounds = state.rounds + (complete && state.phase === "focus" ? 1 : 0);
  const phase =
    state.mode === "custom"
      ? "custom"
      : state.phase === "focus"
        ? complete && rounds % 4 === 0
          ? "long"
          : "short"
        : "focus";
  const completion: Completion[] =
    complete && (state.phase === "focus" || state.phase === "custom")
      ? [{ id: state.sessionId, kind: state.phase, seconds: state.duration }]
      : [];
  return {
    ...state,
    rounds,
    phase,
    duration: settings[phase] * 60,
    remaining: settings[phase] * 60000,
    endAt: null,
    sessionId: crypto.randomUUID(),
    pending: [...state.pending, ...completion],
  };
}
export const timerStorageSchema = z.object({
  mode: z.enum(["pomodoro", "custom"]),
  phase: z.enum(["focus", "short", "long", "custom"]),
  rounds: z.number().int().nonnegative(),
  remaining: z.number().min(0).max(7200000),
  endAt: z.number().finite().nullable(),
  sessionId: z.string().uuid(),
  duration: z.number().int().min(60).max(7200),
  pending: z
    .array(
      z.object({
        id: z.string().uuid(),
        kind: z.enum(["focus", "custom"]),
        seconds: z.number().int().min(60).max(7200),
      }),
    )
    .max(50),
});
export function weeklyStreak(
  days: { day: string; count: number | string }[],
  today: string,
) {
  const date = new Date(today + "T12:00:00");
  let streak = 0;
  if (!days.some((d) => d.day === today && Number(d.count) > 0))
    date.setDate(date.getDate() - 1);
  for (let i = 0; i < 7; i++) {
    if (!days.some((d) => d.day === localDay(date) && Number(d.count) > 0))
      break;
    streak++;
    date.setDate(date.getDate() - 1);
  }
  return streak;
}
