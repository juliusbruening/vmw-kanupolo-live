// HTTP-Fetcher mit ehrlichem User-Agent und kurzem Timeout.
// Keine Retries, weil Netlify Scheduled Functions auf Free Tier
// nur 30s Laufzeit haben — wir brauchen Fail-Fast statt Hängen.

const UA = 'VMW-Kanupolo-Live/0.1 (+https://vmw-berlin.de; mirror for club members)';
const DEFAULT_TIMEOUT_MS = 8000;

export async function fetchHtml(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
      },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
