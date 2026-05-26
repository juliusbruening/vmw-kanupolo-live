// Parser für JoomLeague Ergebnisse-/Spielplan-Seiten
// Erwartet das HTML einer Results-Seite und liefert ein strukturiertes Objekt:
//   { spieltag: "1. Spieltag", sections: [ { header, matches: [...] } ] }
//
// Robustheits-Strategie: Wir hangeln uns an stabilen Klassen entlang
// (sectiontableheader / sectiontableentry1|2 / dtstart / score0 / teamlogo).

import * as cheerio from 'cheerio';

const TEAM_NAME_RE = /<span style="padding:2px;">([^<]+)<\/span>/;

export function parseSpielplan(html) {
  const $ = cheerio.load(html);

  // contentheading[1] = "Spieltagergebnisse - 1. Spieltag (09.05.2026 - 10.05.2026)"
  // → Spieltag-Nr und Datumsbereich extrahieren.
  const headingRange = $('.contentheading').eq(1).text().replace(/\s+/g, ' ').trim();
  const stMatch = headingRange.match(/(\d+)\.\s*Spieltag/);
  const spieltag = stMatch ? `${stMatch[1]}. Spieltag` : null;
  const spieltagNr = stMatch ? parseInt(stMatch[1], 10) : null;
  const dateRangeMatch = headingRange.match(/\(([^)]+)\)/);
  const dateRange = dateRangeMatch ? dateRangeMatch[1].trim() : null;

  // Section-Liste: jede sectiontableheader öffnet eine Section,
  // alle folgenden sectiontableentry-Zeilen gehören dazu, bis der nächste
  // Header kommt.
  const sections = [];
  let current = null;

  // Wir laufen über alle <tr>-Geschwister derselben Tabelle.
  // Da auf der Seite nur EINE solche Tabelle existiert, reicht
  // ein globales Suchen über alle <tr>.
  $('tr').each((_, tr) => {
    const $tr = $(tr);
    if ($tr.hasClass('sectiontableheader')) {
      const headerText = $tr.text().replace(/\s+/g, ' ').trim();
      // z.B. "Samstag, 09.05.2026 - 1. Spieltag"
      current = { header: headerText, matches: [] };
      sections.push(current);
      return;
    }
    if ($tr.hasClass('sectiontableentry1') || $tr.hasClass('sectiontableentry2')) {
      if (!current) return; // sollte nicht passieren, aber safe
      const match = parseMatchRow($, $tr);
      if (match) current.matches.push(match);
    }
  });

  // Aus den Roster-Links eine eindeutige Team-Liste ableiten
  // Pattern: /spielplan/roster/115-{seasonSlug}/{teamId}-{teamSlug}/0
  const teams = new Map();
  $('a[href*="/roster/"]').each((_, a) => {
    const href = $(a).attr('href');
    const m = href.match(/\/roster\/(\d+-[^/]+)\/(\d+)-([^/]+)\/0/);
    if (!m) return;
    const seasonSlug = m[1];
    const teamId = m[2];
    const slug = m[3];
    // title liegt auf dem <img> innerhalb des <a>
    const rawTitle = $(a).find('img').attr('title') || $(a).attr('title') || '';
    const name = rawTitle.replace(/^Kader\s+/, '').trim() || null;
    if (!teams.has(teamId)) teams.set(teamId, { id: teamId, slug, name, seasonSlug });
  });

  return {
    spieltag, spieltagNr, dateRange, headingRange,
    sections,
    teams: Array.from(teams.values()),
  };
}

function parseMatchRow($, $tr) {
  // Zellen aufgreifen
  const $kos = $tr.find('td.ko');
  // ko[0] = Match-Nr, ko[1] = events-icon, ko[2] = enthält dtstart (Zeit)
  const matchNr = $kos.eq(0).text().trim();

  const time = $tr.find('abbr.dtstart').text().trim();

  // Heimteam (right) + Auswärtsteam (left)
  const $home = $tr.find('td.right').first();
  const $away = $tr.find('td.left').first();

  const homeName = textFromTeamCell($home);
  const awayName = textFromTeamCell($away);

  // Logos: erstes teamlogo = home, zweites = away
  const $logos = $tr.find('img.teamlogo');
  const homeLogo = normalizeLogoUrl($logos.eq(0).attr('src'));
  const awayLogo = normalizeLogoUrl($logos.eq(1).attr('src'));

  // Score: span.score0 enthält "_-_" (ungespielt) oder "X-Y"
  const scoreRaw = $tr.find('span.score0').first().text().replace(/\s|&nbsp;/g, '').trim();
  const score = parseScore(scoreRaw);

  // Schiedsrichter
  const referees = $tr.find('td.referees').text().replace(/\s+/g, ' ').trim() || null;

  // Spiel-ID extrahieren — aus Klick-IDs g{matchId}t{teamId}p{projectId}
  const onclick = $home.find('a').attr('onclick') || '';
  const matchIdMatch = onclick.match(/g(\d+)t/);
  const matchId = matchIdMatch ? matchIdMatch[1] : null;

  return {
    matchId,
    matchNr: matchNr || null,
    time: time || null,
    home: { name: homeName, logo: homeLogo },
    away: { name: awayName, logo: awayLogo },
    score,             // { home: 5, away: 3 } oder null wenn nicht gespielt
    played: !!score,
    referees,
  };
}

function textFromTeamCell($cell) {
  // <a><span style="padding:2px;">Teamname</span></a>
  const span = $cell.find('span[style*="padding:2px"]').first();
  if (span.length) return span.text().trim();
  return $cell.find('a').first().text().trim();
}

function normalizeLogoUrl(src) {
  if (!src) return null;
  // Bei gespeicherten HTMLs steht "./Ergebnisse_..._files/krm.jpg",
  // im Live-HTML steht ein relativer Joomla-Pfad. Wir behalten den letzten
  // Dateinamen für lokale Tests bei und mappen später beim Scraping
  // auf die volle URL.
  return src;
}

function parseScore(raw) {
  if (!raw || raw.includes('_')) return null;
  const m = raw.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (!m) return null;
  return { home: parseInt(m[1], 10), away: parseInt(m[2], 10) };
}
