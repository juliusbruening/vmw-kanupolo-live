// Lokaler Test: liest die Fixtures aus /fixtures, parst und schreibt JSON.
// Aufruf:  npm run test:parse

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSpielplan } from '../scraper/parseSpielplan.mjs';
import { parseTabelle } from '../scraper/parseTabelle.mjs';
import { parseKader } from '../scraper/parseKader.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const FIX = resolve(ROOT, 'fixtures');
const OUT = resolve(ROOT, 'fixtures', 'out');
mkdirSync(OUT, { recursive: true });

const cases = [
  { name: 'spielplan', file: 'spielplan_st1.html', parser: parseSpielplan },
  { name: 'tabelle',   file: 'tabelle.html',       parser: parseTabelle },
  { name: 'kader_vmw', file: 'kader_vmw.html',     parser: parseKader },
];

let allOk = true;
for (const c of cases) {
  const html = readFileSync(resolve(FIX, c.file), 'utf-8');
  const t0 = performance.now();
  let parsed;
  try {
    parsed = c.parser(html);
  } catch (err) {
    console.error(`✗ ${c.name}: parse error:`, err.message);
    allOk = false;
    continue;
  }
  const ms = (performance.now() - t0).toFixed(1);
  const json = JSON.stringify(parsed, null, 2);
  writeFileSync(resolve(OUT, `${c.name}.json`), json, 'utf-8');
  console.log(`✓ ${c.name}: parsed in ${ms} ms → fixtures/out/${c.name}.json (${json.length} bytes)`);
  // Kurze Inhalts-Sanity-Checks
  if (c.name === 'spielplan') {
    const total = (parsed.sections || []).reduce((a, s) => a + s.matches.length, 0);
    console.log(`    Spieltag: "${parsed.spieltag}"  •  Sections: ${parsed.sections.length}  •  Matches: ${total}`);
  } else if (c.name === 'tabelle') {
    console.log(`    Teams: ${parsed.rows.length}  •  Top: ${parsed.rows[0]?.team ?? 'n/a'}`);
  } else if (c.name === 'kader_vmw') {
    console.log(`    Team: ${parsed.team}  •  Spieler: ${parsed.players.length}`);
  }
}

if (!allOk) process.exit(1);
console.log('\nAlle drei Parser laufen sauber.');
