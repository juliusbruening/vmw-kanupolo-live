// Parser für JoomLeague Kader-Seite (pro Team).
// Cells (gemäß Recon, 13 td):
//   [3]=Name, [5]=Alter (in Klammern), [6]=Gespielt, [7]=Gelb, [8]=Grün,
//   [9]=Rot, [10]=Rot-Ausschluss, [11]=Tore, [12]=Tore-Schnitt
// Liefert: { team, players: [...] }

import * as cheerio from 'cheerio';

export function parseKader(html) {
  const $ = cheerio.load(html);

  // "Kader: Vereinigung Märkischer Wanderpaddler Berlin [VMW] | Saison 2026 1. Bundesliga..."
  // → "Vereinigung Märkischer Wanderpaddler Berlin"
  const rawHead = $('.contentheading').first().text().trim();
  const team = rawHead
    .replace(/^Kader:\s*/, '')
    .replace(/\s*\[[^\]]+\].*$/, '')   // entfernt "[VMW] | Saison 2026 ..."
    .replace(/\s*\|.*$/, '')           // falls kein [..]: entfernt "| Saison ..."
    .trim();

  const players = [];
  $('tr.sectiontableentry1, tr.sectiontableentry2').each((_, tr) => {
    const $tr = $(tr);
    // Summenzeile ("insgesamt") überspringen — keine .playername darin.
    const $name = $tr.find('.playername');
    if (!$name.length) return;
    const name = $name.text().trim();
    if (!name) return;
    const $tds = $tr.children('td');
    const cellText = (i) => $tds.eq(i).text().replace(/\s|&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

    const ageRaw = cellText(5).replace(/[()]/g, '');
    const age = numOrNull(ageRaw);

    const games = numOrNull(cellText(6));
    const yellow = numOrNull(cellText(7));
    const green = numOrNull(cellText(8));
    const red = numOrNull(cellText(9));
    const redExcl = numOrNull(cellText(10));
    const goals = numOrNull(cellText(11));
    const goalsAvgRaw = cellText(12).replace(',', '.');
    const goalsAvg = isFinite(parseFloat(goalsAvgRaw)) ? parseFloat(goalsAvgRaw) : null;

    players.push({
      name,
      age,
      games,
      cards: { yellow, green, red, redExclusion: redExcl },
      goals,
      goalsAvg,
    });
  });

  return { team, players };
}

function numOrNull(s) {
  if (s === '' || s == null) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}
