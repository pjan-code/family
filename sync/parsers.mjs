// Källspecifik tolkning: rensar titlar och plockar ut samlingstid/plats.
// Varje parser får (raw, ctx) och returnerar fält som läggs ovanpå grundhändelsen.
//   raw = { title, description, location, startLocal: 'YYYY-MM-DDTHH:mm', endLocal, allDay }

const clean = (s) => (s || '').replace(/\r/g, '').trim();
const isPlaceholder = (s) => !s || /^\[*\]*$/.test(s.replace(/\s/g, ''));
const hhmm = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/** "18.30" / "18:30" / "9.05" -> "18:30" */
export function normTime(s) {
  const m = /(\d{1,2})[:.](\d{2})/.exec(s || '');
  return m ? hhmm(+m[1], +m[2]) : null;
}

function firstLineAfter(desc, label) {
  const re = new RegExp(`${label}\\s*\\n([^\\n]+)`, 'i');
  const m = re.exec(desc);
  return m ? m[1].trim() : null;
}

// ---- Laget.se -------------------------------------------------------------
// Titel:  "Träning - Lerums BK Team 16"  -> "Träning"
//         "Match Lerums BK Vit - Frölunda HC Röd" (behålls)
// Beskr:  "Samlingstid\n2026-10-13 18:00\nÖvrig info\nSeriematch mot …"
export function laget(raw) {
  const out = {};
  let title = clean(raw.title);
  const parts = title.split(/\s+-\s+/);
  if (parts.length === 2 && !/\s/.test(parts[0])) title = parts[0];
  out.title = title;

  const desc = clean(raw.description);
  if (!isPlaceholder(desc)) {
    const m = /Samlingstid\s*\n?\s*(\d{4}-\d{2}-\d{2})?\s*(\d{1,2}[:.]\d{2})/i.exec(desc);
    if (m) out.meet = { time: normTime(m[2]) };
    const info = firstLineAfter(desc, 'Övrig info');
    if (info && !/^Läs mer/i.test(info)) out.note = info;
    const url = /(https?:\/\/[^\s"]+)/.exec(desc);
    if (url) out.url = url[1];
  }
  return out;
}

// ---- Svenska lag ----------------------------------------------------------
// Titel:  "Fys+ispass // B1-ungdom (U14) - Sörhaga/Alingsås Hockey" -> "Fys+ispass"
//         "Match: A - B (U14P Västergötland)"                         -> "Match: A - B"
// Beskr:  "Samling: Nolhaga ishall, kl 18:30" | "Samling: kl 16:45"
// Matcher med start 00:00 = tid ej satt.
export function svenskalag(raw) {
  const out = {};
  let title = clean(raw.title).split(/\s+\/\/\s+/)[0];
  title = title.replace(/\s*\([^)]*\)\s*$/, '');
  out.title = title;

  const desc = clean(raw.description);
  const m = /Samling:\s*(?:([^,\n]+?),\s*)?kl\.?\s*(\d{1,2}[:.]\d{2})/i.exec(desc);
  if (m) {
    out.meet = { time: normTime(m[2]) };
    const place = m[1] && m[1].trim();
    if (place && place.toLowerCase() !== clean(raw.location).toLowerCase()) out.meet.place = place;
  }

  if (!raw.allDay && raw.startLocal.endsWith('T00:00')) {
    out.tbd = true;
    delete out.meet;
  }
  return out;
}

// ---- Generisk (Google m.fl.) ----------------------------------------------
// Stödjer planeringsstilen "Ebbe hockey (16.50)" -> samling 16:50,
// och "Samling 18:30" / "Samling: 18.30" i beskrivningen.
export function generic(raw) {
  const out = {};
  let title = clean(raw.title);
  const paren = /\s*\((\d{1,2}[:.]\d{2})\)\s*/.exec(title);
  if (paren) {
    out.meet = { time: normTime(paren[1]) };
    title = title.replace(paren[0], ' ').trim();
  }
  out.title = title;
  if (!out.meet) {
    const m = /Samling[^\d\n]{0,20}(\d{1,2}[:.]\d{2})/i.exec(clean(raw.description));
    if (m) out.meet = { time: normTime(m[1]) };
  }
  return out;
}

export const parsers = { laget, svenskalag, generic };

// "Match Lerums BK Vit - Frölunda HC Röd" + ownTeam "Lerums BK" -> { title: "Match mot Frölunda HC Röd (hemma)", team: "Vit" }
// "Match: Skara IK - Sörhaga/Alingsås Hockey" + ownTeam "Sörhaga" -> { title: "Match mot Skara IK (borta)" }
export function shortenMatch(title, ownTeam) {
  if (!ownTeam) return null;
  const m = /^Match:?\s+(.+?)\s+-\s+(.+)$/i.exec(title);
  if (!m) return null;
  const own = new RegExp(ownTeam, 'i');
  const [a, b] = [m[1].trim(), m[2].trim()];
  const homeIsOwn = own.test(a);
  if (homeIsOwn === own.test(b)) return null; // oklart vem som är vi
  const ours = homeIsOwn ? a : b;
  const them = homeIsOwn ? b : a;
  const suffix = ours.replace(own, '').replace(/^[\s\-/]*(Hockey)?\s*/i, '').trim();
  const where = homeIsOwn ? 'hemma' : 'borta';
  return { title: `Match mot ${them} (${where})`, team: suffix || null };
}

/** "Vättlehallen Ishall, Lerums Kommun" -> "Vättlehallen Ishall" */
export function tidyLocation(loc) {
  return (loc || '').replace(/,\s*[^,]*\bkommun$/i, '').replace(/\(([^)]+)\)/, ' ($1)').replace(/\s+/g, ' ').trim();
}
