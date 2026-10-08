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

-- Takedown: a hidden game disappears from the public site at once (staff still see it).
alter table public.games add column if not exists hidden boolean not null default false;

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
-- manages to create an account. Roles: 'admin' manages everything (games, takedowns, staff);
-- 'scorer' can only go live, update the score, end the game and set the replay link.
create table if not exists public.staff (email text primary key);
alter table public.staff add column if not exists role text not null default 'admin';
update public.staff set email = lower(btrim(email)) where email <> lower(btrim(email));
alter table public.staff drop constraint if exists staff_role_check;
alter table public.staff drop constraint if exists staff_email_check;
alter table public.staff
  add constraint staff_role_check  check (role in ('admin', 'scorer')),
  add constraint staff_email_check check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254);
alter table public.staff enable row level security;

-- The signed-in person's role, or null when they are not on the list.
create or replace function public.staff_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.staff where email = lower(auth.jwt() ->> 'email');
$$;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.staff_role() is not null;
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.staff_role() = 'admin', false);
$$;
revoke all on function public.staff_role() from public, anon;
revoke all on function public.is_staff() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.staff_role() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Scorers may change only the score, the status and the replay link.
create or replace function public.guard_scorer_edits() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.staff_role() = 'scorer' and (
    (new.id, new.team, new.opponent, new.venue, new."start", new.stream_id, new.cover, new.hidden)
    is distinct from
    (old.id, old.team, old.opponent, old.venue, old."start", old.stream_id, old.cover, old.hidden)
  ) then
    raise exception 'Scorers can only change the score, the game status and the replay link';
  end if;
  return new;
end;
$$;
drop trigger if exists games_guard_scorer on public.games;
create trigger games_guard_scorer before update on public.games
for each row execute function public.guard_scorer_edits();

-- A YouTube live stream becomes its own replay, so a finished game with no replay link
-- uses the stream's video until someone pastes a different one.
create or replace function public.fill_replay_from_stream() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'final' and new.replay_id is null and new.stream_id is not null then
    new.replay_id := new.stream_id;
  end if;
  return new;
end;
$$;
drop trigger if exists games_fill_replay on public.games;
create trigger games_fill_replay before insert or update on public.games
for each row execute function public.fill_replay_from_stream();

alter table public.games enable row level security;

drop policy if exists "Anyone can read games" on public.games;
drop policy if exists "Anyone can read visible games" on public.games;
drop policy if exists "Staff can read all games" on public.games;
drop policy if exists "Staff can add games" on public.games;
drop policy if exists "Admins can add games" on public.games;
drop policy if exists "Staff can update games" on public.games;
drop policy if exists "Staff can delete games" on public.games;
drop policy if exists "Admins can delete games" on public.games;

create policy "Anyone can read visible games" on public.games
  for select to anon, authenticated using (not hidden);

create policy "Staff can read all games" on public.games
  for select to authenticated using (public.is_staff());

create policy "Admins can add games" on public.games
  for insert to authenticated with check (public.is_admin());

create policy "Staff can update games" on public.games
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "Admins can delete games" on public.games
  for delete to authenticated using (public.is_admin());

-- Admins manage the staff list from the admin page, but never their own row,
-- so nobody can lock themselves out or remove the last way in by accident.
drop policy if exists "Admins can read staff" on public.staff;
drop policy if exists "Admins can add staff" on public.staff;
drop policy if exists "Admins can change other staff" on public.staff;
drop policy if exists "Admins can remove other staff" on public.staff;

create policy "Admins can read staff" on public.staff
  for select to authenticated using (public.is_admin());

create policy "Admins can add staff" on public.staff
  for insert to authenticated with check (public.is_admin());

create policy "Admins can change other staff" on public.staff
  for update to authenticated
  using (public.is_admin() and email <> lower(auth.jwt() ->> 'email'))
  with check (public.is_admin() and email <> lower(auth.jwt() ->> 'email'));

create policy "Admins can remove other staff" on public.staff
  for delete to authenticated using (public.is_admin() and email <> lower(auth.jwt() ->> 'email'));

-- Change history: every change to a game, who made it and the values before and after, so an admin
-- can see what happened and undo it. Written only by the trigger; admins read it.
-- A run of score-only changes by the same person within 5 minutes is kept as one entry.
create table if not exists public.game_history (
  id         bigint generated always as identity primary key,
  game_id    text not null,
  kind       text not null check (kind in ('insert', 'update', 'score', 'delete')),
  changed_by text,
  changed_at timestamptz not null default now(),
  old_row    jsonb,
  new_row    jsonb
);
create index if not exists game_history_changed_at_idx on public.game_history (changed_at desc);
create index if not exists game_history_game_idx on public.game_history (game_id, changed_at desc);
alter table public.game_history enable row level security;

create or replace function public.log_game_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text := lower(auth.jwt() ->> 'email');
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  k text;
  last public.game_history;
begin
  if tg_op = 'UPDATE' then
    if (o - 'updated_at') = (n - 'updated_at') then return null; end if;
    k := case when (o - '{home_score,away_score,updated_at}'::text[]) = (n - '{home_score,away_score,updated_at}'::text[])
              then 'score' else 'update' end;
    if k = 'score' then
      select * into last from public.game_history where game_id = new.id order by changed_at desc, id desc limit 1;
      if found and last.kind = 'score' and last.changed_by is not distinct from who
         and last.changed_at > now() - interval '5 minutes' then
        update public.game_history set new_row = n, changed_at = now() where id = last.id;
        return null;
      end if;
    end if;
  else
    k := lower(tg_op);
  end if;
  insert into public.game_history (game_id, kind, changed_by, old_row, new_row)
  values (coalesce(new.id, old.id), k, who, o, n);
  return null;
end;
$$;
revoke all on function public.log_game_change() from public, anon, authenticated;

drop trigger if exists games_history on public.games;
create trigger games_history after insert or update or delete on public.games
for each row execute function public.log_game_change();

drop policy if exists "Admins can read history" on public.game_history;
create policy "Admins can read history" on public.game_history
  for select to authenticated using (public.is_admin());
revoke all on public.game_history from anon, authenticated;
grant select on public.game_history to authenticated;

-- Cover photos: a public storage folder anyone can view; only admins upload, replace or delete.
-- JPEG, PNG or WebP up to 5 MB (the admin page shrinks photos before uploading).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Admins upload cover photos" on storage.objects;
drop policy if exists "Admins replace cover photos" on storage.objects;
drop policy if exists "Admins remove cover photos" on storage.objects;
create policy "Admins upload cover photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'covers' and public.is_admin());
create policy "Admins replace cover photos" on storage.objects
  for update to authenticated using (bucket_id = 'covers' and public.is_admin()) with check (bucket_id = 'covers' and public.is_admin());
create policy "Admins remove cover photos" on storage.objects
  for delete to authenticated using (bucket_id = 'covers' and public.is_admin());

-- Visitors only ever read. Row level security already blocks writes for the anon role;
-- removing the table grants as well means a policy mistake later cannot open writes to everyone.
revoke insert, update, delete, truncate on public.games from anon;
revoke all on public.staff from anon, authenticated;
grant select, insert, update, delete on public.staff to authenticated;

-- Only staff-listed emails can get an account at all, so public sign-up is closed even if the
-- "Allow new users to sign up" switch is left on. Add the email to public.staff first, then create the user.
create or replace function public.only_staff_accounts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or not exists (select 1 from public.staff where lower(email) = lower(new.email)) then
    raise exception 'Sign-up is closed: % is not on the staff list', coalesce(new.email, '(no email)');
  end if;
  return new;
end;
$$;

drop trigger if exists only_staff_accounts on auth.users;
create trigger only_staff_accounts before insert on auth.users
for each row execute function public.only_staff_accounts();

-- Add each staff member (replace with real addresses):
-- The first admin has to be added here; after that, admins add staff from the admin page.
-- insert into public.staff (email, role) values ('athletics@example.org', 'admin') on conflict do nothing;
