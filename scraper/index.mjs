// Orchestrator: holt alle Quellseiten, parst sie, liefert ein Snapshot-Objekt.
//   - Spielplan/Ergebnisse je Spieltag (4×)
//   - Tabelle (1×)
//   - Kader je Team (12×)
// Total ~17 HTTP-Requests pro Lauf — bei 15-min-Intervall ~68/h, vertretbar.

import { fetchHtml } from './fetch.mjs';
import { parseSpielplan } from './parseSpielplan.mjs';
import { parseTabelle } from './parseTabelle.mjs';
import { parseKader } from './parseKader.mjs';

const BASE = 'https://bundesliga.kanupolo.de';
const PROJECT_ID = '115';                   // Saison 2026 1. BL Herren
const ROUND_IDS = [295, 296, 297, 298];     // Spieltage 1-4
const SEASON_PATH = '1-bundesliga-herren';
const TABELLE_URL = `${BASE}/index.php/${SEASON_PATH}/tabelle`;
const VMW_TEAM_NAME = 'Vereinigung Märkischer Wanderpaddler Berlin';

function spielplanUrl(roundId) {
  return `${BASE}/index.php/${SEASON_PATH}/spielplan/results/${PROJECT_ID}/${roundId}/0/0/0/0`;
}

function rosterUrl(seasonSlug, teamId, teamSlug) {
  return `${BASE}/index.php/${SEASON_PATH}/tabelle/roster/${seasonSlug}/${teamId}-${teamSlug}/0`;
}

// Bilder/Logos in der Quelle sind relativ. Wir mappen sie auf absolute URLs.
function absolutize(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return BASE + url;
  // "./Ergebnisse_..._files/krm.jpg" oder "templates/.../images/foo.png"
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

  // 1) Spielpläne (parallel, eine Anfrage pro Spieltag)
  const spielplaeneRaw = await Promise.all(
    ROUND_IDS.map((rid, i) => safe(`spielplan ST${i + 1}`, async () => {
      const html = await fetchHtml(spielplanUrl(rid));
      return fixupSpielplanLogos(parseSpielplan(html));
    }))
  );
  const spielplaene = spielplaeneRaw.filter(Boolean);

  // 2) Team-Liste vereinen (aus allen Spieltagen)
  const teamMap = new Map();
  for (const sp of spielplaene) {
    for (const t of (sp.teams || [])) {
      if (!teamMap.has(t.id)) teamMap.set(t.id, t);
    }
  }
  const teams = Array.from(teamMap.values());

  // 3) Tabelle
  const tabelle = await safe('tabelle', async () => {
    const html = await fetchHtml(TABELLE_URL);
    return fixupTabelleLogos(parseTabelle(html));
  });

  // 4) Kader für jedes Team (parallel, kleine Concurrency-Begrenzung)
  const kader = {};
  await Promise.all(teams.map((t) => safe(`kader ${t.id}`, async () => {
    const html = await fetchHtml(rosterUrl(t.seasonSlug, t.id, t.slug));
    kader[t.id] = parseKader(html);
  })));

  // 5) VMW-Spotlight: alle Matches mit VMW im Team-Namen extrahieren
  const vmwMatches = [];
  for (const sp of spielplaene) {
    for (const sec of sp.sections) {
      for (const m of sec.matches) {
        if (m.home.name?.includes('Märkischer Wanderpaddler') ||
            m.away.name?.includes('Märkischer Wanderpaddler')) {
          vmwMatches.push({
            spieltag: sp.spieltag,
            spieltagNr: sp.spieltagNr,
            sectionHeader: sec.header,
            ...m,
            isHome: m.home.name?.includes('Märkischer Wanderpaddler'),
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
