import S from './strings.js';
import {
  TZ, upcoming, teamMap, heroInner, heroSig, scoreboardInner, videoInner, videoKey, gameUrl, gameTitle, liveBadge, esc,
  listSig, regionHtml
} from './render.js';
import { loadConfig, loadGames, loadTeams } from './data.js';
import { buildIcs } from './ics.js';

const POLL_MS = 30000;
const params = new URLSearchParams(location.search);

/* ---------- data ---------- */
let configPromise;
const getConfig = () => (configPromise ||= loadConfig());

// Games come from the database when one is configured (config.json), otherwise from data/games.json.
async function loadData() {
  const cfg = await getConfig();
  const [all, t] = await Promise.all([loadGames(cfg), loadTeams()]);
  let games = all;
  // Review helpers: ?demo=live shows the next game as live, ?demo=empty shows no fixtures.
  const demo = params.get('demo');
  if (demo === 'live') {
    const next = upcoming(games).find((x) => x.status === 'scheduled');
    if (next) games = games.map((x) => (x === next ? { ...x, status: 'live', homeScore: 2, awayScore: 1 } : x));
  } else if (demo === 'empty') {
    games = games.filter((x) => x.status === 'final');
  }
  return { games, teams: teamMap(t) };
}

/* ---------- regions that refresh themselves ---------- */
function refresh({ games, teams }) {
  // Lists were pre-rendered at build time. When games were added or changed since then
  // (through the admin area), rebuild just the part of the page that shows them.
  const main = document.getElementById('main');
  if (main?.dataset.page) {
    const sig = listSig(games);
    if (main.dataset.sig !== sig) {
      const region = main.querySelector('[data-rerender]');
      const html = regionHtml(main.dataset.page, main.dataset.arg, games, teams);
      if (region && html) {
        region.outerHTML = html;
        setupFilters();
      }
      main.dataset.sig = sig;
    }
  }

  const hero = document.querySelector('[data-region="hero"]');
  // Re-render only when something changed, so the entrance animation does not replay every poll.
  if (hero && hero.dataset.sig !== heroSig(games)) {
    hero.querySelector('[data-slot]').innerHTML = heroInner(games, teams);
    hero.dataset.sig = heroSig(games);
  }

  const strip = document.querySelector('[data-region="live-strip"]');
  if (strip) {
    const live = games.find((g) => g.status === 'live');
    strip.hidden = !live;
    if (live) strip.innerHTML = `<a href="${gameUrl(live)}">${liveBadge()}<strong>${esc(gameTitle(live))}</strong><span class="go">${S.hero.watchLive} →</span></a>`;
  }

  const score = document.querySelector('[data-region="score"]');
  const video = document.querySelector('[data-region="video"]');
  if (score) {
    const g = games.find((x) => x.id === score.dataset.game);
    if (g) {
      score.innerHTML = scoreboardInner(g);
      // Only swap the video when its state changes, so a playing embed is never reloaded.
      if (video && video.dataset.key !== videoKey(g)) {
        video.innerHTML = videoInner(g);
        video.dataset.key = videoKey(g);
      }
    }
  }
  tick();
  localTimes();
}

/* ---------- countdown ---------- */
const pad = (n) => String(n).padStart(2, '0');
function tick() {
  document.querySelectorAll('[data-countdown]').forEach((el) => {
    const ms = new Date(el.dataset.countdown) - Date.now();
    const s = Math.max(0, Math.floor(ms / 1000));
    el.querySelector('[data-u="d"]').textContent = pad(Math.floor(s / 86400));
    el.querySelector('[data-u="h"]').textContent = pad(Math.floor((s % 86400) / 3600));
    el.querySelector('[data-u="m"]').textContent = pad(Math.floor((s % 3600) / 60));
  });
}

/* ---------- viewer's local time (only shown when it differs from Tashkent) ---------- */
function localTimes() {
  const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fmt = (tz, d) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(d);
  document.querySelectorAll('[data-local]').forEach((el) => {
    const d = new Date(el.dataset.local);
    const mine = fmt(viewerTz, d);
    el.textContent = mine !== fmt(TZ, d) ? `${mine} ${S.schedule.yourTime}` : '';
  });
}

/* ---------- filters (sport and level chips) ---------- */
function setupFilters() {
  document.querySelectorAll('[data-filterable]').forEach((root) => {
    const q = new URLSearchParams(location.search);
    const state = { sport: q.get('sport') || '', level: q.get('level') || '' };
    const chips = root.querySelectorAll('.chip');
    const apply = () => {
      chips.forEach((c) => c.setAttribute('aria-pressed', String((state[c.dataset.group] || '') === c.dataset.value)));
      let any = false;
      root.querySelectorAll('[data-list]').forEach((list) => {
        let shown = 0;
        list.querySelectorAll('[data-sport]').forEach((item) => {
          const ok = (!state.sport || item.dataset.sport === state.sport) && (!state.level || item.dataset.level === state.level);
          item.hidden = !ok;
          if (ok) shown += 1;
        });
        list.closest('.section')?.toggleAttribute('hidden', false);
        any = any || shown > 0;
      });
      const empty = root.querySelector('[data-empty]');
      if (empty) empty.hidden = any || !root.querySelectorAll('[data-list] [data-sport]').length;
    };
    chips.forEach((c) =>
      c.addEventListener('click', () => {
        state[c.dataset.group] = c.dataset.value;
        const u = new URL(location.href);
        ['sport', 'level'].forEach((k) => (state[k] ? u.searchParams.set(k, state[k]) : u.searchParams.delete(k)));
        history.replaceState(null, '', u);
        apply();
      })
    );
    apply();
  });
}

/* ---------- share ---------- */
function setupShare() {
  document.querySelectorAll('[data-share]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const data = { title: btn.dataset.title, url: location.origin + location.pathname };
      try {
        if (navigator.share) { await navigator.share(data); return; }
        await navigator.clipboard.writeText(data.url);
        const label = btn.querySelector('span');
        const old = label.textContent;
        label.textContent = btn.dataset.copied;
        setTimeout(() => (label.textContent = old), 2000);
      } catch { /* user cancelled */ }
    });
  });
}

/* ---------- calendar file ---------- */
// Games added after the last build have no pre-made .ics file, so make one in the browser.
function setupCalendar() {
  document.addEventListener('click', async (e) => {
    const a = e.target.closest('a[data-ics]');
    if (!a) return;
    e.preventDefault();
    try {
      const head = await fetch(a.href, { method: 'HEAD' });
      if (head.ok && (head.headers.get('content-type') || '').includes('text/calendar')) { location.href = a.href; return; }
    } catch { /* fall through to the in-browser file */ }
    try {
      const cfg = await getConfig();
      const { games, teams } = await loadData();
      const g = games.find((x) => x.id === a.dataset.ics);
      if (!g) return;
      const ics = buildIcs(g, teams[g.team], { name: cfg.name || 'TIS Owls Live', siteUrl: cfg.siteUrl || location.origin });
      const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
      const dl = Object.assign(document.createElement('a'), { href: url, download: `${g.id}.ics` });
      document.body.appendChild(dl);
      dl.click();
      dl.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch { /* nothing more to try */ }
  });
}

/* ---------- boot ---------- */
setupFilters();
setupShare();
setupCalendar();
tick();
localTimes();
setInterval(tick, 1000);

if (document.querySelector('[data-region]')) {
  const run = () => loadData().then(refresh).catch(() => {});
  run();
  setInterval(run, POLL_MS);
}
