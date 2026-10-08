# Admin area

Staff open `/admin/` (not linked from the site, kept out of search engines). The page works in
two modes. Which one you get depends on whether the database is configured.

## What staff do on game day (target: under 5 minutes)

1. **Add game**: sport and level, opponent, start time (Tashkent time), optional YouTube stream link.
2. **Go live** when the stream starts. The home page switches to "Live now" and the game page shows the stream.
3. Tap **+** and **−** to update the score (saved automatically).
4. **End game** at the final whistle. Later, **Edit** and paste the replay link.

Pasting any YouTube address works (`watch?v=`, `youtu.be/`, `/live/`, `/embed/`) or just the 11-character id.
Scores are optional, so a game with no scorer still works.

## Preview mode (default, no setup)

Changes are saved only in the browser that made them. Use it to try the flow or to prepare fixtures.
**Download games.json** exports everything; replace `data/games.json` with it and commit to publish.
**Reset draft** goes back to the committed data.

## Database mode (staff changes go live for everyone)

Uses [Supabase](https://supabase.com) (free tier is enough): email sign-in plus one `games` table.

1. Create a Supabase project. Region: pick the closest to Tashkent.
2. SQL editor: run `supabase/schema.sql`. It is safe to run again later (for example after a pull that changed it):
   existing games and staff are kept and the rules are replaced with the new version.
3. Authentication > Providers > Email: **turn off "Allow new users to sign up"**.
   Authentication > Users: add each staff member (invite or "Add user").
4. SQL editor: `insert into public.staff (email) values ('athletics@...');` for each staff member.
   Only listed emails can change games, even if an account exists.
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
2. GitHub repo > Settings > Secrets and variables > Actions > add three repository secrets:
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CF_DEPLOY_HOOK`.
3. Actions tab > "Rebuild when games change" > **Run workflow** to check it. The log says "Up to date" or
   "Rebuild triggered".

Until the secrets exist the workflow just reports that no database is configured. A game day with
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
