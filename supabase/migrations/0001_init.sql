-- Habiloop schema

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  timezone text not null default 'Europe/Istanbul',
  reminder_hour int not null default 9 check (reminder_hour between 0 and 23),
  created_at timestamptz not null default now()
);

create table public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  emoji text not null default '✅',
  interval_days int not null check (interval_days between 1 and 365),
  grace_days int not null default 0 check (grace_days between 0 and 60),
  start_date date not null default current_date,
  archived boolean not null default false,
  -- Interval value the user dismissed, so the same suggestion is not shown again.
  dismissed_suggestion int,
  created_at timestamptz not null default now()
);
create index habits_user_idx on public.habits (user_id) where not archived;

create table public.completions (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  done_on date not null,
  note text,
  created_at timestamptz not null default now(),
  unique (habit_id, done_on)
);
create index completions_habit_idx on public.completions (habit_id, done_on desc);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Written only by the server (service role); prevents duplicate reminders per day.
create table public.notification_log (
  habit_id uuid not null references public.habits on delete cascade,
  kind text not null,
  sent_on date not null,
  primary key (habit_id, kind, sent_on)
);

-- Row level security: users only see their own rows.
alter table public.profiles enable row level security;
alter table public.habits enable row level security;
alter table public.completions enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log enable row level security;

create policy "own profile" on public.profiles for all
  using (id = auth.uid()) with check (id = auth.uid());
create policy "own habits" on public.habits for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own completions" on public.completions for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid())
  );
create policy "own push subscriptions" on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Create a profile row for every new user.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
