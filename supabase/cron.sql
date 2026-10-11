-- Run once in the Supabase SQL editor after deploying the app.
-- Replace the URL and secret with your own values (CRON_SECRET from .env).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'habiloop-remind',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-APP.vercel.app/api/cron/remind',
    headers := jsonb_build_object('x-cron-secret', 'YOUR_CRON_SECRET')
  );
  $$
);
