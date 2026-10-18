// Kör: npm test   – testar tolkning mot syntetiska flöden i samma format som källorna.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildData } from './sync.mjs';
import { encryptJson, decryptJson } from './crypto.mjs';

import { FIX, cfg } from './test-fixtures.mjs';

const fetchFeed = async (_u, f) => { if (!FIX[f.id]) throw new Error('HTTP 404'); return FIX[f.id]; };
const now = new Date('2026-10-18T10:00:00+02:00');
const previous = { events: [{ id: 'old1', feed: 'broken', kind: 'event', people: ['elis'], title: 'Lekis', allDay: false, start: '2026-10-24T11:00', end: '2026-10-24T12:00' }] };
const data = await buildData(cfg, { fetchFeed, previous, now });
const find = (t) => data.events.filter((e) => e.title.includes(t));

test('Laget: titel, samling, Windows-tidszon, lagfärg', () => {
  const tr = find('Träning')[0];
  assert.equal(tr.title, 'Träning');
  assert.equal(tr.start, '2026-10-13T19:00');
  assert.deepEqual(tr.meet, { time: '18:00' });
  assert.equal(find('Hockeyskoj')[0].meet, undefined);
  const [rod] = find('Bäcken');
  const [vit] = find('Frölunda');
  assert.equal(vit.title, 'Match mot Frölunda HC Röd (hemma)');
  assert.equal(vit.team, 'Vit');
  assert.equal(rod.team, 'Röd');
  assert.equal(rod.dim, undefined, 'båda lagens matcher visas fullt');
  assert.equal(vit.note, 'Seriematch mot Frölunda och Härryda');
  assert.equal(vit.location, 'Vättlehallen Ishall');
});

test('Svenska lag: titel, samlingsplats, tid ej satt', () => {
  const [fys] = find('Fys+Ispass');
  assert.equal(fys.title, 'Fys+Ispass');
  assert.deepEqual(fys.meet, { time: '18:30' });
  const [pua] = find('PUAHALLEN');
  assert.deepEqual(pua.meet, { time: '18:20', place: 'Nolhaga ishall' });
  const [tbd] = find('Falköping');
  assert.equal(tbd.tbd, true);
  assert.equal(tbd.meet, undefined);
  assert.equal(tbd.title, 'Match mot IFK Falköping IK/Tidaholms HF (borta)');
  assert.equal(find('Lidköping')[0].title, 'Match mot HC Lidköping Red Roosters (hemma)');
  assert.equal(find('PUAHALLEN')[0].location, 'Puahallen (VÅRGÅRDA)');
  assert.equal(find('Lidköping')[0].start, '2026-10-18T13:45');
});

test('Google: återkommande, sommartid->vintertid, namn i titel, samling i parentes', () => {
  const padel = find('Padel').map((e) => e.start);
  assert.ok(padel.includes('2026-10-12T08:00'), padel.join());
  assert.ok(padel.includes('2026-10-26T07:00'), 'vintertid efter 25/10');
  const [tand] = find('tandläkare');
  assert.deepEqual(tand.people.sort(), ['ebbe', 'peter']);
  assert.deepEqual(tand.meet, { time: '16:50' });
  assert.equal(tand.title, 'Skjutsa Ebbe tandläkare');
});

test('Helgdag, anteckningar, att göra', () => {
  assert.equal(find('Alla helgons')[0].red, true);
  assert.equal(find('Halloween')[0].red, undefined);
  const todo = data.events.find((e) => e.kind === 'todo');
  assert.equal(todo.title, 'Lampor Ebbes cykel');
  assert.deepEqual(todo.people, ['ebbe']);
  assert.equal(data.events.find((e) => e.kind === 'note').people[0], 'elliot');
});

test('Skolschema hoppar över lov', () => {
  const s = data.events.filter((e) => e.kind === 'school').map((e) => e.start);
  assert.ok(s.includes('2026-10-12T08:00'));
  assert.ok(s.includes('2026-10-16T09:40'));
  assert.ok(!s.includes('2026-10-26T08:00'), 'höstlov');
});

test('Trasigt flöde återanvänder förra datan', () => {
  const f = data.feeds.find((x) => x.id === 'broken');
  assert.equal(f.ok, false);
  assert.equal(f.stale, true);
  assert.ok(find('Lekis').length === 1);
});

test('Kryptering runt', async () => {
  const key = Buffer.alloc(32, 7).toString('base64url');
  const enc = await encryptJson({ a: 'åäö' }, key);
  assert.deepEqual(await decryptJson(enc, key), { a: 'åäö' });
});
