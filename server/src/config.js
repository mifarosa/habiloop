// Reads settings from environment variables (see .env.example) and fails early with a clear message.
export function readConfig(env = process.env) {
  const missing = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'GOOGLE_APPLICATION_CREDENTIALS']
    .filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`Missing settings: ${missing.join(', ')}. Copy .env.example to .env and fill it in.`);
  }
  if (!/^(mailto:|https:)/.test(env.VAPID_SUBJECT)) {
    throw new Error('VAPID_SUBJECT must start with "mailto:" or "https:", e.g. mailto:you@example.com');
  }
  const num = (key, fallback) => {
    const v = Number(env[key] ?? fallback);
    if (!Number.isFinite(v) || v <= 0) throw new Error(`${key} must be a positive number`);
    return v;
  };
  return {
    vapidPublicKey: env.VAPID_PUBLIC_KEY,
    vapidPrivateKey: env.VAPID_PRIVATE_KEY,
    vapidSubject: env.VAPID_SUBJECT,
    dataDir: env.DATA_DIR || './data',
    tickSeconds: num('TICK_SECONDS', 30),
    maxLateMinutes: num('MAX_LATE_MINUTES', 30),
  };
}
