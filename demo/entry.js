// Single-page preview of the whole site. It reuses the real renderers (src/render.js), the real
// page behaviour (src/app.js) and the real admin (src/admin.js); only data loading is swapped for a
// browser-side version (demo/data-shim.js) and the YouTube embed for a stand-in player.
import './flag.js';
import S from '../src/strings.js';
import * as R from '../src/render.js';
import { setupFilters, setupShare, setupCalendar, tick, localTimes, refresh, loadData } from '../src/app.js';
import { mountAdmin } from '../src/admin.js';
import { loadGames, loadTeams, saveDraft, resetDraft } from './data-shim.js';

const SITE = 'https://live.tashschool.org';
const FAKE_STREAM = 'dQw4w9WgXcQ';
let token = 0;

/* ---------- routing: the real site uses folders, the preview uses #/paths ---------- */

async function renderRoute() {
  const mine = ++token;
  // The real site is one page per address, so filter choices never carry over. Mimic that here.
  try { if (location.search) history.replaceState(null, '', location.pathname + location.hash); } catch { /* not allowed in some embeds */ }
  const path = (location.hash.slice(1) || '/').split('?')[0].replace(/([^/])$/, '$1/');
  const [games, teamList] = await Promise.all([loadGames(), loadTeams()]);
  if (mine !== token) return;
  const teams = R.teamMap(teamList);

  let spec = null;
  let m;
  if (path === '/') spec = { title: S.siteName, body: R.homeBody(games, teams, {}), bodyClass: 'home', page: 'home' };
  else if (path === '/schedule/') spec = { title: S.schedule.title, body: R.scheduleBody(games, teams), active: 'schedule', page: 'schedule' };
  else if (path === '/replays/') spec = { title: S.replays.title, body: R.replaysBody(games, teams), active: 'replays', page: 'replays' };
  else if (path === '/teams/') spec = { title: S.teams.title, body: R.teamsBody(games, teams), active: 'teams', page: 'teams' };
  else if (path === '/about/') spec = { title: S.about.title, body: R.aboutBody(), active: 'about' };
  else if (path === '/admin/') spec = { title: S.admin.title, body: '<div class="wrap page admin" id="admin-root"></div>' };
  else if ((m = path.match(/^\/teams\/([^/]+)\/$/)) && teams[m[1]]) spec = { title: R.teamLabelLong(teams[m[1]]), body: R.teamBody(teams[m[1]], games, teams), active: 'teams', page: 'team', arg: m[1] };
  else if ((m = path.match(/^\/game\/([^/]+)\/$/))) {
    const g = games.find((x) => x.id === decodeURIComponent(m[1]));
    if (g && teams[g.team]) spec = { title: R.gameTitle(g), body: R.gameBody(g, games, teams), active: 'schedule' };
  }
  if (!spec) spec = { title: S.notFound.title, body: `<div class="wrap page narrow"><h1 class="page-title">${S.notFound.title}</h1><p class="lede">${S.notFound.text}</p><p><a class="btn btn-ghost" href="/">${S.notFound.home}</a></p></div>` };

  const html = R.layout({ siteUrl: SITE, path, sig: R.listSig(games), tone: 'dark', ...spec });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const keep = document.getElementById('demo-root');
  keep.remove();
  document.body.className = doc.body.className;
  document.body.dataset.tone = 'dark';
  document.body.innerHTML = doc.body.innerHTML;
  document.body.appendChild(keep);
  document.title = doc.title;
  window.scrollTo(0, 0);

  if (path === '/admin/') mountAdmin(document.getElementById('admin-root'));
  setupFilters();
  setupShare();
  tick();
  localTimes();
  swapPlayers();
  if (document.querySelector('[data-region]')) loadData().then(refresh).catch(() => {});
  closePanel();
}

// One awaited path for every navigation: set the hash (without letting hashchange render a second
// time) and render once.
let skipHash = null;
async function navigate(href) {
  const next = `#${href}`;
  if (location.hash !== next) { skipHash = next; location.hash = next; }
  await renderRoute();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || a.hasAttribute('data-ics') || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
  const href = a.getAttribute('href');
  if (!href.startsWith('/')) return;
  e.preventDefault();
  navigate(href);
});
window.addEventListener('hashchange', () => {
  if (location.hash === skipHash) { skipHash = null; return; }
  renderRoute();
});

/* ---------- stand-in for the YouTube embed ---------- */

const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
function swapPlayers() {
  document.querySelectorAll('.video iframe').forEach((f) => {
    const box = document.createElement('div');
    box.className = 'demo-player';
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', 'Demo video player');
    box.innerHTML = `<span class="dp-play">${playIcon}</span><strong>${R.esc(f.title || 'Video')}</strong><small>Demo player. The real site embeds the YouTube stream or replay here.</small>`;
    f.replaceWith(box);
  });
}
new MutationObserver(swapPlayers).observe(document.documentElement, { childList: true, subtree: true });

/* ---------- tour button and panel ---------- */

const root = document.createElement('div');
root.id = 'demo-root';
document.body.appendChild(root);
let panelOpen = false;
let note = '';

const nextScheduled = (games) => games.filter((g) => g.status === 'scheduled').sort(R.byStart)[0];

async function panelHtml() {
  const games = await loadGames();
  const live = games.find((g) => g.status === 'live');
  return `<div class="demo-panel" role="dialog" aria-label="What is in this preview">
  <button class="btn btn-ghost demo-close" type="button" data-demo="close">Close</button>
  <h2>What's in this preview</h2>
  <p>The real design and code on sample data (fictional opponents). Everything you change stays in your browser.</p>
  <div><h3>Three journeys</h3><div class="demo-row">
    <button class="btn btn-primary" type="button" data-demo="watch">Watch live</button>
    <a class="btn btn-ghost" href="/replays/">Find a replay</a>
    <a class="btn btn-ghost" href="/schedule/">Plan ahead</a></div></div>
  <div><h3>Try the game-day flow</h3><div class="demo-row">
    ${live ? '<button class="btn btn-ghost" type="button" data-demo="end">End the live game</button>' : '<button class="btn btn-ghost" type="button" data-demo="golive">Make next game live (2–1)</button>'}
    <a class="btn btn-ghost" href="/admin/">Open admin</a>
    <button class="btn btn-ghost" type="button" data-demo="reset">Reset demo data</button></div>
    <p class="demo-msg" role="status" aria-live="polite">${R.esc(note)}</p></div>
  <div><h3>What it does</h3><ul>
    <li><b>Home hero:</b> "Live now" with the score, or the next game with a countdown.</li>
    <li><b>Game page:</b> video, score banner, share link, add to calendar.</li>
    <li><b>Schedule and replays:</b> filter by sport and level; Tashkent time plus your local time.</li>
    <li><b>Team pages:</b> schedule, results and replays per team.</li>
    <li><b>Admin:</b> add a game, paste a YouTube link, go live, tap the score, end the game. The site updates at once.</li>
    <li><b>Also built:</b> no logins or chat, mobile tab bar, reduced-motion support, English strings in one file.</li>
  </ul></div>
  <div><h3>Not in this preview</h3><p>Real video (placeholder player), the staff database sign-in, school logo and photos, Russian and Korean. File downloads (calendar file, games.json) are blocked inside a hosted preview but work on the real site.</p></div>
</div>`;
}

async function renderPanel() {
  root.innerHTML = `${panelOpen ? await panelHtml() : ''}<button class="demo-fab" type="button" data-demo="toggle" aria-expanded="${panelOpen}">${panelOpen ? 'Hide tour' : "What's in here"}</button>`;
}
function closePanel() { panelOpen = false; note = ''; renderPanel(); }

root.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-demo]');
  if (!el) return;
  e.stopPropagation();
  const act = el.dataset.demo;
  if (act === 'toggle') { panelOpen = !panelOpen; note = ''; await renderPanel(); return; }
  if (act === 'close') { closePanel(); return; }
  const games = await loadGames();
  if (act === 'golive' || act === 'watch') {
    let g = games.find((x) => x.status === 'live');
    if (!g) {
      g = nextScheduled(games);
      if (!g) { note = 'No upcoming game left. Reset the demo data.'; await renderPanel(); return; }
      Object.assign(g, { status: 'live', homeScore: 2, awayScore: 1, streamId: FAKE_STREAM });
      saveDraft(games);
    }
    panelOpen = false; note = '';
    await navigate('/');
  } else if (act === 'end') {
    const g = games.find((x) => x.status === 'live');
    if (g) { g.status = 'final'; g.homeScore ??= 0; g.awayScore ??= 0; saveDraft(games); }
    panelOpen = false; await navigate('/replays/');
  } else if (act === 'reset') {
    resetDraft(); await navigate('/'); note = 'Demo data reset.'; panelOpen = true; await renderPanel();
  }
});

/* ---------- start ---------- */
setupCalendar();
setInterval(tick, 1000);
setInterval(() => { if (document.querySelector('[data-region]')) loadData().then(refresh).catch(() => {}); }, 15000);
renderRoute().then(renderPanel);
