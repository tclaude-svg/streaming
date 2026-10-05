// Zero-dependency static site generator.
// Reads data/*.json, pre-renders every page into dist/, generates calendar files.
import { mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import S from '../src/strings.js';
import * as R from '../src/render.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const cfg = JSON.parse(await readFile(join(root, 'site.config.json'), 'utf8'));
const teamsList = JSON.parse(await readFile(join(root, 'data/teams.json'), 'utf8'));
const { games } = JSON.parse(await readFile(join(root, 'data/games.json'), 'utf8'));
const teams = R.teamMap(teamsList);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const write = async (rel, content) => {
  const p = join(dist, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content);
};
const page = (path, opts) => write(join(path, 'index.html'), R.layout({ siteUrl: cfg.siteUrl, path, ...opts }));

// --- pages
await page('/', { title: S.siteName, body: R.homeBody(games, teams, { heroVideo: cfg.heroVideo }), bodyClass: 'home', tone: cfg.heroTone || 'dark' });
await page('/schedule/', { title: S.schedule.title, body: R.scheduleBody(games, teams), active: 'schedule' });
await page('/replays/', { title: S.replays.title, body: R.replaysBody(games, teams), active: 'replays' });
await page('/teams/', { title: S.teams.title, body: R.teamsBody(games, teams), active: 'teams' });
await page('/about/', { title: S.about.title, body: R.aboutBody(), active: 'about' });
for (const t of teamsList) {
  await page(`/teams/${t.slug}/`, { title: R.teamLabelLong(t), body: R.teamBody(t, games, teams), active: 'teams' });
}
for (const g of games) {
  const t = teams[g.team];
  await page(`/game/${g.id}/`, {
    title: R.gameTitle(g),
    description: `${R.teamLabelLong(t)} · ${R.dayLabel(g.start)} ${R.timeLabel(g.start)} · ${g.venue}`,
    ogTitle: `${R.gameTitle(g)} · ${R.teamLabel(t)}`,
    body: R.gameBody(g, games, teams),
    active: 'schedule'
  });
}

// --- calendar files (one per game)
const utc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const fold = (s) => s.replace(/([,;\\])/g, '\\$1');
for (const g of games) {
  const start = new Date(g.start);
  const end = new Date(start.getTime() + 2 * 3600 * 1000);
  const t = teams[g.team];
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${cfg.name}//EN`, 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${g.id}@${new URL(cfg.siteUrl).hostname}`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(start)}`, `DTEND:${utc(end)}`,
    `SUMMARY:${fold(`${R.gameTitle(g)} (${R.teamLabel(t)})`)}`,
    `LOCATION:${fold(g.venue)}`,
    `DESCRIPTION:${fold(`Watch live: ${cfg.siteUrl}/game/${g.id}/`)}`,
    `URL:${cfg.siteUrl}/game/${g.id}/`,
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n') + '\r\n';
  await write(`calendar/${g.id}.ics`, ics);
}

// --- static files
await cp(join(root, 'src/styles.css'), join(dist, 'css/styles.css'));
for (const f of ['app.js', 'render.js', 'strings.js']) await cp(join(root, 'src', f), join(dist, 'js', f));
await cp(join(root, 'src/assets'), join(dist, 'assets'), { recursive: true });
await cp(join(root, 'data'), join(dist, 'data'), { recursive: true });
await write('robots.txt', `User-agent: *\nAllow: /\n`);

console.log(`Built ${games.length} games, ${teamsList.length} teams -> dist/`);
