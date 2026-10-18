# Habiloop

Interval habit tracker (PWA). Instead of a daily streak, every habit has a window: choose **every how many days** and a **tolerance**, and the app works out the ideal day and the last day from when you last did it. When the day comes, it asks "did you do it?".

Example: litter box, every 3 days, 1 day tolerance. Clean it on Wednesday:

| Day | State |
| --- | --- |
| Thursday, Friday | 🟢 Relaxed |
| Saturday | 🟡 Ideal day |
| Sunday | 🔴 Last day |
| Monday | ⛔ Overdue |

## Features
- Habits sorted by urgency, with a one-tap **Done** button and **Another day** (pick any of the last 14 days).
- "It's time" prompt once a day after the reminder time; optional browser notifications while the app is open or in the background.
- On-time rate (share of cycles done by the last day) instead of a streak.
- Interval suggestion after 5+ entries when your real rhythm differs.
- Calendar with a log per day, history editing, JSON backup and restore.
- Paper-and-ink UI with progress rings: light/dark/system theme, five accent colors, Turkish and English.
- Delete a habit from its detail sheet; "Delete all data" in settings.
- Notifications: toggle, test notification and a "Done" action on the notification itself. They arrive while the app is open or in the background; a fully closed app cannot schedule them without a push server.
- Data stays on the device (localStorage). Works offline, installable on Android and iOS.

## Run
No build step. Serve the folder with any static server, for example `python -m http.server`, and open http://localhost:8000.

## Files
| File | Purpose |
| --- | --- |
| `js/schedule.js` | Window, on-time rate and interval suggestion logic (pure functions) |
| `js/app.js` | UI: habits, calendar, settings, prompts |
| `js/i18n.js` | Turkish and English strings |
| `sw.js` | Service worker (bump `CACHE` on every release) |
