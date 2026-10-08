import test from 'node:test';
import assert from 'node:assert/strict';
import { splitRows, parseDate, parseTime, parseTeam, parseFixtures } from '../src/import.js';

const SLUGS = ['football-varsity', 'football-jv', 'basketball-varsity', 'basketball-jv', 'volleyball-varsity', 'volleyball-jv'];

test('splitRows reads pasted spreadsheet rows and CSV with quotes', () => {
  assert.deepEqual(splitRows('a\tb\n1\t2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(splitRows('a,b\r\n"x, y","say ""hi"""\r\n\r\n'), [['a', 'b'], ['x, y', 'say "hi"']]);
  assert.deepEqual(splitRows('a;b;c\n1;2;3'), [['a', 'b', 'c'], ['1', '2', '3']]);
  assert.deepEqual(splitRows('﻿date,opponent\n'), [['date', 'opponent']]);
  assert.deepEqual(splitRows(''), []);
});

test('parseDate understands the usual formats, day first', () => {
  for (const s of ['2026-10-17', '17/10/2026', '17.10.2026', '17-10-26', '10/17/2026', '17 Oct 2026', 'Sat 17 October 2026', 'Oct 17, 2026'])
    assert.equal(parseDate(s), '2026-10-17', s);
  assert.equal(parseDate('05/11/2026'), '2026-11-05', 'ambiguous dates are day first');
  assert.equal(parseDate('3 Sept 2026'), '2026-09-03');
  for (const s of ['', '31/02/2026', '2026-13-01', 'next friday', '17/10']) assert.equal(parseDate(s), null, s);
});

test('parseTime understands 24-hour and am/pm times', () => {
  const cases = { '15:30': '15:30', '9:05': '09:05', '3:30 pm': '15:30', '3pm': '15:00', '12am': '00:00', '12:15 PM': '12:15', '1530': '15:30', '15.30': '15:30', '15h30': '15:30', '15': '15:00' };
  for (const [s, want] of Object.entries(cases)) assert.equal(parseTime(s), want, s);
  for (const s of ['', '25:00', '13pm', '12:75', 'noon']) assert.equal(parseTime(s), null, s);
});

test('parseTeam maps sport and level words to a team', () => {
  assert.equal(parseTeam('Football', 'Varsity', SLUGS), 'football-varsity');
  assert.equal(parseTeam('Soccer', 'JV', SLUGS), 'football-jv');
  assert.equal(parseTeam('Basketball', 'Junior Varsity', SLUGS), 'basketball-jv');
  assert.equal(parseTeam('volleyball-jv', '', SLUGS), 'volleyball-jv');
  assert.equal(parseTeam('Volleyball Varsity', '', SLUGS), 'volleyball-varsity');
  assert.equal(parseTeam('Football', 'V', SLUGS), 'football-varsity');
  assert.equal(parseTeam('Tennis', 'Varsity', SLUGS), null);
  assert.equal(parseTeam('Football', 'Middle School', SLUGS), null);
});

test('parseFixtures with a header row, any column order', () => {
  const text = 'Opponent\tDate\tTime\tSport\tLevel\tVenue\n'
    + 'Westbridge Academy\t17/10/2026\t15:30\tFootball\tVarsity\t\n'
    + 'Lakeview Prep\t18/10/2026\t4pm\tBasketball\tJV\tMain gym\n';
  const { rows, hasHeader } = parseFixtures(text, { teamSlugs: SLUGS });
  assert.equal(hasHeader, true);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.errors), [[], []]);
  assert.equal(rows[0].game.id, '2026-10-17-football-varsity-westbridge-academy');
  assert.equal(rows[0].game.start, '2026-10-17T15:30:00+05:00');
  assert.equal(rows[0].game.venue, 'Home field');
  assert.equal(rows[1].game.venue, 'Main gym');
  assert.equal(rows[1].line, 3);
});

test('parseFixtures without a header uses the default column order', () => {
  const { rows, hasHeader } = parseFixtures('2026-10-17,15:30,Football,JV,Silk Road Academy,,https://youtu.be/dQw4w9WgXcQ', { teamSlugs: SLUGS });
  assert.equal(hasHeader, false);
  assert.equal(rows[0].game.team, 'football-jv');
  assert.equal(rows[0].game.streamId, 'dQw4w9WgXcQ');
});

test('parseFixtures flags bad rows and duplicates', () => {
  const text = 'date,time,sport,level,opponent,venue,stream\n'
    + 'someday,15:30,Football,Varsity,A,,\n'
    + '2026-10-17,99:00,Tennis,Varsity,,,not a link\n'
    + '2026-10-17,15:30,Football,Varsity,Westbridge Academy,,\n';
  const existing = [{ id: 'hand-made-id', team: 'football-varsity', opponent: 'Westbridge Academy', start: '2026-10-17T10:30:00Z' }];
  const { rows } = parseFixtures(text, { teamSlugs: SLUGS, existing });
  assert.deepEqual(rows[0].errors, ['date']);
  assert.deepEqual(rows[1].errors, ['time', 'team', 'opponent', 'stream']);
  assert.equal(rows[2].duplicate, true);
});

test('two games on the same day against the same team get different ids', () => {
  const text = '2026-10-17,10:00,Football,JV,Riverside School\n2026-10-17,15:00,Football,JV,Riverside School';
  const { rows } = parseFixtures(text, { teamSlugs: SLUGS });
  assert.notEqual(rows[0].game.id, rows[1].game.id);
});

test('the same game twice in one paste is added once', () => {
  const text = '2026-10-17,15:00,Football,JV,Riverside School\n17/10/2026,3pm,Football,JV,Riverside School';
  const { rows } = parseFixtures(text, { teamSlugs: SLUGS });
  assert.deepEqual(rows.map((r) => r.duplicate), [false, true]);
});

test('new ids never clash with existing ids', () => {
  const existing = [{ id: '2026-10-17-football-jv-riverside-school', team: 'football-jv', opponent: 'Other', start: '2026-10-17T05:00:00Z' }];
  const { rows } = parseFixtures('2026-10-17,15:00,Football,JV,Riverside School', { teamSlugs: SLUGS, existing });
  assert.equal(rows[0].duplicate, false);
  assert.equal(rows[0].game.id, '2026-10-17-football-jv-riverside-school-2');
});
