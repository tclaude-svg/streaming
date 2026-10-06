# Team setup: 3 people, one Cloudflare Pages site, everyone edits through Claude

## 1. GitHub (once, by the repo owner)
1. Repo `tclaude-svg/streaming` > Settings > Collaborators > add the other two people (Write access).
2. Settings > Branches > add a rule for `main`: require a pull request, 1 approval.
3. Fill in the usernames in `.github/CODEOWNERS`.

## 2. Cloudflare Pages (once, by the repo owner)
1. Cloudflare dashboard > Workers & Pages > Create > Pages > **Connect to Git** > pick `tclaude-svg/streaming`.
2. Build settings:
   - Framework preset: None
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variables (only once the database exists): `SUPABASE_URL`, `SUPABASE_ANON_KEY`
3. Save and deploy. Production branch = `main` -> `https://<project>.pages.dev`.
   Every other branch gets its own preview URL like `https://frontend-hero.<project>.pages.dev`.
4. Account > Members: invite the other two (optional, only needed to see deploy logs).
5. Later: Custom domains > add `live.tashschool.org`.

Nobody uploads files to Cloudflare by hand. Pushing to GitHub is the deploy.

## 3. Each teammate (once)
1. Accept the GitHub invite.
2. Open claude.ai/code, connect GitHub, choose the `tclaude-svg/streaming` repo.
3. Claude reads `CLAUDE.md` automatically, so it already knows the branch and ownership rules.

## 4. Day-to-day
1. Start a Claude session and say what you want, e.g.
   "Frontend: make the schedule cards bigger on mobile, branch frontend/schedule-cards, open a PR."
2. Claude makes a branch, edits, runs build + tests, pushes, opens a pull request.
3. Open the Cloudflare preview link on the PR and check it on your phone.
4. A teammate approves, then merge. `main` redeploys to the live site in about a minute.

## Avoiding conflicts
- Frontend and backend touch different files (see `CLAUDE.md`), so you rarely collide.
- Merge PRs quickly; long-lived branches are what cause conflicts.
- If GitHub says "conflict", ask Claude: "merge main into this branch and fix the conflicts".
