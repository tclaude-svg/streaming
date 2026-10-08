// Zero-dependency static site generator.
// Reads data/*.json, pre-renders every page into dist/, generates calendar files.
import { mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import S from '../src/strings.js';
import * as R from '../src/render.js';
import { buildIcs } from '../src/ics.js';
import { fetchSupabaseGames, shareImage } from '../src/data.js';
import { gamesSignature } from './signature.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const cfg = JSON.parse(await readFile(join(root, 'site.config.json'), 'utf8'));
const teamsList = JSON.parse(await readFile(join(root, 'data/teams.json'), 'utf8'));
let { games } = JSON.parse(await readFile(join(root, 'data/games.json'), 'utf8'));
games = games.filter((g) => !g.hidden); // the database already leaves hidden games out for visitors

// Database settings (public by design: the anon key can only do what row level security allows).
// Environment variables win over site.config.json so hosting can set them without a commit.
// SUPABASE_URL=off builds without the database (preview mode with data/games.json), e.g. for tests.
const dbOff = process.env.SUPABASE_URL === 'off';
const supabase = dbOff ? { url: null, anonKey: null } : {
  url: process.env.SUPABASE_URL || cfg.supabase?.url || null,
  anonKey: process.env.SUPABASE_ANON_KEY || cfg.supabase?.anonKey || null
};
if (supabase.url && supabase.anonKey) {
  try {
    games = await fetchSupabaseGames(supabase);
    console.log(`Read ${games.length} games from the database`);
  } catch (e) {
    console.warn(`Database read failed (${e.message}); using data/games.json`);
  }
}
const teams = R.teamMap(teamsList);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const write = async (rel, content) => {
  const p = join(dist, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content);
};
const sig = R.listSig(games);
const page = (path, opts) => write(join(path, 'index.html'), R.layout({ siteUrl: cfg.siteUrl, path, ...opts }));

// --- pages
await page('/', { title: S.siteName, body: R.homeBody(games, teams, { heroVideo: cfg.heroVideo }), bodyClass: 'home', tone: cfg.heroTone || 'dark', page: 'home', sig });
await page('/schedule/', { title: S.schedule.title, body: R.scheduleBody(games, teams), active: 'schedule', page: 'schedule', sig });
await page('/replays/', { title: S.replays.title, body: R.replaysBody(games, teams), active: 'replays', page: 'replays', sig });
await page('/teams/', { title: S.teams.title, body: R.teamsBody(games, teams), active: 'teams', page: 'teams', sig });
await page('/about/', { title: S.about.title, body: R.aboutBody(), active: 'about' });
for (const t of teamsList) {
  await page(`/teams/${t.slug}/`, { title: R.teamLabelLong(t), body: R.teamBody(t, games, teams), active: 'teams', page: 'team', arg: t.slug, sig });
}
for (const g of games) {
  const t = teams[g.team];
  await page(`/game/${g.id}/`, {
    title: R.gameTitle(g),
    description: `${R.teamLabelLong(t)} · ${R.dayLabel(g.start)} ${R.timeLabel(g.start)} · ${g.venue}`,
    ogTitle: `${R.gameTitle(g)} · ${R.teamLabel(t)}`,
    ogImage: shareImage(g),
    body: R.gameBody(g, games, teams),
    active: 'schedule'
  });
}

// --- calendar files (one per game)
for (const g of games) {
  await write(`calendar/${g.id}.ics`, buildIcs(g, teams[g.team], { name: cfg.name, siteUrl: cfg.siteUrl }));
}

// --- admin page (staff only, not linked from the site, kept out of search engines)
await page('/admin/', {
  title: S.admin.title,
  noindex: true,
  script: '/js/admin.js',
  body: `<div class="wrap page admin" id="admin-root"><noscript><p class="empty">JavaScript is needed for the admin area.</p></noscript></div>`
});

// --- 404 page; also renders game pages created after this build (see src/fallback.js)
await write('404.html', R.layout({
  siteUrl: cfg.siteUrl,
  path: '/404.html',
  title: S.notFound.title,
  noindex: true,
  script: '/js/fallback.js',
  body: `<div class="wrap page narrow" id="nf"><h1 class="page-title">${S.notFound.title}</h1><p class="lede">${S.notFound.loading}</p></div>`
}));

// --- static files
await cp(join(root, 'src/styles.css'), join(dist, 'css/styles.css'));
for (const f of ['app.js', 'render.js', 'strings.js', 'data.js', 'ics.js', 'admin.js', 'import.js', 'fallback.js']) await cp(join(root, 'src', f), join(dist, 'js', f));
await cp(join(root, 'src/assets'), join(dist, 'assets'), { recursive: true });
await cp(join(root, 'data'), join(dist, 'data'), { recursive: true });
await write('config.json', JSON.stringify({ name: cfg.name, siteUrl: cfg.siteUrl, heroVideo: cfg.heroVideo, supabase: supabase.url && supabase.anonKey ? supabase : null }, null, 2));
// Fingerprint of the rendered games, read by scripts/check-rebuild.mjs.
await write('build-sig.json', JSON.stringify({ games: gamesSignature(games), builtAt: new Date().toISOString() }));
await write('robots.txt', `User-agent: *\nAllow: /\n`);

console.log(`Built ${games.length} games, ${teamsList.length} teams -> dist/`);
