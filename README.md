# VMW Kanupolo Live

Schlanke Web-App, die Spielplan, Tabelle und Kader der **1. Bundesliga Herren** von
[bundesliga.kanupolo.de](https://bundesliga.kanupolo.de) regelmäßig spiegelt und für
Familie, Freunde und den **VMW Berlin** in Vereinsfarben darstellt.

- Scraper: Node + cheerio (kein LLM, kein Headless-Browser)
- Storage: Netlify Blobs
- Frontend: Statisches HTML/CSS/JS, mobile-first, rot/weiß
- Hosting: Netlify Free Tier (Scheduled Functions + statische Seite)

## Projektstruktur

```
vmw-kanupolo-live/
├── netlify.toml                 # Netlify-Config
├── package.json
├── netlify/functions/
│   ├── scrape.mjs               # Scheduled Function, alle 15 Min
│   └── data.mjs                 # Read-Endpoint /api/data
├── scraper/
│   ├── fetch.mjs                # HTTP mit User-Agent + Retry
│   ├── parseSpielplan.mjs       # Ergebnisse/Spielplan je Spieltag
│   ├── parseTabelle.mjs         # Tabelle
│   ├── parseKader.mjs           # Kader pro Team
│   └── index.mjs                # Orchestrator (4 Spieltage + Tabelle + 12 Kader)
├── public/
│   ├── index.html               # Single-Page-App
│   ├── style.css                # VMW-Theme, mobile-first
│   ├── app.js                   # Vanilla-JS, pollt /api/data alle 60s
│   └── data.json                # nur lokal: vom preview-Skript erzeugt
├── fixtures/                    # gespeicherte Quell-HTMLs für Tests
└── scripts/
    ├── runLocal.mjs             # Parser gegen Fixtures testen
    ├── buildLocalSnapshot.mjs   # snapshot.json aus Fixtures bauen
    └── serveLocal.mjs           # Mini-Static-Server für /public
```

## Lokal testen

```bash
npm install
npm run test:parse          # Parser gegen Fixtures
npm run preview:data        # public/data.json aus Fixtures bauen
npm run preview             # Static-Server auf http://localhost:5173
```

## Deployment auf Netlify

1. **Repo anlegen**: Inhalt dieses Ordners in ein neues GitHub-Repo pushen
   (z.B. `julius-bruening/vmw-kanupolo-live`).
2. **Netlify-Account**: bei [netlify.com](https://netlify.com) anmelden
   (Free Tier reicht).
3. **Site importieren**: "Add new site" → "Import an existing project" →
   GitHub auswählen → Repo auswählen.
4. **Build-Settings** sind bereits in `netlify.toml` definiert
   (publish = `public`, functions = `netlify/functions`).
5. **Deploy**. Netlify erkennt automatisch die Scheduled Function und
   richtet den 15-Minuten-Cron ein.
6. **Erste Daten**: nach dem ersten erfolgreichen Cron-Lauf sind die Daten da.
   Du kannst die Function einmalig manuell triggern unter
   `https://app.netlify.com/sites/<site>/functions/scrape` → "Test function".

### Custom Domain (optional)

Standardmäßig läuft die Seite unter `<random>.netlify.app`. Wenn du z.B.
`kanupolo.vmw-berlin.de` willst:

1. In Netlify unter "Domain management" → Add custom domain
2. Beim Domain-Provider einen `CNAME` auf `<site>.netlify.app` setzen
3. Netlify stellt automatisch ein Let's-Encrypt-Zertifikat aus

## Architektur-Diagramm

```
[bundesliga.kanupolo.de]
        │ alle 15 Min
        ▼
[netlify/functions/scrape.mjs]
        │ schreibt
        ▼
[Netlify Blobs Store "data"]
        │ liest
        ▼
[netlify/functions/data.mjs] ← /api/data
        │
        ▼
[public/index.html] (statisches Frontend, pollt alle 60s)
```

## Was wenn die Quellseite ihr HTML ändert?

Die drei Parser zielen auf stabile Klassen (`sectiontableentry1|2`,
`rankingrow_*`, `playername`, `dtstart`, `score0`). Bei strukturellen
Änderungen sehen wir das im UI-Status-Bar als "fail" oder "stale" und in
den Function-Logs auf Netlify. Reparatur = Selektoren in den Parser-Modulen
nachziehen, danach erneut deployen.

## Quellen-Fairness

- Honester `User-Agent` mit Verweis auf VMW Berlin
- Aggressives Caching (15-Min-Snapshots), keine Live-Hammering der Quelle
- Quellverlinkung im Footer
- Empfehlung: kurze Mail an den Webmaster der Bundesliga-Seite, dass die
  Daten gespiegelt werden — meistens kein Thema, aber sauber.

## Lizenz

Privat / Vereinszweck. Daten sind Eigentum der jeweiligen Liga / des DKV.
