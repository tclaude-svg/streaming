# TIS Owls Live

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
- `scripts/build.mjs` generates pages, one `.ics` calendar file per game, and copies assets.
- Hero video: set `heroVideo` and `heroTone` in `site.config.json`; see `docs/DESIGN.md`.
- Comments and live chat are not part of the site; YouTube embeds use the privacy-enhanced domain.

## Pages

`/` home, `/schedule/`, `/replays/`, `/teams/`, `/teams/<team>/`, `/game/<id>/`, `/about/`

## Not built yet (next steps)

1. Admin area with staff login (plan: Supabase auth + games table; the front end only needs
   `loadData()` in `src/app.js` pointed at it).
2. Real TIS logo, brand hex codes (placeholders in `:root` of `src/styles.css`) and approved photos.
3. Self-hosted fonts (currently Google Fonts, marked TODO in `src/render.js`).
4. Privacy-friendly analytics script, Lighthouse and accessibility audit on real hosting.
5. Per-game share images (currently one default image).
6. Fill the About page text (placeholders in square brackets) once the school decides.

## Put it on GitHub

```bash
cd tis-owls-live
git remote add origin git@github.com:<your-org>/tis-owls-live.git
git push -u origin main
```

Use a private repo until the school approves the safeguarding rules.
