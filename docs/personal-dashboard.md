# Personal Dashboard

Signed-in users with completed onboarding land at `/dashboard`. Dashboard is the first main navigation item and the signed-in logo destination. Users completing sign-in still pass through the existing session and onboarding checks.

## Daily overview

The responsive card grid contains a local clock, time-based greeting, quick links, personal notes, focus timers, project links and assigned tickets. My day counts open or in-progress tickets across up to 30 active projects. Assigned tickets and recent messages are limited to the latest 12. The activity list shows six recent notification events for updates, tickets and project status.

Recent messages are read from `project_messages` through `personal_dashboard(text,date)`. They are never copied into a feed table. The function requires the verified viewer, checks current team access and then allows Everyone messages or a private message whose participant array includes the viewer. It includes the project's lead as an active team participant through the existing team-access helper. Removed members lose the feed immediately. Deleted messages are omitted.

A message link includes its exact project, thread and message ID. The team dashboard opens that thread and scrolls to the selected message. Viewing a personal preview leaves the conversation unread. The team chat updates read state after the conversation is opened.

## Daily notes

Notes accept 1–500 trimmed plain-text characters. Owners can add, edit, complete, reopen and delete them. They retain their original date. The selected date shows that day's notes, unfinished notes from earlier dates, and notes completed on the selected day. At local midnight the dashboard advances to the new date if the user was viewing today.

The maximum is 50 notes per date and 300 retained notes per user. The mutation function serializes on the owner's profile row before checking limits. Completed history remains available by choosing its date. Deleting a note is permanent. No daily job or automatic date rewrite is needed for carry-over.

## Do not disturb

DND is saved in `dashboard_preferences` and shared across devices. Optional expiry choices are 30 minutes, one hour, or tomorrow at 8 AM in the user's local zone. With no expiry it remains enabled until switched off. Expired preferences evaluate as inactive without changing a row during reads.

DND replaces personal message/activity cards with a calm state, removes the latest-unread shortcut and unread badges, suppresses the notification bell count and completion sounds. The personal read function also omits messages and activity while DND is active. Notifications and project messages continue to be stored. The notification inbox remains available. Preferences refresh on visibility changes and every 30 seconds on visible tabs. Local expiry is checked every second.

## Clock and focus

The clock mounts only in the browser and reads the actual current time each second. It displays the local date, zone and AM/PM. The API normalizes the browser's legacy Asia/Calcutta alias to the Asia/Kolkata name supported by the hosted PostgreSQL catalog.

Pomodoro defaults are 25 minutes of focus, five minutes of short break and a 15-minute long break after four completed focus intervals. Every interval starts explicitly. Start/pause, Reset and Skip are available. Skipping and resetting do not record a completion. A custom countdown is also available. Each duration can be adjusted from one to 120 minutes. Saved duration settings sync across devices and apply to the next interval or Reset.

Running timer state is stored under a per-user localStorage key. It uses an absolute end timestamp and a stored paused remainder, so refreshes and background tabs retain the correct elapsed time. Timer execution is local to that browser. A completion advances one interval to a paused next phase, so returning after a long absence records the interval that was running and waits for the user to start the next one. Remaining running time appears in the browser tab title.

Optional completion audio is enabled by a user gesture and uses the browser's built-in audio API. It requests no browser-notification permission. DND suppresses it. Completed focus/countdown intervals use stable UUIDs for retry deduplication. An offline completion remains queued in localStorage and retries every 15 seconds while the dashboard is open. Completed focus intervals contribute to today's count and the consecutive streak within the last seven local dates. A streak can end yesterday while today is still in progress. Countdowns and breaks do not count as Pomodoros. Statistics describe timer completions reported by the user's device.

Keyboard shortcuts operate outside form controls and dialogs. N focuses a new note, D toggles DND, Space starts or pauses the timer, and ? opens shortcut help. Escape closes help. The interface uses the existing theme variables for light and dark modes.

## API and security

| Endpoint | Purpose |
| --- | --- |
| `GET /api/dashboard?zone=<IANA>&day=<YYYY-MM-DD>` | Viewer-only feed, activity, notes, projects, assigned tickets and weekly focus totals |
| `GET /api/dashboard/preferences` | Lightweight viewer-only preferences used by the shell and notification bell |
| `POST /api/dashboard` | Validated note, preference and focus-completion mutations |

Every endpoint requires a verified, onboarded session. Mutations enforce same origin, Zod validation and a 60-per-minute per-user limit. The server derives the actor from its session before calling the admin-only mutation RPC.

New tables are `daily_notes`, `dashboard_preferences` and `focus_sessions`. All have owner-only RLS with USING and WITH CHECK. Client roles receive SELECT only. Writes go through `personal_dashboard_action(uuid,jsonb)`, which checks the actor and applies changes only to that owner's records. Definer functions use a pinned search path. PUBLIC and anon cannot execute any new function. Authenticated users may execute the two viewer-derived read functions, while mutations require project_admin. No read accepts a target user ID.

## Current scope and limitations

Running timers sync within their browser through persistence on refresh. Duration settings, DND and completed session history are server-backed. Multi-device running-timer synchronization, browser push notifications, rich text, file attachments, calendar integration and exports are outside this change. Audio is optional and depends on browser support. DND changes made on another device can take up to the next preference poll to appear. Feeds are bounded recent lists. Notes have explicit per-date and total limits. A suspended browser can alert only after it resumes.

Use the verification report for migration, deployment, tests and cleanup evidence.
