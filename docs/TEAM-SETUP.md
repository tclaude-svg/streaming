# Team setup: 3 people, one shared Claude account, one shared GitHub account, one Cloudflare Pages site

## 1. GitHub (once)
1. Repo `tclaude-svg/streaming` > Settings > Branches > add a rule for `main`: require a pull request,
   **0 approvals** (one shared account cannot approve its own pull requests, so requiring 1 would block every merge).
   This still stops anyone pushing straight to the live site.

## 2. Cloudflare Pages (once, by the repo owner)
1. Cloudflare dashboard > Workers & Pages > Create > Pages > **Connect to Git** > pick `tclaude-svg/streaming`.
2. Build settings:
   - Framework preset: None
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variables (only once the database exists): `SUPABASE_URL`, `SUPABASE_ANON_KEY`
3. Save and deploy. Production branch = `main` -> `https://<project>.pages.dev`.
   Every other branch gets its own preview URL like `https://frontend-hero.<project>.pages.dev`.
   Cloudflare turns `/` into `-` and **cuts the name to 28 characters**: `backend/replays-takedown-roles`
   becomes `backend-replays-takedown-rol`. The exact link is in the pull request's checks
   ("Cloudflare Pages" > Details), so copy it from there instead of guessing.
5. Later: Custom domains > add `live.tashschool.org`.

Nobody uploads files to Cloudflare by hand. Pushing to GitHub is the deploy.

## 3. Each teammate
1. Log in to the shared Claude account at claude.ai/code and choose the `tclaude-svg/streaming` repo.
2. **Start your own new session** and rename it right away: `<your name> – <branch>`, e.g. `Aziz – frontend/schedule`.
   Never type into a session someone else started; everyone sees all sessions on the shared account.
3. Claude reads `CLAUDE.md` automatically, so it already knows the branch and ownership rules.

## 4. Day-to-day
1. In your session, say who you are and what you want, e.g.
   "I'm Aziz. Frontend: make the schedule cards bigger on mobile, branch frontend/schedule-cards, open a PR."
2. Claude makes the branch, edits, runs build + tests, pushes, opens a pull request.
3. Post the PR link in your group chat. **Someone else** opens the Cloudflare preview, checks it on a phone,
   and clicks Merge. `main` redeploys to the live site in about a minute.

Shared usage limits: three busy sessions use the account's limit faster. Close sessions you're done with
and keep requests focused.

## Avoiding conflicts
- Frontend and backend touch different files (see `CLAUDE.md`), so you rarely collide.
- Merge PRs quickly; long-lived branches are what cause conflicts.
- If GitHub says "conflict", ask Claude: "merge main into this branch and fix the conflicts".

## 21st.dev UI components (MCP)
`.mcp.json` connects every Claude session in this repo to the 21st.dev MCP, which lets Claude search
21st.dev's UI component library and generate components. The key is never in the repo or the session:
it is an API credential on the cloud environment (environment menu in the session title bar > Edit >
Add credential): type Bearer, allowed website `21st.dev`, header `Authorization` / `Bearer` / key from
https://21st.dev/settings/api-keys. The environment adds the header to every request to 21st.dev.
New sessions pick it up. 21st.dev components are React + Tailwind; this site is plain JS and CSS, so ask
Claude to adapt a component to `src/render.js` and `src/styles.css` rather than adding React.
