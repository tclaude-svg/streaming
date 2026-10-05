// Pure functions that return HTML strings.
// Used at build time (Node) to pre-render pages and in the browser to refresh
// live regions, so markup is defined in exactly one place.
import S from './strings.js';

export const TZ = 'Asia/Tashkent';

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const dateFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });

export const dayLabel = (iso) => dateFmt.format(new Date(iso)).replace(',', '');
export const timeLabel = (iso) => timeFmt.format(new Date(iso));
export const byStart = (a, b) => new Date(a.start) - new Date(b.start);

export const teamMap = (teams) => Object.fromEntries(teams.map((t) => [t.slug, t]));
export const teamLabel = (t) => `${S.sports[t.sport]} · ${S.levelsShort[t.level]}`;
export const teamLabelLong = (t) => `${S.sports[t.sport]} · ${S.levels[t.level]}`;
export const gameTitle = (g) => `${S.owls} ${S.vs} ${g.opponent}`;
export const gameUrl = (g) => `/game/${g.id}/`;

export const upcoming = (games) => games.filter((g) => g.status !== 'final').sort(byStart);
export const finished = (games) => games.filter((g) => g.status === 'final').sort((a, b) => byStart(b, a));

/* ---------- small pieces ---------- */

export const owlEye = (cls = '') =>
  `<svg class="owl-eye ${cls}" viewBox="0 0 30 14" aria-hidden="true" focusable="false">` +
  `<circle class="eye" cx="7" cy="7" r="6.2"/><circle class="eye" cx="23" cy="7" r="6.2"/>` +
  `<circle class="pupil" cx="7" cy="7" r="2.7"/><circle class="pupil" cx="23" cy="7" r="2.7"/></svg>`;

export const liveBadge = () => `<span class="live-badge">${owlEye()}<span>${S.status.live}</span></span>`;

const icon = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2v3M17 2v3M3.5 9h17M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5 9v6l4.5-3z"/></svg>',
  teams: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5.5c0 4.2-2.9 7.6-7 9.5-4.1-1.9-7-5.3-7-9.5V6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5.5M12 7.5v.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0L8 8m4-4l4 4M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
export { icon };

const courtPaths = {
  football: '<rect x="8" y="8" width="144" height="74"/><path d="M80 8v74"/><circle cx="80" cy="45" r="12"/><rect x="8" y="25" width="22" height="40"/><rect x="130" y="25" width="22" height="40"/><rect x="8" y="35" width="8" height="20"/><rect x="144" y="35" width="8" height="20"/>',
  basketball: '<rect x="8" y="8" width="144" height="74"/><path d="M80 8v74"/><circle cx="80" cy="45" r="10"/><rect x="8" y="30" width="28" height="30"/><rect x="124" y="30" width="28" height="30"/><path d="M36 30a15 15 0 0 1 0 30M124 30a15 15 0 0 0 0 30M8 14h14a33 33 0 0 1 0 62H8M152 14h-14a33 33 0 0 0 0 62h14"/>',
  volleyball: '<rect x="28" y="14" width="104" height="62"/><path d="M80 8v74" stroke-width="2.2"/><path d="M60 14v62M100 14v62"/>'
};
export const court = (sport) =>
  `<svg class="court" viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.1">${courtPaths[sport] || ''}</g></svg>`;

const localHint = (iso) => `<span class="local" data-local="${esc(iso)}"></span>`;

export const whenHtml = (g) =>
  `<time datetime="${esc(g.start)}">${dayLabel(g.start)} · ${timeLabel(g.start)}</time>${localHint(g.start)}`;

/* ---------- cards ---------- */

export function gameCard(g, teams, kind = 'auto') {
  const t = teams[g.team];
  const isFinal = g.status === 'final';
  const isLive = g.status === 'live';
  const replay = isFinal;
  const media = [
    isLive ? `<span class="card-badge">${liveBadge()}</span>` : '',
    isFinal ? `<span class="card-score" aria-label="Final score ${g.homeScore} to ${g.awayScore}">${g.homeScore}<i>–</i>${g.awayScore}</span>` : '',
    replay ? `<span class="play-circle">${icon.play}</span>` : '',
    g.replayId ? '' : court(t.sport)
  ].join('');
  const bg = g.replayId
    ? ` style="background-image:linear-gradient(180deg,rgba(10,15,26,0) 40%,rgba(10,15,26,.85)),url(https://i.ytimg.com/vi/${esc(g.replayId)}/hqdefault.jpg)"`
    : g.cover
      ? ` style="background-image:linear-gradient(180deg,rgba(10,15,26,0) 40%,rgba(10,15,26,.85)),url(${esc(g.cover)})"`
      : '';
  return `<article class="card ${isLive ? 'is-live' : ''}" data-sport="${t.sport}" data-level="${t.level}">
  <a class="card-link" href="${gameUrl(g)}">
    <div class="card-media"${bg}>${media}</div>
    <div class="card-body">
      <p class="eyebrow">${esc(teamLabel(t))}</p>
      <h3 class="card-title">${esc(gameTitle(g))}</h3>
      <p class="meta">${whenHtml(g)}</p>
    </div>
  </a>
</article>`;
}

/* ---------- filters ---------- */

export function filterBar(opts = { level: true }) {
  const chips = (group, values, labels) =>
    `<button class="chip" type="button" data-group="${group}" data-value="" aria-pressed="true">${S.filters.all}</button>` +
    values.map((v) => `<button class="chip" type="button" data-group="${group}" data-value="${v}" aria-pressed="false">${esc(labels[v])}</button>`).join('');
  const sports = Object.keys(S.sports);
  return `<div class="filters" role="group" aria-label="Filters">
  <div class="chip-row">
    ${chips('sport', sports, S.sports)}
    ${opts.level ? `<span class="chip-divider" aria-hidden="true"></span>${chips('level', Object.keys(S.levels), S.levelsShort)}` : ''}
  </div>
</div>`;
}

/* ---------- hero (home) ---------- */

export function countdownHtml(iso) {
  return `<div class="countdown" data-countdown="${esc(iso)}" role="timer" aria-label="Time until the game starts">
  <div><b data-u="d">--</b><span>${S.hero.days}</span></div><i>:</i>
  <div><b data-u="h">--</b><span>${S.hero.hours}</span></div><i>:</i>
  <div><b data-u="m">--</b><span>${S.hero.minutes}</span></div></div>`;
}

export const heroSig = (games) => {
  const live = games.find((g) => g.status === 'live');
  const next = upcoming(games).find((g) => g.status === 'scheduled');
  return live ? `live:${live.id}:${live.homeScore}:${live.awayScore}` : next ? `next:${next.id}` : 'none';
};

const heroTitle = (g) => `${esc(S.owls)} <em>${S.vs}</em> ${esc(g.opponent)}`;

export function heroInner(games, teams) {
  const live = games.find((g) => g.status === 'live');
  const next = upcoming(games).find((g) => g.status === 'scheduled');
  if (live) {
    const t = teams[live.team];
    return `<p class="eyebrow-row fx fx-0">${liveBadge()}<span class="hero-kicker">${esc(teamLabelLong(t))}</span></p>
<h1 class="hero-title fx fx-0">${heroTitle(live)}</h1>
<p class="hero-score fx fx-1" aria-label="Score ${live.homeScore ?? 0} to ${live.awayScore ?? 0}">${live.homeScore ?? 0}<i>–</i>${live.awayScore ?? 0}</p>
<div class="hero-actions fx fx-2"><a class="btn-pill btn-pill-lg" href="${gameUrl(live)}">${icon.play}${S.hero.watchLive}</a></div>`;
  }
  if (next) {
    const t = teams[next.team];
    return `<p class="hero-kicker fx fx-0">${S.hero.nextGame} · ${esc(teamLabelLong(t))}</p>
<h1 class="hero-title fx fx-0">${heroTitle(next)}</h1>
<p class="hero-sub fx fx-1">${whenHtml(next)} · ${esc(next.venue)}</p>
<div class="fx fx-1">${countdownHtml(next.start)}</div>
<div class="hero-actions fx fx-2"><a class="btn-pill btn-pill-lg" href="${gameUrl(next)}">${S.hero.gameDetails}</a></div>`;
  }
  return `<h1 class="hero-title fx fx-0">${S.hero.emptyTitle}</h1>
<p class="hero-sub fx fx-1">${S.hero.emptyText}</p>
<div class="hero-actions fx fx-2"><a class="btn-pill btn-pill-lg" href="/replays/">${S.hero.browseReplays}</a></div>`;
}

/* ---------- game page pieces ---------- */

export function scoreboardInner(g) {
  const hs = g.homeScore ?? '–';
  const as = g.awayScore ?? '–';
  const mid =
    g.status === 'live' ? liveBadge() :
    g.status === 'final' ? `<span class="sb-state">${S.status.final}</span>` :
    `<span class="sb-state">${timeLabel(g.start)}</span>`;
  return `<div class="sb-team"><span class="sb-name">${S.owls}</span><b class="sb-num">${hs}</b></div>
<div class="sb-mid">${mid}</div>
<div class="sb-team sb-away"><b class="sb-num">${as}</b><span class="sb-name">${esc(g.opponent)}</span></div>`;
}

export function videoState(g) {
  if (g.status === 'live') return g.streamId ? 'embed' : 'live-wait';
  if (g.status === 'final') return g.replayId ? 'embed' : 'replay-wait';
  return 'scheduled';
}

export const videoKey = (g) => `${videoState(g)}:${g.streamId || ''}:${g.replayId || ''}`;

export function videoInner(g) {
  const state = videoState(g);
  if (state === 'embed') {
    const id = g.status === 'live' ? g.streamId : g.replayId;
    return `<iframe src="https://www.youtube-nocookie.com/embed/${esc(id)}?rel=0&modestbranding=1&playsinline=1" title="${esc(gameTitle(g))}" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  }
  const msg = state === 'scheduled' ? S.game.videoScheduled : state === 'live-wait' ? S.game.videoLiveNoStream : S.game.videoFinalNoReplay;
  return `<div class="video-wait">${owlEye('big')}<p>${msg}</p>${state === 'scheduled' ? countdownHtml(g.start) : ''}</div>`;
}

/* ---------- layout ---------- */

const navItems = [
  { key: 'schedule', href: '/schedule/', icon: icon.play },
  { key: 'replays', href: '/replays/', icon: icon.replay },
  { key: 'teams', href: '/teams/', icon: icon.teams },
  { key: 'about', href: '/about/', icon: icon.info }
];

export function layout({ title, description, path, body, active, siteUrl, ogTitle, bodyClass = '', tone = 'dark' }) {
  const full = title === S.siteName ? title : `${title} · ${S.siteName}`;
  const url = siteUrl + path;
  const desc = description || S.metaDescription;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#0a0f1a">
<meta name="color-scheme" content="dark">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(S.siteName)}">
<meta property="og:title" content="${esc(ogTitle || full)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(siteUrl)}/assets/og-default.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<!-- TODO before launch: self-host these two fonts (Instrument Serif 400, Inter 400/500/600/700) instead of using Google Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/css/styles.css">
<script type="module" src="/js/app.js"></script>
</head>
<body class="${esc(bodyClass)}" data-tone="${esc(tone)}">
<a class="skip" href="#main">${S.skip}</a>
<header class="topbar">
  <a class="brand" href="/" aria-label="${esc(S.siteName)} home">${owlEye('brand-eye')}<span class="brand-text">TIS <em>Owls</em> Live</span></a>
  <nav class="topnav" aria-label="Main">
    ${navItems.map((n) => `<a href="${n.href}"${active === n.key ? ' aria-current="page"' : ''}>${S.nav[n.key]}</a>`).join('')}
  </nav>
  <a class="btn-pill topcta" href="/schedule/">${S.cta}</a>
</header>
<main id="main">
${body}
</main>
<footer class="footer">
  <p class="footer-school">${S.footer.school}</p>
  <p class="footer-tag">${S.tagline}</p>
</footer>
<nav class="tabbar" aria-label="Main">
  ${navItems.map((n) => `<a href="${n.href}"${active === n.key ? ' aria-current="page"' : ''}>${n.icon}<span>${S.nav[n.key]}</span></a>`).join('')}
</nav>
</body>
</html>`;
}

/* ---------- page bodies ---------- */

const section = (title, inner, more) =>
  `<section class="section"><div class="section-head"><h2>${title}</h2>${more || ''}</div>${inner}</section>`;

const emptyMsg = (text) => `<p class="empty">${text}</p>`;
const filterEmpty = `<p class="empty" data-empty hidden>${S.filters.none}</p>`;

export function homeBody(games, teams, opts = {}) {
  const featured = games.find((g) => g.status === 'live') || upcoming(games).find((g) => g.status === 'scheduled');
  const ups = upcoming(games).filter((g) => g !== featured).slice(0, 6);
  const reps = finished(games).slice(0, 6);
  const video = opts.heroVideo
    ? `<video class="hero-video" autoplay muted loop playsinline poster="/assets/hero-pitch.svg"><source src="${esc(opts.heroVideo)}" type="video/mp4"></video>`
    : '';
  return `<section class="hero" data-region="hero" data-sig="${esc(heroSig(games))}">
  <div class="hero-media" aria-hidden="true">${video}</div>
  <div class="hero-content" data-slot>${heroInner(games, teams)}</div>
</section>
<div class="wrap" data-filterable>
  ${filterBar({ level: false })}
  ${section(S.home.thisWeek, `<div class="rail" data-list>${ups.map((g) => gameCard(g, teams)).join('') || emptyMsg(S.schedule.empty)}</div>`, `<a class="more" href="/schedule/">${S.home.allSchedule}</a>`)}
  ${section(S.home.latestReplays, `<div class="rail" data-list>${reps.map((g) => gameCard(g, teams)).join('') || emptyMsg(S.replays.empty)}</div>`, `<a class="more" href="/replays/">${S.home.allReplays}</a>`)}
  ${filterEmpty}
</div>`;
}

export function scheduleBody(games, teams) {
  const ups = upcoming(games);
  return `<div class="wrap page" data-filterable>
  <h1 class="page-title">${S.schedule.title}</h1>
  <p class="lede">${S.schedule.intro}</p>
  <div data-region="live-strip" class="live-strip" hidden></div>
  ${filterBar({ level: true })}
  <div class="grid" data-list>${ups.map((g) => gameCard(g, teams)).join('') || emptyMsg(S.schedule.empty)}</div>
  ${filterEmpty}
</div>`;
}

export function replaysBody(games, teams) {
  const reps = finished(games);
  return `<div class="wrap page" data-filterable>
  <h1 class="page-title">${S.replays.title}</h1>
  <p class="lede">${S.replays.intro}</p>
  ${filterBar({ level: true })}
  <div class="grid" data-list>${reps.map((g) => gameCard(g, teams)).join('') || emptyMsg(S.replays.empty)}</div>
  ${filterEmpty}
</div>`;
}

export function teamsBody(games, teams) {
  const cards = Object.values(teams).map((t) => {
    const next = upcoming(games.filter((g) => g.team === t.slug)).find((g) => g.status === 'scheduled');
    return `<a class="team-card" href="/teams/${t.slug}/" data-sport="${t.sport}">
  <p class="eyebrow">${esc(S.levels[t.level])}</p>
  <h3>${esc(S.sports[t.sport])}</h3>
  <p class="meta">${next ? `${S.teams.nextPrefix}: ${dayLabel(next.start)} ${S.vs} ${esc(next.opponent)}` : S.teams.noNext}</p>
  ${owlEye('watermark')}
</a>`;
  });
  return `<div class="wrap page">
  <h1 class="page-title">${S.teams.title}</h1>
  <div class="grid">${cards.join('')}</div>
</div>`;
}

export function teamBody(t, games, teams) {
  const mine = games.filter((g) => g.team === t.slug);
  const ups = upcoming(mine);
  const res = finished(mine);
  return `<div class="wrap page">
  <p class="crumb"><a href="/teams/">${S.teams.title}</a></p>
  <h1 class="page-title">${esc(teamLabelLong(t))}</h1>
  ${section(S.teams.upcoming, `<div class="grid">${ups.map((g) => gameCard(g, teams)).join('') || emptyMsg(S.teams.noNext)}</div>`)}
  ${section(S.teams.results, `<div class="grid">${res.map((g) => gameCard(g, teams)).join('') || emptyMsg(S.teams.noResults)}</div>`)}
</div>`;
}

export function gameBody(g, games, teams) {
  const t = teams[g.team];
  const next = upcoming(games).find((x) => x.id !== g.id && x.status === 'scheduled' && new Date(x.start) >= new Date(g.start)) ||
               upcoming(games).find((x) => x.id !== g.id && x.status === 'scheduled');
  return `<div class="wrap page game-page">
  <p class="crumb"><a href="/teams/${t.slug}/">${esc(teamLabelLong(t))}</a></p>
  <div class="video" data-region="video" data-game="${esc(g.id)}" data-key="${esc(videoKey(g))}">${videoInner(g)}</div>
  <div class="scoreboard" data-region="score" data-game="${esc(g.id)}" role="status" aria-live="polite">${scoreboardInner(g)}</div>
  <div class="game-head">
    <div>
      <p class="eyebrow">${esc(teamLabelLong(t))}</p>
      <h1 class="page-title">${esc(gameTitle(g))}</h1>
      <p class="meta">${whenHtml(g)} · ${esc(g.venue)}</p>
    </div>
    <div class="game-actions">
      <a class="btn btn-ghost" href="/calendar/${esc(g.id)}.ics">${icon.cal}${S.game.addToCalendar}</a>
      <button class="btn btn-ghost" type="button" data-share data-title="${esc(gameTitle(g))}" data-copied="${S.game.copied}">${icon.share}<span>${S.game.share}</span></button>
    </div>
  </div>
  ${next ? section(S.game.nextUp, `<div class="grid grid-one">${gameCard(next, teams)}</div>`) : ''}
</div>`;
}

export function aboutBody() {
  const a = S.about;
  const block = (h, p) => `<section class="prose-block"><h2>${h}</h2><p>${p}</p></section>`;
  return `<div class="wrap page narrow">
  <h1 class="page-title">${a.title}</h1>
  ${block(a.howTitle, a.how)}${block(a.whoTitle, a.who)}${block(a.contactTitle, a.contact)}${block(a.privacyTitle, a.privacy)}${block(a.takedownTitle, a.takedown)}
  <p class="about-tag">${S.tagline}</p>
</div>`;
}
