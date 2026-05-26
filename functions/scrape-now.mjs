// Manueller Trigger für den Scrape — per HTTP aufrufbar.
// URL: https://<deine-site>.netlify.app/.netlify/functions/scrape-now
// Macht das Gleiche wie die scheduled-Funktion, ist aber per Browser-Aufruf
// jederzeit auslösbar.

import { getStore } from '@netlify/blobs';
import { buildSnapshot } from '../../scraper/index.mjs';

export default async () => {
  console.log('[scrape-now] start');
  const snapshot = await buildSnapshot();

  const store = getStore('data');
  await store.setJSON('snapshot.json', snapshot);
  await store.setJSON('meta.json', {
    fetchedAt: snapshot.fetchedAt,
    finishedAt: snapshot.finishedAt,
    status: snapshot.status,
    errors: snapshot.errors,
  });

  console.log(`[scrape-now] done status=${snapshot.status} errors=${snapshot.errors.length}`);
  return new Response(
    JSON.stringify({
      ok: true,
      status: snapshot.status,
      errors: snapshot.errors,
      fetchedAt: snapshot.fetchedAt,
      teams: snapshot.teams.length,
      spielplaene: snapshot.spielplaene.length,
    }, null, 2),
    {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }
  );
};
