# TIS Owls Live

Live site: https://tisowlstreaming.pages.dev (Cloudflare Pages, deploys from `main`; every branch gets a preview URL).
Team workflow: [docs/TEAM-SETUP.md](docs/TEAM-SETUP.md).

Mobile-first website where families and students watch Tashkent International School
sports live or as replays. MVP scope is in the project plan (Oct 2, 2026): one YouTube
stream per game, a schedule, a replay library and simple team pages.

Sports at launch: football, basketball, volleyball (Varsity and JV). English only.

## Run it

Needs Node 20+. No dependencies to install.

```bash
npm run dev      # builds, serves http://localhost:3000, rebuilds on every change
npm run build    # writes the static site to dist/
```

Review helpers: add `?demo=live` to any page to see the next game as live with a score,
or `?demo=empty` to see the no-fixtures state.

## How it works

- `data/games.json`, `data/teams.json` hold the fixtures (SAMPLE DATA, fictional opponents).
- `src/render.js` returns HTML strings. It runs at build time to pre-render every page
  (so each game has a stable URL with a share preview) and in the browser to refresh the
  live regions (hero, score banner, video) every 30 seconds.
- `src/strings.js` holds all interface text (Russian and Korean come later as extra files).
- `src/data.js` loads games (database when configured, otherwise `data/games.json`); `src/admin.js` is the admin area.
- `src/import.js` reads pasted spreadsheet rows or a CSV file into games for the admin's Import page.
- `scripts/build.mjs` generates pages, one `.ics` calendar file per game, the admin page and `404.html`, and copies assets.
- Hero video: set `heroVideo` and `heroTone` in `site.config.json`; see `docs/DESIGN.md`.
- Comments and live chat are not part of the site; YouTube embeds use the privacy-enhanced domain.

## Pages

`/` home, `/schedule/`, `/replays/`, `/teams/`, `/teams/<team>/`, `/game/<id>/`, `/about/`, `/admin/` (staff)

## Admin

`/admin/` lets the athletics office add games, paste stream links, mark a game live and update the score.
It works out of the box in a preview mode and connects to a database for real use. Setup and details:
[docs/ADMIN.md](docs/ADMIN.md).

## Clickable preview (one HTML file)

```bash
npm install          # once: installs esbuild, used only for this preview
npm run demo         # writes dist/demo.html (or: node demo/build.mjs path/to/file.html)
```

Bundles the real pages, behaviour and admin into a single file with sample data and a stand-in video
player. The admin and the public pages share one browser-side draft, so changes in the admin show on the site.

## Tests

```bash
npm test                      # unit tests
python3 test/e2e/preview.py   # browser tests (python playwright + chromium)
python3 test/e2e/db.py
python3 test/e2e/roles.py      # staff roles, takedowns, auto replays, staff page
python3 test/e2e/history.py    # change history and undo
python3 test/e2e/import.py     # fixture import from a spreadsheet or CSV
python3 test/e2e/cover.py      # cover photo upload (needs Pillow)
python3 test/e2e/preview-bundle.py   # builds and walks through the single-file preview
```

## Not built yet (next steps)

1. Supabase project `tis-owls-live` exists (Frankfurt, free plan) and is set in `site.config.json`. Public sign-up is closed
   (only emails in `public.staff` can get an account). Still to do: add the first admin's email; after that, admins
   add staff from the admin page and people set up their own accounts (docs/ADMIN.md).
2. Real TIS logo, brand hex codes (placeholders in `:root` of `src/styles.css`) and approved photos.
3. Self-hosted fonts (currently Google Fonts, marked TODO in `src/render.js`).
4. Privacy-friendly analytics script, Lighthouse and accessibility audit on real hosting.
5. Per-game share images (cover photo or video thumbnail) are in; scheduled rebuilds need the `CF_DEPLOY_HOOK` secret (docs/ADMIN.md).
6. Fill the About page text (placeholders in square brackets) once the school decides.
7. Point `live.tashschool.org` at the Cloudflare Pages project and switch `siteUrl` in `site.config.json` back to it.

## Repository

Public for now. Keep real fixtures, photos and stream links out of it until the school approves the
safeguarding rules, or make the repository private.
