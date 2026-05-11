// Parser für JoomLeague Kader-Seite (pro Team).
// Spalten-Reihenfolge (verifiziert anhand des Live-HTML-Headers nach ST1 2026):
//   Spieler (5 td breit) | Alter | Spiele | Tore | Grüne Karte | Gelbe Karte | Rote Karte | Rote Karte (Ausschluss) | Tore-∅
// Daraus folgt für die td-Indices in der Datenzeile:
//   [3]=Name, [5]=Alter (in Klammern)
//   [6]=Spiele, [7]=Tore, [8]=Grüne, [9]=Gelbe, [10]=Rote, [11]=Rote-Ausschluss, [12]=Tore-∅

import * as cheerio from 'cheerio';

export function parseKader(html) {
  const $ = cheerio.load(html);

  const rawHead = $('.contentheading').first().text().trim();
  const team = rawHead
    .replace(/^Kader:\s*/, '')
    .replace(/\s*\[[^\]]+\].*$/, '')
    .replace(/\s*\|.*$/, '')
    .trim();

  const players = [];
  $('tr.sectiontableentry1, tr.sectiontableentry2').each((_, tr) => {
    const $tr = $(tr);
    const $name = $tr.find('.playername');
    if (!$name.length) return;
    const name = $name.text().trim();
    if (!name) return;
    const $tds = $tr.children('td');
    const cellText = (i) => $tds.eq(i).text().replace(/\s|&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

    const ageRaw = cellText(5).replace(/[()]/g, '');
    const age = numOrNull(ageRaw);

    const games = numOrNull(cellText(6));
    const goals = numOrNull(cellText(7));
    const green = numOrNull(cellText(8));
    const yellow = numOrNull(cellText(9));
    const red = numOrNull(cellText(10));
    const redExcl = numOrNull(cellText(11));
    const goalsAvgRaw = cellText(12).replace(',', '.');
    const goalsAvg = isFinite(parseFloat(goalsAvgRaw)) ? parseFloat(goalsAvgRaw) : null;

    players.push({
      name,
      age,
      games,
      goals,
      goalsAvg,
      cards: { green, yellow, red, redExclusion: redExcl },
    });
  });

  return { team, players };
}

function numOrNull(s) {
  if (s === '' || s == null) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}
