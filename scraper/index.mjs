// Orchestrator: holt alle Quellseiten PARALLEL, parst sie, liefert ein Snapshot.
// Wichtig: Alle 6 HTTP-Requests laufen gleichzeitig, damit selbst bei 25s
// pro Request das 30s-Limit der Netlify Scheduled Function eingehalten wird.

import { fetchHtml } from './fetch.mjs';
import { parseSpielplan } from './parseSpielplan.mjs';
import { parseTabelle } from './parseTabelle.mjs';
import { parseKader } from './parseKader.mjs';

const BASE = 'https://bundesliga.kanupolo.de';
const PROJECT_ID = '115';
const SEASON_SLUG = '115-herren-1-liga-regulaere-saison-2026';
const SEASON_PATH = '1-bundesliga-herren';
const ROUND_IDS = [295, 296, 297, 298];
const VMW_TEAM_ID = '56';
const VMW_TEAM_SLUG = 'vereinigung-maerkischer-wanderpaddler-berlin';
const VMW_TEAM_NAME = 'Vereinigung Märkischer Wanderpaddler Berlin';
const VMW_NAME_FRAGMENT = 'Märkischer Wanderpaddler';

const TABELLE_URL = `${BASE}/index.php/${SEASON_PATH}/tabelle`;
const VMW_KADER_URL = `${BASE}/index.php/${SEASON_PATH}/tabelle/roster/${SEASON_SLUG}/${VMW_TEAM_ID}-${VMW_TEAM_SLUG}/0`;
const SPIELPLAN_URLS = ROUND_IDS.map((rid) => ({
  rid,
  url: `${BASE}/index.php/${SEASON_PATH}/spielplan/results/${PROJECT_ID}/${rid}/0/0/0/0`,
}));

function absolutize(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return BASE + url;
  return BASE + '/' + url.replace(/^\.?\//, '');
}

function fixupSpielplanLogos(spielplan) {
  for (const sec of spielplan.sections) {
    for (const m of sec.matches) {
      m.home.logo = absolutize(m.home.logo);
      m.away.logo = absolutize(m.away.logo);
    }
  }
  return spielplan;
}

function fixupTabelleLogos(tabelle) {
  for (const r of tabelle.rows) r.logo = absolutize(r.logo);
  return tabelle;
}

export async function buildSnapshot({ logger = console } = {}) {
  const startedAt = new Date().toISOString();
  const errors = [];
  const safe = async (label, fn) => {
    try { return await fn(); }
    catch (err) {
      errors.push({ step: label, message: String(err?.message || err) });
      logger.warn(`! ${label} failed:`, err.message);
      return null;
    }
  };

  // ALLE Requests parallel — das ist der Schlüssel für die 30s-Grenze
  const tasks = [
    ...SPIELPLAN_URLS.map(({ rid, url }, i) =>
      safe(`spielplan ST${i + 1}`, async () => {
        const html = await fetchHtml(url);
        return fixupSpielplanLogos(parseSpielplan(html));
      })
    ),
    safe('tabelle', async () => {
      const html = await fetchHtml(TABELLE_URL);
      return fixupTabelleLogos(parseTabelle(html));
    }),
    safe('kader VMW', async () => {
      const html = await fetchHtml(VMW_KADER_URL);
      return parseKader(html);
    }),
  ];

  const results = await Promise.all(tasks);
  const spielplaene = results.slice(0, 4).filter(Boolean);
  const tabelle = results[4];
  const kaderVmw = results[5];

  // Team-Liste aus Spielplänen ableiten
  const teamMap = new Map();
  for (const sp of spielplaene) {
    for (const t of (sp.teams || [])) {
      if (!teamMap.has(t.id)) teamMap.set(t.id, t);
    }
  }
  const teams = Array.from(teamMap.values());

  // Kader-Map
  const kader = {};
  if (kaderVmw) kader[VMW_TEAM_ID] = kaderVmw;

  // VMW-Spotlight
  const vmwMatches = [];
  for (const sp of spielplaene) {
    for (const sec of sp.sections) {
      for (const m of sec.matches) {
        if (m.home.name?.includes(VMW_NAME_FRAGMENT) ||
            m.away.name?.includes(VMW_NAME_FRAGMENT)) {
          vmwMatches.push({
            spieltag: sp.spieltag,
            spieltagNr: sp.spieltagNr,
            sectionHeader: sec.header,
            ...m,
            isHome: m.home.name?.includes(VMW_NAME_FRAGMENT),
          });
        }
      }
    }
  }

  return {
    fetchedAt: startedAt,
    finishedAt: new Date().toISOString(),
    source: BASE,
    season: { projectId: PROJECT_ID, label: 'Saison 2026 — 1. Bundesliga Herren' },
    teams,
    spielplaene,
    tabelle,
    kader,
    vmw: { teamName: VMW_TEAM_NAME, matches: vmwMatches },
    errors,
    status: errors.length === 0 ? 'ok' : (spielplaene.length === 0 ? 'failed' : 'partial'),
  };
}
