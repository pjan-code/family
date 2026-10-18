/* Familjekalender – väggvy. Läser data.enc.json, dekrypterar med nyckeln i #k=… */
(() => {
  'use strict';

  const TZ = 'Europe/Stockholm';
  const DATA_URL = 'data.enc.json';
  const KEY_STORE = 'familyKey';
  const CACHE_STORE = 'familyDataCache';
  const REFRESH_MS = 10 * 60 * 1000;
  const IDLE_MS = 3 * 60 * 1000;
  const NIGHT = { from: '21:30', to: '06:00' };
  const PALETTE = ['#c2185b', '#2f6fb0', '#2e8b57', '#e07b00', '#7b4fc4', '#00838f', '#8d6e63'];

  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* privat läge */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
  };

  // ---------- tid ----------
  const partsFmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  function nowLocal() {
    const p = Object.fromEntries(partsFmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { ymd: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour}:${p.minute}` };
  }
  const utcNoon = (ymd) => new Date(`${ymd}T12:00:00Z`);
  function addDays(ymd, n) { const d = utcNoon(ymd); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function mondayOf(ymd) { const d = utcNoon(ymd); return addDays(ymd, -((d.getUTCDay() + 6) % 7)); }
  function isoWeek(ymd) {
    const d = utcNoon(ymd);
    d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
    const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  }
  const fmt = (opts) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', ...opts });
  const fDayName = fmt({ weekday: 'short' });
  const fDayLong = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
  const fDayMonth = fmt({ day: 'numeric', month: 'short' });
  const fWeekday = fmt({ weekday: 'long' });
  const time = (local) => local.slice(11, 16);
  const shortTime = (hm) => hm.replace(/^0/, '');

  // ---------- nyckel & data ----------
  function keyFromText(text) {
    const s = (text || '').trim();
    const m = /[#&?]k=([A-Za-z0-9_-]{40,})/.exec(s);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{40,}$/.test(s) ? s : null;
  }
  function currentKey() {
    const fromHash = keyFromText(location.hash);
    if (fromHash) { store.set(KEY_STORE, fromHash); return fromHash; }
    return store.get(KEY_STORE);
  }
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  function b64urlToBytes(s) {
    const t = s.replace(/-/g, '+').replace(/_/g, '/');
    return b64(t + '==='.slice((t.length + 3) % 4));
  }
  async function decrypt(payload, keyText) {
    const key = await crypto.subtle.importKey('raw', b64urlToBytes(keyText), 'AES-GCM', false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(payload.iv) }, key, b64(payload.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function fetchPayload() {
    try {
      const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      store.set(CACHE_STORE, JSON.stringify(payload));
      return { payload, offline: false };
    } catch (err) {
      const cached = store.get(CACHE_STORE);
      if (cached) return { payload: JSON.parse(cached), offline: true };
      throw err;
    }
  }

  // ---------- state ----------
  const state = { data: null, offline: false, weekStart: null, lastTouch: Date.now(), loadedAt: Date.now() };

  function personMap() {
    const m = new Map();
    (state.data?.people || []).forEach((p, i) => m.set(p.id, { ...p, color: p.color || PALETTE[i % PALETTE.length] }));
    return m;
  }

  // ---------- render ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function barStyle(ids, people) {
    const cs = ids.map((id) => people.get(id)?.color).filter(Boolean);
    if (cs.length <= 1) return cs[0] || 'var(--ink-3)';
    const step = 100 / cs.length;
    return `linear-gradient(${cs.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(',')})`;
  }

  function eventsOnDay(ymd) {
    const list = [];
    for (const e of state.data.events) {
      if (e.allDay) {
        if (e.start <= ymd && ymd < e.end) list.push(e);
      } else {
        const sd = e.start.slice(0, 10);
        const ed = e.end.slice(0, 10);
        if (sd <= ymd && (ymd < ed || (ymd === ed && (sd === ed || e.end.slice(11) !== '00:00')))) list.push(e);
      }
    }
    return list;
  }

  function whoLabel(e, people) {
    return e.people
      .map((id) => people.get(id)?.name)
      .filter((n) => n && !new RegExp(`(^|[^\\p{L}])${n}`, 'iu').test(e.title))
      .join(', ');
  }

  function renderEvent(e, ymd, now, people) {
    const card = el('article', 'ev');
    card.style.setProperty('--bar', barStyle(e.people, people));
    if (e.dim) card.classList.add('dim');

    if (e.allDay) {
      card.classList.add('allday');
    } else {
      const sd = e.start.slice(0, 10);
      const ed = e.end.slice(0, 10);
      const from = sd === ymd ? shortTime(time(e.start)) : '';
      const to = ed === ymd ? shortTime(time(e.end)) : '';
      const t = el('div', 'ev-time');
      if (e.tbd) t.appendChild(el('span', 'tbd', 'Tid ej satt'));
      else t.textContent = from && to ? `${from}–${to}` : from ? `${from} →` : to ? `→ ${to}` : 'Hela dagen';
      card.appendChild(t);

      if (ymd === now.ymd && !e.tbd) {
        const nowStr = `${now.ymd}T${now.hm}`;
        if (e.end <= nowStr) card.classList.add('done');
        else if (e.start <= nowStr) card.classList.add('now');
      }
    }

    if (e.label) card.appendChild(el('div', 'ev-tag', e.label));
    const title = el('div', 'ev-title');
    const who = whoLabel(e, people);
    if (who) { title.appendChild(el('span', 'ev-who', who)); title.appendChild(document.createTextNode(' · ')); }
    title.appendChild(document.createTextNode(e.title));
    card.appendChild(title);

    if (e.meet?.time && e.start.slice(0, 10) === ymd) {
      card.appendChild(el('div', 'ev-meet', `Samling ${shortTime(e.meet.time)}${e.meet.place ? ` · ${e.meet.place}` : ''}`));
    }
    if (e.location) card.appendChild(el('div', 'ev-loc', e.location));
    if (e.note) card.appendChild(el('div', 'ev-note', e.note));
    return card;
  }

  function renderDays(now, people) {
    const wrap = $('days');
    wrap.replaceChildren();
    for (let i = 0; i < 7; i++) {
      const ymd = addDays(state.weekStart, i);
      const all = eventsOnDay(ymd);
      const holidays = all.filter((e) => e.kind === 'holiday');
      const school = all.filter((e) => e.kind === 'school');
      const items = all
        .filter((e) => e.kind === 'event')
        .sort((a, b) => (b.allDay - a.allDay) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title));

      const day = el('section', 'day');
      if (ymd === now.ymd) day.classList.add('today');
      if (ymd < now.ymd) day.classList.add('past');
      if (i === 6 || holidays.some((h) => h.red)) day.classList.add('red');

      const head = el('header', 'day-head');
      head.appendChild(el('span', 'day-name', fDayName.format(utcNoon(ymd)).replace('.', '')));
      head.appendChild(el('span', 'day-num', String(+ymd.slice(8))));
      day.appendChild(head);
      if (holidays.length) day.appendChild(el('div', 'day-holiday', holidays.map((h) => h.title).join(' · ')));

      const body = el('div', 'day-body');
      if (school.length) {
        const row = el('div', 'school');
        for (const s of school) {
          const p = people.get(s.people[0]);
          const chip = el('span', null, `${p?.name || ''} ${shortTime(time(s.start))}–${shortTime(time(s.end))}`);
          chip.style.setProperty('--c', p?.color || 'var(--ink-3)');
          row.appendChild(chip);
        }
        body.appendChild(row);
      }
      for (const e of items) body.appendChild(renderEvent(e, ymd, now, people));
      if (!items.length && !school.length) body.appendChild(el('div', 'empty', '–'));
      day.appendChild(body);
      wrap.appendChild(day);
    }
  }

  function renderSide(now, people) {
    const weekEnd = addDays(state.weekStart, 7);
    const isCurrent = state.weekStart === mondayOf(now.ymd);
    const ev = state.data.events;

    const todos = ev.filter((e) => e.kind === 'todo' && e.start < weekEnd &&
      (e.end > state.weekStart || (isCurrent && e.start >= addDays(now.ymd, -14))));
    const notes = ev.filter((e) => e.kind === 'note' && e.start < weekEnd && e.end > state.weekStart);

    const fill = (ul, list, withBox) => {
      ul.replaceChildren();
      if (!list.length) { ul.appendChild(el('li', 'empty', 'Inget just nu')); return; }
      for (const e of list) {
        const li = el('li');
        if (withBox) li.appendChild(el('span', 'box'));
        const dot = el('span', 'dot');
        dot.style.setProperty('--c', e.people.length ? barStyle(e.people.slice(0, 1), people) : 'var(--ink-3)');
        if (!withBox) li.appendChild(dot);
        const txt = el('div');
        const who = whoLabel(e, people);
        txt.appendChild(document.createTextNode(who ? `${who}: ${e.title}` : e.title));
        const d = e.start.slice(0, 10);
        txt.appendChild(el('span', 'when', fWeekday.format(utcNoon(d)) + (d < state.weekStart ? ` ${fDayMonth.format(utcNoon(d))}` : '')));
        li.appendChild(txt);
        ul.appendChild(li);
      }
    };
    fill($('todo'), todos, true);
    fill($('notes'), notes, false);
  }

  function renderStatus() {
    const s = $('status');
    s.replaceChildren();
    const gen = new Date(state.data.generated);
    const ageMin = (Date.now() - gen) / 60000;
    const t = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(gen);
    s.appendChild(el('span', ageMin > 120 ? 'warn' : '', `Uppdaterad ${t}`));
    const bad = (state.data.feeds || []).filter((f) => !f.ok);
    if (bad.length) s.appendChild(el('span', 'warn', ` · ${bad.length} källa${bad.length > 1 ? 'or' : ''} svarar inte`));
    if (state.offline) s.appendChild(el('span', 'warn', ' · offline'));
  }

  function renderHeader(now, people) {
    $('weekNo').textContent = `Vecka ${isoWeek(state.weekStart)}`;
    const end = addDays(state.weekStart, 6);
    $('weekRange').textContent = `${fDayMonth.format(utcNoon(state.weekStart))} – ${fDayMonth.format(utcNoon(end))}`;
    $('today').setAttribute('aria-pressed', String(state.weekStart === mondayOf(now.ymd)));
    const lg = $('legend');
    lg.replaceChildren();
    for (const p of people.values()) {
      const li = el('li');
      const d = el('span', 'dot');
      d.style.setProperty('--c', p.color);
      li.append(d, document.createTextNode(p.name));
      lg.appendChild(li);
    }
  }

  function tick() {
    const now = nowLocal();
    $('clockTime').textContent = now.hm;
    $('clockDate').textContent = fDayLong.format(utcNoon(now.ymd));
    const night = now.hm >= NIGHT.from || now.hm < NIGHT.to;
    document.documentElement.toggleAttribute('data-night', night);
    document.querySelector('meta[name="theme-color"]').content = night ? '#0f1418' : '#f6f4ef';
    return now;
  }

  function render() {
    if (!state.data) return;
    const now = tick();
    if (!state.weekStart) state.weekStart = mondayOf(now.ymd);
    const people = personMap();
    renderHeader(now, people);
    renderDays(now, people);
    renderSide(now, people);
    renderStatus();
  }

  // ---------- flöde ----------
  async function load({ silent = false } = {}) {
    const key = currentKey();
    if (!key) return showLock('');
    try {
      const { payload, offline } = await fetchPayload();
      state.data = await decrypt(payload, key);
      state.offline = offline;
      $('lock').hidden = true;
      $('app').hidden = false;
      render();
    } catch (err) {
      if (err && err.name === 'OperationError') {
        store.del(KEY_STORE);
        return showLock('Koden stämmer inte med datan.');
      }
      if (!silent || !state.data) {
        if (!state.data) showLock(`Kunde inte hämta kalendern (${err.message || err}).`);
      } else {
        state.offline = true;
        renderStatus();
      }
    }
  }

  function showLock(msg) {
    $('app').hidden = true;
    $('lock').hidden = false;
    $('lockErr').textContent = msg || '';
  }

  $('lockForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const k = keyFromText($('lockInput').value);
    if (!k) { $('lockErr').textContent = 'Ser inte ut som en giltig kod.'; return; }
    store.set(KEY_STORE, k);
    history.replaceState(null, '', `#k=${k}`);
    $('lockInput').value = '';
    load();
  });

  function goWeek(delta) {
    state.weekStart = delta === 0 ? mondayOf(nowLocal().ymd) : addDays(state.weekStart, 7 * delta);
    render();
  }
  $('prev').addEventListener('click', () => goWeek(-1));
  $('next').addEventListener('click', () => goWeek(1));
  $('today').addEventListener('click', () => goWeek(0));
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') goWeek(-1);
    if (e.key === 'ArrowRight') goWeek(1);
  });

  // Svep vänster/höger för att byta vecka
  let touchX = null, touchY = null;
  document.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) goWeek(dx < 0 ? 1 : -1);
    touchX = null;
  }, { passive: true });

  ['pointerdown', 'keydown', 'touchstart'].forEach((t) =>
    document.addEventListener(t, () => { state.lastTouch = Date.now(); }, { passive: true }));

  // Håll skärmen vaken på surfplattan (där det stöds)
  let wakeLock = null;
  async function keepAwake() {
    try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* ej tillåtet */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { keepAwake(); load({ silent: true }); }
  });
  document.addEventListener('pointerdown', keepAwake, { once: true });

  setInterval(() => {
    const now = nowLocal();
    if (state.data && Date.now() - state.lastTouch > IDLE_MS && state.weekStart !== mondayOf(now.ymd)) {
      state.weekStart = mondayOf(now.ymd);
    }
    render();
    // Ladda om sidan en gång per natt för att få ny kod
    if (now.hm >= '04:00' && now.hm < '04:05' && Date.now() - state.loadedAt > 3600000) location.reload();
  }, 30000);
  setInterval(() => load({ silent: true }), REFRESH_MS);

  tick();
  load();
  keepAwake();
})();
