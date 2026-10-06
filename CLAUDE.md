# Working on TIS Owls Live (read this first)

Three people edit this site, each through Claude. GitHub is the source of truth; Cloudflare Pages
deploys `main` to the live site and every other branch to its own preview URL.

## Rules for every change
- Never commit straight to `main`. Work on a branch named `frontend/<short-topic>` or `backend/<short-topic>`.
- Pull the latest `main` before starting: `git fetch origin main && git merge origin/main`.
- Before pushing, run `npm run build` and `npm test`. Both must pass.
- Push the branch and open a pull request. Another teammate approves it before merging.
- Keep pull requests small (one feature or fix) so they do not collide with other people's work.
- Do not commit secrets. The Supabase anon key is fine; the `service_role` key never goes in the repo.
- Keep real fixtures, student photos and stream links out of the repo (see README "Repository").

## Who owns what
Stay inside your area. If a change needs the other area, say so in the pull request and tag that person.

**Frontend** (what visitors see)
- `src/render.js` (page HTML), `src/styles.css`, `src/strings.js` (all interface text), `src/assets/`
- `src/app.js` (browser behaviour), `demo/`
- Design rules: `docs/DESIGN.md`

**Backend** (data, admin, build, hosting)
- `src/data.js`, `src/admin.js`, `src/fallback.js`, `src/ics.js`
- `supabase/schema.sql`, `scripts/`, `site.config.json`, `data/*.json`
- Admin and database setup: `docs/ADMIN.md`

**Shared** (change only with a heads-up to the team): `package.json`, `README.md`, `CLAUDE.md`, `test/`

## Commands
- `npm run dev` serves http://localhost:3000 and rebuilds on change
- `npm run build` writes the static site to `dist/` (this is what Cloudflare runs)
- `npm test` unit tests
