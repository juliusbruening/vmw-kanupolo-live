// Erzeugt aus den fixtures/* HTMLs eine snapshot.json analog zur Live-Function.
// Praktisch fürs lokale Frontend-Preview ohne Netlify.
//
//   npm run preview:data

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSpielplan } from '../scraper/parseSpielplan.mjs';
import { parseTabelle } from '../scraper/parseTabelle.mjs';
import { parseKader } from '../scraper/parseKader.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const FIX = resolve(ROOT, 'fixtures');
const PUB = resolve(ROOT, 'public');

const BASE = 'https://bundesliga.kanupolo.de';

function absolutize(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  // In gespeicherten HTMLs ersetzt der Browser src durch lokale Pfade
  // ("./Ergebnisse_..._files/krm.jpg"). Wir extrahieren den letzten Dateinamen
  // und mappen auf die Live-Bilder, die unter /images/com_joomleague/...
  // oder /templates/... gehostet sind. Da wir den genauen Live-Pfad ohne
  // Live-Fetch nicht kennen, lassen wir es als data: oder Filename – das
  // Frontend rendert dann ein leeres Bild. Für die Preview reicht das.
  if (url.startsWith('./') || url.startsWith('/')) return null;
  return null;
}

function fixupSpielplanLogos(sp) {
  for (const sec of sp.sections) {
    for (const m of sec.matches) {
      m.home.logo = absolutize(m.home.logo);
      m.away.logo = absolutize(m.away.logo);
    }
  }
  return sp;
}
function fixupTabelleLogos(t) {
  for (const r of t.rows) r.logo = absolutize(r.logo);
  return t;
}

const spielplanHtml = readFileSync(resolve(FIX, 'spielplan_st1.html'), 'utf-8');
const tabelleHtml   = readFileSync(resolve(FIX, 'tabelle.html'), 'utf-8');
const kaderHtml     = readFileSync(resolve(FIX, 'kader_vmw.html'), 'utf-8');

const spielplan = fixupSpielplanLogos(parseSpielplan(spielplanHtml));
const tabelle   = fixupTabelleLogos(parseTabelle(tabelleHtml));
const kaderVmw  = parseKader(kaderHtml);

// VMW Spotlight: aus dem ST1-Spielplan VMW-Spiele extrahieren
const vmwMatches = [];
for (const sec of spielplan.sections) {
  for (const m of sec.matches) {
    if (m.home.name?.includes('Märkischer Wanderpaddler') ||
        m.away.name?.includes('Märkischer Wanderpaddler')) {
      vmwMatches.push({
        spieltag: spielplan.spieltag,
        spieltagNr: spielplan.spieltagNr,
        sectionHeader: sec.header,
        ...m,
        isHome: m.home.name?.includes('Märkischer Wanderpaddler'),
      });
    }
  }
}

const snapshot = {
  fetchedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  source: BASE,
  season: { projectId: '115', label: 'Saison 2026 — 1. Bundesliga Herren' },
  teams: spielplan.teams,
  spielplaene: [spielplan],          // nur ST1 in der lokalen Preview
  tabelle,
  kader: { 56: kaderVmw },           // nur VMW
  vmw: { teamName: 'Vereinigung Märkischer Wanderpaddler Berlin', matches: vmwMatches },
  errors: [],
  status: 'ok',
  _localPreview: true,
};

writeFileSync(resolve(PUB, 'data.json'), JSON.stringify(snapshot, null, 2), 'utf-8');
console.log(`✓ public/data.json geschrieben — ${(JSON.stringify(snapshot).length / 1024).toFixed(1)} KB`);
console.log(`  Teams: ${snapshot.teams.length}  •  ST1 Matches: ${spielplan.sections.reduce((a,s)=>a+s.matches.length,0)}  •  VMW-Matches: ${vmwMatches.length}`);
