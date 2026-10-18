# Habiloop

A habit tracker PWA that is compatible with [Loop Habit Tracker](https://github.com/iSoron/uhabits) for Android.
Runs fully in the browser (iPhone, desktop, Android), works offline, and stores everything on the device.

- Opens a Loop backup (`.db`) directly, and exports back to the same format (Loop schema version 25).
- Yes/No and numerical habits, any frequency ("X times per Y days"), archive.
- Habit strength score ported from Loop's `Score.kt` / `ScoreList.kt`, plus a 90-day score chart and streaks.
- Turkish and English.

Data is a real SQLite database (via [sql.js](https://github.com/sql-js/sql.js), vendored in `lib/`) kept in IndexedDB.

## Run

Any static file server works, for example `python -m http.server`, then open http://localhost:8000.
A service worker needs HTTPS (or localhost) to install the app.

## Known limits

- Reminders/notifications and widgets are not implemented yet.
- Streaks are computed with a simplified rule, so a few numbers can differ from Loop for non-daily habits.
- Loop's "skip" and "unknown" states are read, but the UI only toggles yes/no.
- Backups written by this app have not been tested inside the Android app.

## License

GPL-3.0. The scoring code is derived from Loop Habit Tracker (GPL-3.0). Loop is not affiliated with this project.
