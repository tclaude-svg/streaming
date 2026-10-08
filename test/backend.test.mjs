import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeCover, fromRow } from '../src/data.js';
import { gamesSignature } from '../scripts/signature.mjs';

test('isSafeCover accepts plain https image addresses only', () => {
  for (const ok of [
    'https://example.org/a.jpg',
    'https://cdn.example.org/photos/team%201.png?w=800&h=600',
    'https://example.org/img.webp#x'
  ]) assert.equal(isSafeCover(ok), true, ok);
  for (const bad of [
    '', null, undefined, 42,
    'http://example.org/a.jpg',
    'javascript:alert(1)',
    'https://example.org/a.jpg);background:red',
    'https://example.org/a b.jpg',
    'https://example.org/"x.jpg',
    "https://example.org/'x.jpg",
    'https://example.org/a\\b.jpg',
    `https://example.org/${'a'.repeat(500)}.jpg`
  ]) assert.equal(isSafeCover(bad), false, String(bad));
});

test('fromRow drops an unsafe cover instead of putting it on the page', () => {
  const row = { id: 'x', team: 'football-varsity', opponent: 'A', venue: 'Home field', start: '2026-10-17T15:00:00+05:00', status: 'scheduled', cover: 'https://e.org/a.jpg)' };
  assert.equal(fromRow(row).cover, null);
  assert.equal(fromRow({ ...row, cover: 'https://e.org/a.jpg' }).cover, 'https://e.org/a.jpg');
});

test('gamesSignature ignores order and time-zone spelling, notices real changes', () => {
  const a = { id: 'a', team: 'football-varsity', opponent: 'X', venue: 'Home field', start: '2026-10-17T15:00:00+05:00', status: 'scheduled' };
  const b = { id: 'b', team: 'basketball-jv', opponent: 'Y', venue: 'Gym', start: '2026-10-18T16:00:00+05:00', status: 'scheduled', homeScore: null };
  const base = gamesSignature([a, b]);
  assert.equal(gamesSignature([b, a]), base);
  assert.equal(gamesSignature([{ ...a, start: '2026-10-17T10:00:00.000Z' }, b]), base);
  assert.equal(gamesSignature([a, { ...b, homeScore: undefined }]), base);
  assert.notEqual(gamesSignature([{ ...a, status: 'live' }, b]), base);
  assert.notEqual(gamesSignature([a, { ...b, replayId: 'dQw4w9WgXcQ' }]), base);
  assert.notEqual(gamesSignature([a]), base);
});
