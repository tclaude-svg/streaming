# Admin area

Staff open `/admin/` (not linked from the site, kept out of search engines). The page works in
two modes. Which one you get depends on whether the database is configured.

## What staff do on game day (target: under 5 minutes)

1. **Add game**: sport and level, opponent, start time (Tashkent time), optional YouTube stream link.
2. **Go live** when the stream starts. The home page switches to "Live now" and the game page shows the stream.
3. Tap **+** and **−** to update the score (saved automatically).
4. **End game** at the final whistle. If the game had a stream link, the stream becomes the replay
   automatically (YouTube keeps a live stream as a video). Paste a different replay link with **Edit** only if needed.

Pasting any YouTube address works (`watch?v=`, `youtu.be/`, `/live/`, `/embed/`) or just the 11-character id.
Scores are optional, so a game with no scorer still works.

## Roles

| | Admin | Scorer |
|---|---|---|
| Go live, update the score, end the game | yes | yes |
| Add, edit and delete games | yes | no |
| Hide a game from the public site (takedown) | yes | no |
| Add and remove staff, change roles (**Staff** button) | yes | no |

Admins cannot change or remove their own entry, so nobody locks themselves out by accident.
The database enforces all of this, not just the buttons.

## Takedown requests

**Hide from site** removes the game from every public list and page right away; staff still see it in the admin,
marked "Hidden from the public site". Links that were already shared stop working after the next rebuild
(about 10 minutes with automatic rebuilds). Also make the video private on YouTube, since the site only
embeds it. **Show on site** brings it back.

## Importing the fixture list

Admins tap **Import fixtures**, then paste rows copied from Excel or Google Sheets (or choose a CSV file).
Columns: date, time, sport, level, opponent, and optionally venue and stream link, with or without a header row
(any column order when there is a header). A single "team" column such as "Football Varsity" also works.

- Dates are day first: `17/10/2026`, `17.10.2026`, `2026-10-17` or `17 Oct 2026`. Times: `15:30`, `3:30 pm`, `1530`.
  All times are Tashkent time.
- Sports: football (or soccer), basketball, volleyball. Levels: Varsity (V), Junior Varsity (JV).
- **Check rows** shows every row: ready, already added (same team, time and opponent; skipped), or what to fix.
  **Add N games** adds the ready ones. Re-importing the same sheet adds nothing new.

## Change history and undo

Admins open **History** to see the latest 60 changes to games: what changed, when, and who did it
(for example "Score 0–0 → 3–1, by scorer@…"). A run of score taps by one person within 5 minutes is one entry.
**Undo** puts the game back the way it was before that change; if the game changed again afterwards, the page
warns first, because undo also removes those later changes. Undo works for added and deleted games too.
The database records history itself, so nobody can edit or delete it from the site.

## Adding staff

1. An admin opens **Staff**, enters the person's email and picks Admin or Scorer.
2. The person opens `/admin/`, taps **First time here? Set up your account**, enters that email and a password.
3. They click the confirmation link Supabase emails them, then sign in.

Only emails on the staff list can create an account; anyone else is refused. Removing someone from the list
takes away all access at once, even though their account still exists.

## Preview mode (default, no setup)

Changes are saved only in the browser that made them. Use it to try the flow or to prepare fixtures.
**Download games.json** exports everything; replace `data/games.json` with it and commit to publish.
**Reset draft** goes back to the committed data.

## Database mode (staff changes go live for everyone)

Uses [Supabase](https://supabase.com) (free tier is enough): email sign-in plus one `games` table.

1. Create a Supabase project. Region: pick the closest to Tashkent.
2. SQL editor: run `supabase/schema.sql`. It is safe to run again later (for example after a pull that changed it):
   existing games and staff are kept and the rules are replaced with the new version.
3. SQL editor: add the first admin: `insert into public.staff (email, role) values ('athletics@...', 'admin');`
   Everyone after that is added from the admin page (see "Adding staff"). Only listed emails can get an account
   or change anything: the schema refuses any other sign-up, so leave "Allow new users to sign up" **on**
   (it is how listed staff set up their own accounts) and keep "Confirm email" on.
4. The first admin sets up their account from `/admin/` > **First time here?**, or in Authentication > Users
   ("Add user", after step 3).
5. Project settings > API: copy the **Project URL** and the **anon public key**. Never use the `service_role` key.
6. Put them in `site.config.json` under `supabase` (`url`, `anonKey`), or set the environment variables
   `SUPABASE_URL` and `SUPABASE_ANON_KEY` where the site is built. The anon key is meant to be public;
   row level security in the schema is what protects the data.
7. Build and deploy. The build also reads the games from the database, so game pages and calendar files
   are pre-rendered at that moment.

### How new games show up without a redeploy

- Schedule, replays, team pages and the home lists re-render in the browser when the database differs from the build.
- A game page that was not built yet is rendered by `404.html` (the host must serve `404.html` for unknown
  addresses; Netlify, Cloudflare Pages, GitHub Pages and Vercel do). Its link preview image and title in a chat
  are the generic site ones until the next build.
- The calendar file is made in the browser for games that have no pre-built `.ics`.
- A GitHub Action rebuilds the site when the database changed, so previews catch up within about 10 minutes
  (see "Automatic rebuilds" below).

## Automatic rebuilds

`.github/workflows/rebuild.yml` runs every 10 minutes. It compares the games in the database with the
fingerprint the last build left at `/build-sig.json` and starts a Cloudflare build only when they differ,
so quiet days use no builds (Cloudflare's free plan allows 500 builds a month).

Setup, once the database exists:
1. Cloudflare dashboard > Workers & Pages > the project > Settings > Builds > **Deploy hooks** > add one
   for branch `main`. Copy the URL (treat it like a password: anyone with it can start builds).
2. GitHub repo > Settings > Secrets and variables > Actions > add a repository secret `CF_DEPLOY_HOOK`
   with that URL. (The database address and public key are read from `site.config.json`.)
3. Actions tab > "Rebuild when games change" > **Run workflow** to check it. The log says "Up to date" or
   "Rebuild triggered".

Until `CF_DEPLOY_HOOK` exists the workflow reports the change and fails, which shows as a red run in the Actions tab. A game day with
frequent score taps uses at most one build per 10 minutes.

## Try database mode locally

```bash
npm run mock                      # fake Supabase on :4010 (staff@test.org / secret)
SUPABASE_URL=http://localhost:4010 SUPABASE_ANON_KEY=anon npm run dev
```

## Security notes

- Writes need a signed-in staff token; the browser never holds anything more powerful than the anon key.
- The session is kept in `sessionStorage` (cleared when the tab closes) and refreshed automatically.
- Do not turn on public sign-up, and do not add the `service_role` key to the repo or the page.
- Cover image addresses must be plain `https://` links (no spaces, quotes or brackets). The database rejects
  anything else and the site ignores it, because the address is placed inside the page's CSS.
- The mock server and the browser tests check the client logic. The rules in `schema.sql` were also checked on
  Postgres 16 with stand-ins for Supabase's roles (visitors read only; signed-in non-staff cannot write).
  Still check once on the real project with a staff account and once signed out.

## Tests

```bash
npm test                          # unit tests (links, time zones, ids, calendar files)
python3 test/e2e/preview.py       # browser test, preview mode (needs python playwright + chromium)
python3 test/e2e/db.py            # browser test, database mode against the mock server
```
