// HTTP-Fetcher mit ehrlichem User-Agent, Retry und Timeout.
// Wird von der Netlify Scheduled Function genutzt. Wir identifizieren uns
// als VMW-Mirror, damit der Webmaster der Quellseite uns ggf. zuordnen kann.

const UA = 'VMW-Kanupolo-Live/0.1 (+https://vmw-berlin.de; mirror for club members)';
const DEFAULT_TIMEOUT_MS = 20000;

export async function fetchHtml(url, { retries = 2, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
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
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        await sleep(500 * Math.pow(2, attempt));
      }
    }
  }
  throw lastErr;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
