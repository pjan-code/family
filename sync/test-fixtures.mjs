// Syntetiska flöden i samma format som källorna (Laget, Svenska lag, Google).
const wrap = (name, body, extra = '') =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:test\r\nX-WR-CALNAME:${name}\r\n${extra}${body}END:VCALENDAR\r\n`;

const LAGET = wrap('Team 16', [
  ['1', '20261013T190000', '20261013T195000', 'Träning - Lerums BK Team 16', 'Vättlehallen', 'Samlingstid\\n2026-10-13 18:00'],
  ['2', '20261016T150000', '20261016T155000', 'Hockeyskoj', 'Vättlehallen', '[[[]]]'],
  ['3', '20261018T113000', '20261018T125000', 'Match Lerums BK Röd - Bäcken HC Vit', 'Marconihallen', 'Samlingstid\\n2026-10-18 10:30\\nÖvrig info\\nSeriematch mot Bäcken + Kungälv\\n\\nLäs mer om matchen'],
  ['4', '20261018T123000', '20261018T135000', 'Match Lerums BK Vit - Frölunda HC Röd', 'Vättlehallen Ishall\\, Lerums Kommun', 'Samlingstid\\n2026-10-18 11:30\\nÖvrig info\\nSeriematch mot Frölunda och Härryda'],
].map(([uid, s, e, sum, loc, d]) =>
  `BEGIN:VEVENT\r\nUID:${uid}@laget\r\nDTSTART;TZID=W. Europe Standard Time:${s}\r\nDTEND;TZID=W. Europe Standard Time:${e}\r\nSUMMARY:${sum}\r\nLOCATION:${loc}\r\nDESCRIPTION:${d}\r\nEND:VEVENT\r\n`).join(''));

const VTZ = `BEGIN:VTIMEZONE\r\nTZID:Europe/Stockholm\r\nBEGIN:DAYLIGHT\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200\r\nTZNAME:CEST\r\nDTSTART:19700329T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\nEND:DAYLIGHT\r\nBEGIN:STANDARD\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0100\r\nTZNAME:CET\r\nDTSTART:19701025T030000\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\nEND:STANDARD\r\nEND:VTIMEZONE\r\n`;

const SVL = wrap('B1-ungdom (U14) - Sörhaga/Alingsås Hockey', [
  ['a', '20261012T184000', '20261012T204000', 'Fys+Ispass // B1-ungdom (U14) - Sörhaga/Alingsås Hockey', 'Nolhaga ishall', 'Samling: Nolhaga ishall, kl 18:30\\nFys 18:40'],
  ['b', '20261014T183000', '20261014T202000', 'Fys+ispass PUAHALLEN // B1-ungdom (U14) - Sörhaga/Alingsås Hockey', 'Puahallen(VÅRGÅRDA)', 'Samling: Nolhaga ishall, kl 18:20'],
  ['c', '20261017T000000', '20261017T020000', 'Match: IFK Falköping IK/Tidaholms HF - Sörhaga/Alingsås Hockey (U14P Västergötland)', 'Rosenbergs ishall', 'Samling: kl 23:00'],
  ['d', '20261018T134500', '20261018T154500', 'Match: Sörhaga/Alingsås Hockey - HC Lidköping Red Roosters (U14P Västergötland)', 'Nolhaga Ishall', 'Samling: kl 12:45'],
].map(([uid, s, e, sum, loc, d]) =>
  `BEGIN:VEVENT\r\nUID:${uid}@svl\r\nDTSTART;TZID=Europe/Stockholm:${s}\r\nDTEND;TZID=Europe/Stockholm:${e}\r\nSUMMARY:${sum}\r\nLOCATION:${loc}\r\nDESCRIPTION:${d}\r\nEND:VEVENT\r\n`).join(''), VTZ);

const GOOGLE = wrap('Peter',
  `BEGIN:VEVENT\r\nUID:g1\r\nDTSTART:20261005T060000Z\r\nDTEND:20261005T070000Z\r\nRRULE:FREQ=WEEKLY;BYDAY=MO\r\nSUMMARY:Padel\r\nEND:VEVENT\r\n` +
  `BEGIN:VEVENT\r\nUID:g2\r\nDTSTART:20261015T150000Z\r\nDTEND:20261015T160000Z\r\nSUMMARY:Skjutsa Ebbe tandläkare (16.50)\r\nEND:VEVENT\r\n`);

const HOLI = wrap('Helgdagar i Sverige',
  `BEGIN:VEVENT\r\nUID:h1\r\nDTSTART;VALUE=DATE:20261031\r\nDTEND;VALUE=DATE:20261101\r\nSUMMARY:Alla helgons dag\r\nEND:VEVENT\r\n` +
  `BEGIN:VEVENT\r\nUID:h2\r\nDTSTART;VALUE=DATE:20261031\r\nDTEND;VALUE=DATE:20261101\r\nSUMMARY:Halloween\r\nEND:VEVENT\r\n`);

const NOTES = wrap('Familjen',
  `BEGIN:VEVENT\r\nUID:n1\r\nDTSTART;VALUE=DATE:20261013\r\nDTEND;VALUE=DATE:20261014\r\nSUMMARY:Att göra: Lampor Ebbes cykel\r\nEND:VEVENT\r\n` +
  `BEGIN:VEVENT\r\nUID:n2\r\nDTSTART;VALUE=DATE:20261016\r\nDTEND;VALUE=DATE:20261017\r\nSUMMARY:Elliot matteprov kap 1\r\nEND:VEVENT\r\n`);

export const FIX = { ebbe: LAGET, elliot: SVL, peter: GOOGLE, holi: HOLI, notes: NOTES };

export const cfg = {
  weeksBack: 1, weeksAhead: 2,
  people: [
    { id: 'carina', name: 'Carina' }, { id: 'peter', name: 'Peter' },
    { id: 'elliot', name: 'Elliot' }, { id: 'ebbe', name: 'Ebbe' }, { id: 'elis', name: 'Elis' },
  ],
  feeds: [
    { id: 'ebbe', url: 'x', people: ['ebbe'], parser: 'laget', label: 'Hockey', dim: ['Lerums BK Röd'], ownTeam: 'Lerums BK' },
    { id: 'elliot', url: 'x', people: ['elliot'], parser: 'svenskalag', label: 'Hockey', ownTeam: 'Sörhaga/Alingsås' },
    { id: 'peter', url: 'x', people: ['peter'] },
    { id: 'holi', url: 'x', kind: 'holiday' },
    { id: 'notes', url: 'x', kind: 'notes' },
    { id: 'broken', url: 'x', people: ['elis'] },
  ],
  school: { elliot: { mon: '08:00-15:10', fri: '09:40-15:05' } },
  schoolBreaks: [{ from: '2026-10-26', to: '2026-10-30', label: 'Höstlov' }],
};

