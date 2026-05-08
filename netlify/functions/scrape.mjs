// Netlify Scheduled Function — läuft alle 15 Min via netlify.toml-Schedule.
// Holt einen Snapshot, schreibt ihn in den Netlify-Blob "data".

import { schedule } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { buildSnapshot } from '../../scraper/index.mjs';

const handler = async () => {
  console.log('[scrape] start');
  const snapshot = await buildSnapshot();

  const store = getStore('data');
  await store.setJSON('snapshot.json', snapshot);
  // Auch ein ETag-artiger Mini-Datensatz für schnelle Polls
  await store.setJSON('meta.json', {
    fetchedAt: snapshot.fetchedAt,
    finishedAt: snapshot.finishedAt,
    status: snapshot.status,
    errors: snapshot.errors,
  });

  console.log(`[scrape] done status=${snapshot.status} errors=${snapshot.errors.length}`);
  return { statusCode: 200, body: `ok status=${snapshot.status}` };
};

// Cron alle 15 Minuten, läuft in UTC
export default schedule('*/15 * * * *', handler);
