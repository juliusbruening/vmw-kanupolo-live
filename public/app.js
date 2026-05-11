/* VMW Kanupolo Live — Frontend
   Lädt Snapshot von /api/data (Production) oder /data.json (lokal).
   Re-fetch alle 60s und beim Tab-Reaktivieren. */

const VMW_NAME_FRAGMENT = 'Märkischer Wanderpaddler';
const POLL_MS = 60_000;
const DATA_URLS = ['/api/data', './data.json'];
const SOON_WINDOW_DAYS = 7;

const state = {
  snapshot: null,
  selectedSpieltagNr: null,
  vmwOnly: false,
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refreshBtn').addEventListener('click', () => loadData(true));
  document.getElementById('vmwFilter').addEventListener('change', (e) => {
    state.vmwOnly = e.target.checked;
    renderSpielplan();
  });
  setupContactLink();
  loadData();
  setInterval(loadData, POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadData();
  });
});

// Email wird erst zur Laufzeit zusammengesetzt — Spam-Bots ohne JS-Ausführung
// sehen die Adresse nie im HTML-Quelltext.
function setupContactLink() {
  const link = document.getElementById('contactLink');
  if (!link) return;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const local = 'juliusbruening1994';
    const domain = ['gmail', 'com'].join('.');
    const subject = encodeURIComponent('VMW-Kanupolo-Live · Anfrage');
    window.location.href = `mailto:${local}@${domain}?subject=${subject}`;
  });
}

async function loadData(userTriggered = false) {
  const btn = document.getElementById('refreshBtn');
  if (userTriggered) btn.classList.add('spinning');
  let data = null, lastErr = null;
  for (const url of DATA_URLS) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) { lastErr = new Error(`${url}: ${res.status}`); continue; }
      data = await res.json();
      break;
    } catch (err) { lastErr = err; }
  }
  btn.classList.remove('spinning');
  if (!data) {
    setStatus('fail', 'Daten nicht erreichbar: ' + (lastErr?.message || 'unbekannter Fehler'));
    return;
  }
  state.snapshot = data;
  if (state.selectedSpieltagNr == null && data.spielplaene?.length) {
    state.selectedSpieltagNr = pickDefaultSpieltag(data.spielplaene);
  }
  renderAll();
  updateStatus();
}

// Smart-Default: aktueller / unmittelbar bevorstehender Spieltag bevorzugt.
// Ablauf: 1) heute im Date-Range? → den 2) nächster innerhalb 7 Tage? → den
//         3) zuletzt gespielter? → den   4) sonst der nächste in der Zukunft
//         5) Fallback: erster Spieltag
function pickDefaultSpieltag(spielplaene) {
  if (!spielplaene?.length) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const enriched = spielplaene.map((sp) => ({ sp, ...parseDateRange(sp.dateRange) }));

  const current = enriched.find((e) => e.start && e.end && today >= e.start && today <= e.end);
  if (current) return current.sp.spieltagNr;

  const upcoming = enriched
    .filter((e) => e.start && e.start > today)
    .sort((a, b) => a.start - b.start);
  const soon = upcoming.find((e) => (e.start - today) / 86400000 <= SOON_WINDOW_DAYS);
  if (soon) return soon.sp.spieltagNr;

  const past = enriched
    .filter((e) => e.end && e.end < today)
    .sort((a, b) => b.end - a.end);
  if (past[0]) return past[0].sp.spieltagNr;

  if (upcoming[0]) return upcoming[0].sp.spieltagNr;
  return spielplaene[0].spieltagNr ?? 1;
}

function parseDateRange(range) {
  if (!range) return { start: null, end: null };
  const dates = range.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/g);
  if (!dates) return { start: null, end: null };
  const toDate = (s) => {
    const [d, m, y] = s.split('.');
    return new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T00:00:00`);
  };
  return { start: toDate(dates[0]), end: toDate(dates[dates.length - 1]) };
}

function isVmw(name) {
  return !!name && name.includes(VMW_NAME_FRAGMENT);
}

function setStatus(kind, text) {
  const bar = document.getElementById('statusBar');
  const txt = document.getElementById('statusText');
  bar.classList.remove('ok', 'stale', 'fail');
  bar.classList.add(kind);
  txt.textContent = text;
}

function updateStatus() {
  const s = state.snapshot;
  if (!s) return;
  const ageMs = Date.now() - new Date(s.fetchedAt).getTime();
  const ageMin = Math.max(0, Math.round(ageMs / 60000));
  const stale = ageMin > 30;
  const failed = s.status === 'failed';
  const partial = s.status === 'partial' || s.errors?.length > 0;
  const kind = failed ? 'fail' : (stale || partial ? 'stale' : 'ok');
  const ageText = ageMin === 0 ? 'gerade aktualisiert' : `aktualisiert vor ${ageMin} Min`;
  const errText = s.errors?.length ? ` · ${s.errors.length} Fehler` : '';
  setStatus(kind, `${ageText}${errText}`);
}

function renderAll() {
  renderVmwSpotlight();
  renderTabelle();
  renderSpielplanTabs();
  renderSpielplan();
  renderKader();
}

function renderVmwSpotlight() {
  const container = document.getElementById('vmwSpotlight');
  const matches = state.snapshot?.vmw?.matches ?? [];
  if (!matches.length) {
    container.innerHTML = '<p class="placeholder">Keine VMW-Spiele im Snapshot.</p>';
    return;
  }
  const played = matches.filter((m) => m.played);
  const upcoming = matches.filter((m) => !m.played);
  const last = played[played.length - 1] || null;
  const next = upcoming[0] || null;

  let html = '';
  if (next) html += `<div class="spotlight-block"><h3>Nächstes Spiel</h3>${renderSpotlightMatch(next)}</div>`;
  if (last) html += `<div class="spotlight-block"><h3>Letztes Spiel</h3>${renderSpotlightMatch(last)}</div>`;
  if (!next && !last) html = '<p class="placeholder">Keine VMW-Spiele gefunden.</p>';
  container.innerHTML = html;
}

function renderSpotlightMatch(m) {
  const cls = m.played ? 'is-played' : '';
  const meta = `${m.spieltag} · ${m.sectionHeader} · ${m.time ?? ''}`.trim();
  return `<div class="spotlight-match ${cls}">
    <div class="team"><img alt="" src="${m.home.logo || ''}"><span class="name">${escapeHtml(m.home.name)}</span></div>
    <div class="score">${formatScore(m)}</div>
    <div class="team right"><span class="name">${escapeHtml(m.away.name)}</span><img alt="" src="${m.away.logo || ''}"></div>
  </div>
  <div class="meta">${escapeHtml(meta)}</div>`;
}

function formatScore(m) {
  if (!m.score) return '— : —';
  return `${m.score.home} : ${m.score.away}`;
}

function renderTabelle() {
  const tbody = document.querySelector('#tabelleTable tbody');
  const rows = state.snapshot?.tabelle?.rows ?? [];
  if (!rows.length) { tbody.innerHTML = ''; return; }
  tbody.innerHTML = rows.map((r) => `
    <tr class="${isVmw(r.team) ? 'is-vmw' : ''}">
      <td class="num">${r.rank ?? '-'}</td>
      <td>${escapeHtml(r.team)}</td>
      <td class="num">${r.played ?? 0}</td>
      <td class="num">${r.won ?? 0}</td>
      <td class="num">${r.drawn ?? 0}</td>
      <td class="num">${r.lost ?? 0}</td>
      <td class="num"><strong>${r.points ?? 0}</strong></td>
      <td class="num">${formatDiff(r.goalDiff, r.goalsFor, r.goalsAgainst)}</td>
    </tr>
  `).join('');
}

function formatDiff(diff, gf, ga) {
  if (diff == null && gf == null && ga == null) return '—';
  const sign = diff > 0 ? '+' : '';
  const d = (diff != null) ? `${sign}${diff}` : '0';
  if (gf != null && ga != null) return `${gf}:${ga} (${d})`;
  return d;
}

function renderSpielplanTabs() {
  const wrap = document.getElementById('spielplanTabs');
  const sps = state.snapshot?.spielplaene ?? [];
  wrap.innerHTML = sps.map((sp) => {
    const active = sp.spieltagNr === state.selectedSpieltagNr ? 'active' : '';
    return `<button class="tab-btn ${active}" data-spieltag="${sp.spieltagNr}">${sp.spieltagNr}. ST</button>`;
  }).join('');
  wrap.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedSpieltagNr = Number(btn.dataset.spieltag);
      renderSpielplanTabs();
      renderSpielplan();
    });
  });
}

function renderSpielplan() {
  const body = document.getElementById('spielplanBody');
  const sps = state.snapshot?.spielplaene ?? [];
  const sp = sps.find((s) => s.spieltagNr === state.selectedSpieltagNr) || sps[0];
  if (!sp) { body.innerHTML = '<p class="placeholder">Keine Spielplan-Daten.</p>'; return; }

  let html = '';
  for (const sec of sp.sections) {
    const matches = state.vmwOnly
      ? sec.matches.filter((m) => isVmw(m.home.name) || isVmw(m.away.name))
      : sec.matches;
    if (state.vmwOnly && matches.length === 0) continue;
    html += `<div class="section-header">${escapeHtml(sec.header)}</div>`;
    html += matches.map(renderMatchRow).join('');
  }
  if (!html) html = '<p class="placeholder">Keine Spiele an diesem Spieltag (vielleicht stehen die Daten in der Quelle noch nicht).</p>';
  body.innerHTML = html;
}

function renderMatchRow(m) {
  const vmw = isVmw(m.home.name) || isVmw(m.away.name);
  const cls = `match-row ${m.played ? 'played' : 'not-played'} ${vmw ? 'is-vmw' : ''}`;
  let scoreCls = '';
  if (m.played && vmw) {
    const vmwIsHome = isVmw(m.home.name);
    const vmwScore = vmwIsHome ? m.score.home : m.score.away;
    const oppScore = vmwIsHome ? m.score.away : m.score.home;
    scoreCls = vmwScore > oppScore ? 'win' : vmwScore < oppScore ? 'loss' : 'draw';
  }
  return `<div class="${cls}">
    <div class="time">${escapeHtml(m.time || '')}</div>
    <div class="team home"><img alt="" src="${m.home.logo || ''}"><span class="name">${escapeHtml(m.home.name)}</span></div>
    <div class="score ${scoreCls}">${formatScore(m)}</div>
    <div class="team away"><span class="name">${escapeHtml(m.away.name)}</span><img alt="" src="${m.away.logo || ''}"></div>
  </div>`;
}

function renderKader() {
  const tbody = document.querySelector('#kaderTable tbody');
  const kader = findVmwKader();
  if (!kader) { tbody.innerHTML = ''; return; }
  const sorted = [...kader.players].sort((a, b) =>
    (b.games ?? 0) - (a.games ?? 0)
    || (b.goals ?? 0) - (a.goals ?? 0)
    || (b.goalsAvg ?? 0) - (a.goalsAvg ?? 0)
    || a.name.localeCompare(b.name, 'de')
  );
  tbody.innerHTML = sorted.map((p) => {
    const red = (p.cards?.red ?? 0) + (p.cards?.redExclusion ?? 0);
    return `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td class="num">${p.age ?? '–'}</td>
      <td class="num">${p.games ?? 0}</td>
      <td class="num">${p.goals ?? 0}</td>
      <td class="num">${(p.goalsAvg ?? 0).toFixed(2).replace('.', ',')}</td>
      <td class="num card-cell card-gr">${p.cards?.green ?? 0}</td>
      <td class="num card-cell card-ge">${p.cards?.yellow ?? 0}</td>
      <td class="num card-cell card-ro">${red}</td>
    </tr>`;
  }).join('');
}

function findVmwKader() {
  const kaderMap = state.snapshot?.kader ?? {};
  for (const k of Object.values(kaderMap)) {
    if (k && isVmw(k.team)) return k;
  }
  return null;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
