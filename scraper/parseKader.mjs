// Parser für JoomLeague Kader-Seite (pro Team).
// Cells (verifiziert anhand der Live-Daten nach ST1 2026):
//   [0-5]= Spielerbereich (Trikotnummer, Foto, Land, Name, leer, Alter)
//   [6]= Spiele
//   [7]= unbekannt (in den Daten immer 0, vermutlich Einsatzminuten) — ignoriert
//   [8]= Grüne Karten
//   [9]= Tore
//   [10]= Gelbe Karten (vermutet, in den Daten noch 0)
//   [11]= Rote Karten (inkl. Ausschluss; vermutet, in den Daten noch 0)
//   [12]= Tore-Schnitt
//
// Falls bei späteren Spieltagen Gelb/Rot vertauscht aussehen,
// einfach Indices [10] und [11] in dieser Datei tauschen.

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
    const green = numOrNull(cellText(8));
    const goals = numOrNull(cellText(9));
    const yellow = numOrNull(cellText(10));
    const red = numOrNull(cellText(11));
    const goalsAvgRaw = cellText(12).replace(',', '.');
    const goalsAvg = isFinite(parseFloat(goalsAvgRaw)) ? parseFloat(goalsAvgRaw) : null;

    players.push({
      name,
      age,
      games,
      goals,
      goalsAvg,
      cards: { green, yellow, red, redExclusion: 0 },
    });
  });

  return { team, players };
}

function numOrNull(s) {
  if (s === '' || s == null) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}
