// Netlify Scheduled Function — läuft alle 15 Min an Wochenenden.
// Holt einen Snapshot, schreibt ihn in den Netlify-Blob "data".
// Wir scrapen nur Sa+So, weil Bundesliga-Spieltage immer am Wochenende stattfinden.
// Spart ~70% Cron-Läufe und schont die Quelle.

import { getStore } from '@netlify/blobs';
import { buildSnapshot } from '../../scraper/index.mjs';

export default async () => {
  console.log('[scrape] start');
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

// Cron alle 15 Minuten — nur Samstag (6) und Sonntag (0), UTC.
// Cron-Syntax: minute hour day-of-month month day-of-week
export const config = {
  schedule: '*/15 * * * 6,0',
};
