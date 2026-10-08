import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeId, toTashkentInput, fromTashkentInput, makeId, slug, fromRow, toRow } from '../src/data.js';
import { listSig } from '../src/render.js';
import { buildIcs } from '../src/ics.js';

test('parseYouTubeId understands the usual link shapes', () => {
  const id = 'dQw4w9WgXcQ';
  for (const input of [
    id,
    `https://www.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/watch?v=${id}&t=30s`,
    `youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/live/${id}?feature=share`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `  https://youtu.be/${id}  `
  ]) assert.equal(parseYouTubeId(input), id, input);
});

test('parseYouTubeId separates empty from invalid', () => {
  assert.equal(parseYouTubeId(''), '');
  assert.equal(parseYouTubeId('   '), '');
  assert.equal(parseYouTubeId(null), '');
  for (const bad of ['hello', 'https://example.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=short', 'https://www.youtube.com/channel/UC123', 'https://evil.com/youtu.be/dQw4w9WgXcQ']) {
    assert.equal(parseYouTubeId(bad), null, bad);
  }
});

test('Tashkent time round trip does not depend on the machine time zone', () => {
  const iso = fromTashkentInput('2026-10-17T16:00');
  assert.equal(iso, '2026-10-17T16:00:00+05:00');
  assert.equal(new Date(iso).toISOString(), '2026-10-17T11:00:00.000Z');
  assert.equal(toTashkentInput('2026-10-17T11:00:00+00:00'), '2026-10-17T16:00');
  assert.equal(toTashkentInput('2026-10-17T19:30:00Z'), '2026-10-18T00:30'); // crosses midnight, no "24:30"
});

test('makeId is readable, stable and unique', () => {
  const g = { start: '2026-10-17T16:00:00+05:00', team: 'football-varsity', opponent: 'Westbridge Academy' };
  assert.equal(makeId(g), '2026-10-17-football-varsity-westbridge-academy');
  assert.equal(makeId(g, ['2026-10-17-football-varsity-westbridge-academy']), '2026-10-17-football-varsity-westbridge-academy-2');
  assert.equal(makeId({ ...g, opponent: 'Школа №5' }), '2026-10-17-football-varsity-no5');
  assert.equal(makeId({ ...g, opponent: 'Школа' }), '2026-10-17-football-varsity-game');
  assert.equal(slug("St. Mary's  /  Prep!"), 'st-mary-s-prep');
});

test('database rows and game objects convert both ways', () => {
  const game = { id: 'a', team: 'football-jv', opponent: 'X', venue: 'Home field', start: '2026-10-17T16:00:00+05:00', status: 'live', homeScore: 0, awayScore: 2, streamId: 'dQw4w9WgXcQ', replayId: null, cover: null, hidden: false };
  assert.deepEqual(fromRow(toRow(game)), game);
  assert.equal(fromRow(toRow({ ...game, hidden: true })).hidden, true);
  assert.equal(toRow({ ...game, homeScore: undefined }).home_score, null);
  assert.equal(toRow({ ...game, streamId: '' }).stream_id, null);
});

test('listSig ignores live score and stream changes but notices real list changes', () => {
  const base = { id: 'a', team: 'football-jv', opponent: 'X', venue: 'v', start: '2026-10-17T16:00:00+05:00', status: 'live', homeScore: 0, awayScore: 0, streamId: null, replayId: null, cover: null };
  const sig = (g) => listSig([g]);
  assert.equal(sig(base), sig({ ...base, homeScore: 3, awayScore: 1, streamId: 'dQw4w9WgXcQ' }));
  assert.notEqual(sig(base), sig({ ...base, status: 'final' }));
  assert.notEqual(sig({ ...base, status: 'final', homeScore: 1, awayScore: 0 }), sig({ ...base, status: 'final', homeScore: 2, awayScore: 0 }));
  assert.notEqual(sig({ ...base, status: 'final' }), sig({ ...base, status: 'final', replayId: 'dQw4w9WgXcQ' }));
  assert.notEqual(listSig([base]), listSig([base, { ...base, id: 'b' }]));
  assert.equal(listSig([base, { ...base, id: 'b' }]), listSig([{ ...base, id: 'b' }, base]));
});

test('buildIcs makes a valid single-event calendar file', () => {
  const g = { id: '2026-10-17-football-varsity-x', team: 'football-varsity', opponent: 'X', venue: 'Home field', start: '2026-10-17T16:00:00+05:00' };
  const ics = buildIcs(g, { slug: 'football-varsity', sport: 'football', level: 'varsity' }, { name: 'TIS Owls Live', siteUrl: 'https://live.tashschool.org', now: new Date('2026-10-05T00:00:00Z') });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.match(ics, /DTSTART:20261017T110000Z\r\n/);
  assert.match(ics, /DTEND:20261017T130000Z\r\n/);
  assert.match(ics, /UID:2026-10-17-football-varsity-x@live\.tashschool\.org\r\n/);
  assert.match(ics, /URL:https:\/\/live\.tashschool\.org\/game\/2026-10-17-football-varsity-x\/\r\n/);
});
