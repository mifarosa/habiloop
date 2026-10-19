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
- Data stays on the device (localStorage) unless you turn on the optional Google sync. Works offline, installable on Android and iOS.
- Optional Google sync: sign in, set a sync password, and habits are encrypted in the browser (AES-256-GCM, PBKDF2) before they go to Firestore, so the server only stores ciphertext.

## Run
No build step. Serve the folder with any static server, for example `python -m http.server`, and open http://localhost:8000.

## Sync setup
Sync is off until a Firebase project is configured; with an empty `js/firebase-config.js` the account section stays hidden.

1. Create a Firebase project and add a **Web app**.
2. **Authentication → Sign-in method**: enable **Google**.
3. **Authentication → Settings → Authorized domains**: add `habiloop.mifarosa.com` (and `localhost` for testing).
4. **Firestore Database**: create it, then paste `firestore.rules` into **Rules** and publish.
5. Put the web app's config values into `js/firebase-config.js`. They are public by design; access is enforced by sign-in and the rules.

Habits are merged one by one (the newer edit wins) and deletions travel as tombstones. A forgotten sync password wipes the cloud copy and re-uploads from a device that still has the habits.

## Files
| File | Purpose |
| --- | --- |
| `js/schedule.js` | Window, on-time rate and interval suggestion logic (pure functions) |
| `js/app.js` | UI: habits, calendar, settings, prompts |
| `js/i18n.js` | Turkish and English strings |
| `js/sync.js`, `js/sync-core.js`, `js/firebase-config.js` | Optional Google sync: Firebase wiring, encryption and merge, config |
| `firestore.rules` | Firestore security rules for the sync data |
| `sw.js` | Service worker (bump `CACHE` on every release) |
