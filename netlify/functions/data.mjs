// Netlify Function — liefert das aktuelle Snapshot-JSON aus den Blobs aus.
// Frontend pollt periodisch /.netlify/functions/data und tauscht den Inhalt aus.
// Cache-Header sorgt dafür, dass CDN das Ergebnis kurz hält → wenig Function-Aufrufe.

import { getStore } from '@netlify/blobs';

export default async () => {
  const store = getStore('data');
  const snap = await store.get('snapshot.json', { type: 'json' });

  if (!snap) {
    return new Response(
      JSON.stringify({ status: 'cold', message: 'Noch kein Scrape gelaufen.' }),
      { status: 503, headers: { 'content-type': 'application/json; charset=utf-8' } }
    );
  }

  return new Response(JSON.stringify(snap), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60, stale-while-revalidate=600',
    },
  });
};
