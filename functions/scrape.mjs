// Netlify Scheduled Function — Cron feuert alle 15 Min, scrapen findet
// aber nur statt:
//   1) An Spieltagen (laut Liste), 8-20 Uhr Berlin-Zeit
//   2) In der Woche vor einem Spieltag: Mo-Fr um ca. 16 Uhr Berlin-Zeit
// Sonst Quick-Exit (~50ms, vernachlässigbarer Credit-Verbrauch).
//
// Bei Saisonwechsel: SPIELTAGE-Liste unten aktualisieren.

import { getStore } from '@netlify/blobs';
import { buildSnapshot } from '../../scraper/index.mjs';

const SPIELTAGE = [
  { start: '2026-05-09', end: '2026-05-10', label: 'ST1' },
  { start: '2026-06-06', end: '2026-06-07', label: 'ST2' },
  { start: '2026-06-27', end: '2026-06-28', label: 'ST3' },
  { start: '2026-07-18', end: '2026-07-19', label: 'ST4' },
  { start: '2026-08-13', end: '2026-08-16', label: 'DM' },
];

const WEEKDAYS_MO_FR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Liefert das aktuelle Datum/Uhrzeit in Berlin-Zeit als strukturiertes Objekt.
// Wichtig: Netlify-Crons laufen in UTC, wir müssen lokal interpretieren,
// damit Sommer-/Winterzeit-Wechsel automatisch korrekt sind.
function berlinNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(now).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: parseInt(parts.hour, 10),
    minute: parseInt(parts.minute, 10),
    weekday: parts.weekday,
  };
}

export function shouldScrapeNow(now = new Date()) {
  const t = berlinNow(now);

  // Case 1: Heute ist Spieltag, Uhrzeit 8-20
  for (const st of SPIELTAGE) {
    if (t.date >= st.start && t.date <= st.end && t.hour >= 8 && t.hour < 20) {
      return { yes: true, reason: `Spieltag ${st.label} live (${t.date} ${t.hour}:${String(t.minute).padStart(2, '0')})` };
    }
  }

  // Case 2: Mo-Fr ca. 16 Uhr (Cron feuert zur vollen Viertelstunde →
  // Minute < 15 fängt den :00-Tick), und nächster Samstag ist Spieltag
  if (WEEKDAYS_MO_FR.includes(t.weekday) && t.hour === 16 && t.minute < 15) {
    const dayIdx = DAY_NAMES.indexOf(t.weekday);
    const daysUntilSat = ((6 - dayIdx) + 7) % 7 || 7;
    const baseDate = new Date(`${t.date}T00:00:00Z`);
    baseDate.setUTCDate(baseDate.getUTCDate() + daysUntilSat);
    const nextSatStr = baseDate.toISOString().slice(0, 10);

    for (const st of SPIELTAGE) {
      if (nextSatStr >= st.start && nextSatStr <= st.end) {
        return { yes: true, reason: `Pre-${st.label}-Check (nächstes Sa: ${nextSatStr})` };
      }
    }
  }

  return { yes: false, reason: `${t.date} ${t.weekday} ${t.hour}:${String(t.minute).padStart(2, '0')} — keine relevante Zeit` };
}

export default async () => {
  const decision = shouldScrapeNow();
  if (!decision.yes) {
    console.log(`[scrape] skip — ${decision.reason}`);
    return new Response('skipped: ' + decision.reason, { status: 200 });
  }

  console.log(`[scrape] start — ${decision.reason}`);
  const snapshot = await buildSnapshot();

  const store = getStore('data');
  await store.setJSON('snapshot.json', snapshot);
  await store.setJSON('meta.json', {
    fetchedAt: snapshot.fetchedAt,
    finishedAt: snapshot.finishedAt,
    status: snapshot.status,
    errors: snapshot.errors,
  });

  console.log(`[scrape] done status=${snapshot.status} errors=${snapshot.errors.length}`);
  return new Response('ok', { status: 200 });
};

// Cron alle 15 Min, ganzjährig. Die eigentliche Filterung passiert in der Function.
export const config = {
  schedule: '*/15 * * * *',
};
