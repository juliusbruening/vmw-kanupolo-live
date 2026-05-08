// Orchestrator: holt alle Quellseiten, parst sie, liefert ein Snapshot-Objekt.
//   - Spielplan/Ergebnisse je Spieltag (4×)
//   - Tabelle (1×)
//   - Kader VMW Berlin (1×)
// Total ~6 HTTP-Requests pro Lauf.

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
const VMW_NAME_FRAGMENT = 'Märkischer Wanderpaddler';

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

  // 4) Nur VMW-Kader scrapen — Frontend zeigt aktuell ausschließlich VMW.
  // Wenn du später Gegner-Kader/Statistiken willst, hier die Liste erweitern.
  const kader = {};
  const vmwTeam = teams.find((t) => t.name?.includes(VMW_NAME_FRAGMENT));
  if (vmwTeam) {
    await safe(`kader VMW (${vmwTeam.id})`, async () => {
      const html = await fetchHtml(rosterUrl(vmwTeam.seasonSlug, vmwTeam.id, vmwTeam.slug));
      kader[vmwTeam.id] = parseKader(html);
    });
  } else {
    errors.push({ step: 'kader VMW', message: 'VMW-Team nicht in Spielplan-Daten gefunden' });
  }

  // 5) VMW-Spotlight: alle Matches mit VMW im Team-Namen extrahieren
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
