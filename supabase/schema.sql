-- TIS Owls Live: database for the admin area.
-- Run this once in the Supabase SQL editor of a new project (see docs/ADMIN.md).

create table public.games (
  id         text primary key,
  team       text not null check (team ~ '^[a-z]+-[a-z]+$'),
  opponent   text not null check (char_length(opponent) between 1 and 80),
  venue      text not null default 'Home field',
  "start"    timestamptz not null,
  status     text not null default 'scheduled' check (status in ('scheduled', 'live', 'final')),
  home_score integer check (home_score >= 0),
  away_score integer check (away_score >= 0),
  stream_id  text check (stream_id ~ '^[A-Za-z0-9_-]{11}$'),
  replay_id  text check (replay_id ~ '^[A-Za-z0-9_-]{11}$'),
  cover      text,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger games_touch before update on public.games
for each row execute function public.touch_updated_at();

-- Staff allow-list. Only people listed here can change games, even if someone
-- manages to create an account. Row level security with no policy means the
-- website itself can never read this table.
create table public.staff (email text primary key);
alter table public.staff enable row level security;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;
revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated;

alter table public.games enable row level security;

create policy "Anyone can read games" on public.games
  for select using (true);

create policy "Staff can add games" on public.games
  for insert to authenticated with check (public.is_staff());

create policy "Staff can update games" on public.games
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "Staff can delete games" on public.games
  for delete to authenticated using (public.is_staff());

-- Add each staff member (replace with real addresses):
-- insert into public.staff (email) values ('athletics@example.org');
