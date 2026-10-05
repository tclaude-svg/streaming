// Shown for any address the build did not pre-render. If it is a game page for a game that was
// added in the admin area after the last build, render that page here; otherwise say not found.
import S from './strings.js';
import * as R from './render.js';
import { loadConfig, loadGames, loadTeams } from './data.js';

function notFound() {
  const el = document.getElementById('nf');
  if (el) el.innerHTML = `<h1 class="page-title">${S.notFound.title}</h1><p class="lede">${S.notFound.text}</p><p><a class="btn btn-ghost" href="/">${S.notFound.home}</a></p>`;
}

(async () => {
  const m = location.pathname.match(/^\/game\/([^/]+)\/?$/);
  if (!m) return notFound();
  try {
    const cfg = await loadConfig();
    const [games, teamList] = await Promise.all([loadGames(cfg), loadTeams()]);
    const teams = R.teamMap(teamList);
    const g = games.find((x) => x.id === decodeURIComponent(m[1]));
    if (!g || !teams[g.team]) return notFound();
    const t = teams[g.team];
    const html = R.layout({
      siteUrl: cfg.siteUrl || location.origin,
      path: location.pathname,
      title: R.gameTitle(g),
      description: `${R.teamLabelLong(t)} · ${R.dayLabel(g.start)} ${R.timeLabel(g.start)} · ${g.venue}`,
      body: R.gameBody(g, games, teams),
      active: 'schedule'
    });
    document.open();
    document.write(html);
    document.close();
  } catch {
    notFound();
  }
})();
