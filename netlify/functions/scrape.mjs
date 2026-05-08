// Netlify Scheduled Function — läuft alle 15 Min via config.schedule.
// Holt einen Snapshot, schreibt ihn in den Netlify-Blob "data".

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

// Cron alle 15 Minuten (UTC), Netlify v2 Function-Format
export const config = {
  schedule: '*/15 * * * *',
};
