#!/usr/bin/env node
// Hämtar alla iCal-flöden, normaliserar, slår ihop och skriver en krypterad datafil.
//
// Konfig:  env CALENDAR_CONFIG (JSON)  eller  --config <fil>
// Nyckel:  env FAMILY_KEY (base64url, 32 bytes)  – krävs om inte --plain
// Utdata:  --out <fil> (default site/data.enc.json, med --plain: site/data.json)
// Reserv:  env PREVIOUS_DATA_URL – förra publicerade filen. Om ett flöde inte
//          går att hämta återanvänds dess händelser därifrån i stället för att försvinna.

process.env.TZ = process.env.TZ || 'Europe/Stockholm';

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import ical from 'node-ical';
import { parsers, shortenMatch, tidyLocation } from './parsers.mjs';
import { encryptJson, decryptJson } from './crypto.mjs';

const RED_DAYS =
  'nyårsdag|trettondedag|trettondag|långfredag|annandag|påskdag|första maj|1 maj|himmelsfärd|himmelfärd|nationaldag|' +
  'midsommar|alla helgons dag|julafton|juldag|nyårsafton|pingstdag';

// ---------- hjälpare -------------------------------------------------------
export function makeLocal(tz) {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  return (d) => {
    const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  };
}

const val = (v) => (v && typeof v === 'object' && 'val' in v ? v.val : v) ?? '';
const str = (v) => String(val(v) ?? '').trim();
const shortHash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const toRegexes = (arr) => (arr || []).map((s) => new RegExp(s, 'i'));
const dateOnly = (local) => local.slice(0, 10);
const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function mondayOf(ymd) {
  const d = new Date(`${ymd}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const a = { plain: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--plain') a.plain = true;
    else if (argv[i] === '--config') a.config = argv[++i];
    else if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--fixtures') a.fixtures = argv[++i];
  }
  return a;
}

async function fetchText(url, { tries = 2, timeoutMs = 20000 } = {}) {
  const u = url.replace(/^webcal:\/\//i, 'https://');
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(u, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': 'family-calendar-sync/1.0', accept: 'text/calendar,*/*' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.includes('BEGIN:VCALENDAR')) throw new Error('svaret är inte iCal');
      return text;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

// ---------- normalisering ---------------------------------------------------
export function assignPeople(text, keywords) {
  const hits = [];
  for (const [id, words] of Object.entries(keywords)) {
    if (words.some((w) => new RegExp(`(^|[^\\p{L}])${w}s?([^\\p{L}]|$)`, 'iu').test(text))) hits.push(id);
  }
  return hits;
}

export function normalizeFeed(icsText, feed, ctx) {
  const { from, to, toLocal, keywords } = ctx;
  const data = ical.sync.parseICS(icsText);
  const parse = parsers[feed.parser || 'generic'] || parsers.generic;
  const hide = toRegexes(feed.hide);
  const dim = toRegexes(feed.dim);
  const out = [];

  for (const ev of Object.values(data)) {
    if (!ev || ev.type !== 'VEVENT') continue;
    if (str(ev.status).toUpperCase() === 'CANCELLED') continue;

    let instances;
    try {
      instances = ical.expandRecurringEvent(ev, { from, to, expandOngoing: true });
    } catch {
      instances = [{ start: ev.start, end: ev.end || ev.start, isFullDay: ev.datetype === 'date', event: ev }];
    }

    for (const inst of instances) {
      const e = inst.event || ev;
      const start = new Date(inst.start);
      const end = new Date(inst.end || inst.start);
      if (end < from || start > to) continue;

      const allDay = !!inst.isFullDay;
      const raw = {
        title: str(e.summary),
        description: str(e.description),
        location: str(e.location).replace(/\\,/g, ','),
        startLocal: toLocal(start),
        endLocal: toLocal(end),
        allDay,
      };
      if (hide.some((r) => r.test(raw.title))) continue;

      const parsed = parse(raw, feed);
      let title = parsed.title || raw.title || '(utan titel)';
      const short = shortenMatch(title, feed.ownTeam);
      if (short) title = short.title;
      const kind = feed.kind || 'event';

      let people = [...(feed.people || [])];
      if (feed.matchPeople !== false && kind !== 'holiday') {
        for (const p of assignPeople(`${raw.title} ${raw.description}`, keywords)) {
          if (!people.includes(p)) people.push(p);
        }
      }

      const item = {
        id: shortHash(`${feed.id}|${str(e.uid)}|${raw.startLocal}`),
        feed: feed.id,
        kind,
        people,
        title,
        allDay,
        start: allDay ? dateOnly(raw.startLocal) : raw.startLocal,
        end: allDay ? dateOnly(raw.endLocal) : raw.endLocal, // heldag: exklusivt slutdatum
      };
      if (allDay && item.end <= item.start) item.end = addDays(item.start, 1);
      if (feed.label) item.label = feed.label;
      if (short?.team) item.team = short.team;
      if (raw.location) item.location = tidyLocation(raw.location);
      if (parsed.meet?.time) item.meet = parsed.meet;
      if (parsed.note) item.note = parsed.note;
      if (parsed.tbd) item.tbd = true;
      if (dim.some((r) => r.test(raw.title))) item.dim = true;

      if (kind === 'notes') {
        // Delad familjekalender: "Att göra: …" blir att-göra, resten anteckningar.
        const todo = /^(att göra|todo|göra)\s*[:\-]\s*/i.exec(title);
        item.kind = todo ? 'todo' : 'note';
        if (todo) item.title = title.slice(todo[0].length);
      }
      out.push(item);
    }
  }
  return out;
}

// Fast skolschema per barn: { "elliot": { "mon": "08:00-15:10", ... } }
export function schoolEvents(cfg, fromYmd, toYmd, holidayDates) {
  const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const breaks = cfg.schoolBreaks || [];
  const out = [];
  for (let d = fromYmd; d <= toYmd; d = addDays(d, 1)) {
    if (holidayDates.has(d)) continue;
    if (breaks.some((b) => d >= b.from && d <= b.to)) continue;
    const dow = keys[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7];
    for (const [person, week] of Object.entries(cfg.school || {})) {
      const spec = week[dow];
      if (!spec) continue;
      const [s, e] = String(spec).split('-').map((x) => x.trim());
      out.push({
        id: shortHash(`school|${person}|${d}`),
        feed: 'school', kind: 'school', people: [person],
        title: 'Skola', allDay: false, start: `${d}T${s}`, end: `${d}T${e}`,
      });
    }
  }
  return out;
}

function dedupe(events) {
  const seen = new Map();
  for (const e of events) {
    const k = `${e.kind}|${e.start}|${e.end}|${e.title.toLowerCase()}`;
    const prev = seen.get(k);
    if (!prev) seen.set(k, e);
    else for (const p of e.people) if (!prev.people.includes(p)) prev.people.push(p);
  }
  return [...seen.values()];
}

async function loadPrevious(keyB64) {
  const url = process.env.PREVIOUS_DATA_URL;
  if (!url || !keyB64) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    if (!res.ok) return null;
    return await decryptJson(await res.json(), keyB64);
  } catch {
    return null;
  }
}

// ---------- huvudprogram ----------------------------------------------------
export async function buildData(cfg, { fetchFeed = fetchText, previous = null, now = new Date() } = {}) {
  const tz = cfg.timezone || 'Europe/Stockholm';
  const toLocal = makeLocal(tz);
  const today = toLocal(now).slice(0, 10);
  const fromYmd = addDays(mondayOf(today), -7 * (cfg.weeksBack ?? 1));
  const toYmd = addDays(mondayOf(today), 7 * ((cfg.weeksAhead ?? 10) + 1) - 1);
  const from = new Date(`${fromYmd}T00:00:00`);
  const to = new Date(`${toYmd}T23:59:59`);

  const people = cfg.people || [];
  const keywords = cfg.keywords || Object.fromEntries(people.map((p) => [p.id, [p.name]]));
  const ctx = { from, to, toLocal, keywords };

  const events = [];
  const feeds = [];
  for (const feed of cfg.feeds || []) {
    try {
      const text = await fetchFeed(feed.url, feed);
      const items = normalizeFeed(text, feed, ctx);
      events.push(...items);
      feeds.push({ id: feed.id, ok: true, count: items.length });
    } catch (err) {
      const old = (previous?.events || []).filter((e) => e.feed === feed.id && e.end >= fromYmd);
      events.push(...old);
      feeds.push({ id: feed.id, ok: false, stale: old.length > 0, count: old.length, error: String(err.message || err).slice(0, 120) });
      console.warn(`! ${feed.id}: ${err.message || err}${old.length ? ` – återanvänder ${old.length} gamla` : ''}`);
    }
  }

  // Lediga dagar som stoppar skolschemat (helgdagsflödet innehåller även t.ex. Halloween).
  const red = new RegExp(cfg.noSchoolHolidays || RED_DAYS, 'i');
  const holidayDates = new Set(
    events.filter((e) => e.kind === 'holiday' && e.allDay && red.test(e.title)).map((e) => e.start),
  );
  for (const e of events) if (e.kind === 'holiday' && red.test(e.title)) e.red = true;
  events.push(...schoolEvents(cfg, fromYmd, toYmd, holidayDates));

  const all = dedupe(events).sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  return {
    v: 1,
    generated: now.toISOString(),
    tz,
    range: { from: fromYmd, to: toYmd },
    people,
    events: all,
    feeds,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const raw = args.config ? await fs.readFile(args.config, 'utf8') : process.env.CALENDAR_CONFIG;
  if (!raw) throw new Error('Ingen konfig: sätt CALENDAR_CONFIG eller använd --config <fil>');
  const cfg = JSON.parse(raw);
  const key = process.env.FAMILY_KEY;
  if (!args.plain && !key) throw new Error('FAMILY_KEY saknas (eller kör med --plain lokalt)');

  let fetchFeed;
  if (args.fixtures) {
    fetchFeed = async (_url, feed) => fs.readFile(path.join(args.fixtures, `${feed.id}.ics`), 'utf8');
  }
  const previous = await loadPrevious(key);
  const data = await buildData(cfg, { fetchFeed, previous });

  const outFile = args.out || (args.plain ? 'site/data.json' : 'site/data.enc.json');
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  const payload = args.plain ? data : await encryptJson(data, key);
  await fs.writeFile(outFile, JSON.stringify(payload));

  for (const f of data.feeds) console.log(`${f.ok ? '✓' : '✗'} ${f.id}: ${f.count} händelser${f.error ? ` (${f.error})` : ''}`);
  console.log(`→ ${outFile}: ${data.events.length} händelser ${data.range.from}..${data.range.to}`);
  if (data.feeds.length && data.feeds.every((f) => !f.ok)) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}
