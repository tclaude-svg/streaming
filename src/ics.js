// Calendar (.ics) file for one game. Used by the build script and, as a fallback, by the
// browser for games added in the admin area after the last build.
import { gameTitle, teamLabel } from './render.js';

const utc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const fold = (s) => s.replace(/([,;\\])/g, '\\$1');

export function buildIcs(g, team, { name, siteUrl, now = new Date() }) {
  const start = new Date(g.start);
  const end = new Date(start.getTime() + 2 * 3600 * 1000);
  const link = `${siteUrl}/game/${g.id}/`;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${name}//EN`, 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${g.id}@${new URL(siteUrl).hostname}`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART:${utc(start)}`, `DTEND:${utc(end)}`,
    `SUMMARY:${fold(`${gameTitle(g)} (${teamLabel(team)})`)}`,
    `LOCATION:${fold(g.venue)}`,
    `DESCRIPTION:${fold(`Watch live: ${link}`)}`,
    `URL:${link}`,
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n') + '\r\n';
}
