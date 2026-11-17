import { expect, it } from "vitest";
import {
  advanceTimer,
  defaultTimerSettings,
  dndActive,
  freshTimer,
  remainingTime,
  toggleTimer,
  noteVisible,
  weeklyStreak,
  timerStorageSchema,
  databaseTimeZone,
  resetTimer,
} from "../src/lib/personal-dashboard";
it('normalizes the legacy browser zone accepted by ICU to the live SQL name',()=>{
 expect(databaseTimeZone('Asia/Calcutta')).toBe('Asia/Kolkata');
 expect(databaseTimeZone('UTC')).toBe('UTC');
});
it("uses timestamps for pauses, refreshes and elapsed background time", () => {
  const start = 100000;
  const state = toggleTimer(freshTimer(defaultTimerSettings), start);
  expect(remainingTime(state, start + 61000)).toBe(1439000);
  const restored = timerStorageSchema.parse(JSON.parse(JSON.stringify(state)));
  expect(remainingTime(restored, start + 1500001)).toBe(0);
  const paused = toggleTimer(state, start + 60000);
  expect(paused.endAt).toBeNull();
  expect(remainingTime(paused, start + 900000)).toBe(1440000);
  expect(toggleTimer(paused, start + 900000).endAt).toBe(start + 2340000);
});
it("uses a long break after four completed rounds and excludes skips", () => {
  let state = freshTimer(defaultTimerSettings);
  for (let round = 1; round <= 4; round++) {
    state = advanceTimer(state, defaultTimerSettings, true);
    expect(state.rounds).toBe(round);
    expect(state.phase).toBe(round === 4 ? "long" : "short");
    state = advanceTimer(state, defaultTimerSettings, true);
  }
  expect(state.pending).toHaveLength(4);
  const skipped = advanceTimer(
    freshTimer(defaultTimerSettings),
    defaultTimerSettings,
    false,
  );
  expect(skipped.rounds).toBe(0);
  expect(skipped.pending).toHaveLength(0);
  const custom = advanceTimer(
    freshTimer(defaultTimerSettings, "custom"),
    defaultTimerSettings,
    true,
  );
  expect(custom.pending[0].kind).toBe("custom");
  expect(custom.rounds).toBe(0);
});
it('resets the current break without discarding completions waiting to sync',()=>{
 const state=advanceTimer(freshTimer(defaultTimerSettings),defaultTimerSettings,true);
 const reset=resetTimer({...state,remaining:120000},defaultTimerSettings);
 expect(reset.phase).toBe('short');expect(reset.remaining).toBe(300000);
 expect(reset.pending).toEqual(state.pending);expect(reset.rounds).toBe(1);
});
it("expires DND exactly at the saved timestamp", () => {
  const p = { dnd_enabled: true, dnd_until: "2026-11-17T12:00:00Z" };
  expect(dndActive(p, Date.parse(p.dnd_until) - 1)).toBe(true);
  expect(dndActive(p, Date.parse(p.dnd_until))).toBe(false);
  expect(dndActive({ ...p, dnd_until: null }, Date.now())).toBe(true);
});
it("carries unfinished notes forward without rewriting their original date", () => {
  const note = { day: "2026-11-16", done: false, completed_at: null };
  expect(noteVisible(note, "2026-11-17")).toBe(true);
  expect(noteVisible(note, "2026-11-15")).toBe(false);
  expect(noteVisible({ ...note, done: true }, "2026-11-17")).toBe(false);
  expect(note.day).toBe("2026-11-16");
});
it("counts a consecutive weekly streak with a grace day for today", () => {
  expect(
    weeklyStreak(
      [
        { day: "2026-11-16", count: "2" },
        { day: "2026-11-15", count: 1 },
      ],
      "2026-11-17",
    ),
  ).toBe(2);
  expect(weeklyStreak([{ day: "2026-11-15", count: 1 }], "2026-11-17")).toBe(0);
});
