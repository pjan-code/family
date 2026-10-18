# Familjekalender

En statisk väggkalender för surfplattan. En GitHub Action hämtar familjens kalenderflöden
var 15:e minut, tolkar dem, krypterar resultatet och publicerar på GitHub Pages.

```
iCal-flöden ──► Action (sync/sync.mjs) ──► data.enc.json (AES-256-GCM) ──► GitHub Pages
                                                                  ▲
                         surfplattan: index.html#k=<nyckel> ──────┘  dekrypterar i webbläsaren
```

**Säkerhet i korthet**

- Kalenderadresserna finns bara i secret `CALENDAR_CONFIG`. De ligger aldrig i koden, och läckvakten i workflowen stoppar en push som innehåller något som liknar en adress.
- Den publicerade datan är krypterad. Nyckeln finns i secret `FAMILY_KEY` och i bokmärket efter `#`, och delen efter `#` skickas aldrig till någon server.
- Workflowen körs bara på schema, vid push till `main` och manuellt, aldrig på pull requests.

## Engångsuppsättning

1. **Pages:** *Settings → Pages → Build and deployment → Source:* **GitHub Actions**.
2. **Actions:** *Settings → Actions → General → Fork pull request workflows:* **Require approval for all outside collaborators**.
3. **Nyckel:** kör `npm run key`. Lägg nyckeln som secret **`FAMILY_KEY`** (*Settings → Secrets and variables → Actions*) och spara länken som skrivs ut.
4. **Konfig:** lägg hela JSON-konfigen (se nedan) som secret **`CALENDAR_CONFIG`**.
5. **Kör:** *Actions → Synka och publicera → Run workflow*. Öppna sedan länken med `#k=…` på surfplattan och lägg den på hemskärmen.

## Konfig (`CALENDAR_CONFIG`)

Se `config.example.json` för formatet. Fält per flöde:

| Fält | Betydelse |
|---|---|
| `id` | Kort unikt namn |
| `url` | iCal-adress (`webcal://` går också bra) |
| `people` | Vilka händelserna gäller, t.ex. `["ebbe"]` |
| `parser` | `laget`, `svenskalag` eller utelämnad (generisk/Google) |
| `label` | Liten etikett på kortet, t.ex. "Hockey" |
| `ownTeam` | Regex för det egna laget, så att matchtitlar kortas till "Match mot X (borta)" |
| `dim` / `hide` | Regex-listor på originaltiteln: tona ner eller dölj (t.ex. det andra lagets matcher) |
| `kind` | `holiday` (helgdagar), `notes` (delad familjekalender) eller utelämnad |
| `matchPeople` | `false` stänger av namnmatchning i titlar |

- **Namn i titlar:** "Skjutsa Ebbe tandläkare" i Peters kalender visas också på Ebbe.
- **Samling i parentes:** "Ebbe hockey (16.50)" ger en samlingsrad.
- **Delad kalender med `kind: notes`:** heldagshändelser som börjar med "Att göra:" hamnar under *Att göra*, övriga under *Anteckningar*.
- **`school` / `schoolBreaks`:** fast veckoschema per barn som pausas på lov och röda dagar.

Ändrar du konfigen uppdaterar du bara secreten. Ingen kod behöver ändras.

## Lokalt

```bash
npm ci
npm test                                   # tolkningstester
FAMILY_KEY=<nyckel> npm run sync:local      # läser config.local.json (gitignorerad)
npm run serve                              # http://localhost:8080/#k=<nyckel>
```

## Byta nyckel

Kör `npm run key`, uppdatera secret `FAMILY_KEY`, kör workflowen och uppdatera bokmärket på surfplattan.

## Drift

- Faller ett flöde bort återanvänds dess senast kända händelser, och sidan visar "1 källa svarar inte".
- Statusraden blir röd om datan är äldre än 2 timmar.
- `keepalive.yml` återaktiverar schemat en gång i månaden. GitHub pausar annars schemalagda körningar i publika repon efter 60 dagar utan aktivitet.
