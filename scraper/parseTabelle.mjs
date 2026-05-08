// Parser für JoomLeague Tabellen-Seite.
// Liefert: { rows: [ { rank, lastRank, team, logo, played, won, drawn, lost,
//                     points, goalsFor, goalsAgainst, goalDiff } ] }

import * as cheerio from 'cheerio';

export function parseTabelle(html) {
  const $ = cheerio.load(html);

  const rows = [];
  $('tr.sectiontableentry1, tr.sectiontableentry2').each((_, tr) => {
    const $tr = $(tr);

    // Bevorzugt klassenbasiert
    const rankRaw = $tr.find('.rankingrow_rank').text().trim();
    const lastRankRaw = $tr.find('.rankingrow_lastrank').text().replace(/[()]/g, '').trim();
    const team = $tr.find('.rankingrow_teamname').text().trim();
    const logo = $tr.find('.rankingrow_logo img').attr('src') || null;

    // Zell-basiert für die übrigen Spalten (siehe Header-Reihenfolge:
    // Platz, [logo], Mannschaft, Spiele, S, U, N, Punkte, T+, T-, +/-).
    // td.rankingrow_played / .rankingrow_points sind klassiert; S/U/N/T+/T-/+/-
    // hängen wir per Index ab — Cells gemäß Recon (14 td):
    //   [6]=Spiele, [7]=S, [8]=U, [9]=N, [10]=Punkte, [11]=T+, [12]=T-, [13]=+/-
    const $tds = $tr.children('td');
    const cellText = (i) => $tds.eq(i).text().replace(/\s|&nbsp;/g, '').trim();

    const played = numOrNull(cellText(6));
    const won = numOrNull(cellText(7));
    const drawn = numOrNull(cellText(8));
    const lost = numOrNull(cellText(9));
    const points = numOrNull(cellText(10));
    const goalsFor = numOrNull(cellText(11));
    const goalsAgainst = numOrNull(cellText(12));
    const goalDiff = signedOrNull(cellText(13));

    rows.push({
      rank: rankRaw === '-' ? null : numOrNull(rankRaw),
      lastRank: lastRankRaw ? numOrNull(lastRankRaw) : null,
      team,
      logo,
      played, won, drawn, lost,
      points, goalsFor, goalsAgainst, goalDiff,
    });
  });

  return { rows };
}

function numOrNull(s) {
  if (s === '' || s == null) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function signedOrNull(s) {
  if (s === '' || s == null) return null;
  const n = parseInt(s.replace(/[+]/, ''), 10);
  return Number.isFinite(n) ? n : null;
}
