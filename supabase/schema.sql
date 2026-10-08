-- TIS Owls Live: database for the admin area.
-- Run this in the Supabase SQL editor of a new project (see docs/ADMIN.md).
-- Safe to run again: tables are created only if missing, and the function, trigger,
-- policies and checks are replaced, so rerunning it after a pull also applies new rules.

create table if not exists public.games (
  id         text primary key,
  team       text not null,
  opponent   text not null,
  venue      text not null default 'Home field',
  "start"    timestamptz not null,
  status     text not null default 'scheduled',
  home_score integer,
  away_score integer,
  stream_id  text,
  replay_id  text,
  cover      text,
  updated_at timestamptz not null default now()
);

-- Checks live outside the table definition so a rerun updates them on an existing table.
alter table public.games drop constraint if exists games_id_check;
alter table public.games drop constraint if exists games_team_check;
alter table public.games drop constraint if exists games_opponent_check;
alter table public.games drop constraint if exists games_venue_check;
alter table public.games drop constraint if exists games_status_check;
alter table public.games drop constraint if exists games_home_score_check;
alter table public.games drop constraint if exists games_away_score_check;
alter table public.games drop constraint if exists games_stream_id_check;
alter table public.games drop constraint if exists games_replay_id_check;
alter table public.games drop constraint if exists games_cover_check;

alter table public.games
  -- ids become page addresses (/game/<id>/), so lowercase letters, digits and dashes only
  add constraint games_id_check         check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 120),
  add constraint games_team_check       check (team ~ '^[a-z]+-[a-z]+$' and char_length(team) <= 40),
  add constraint games_opponent_check   check (char_length(btrim(opponent)) between 1 and 80),
  add constraint games_venue_check      check (char_length(btrim(venue)) between 1 and 80),
  add constraint games_status_check     check (status in ('scheduled', 'live', 'final')),
  add constraint games_home_score_check check (home_score between 0 and 999),
  add constraint games_away_score_check check (away_score between 0 and 999),
  add constraint games_stream_id_check  check (stream_id ~ '^[A-Za-z0-9_-]{11}$'),
  add constraint games_replay_id_check  check (replay_id ~ '^[A-Za-z0-9_-]{11}$'),
  -- The cover ends up inside CSS url(...) on the page, so only plain https addresses are
  -- allowed: no spaces, quotes, parentheses, semicolons or backslashes.
  add constraint games_cover_check      check (cover ~ '^https://[A-Za-z0-9._~:/?#@!$&*+,=%-]+$' and char_length(cover) <= 500);

create index if not exists games_start_idx on public.games ("start");

create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists games_touch on public.games;
create trigger games_touch before update on public.games
for each row execute function public.touch_updated_at();

-- Staff allow-list. Only people listed here can change games, even if someone
-- manages to create an account. Row level security with no policy means the
-- website itself can never read this table.
create table if not exists public.staff (email text primary key);
alter table public.staff enable row level security;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;
revoke all on function public.is_staff() from public;
revoke all on function public.is_staff() from anon;
grant execute on function public.is_staff() to authenticated;

alter table public.games enable row level security;

drop policy if exists "Anyone can read games" on public.games;
drop policy if exists "Staff can add games" on public.games;
drop policy if exists "Staff can update games" on public.games;
drop policy if exists "Staff can delete games" on public.games;

create policy "Anyone can read games" on public.games
  for select using (true);

create policy "Staff can add games" on public.games
  for insert to authenticated with check (public.is_staff());

create policy "Staff can update games" on public.games
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "Staff can delete games" on public.games
  for delete to authenticated using (public.is_staff());

-- Visitors only ever read. Row level security already blocks writes for the anon role;
-- removing the table grants as well means a policy mistake later cannot open writes to everyone.
revoke insert, update, delete, truncate on public.games from anon;
revoke all on public.staff from anon, authenticated;

-- Add each staff member (replace with real addresses):
-- insert into public.staff (email) values ('athletics@example.org') on conflict do nothing;
