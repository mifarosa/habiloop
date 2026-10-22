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
- Notifications with a "Done" action on the notification itself. On their own they arrive while the app is open or in the background. With the optional **home notification server** (`server/`, installs with one command) they also arrive when the app is closed.
- Data stays on the device (localStorage) unless you turn on the optional Google sync. Works offline, installable on Android and iOS.
- Optional Google sync: sign in, set a sync password, and habits are encrypted in the browser (AES-256-GCM, PBKDF2) before they go to Firestore, so the server only stores ciphertext.

## Run
No build step. Serve the folder with any static server, for example `python -m http.server`, and open http://localhost:8000.

## Sync setup
Sync is off until a Firebase project is configured; with an empty `js/firebase-config.js` the account section stays hidden.

1. Create a Firebase project and add a **Web app**.
2. **Authentication → Sign-in method**: enable **Google**.
3. **Authentication → Settings → Authorized domains**: add `habiloop.mifarosa.com` (and `localhost` for testing). Subdomains are not covered by `mifarosa.com`, so list it exactly.
4. **Firestore Database**: create it, then paste `firestore.rules` into **Rules** and publish.
5. Put the web app's config values into `js/firebase-config.js`. They are public by design; access is enforced by sign-in and the rules.

Habits are merged one by one (the newer edit wins) and deletions travel as tombstones. A forgotten sync password wipes the cloud copy and re-uploads from a device that still has the habits.

## Server notifications (optional)
A small Node service in `server/` runs on an always-on machine and sends the reminders as Web Push. Habit data stays
encrypted: the app prepares a list of "send this at that time" reminders per device and the service only sends them.
Setup is one command, see [`server/README.md`](server/README.md). Then paste the server's public key into `js/push-config.js`.

## Files
| File | Purpose |
| --- | --- |
| `js/schedule.js` | Window, on-time rate and interval suggestion logic (pure functions) |
| `js/app.js` | UI: habits, calendar, settings, prompts |
| `js/i18n.js` | Turkish and English strings |
| `js/sync.js`, `js/sync-core.js`, `js/firebase-config.js` | Optional Google sync: Firebase wiring, encryption and merge, config |
| `firestore.rules` | Firestore security rules for the sync data and push subscriptions |
| `server/` | Home notification server (Node, Web Push) and its installer |
| `js/push-config.js` | Public VAPID key of the notification server |
| `sw.js` | Service worker (bump `CACHE` on every release) |
