/* VMW Kanupolo Live — Frontend
   Lädt Snapshot von /api/data (Production) oder /data.json (lokal).
   Re-fetch alle 60s und beim Tab-Reaktivieren. */

const VMW_NAME_FRAGMENT = 'Märkischer Wanderpaddler';
const POLL_MS = 60_000;
const DATA_URLS = ['/api/data', './data.json'];

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
  loadData();
  setInterval(loadData, POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadData();
  });
});

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
    // bevorzugt aktiver/letzter Spieltag mit gespielten Spielen, sonst der erste
    const withGames = [...data.spielplaene].reverse().find((s) => hasPlayedGame(s));
    state.selectedSpieltagNr = withGames?.spieltagNr ?? data.spielplaene[0].spieltagNr ?? 1;
  }
  renderAll();
  updateStatus();
}

function hasPlayedGame(sp) {
  return (sp.sections || []).some((sec) => sec.matches.some((m) => m.played));
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

/* ───────── VMW Spotlight ───────── */

function renderVmwSpotlight() {
  const container = document.getElementById('vmwSpotlight');
  const matches = state.snapshot?.vmw?.matches ?? [];
  if (!matches.length) {
    container.innerHTML = '<p class="placeholder">Keine VMW-Spiele im Snapshot.</p>';
    return;
  }
  // Letztes gespieltes Spiel + nächstes nicht-gespieltes
  const played = matches.filter((m) => m.played);
  const upcoming = matches.filter((m) => !m.played);
  const last = played[played.length - 1] || null;
  const next = upcoming[0] || null;

  let html = '';
  if (next) {
    html += `<div class="spotlight-block">
      <h3>Nächstes Spiel</h3>
      ${renderSpotlightMatch(next)}
    </div>`;
  }
  if (last) {
    html += `<div class="spotlight-block">
      <h3>Letztes Spiel</h3>
      ${renderSpotlightMatch(last)}
    </div>`;
  }
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

/* ───────── Tabelle ───────── */

function renderTabelle() {
  const tbody = document.querySelector('#tabelleTable tbody');
  const rows = state.snapshot?.tabelle?.rows ?? [];
  if (!rows.length) { tbody.innerHTML = ''; return; }
  tbody.innerHTML = rows.map((r, i) => `
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

/* ───────── Spielplan ───────── */

function renderSpielplanTabs() {
  const wrap = document.getElementById('spielplanTabs');
  const sps = state.snapshot?.spielplaene ?? [];
  wrap.innerHTML = sps.map((sp) => {
    const active = sp.spieltagNr === state.selectedSpieltagNr ? 'active' : '';
    const label = `${sp.spieltagNr}. ST`;
    return `<button class="tab-btn ${active}" data-spieltag="${sp.spieltagNr}">${label}</button>`;
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
  if (!html) html = '<p class="placeholder">Keine VMW-Spiele an diesem Spieltag.</p>';
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

/* ───────── Kader VMW ───────── */

function renderKader() {
  const tbody = document.querySelector('#kaderTable tbody');
  const kader = findVmwKader();
  if (!kader) { tbody.innerHTML = ''; return; }
  // Sortierung: Spiele desc → Tore desc → Tore-Schnitt desc → Name
  const sorted = [...kader.players].sort((a, b) =>
    (b.games ?? 0) - (a.games ?? 0)
    || (b.goals ?? 0) - (a.goals ?? 0)
    || (b.goalsAvg ?? 0) - (a.goalsAvg ?? 0)
    || a.name.localeCompare(b.name, 'de')
  );
  tbody.innerHTML = sorted.map((p) => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td class="num">${p.age ?? '–'}</td>
      <td class="num">${p.games ?? 0}</td>
      <td class="num">${p.goals ?? 0}</td>
      <td class="num">${(p.goalsAvg ?? 0).toFixed(2).replace('.', ',')}</td>
      <td class="num">${p.cards?.yellow ?? 0}</td>
      <td class="num">${(p.cards?.red ?? 0) + (p.cards?.redExclusion ?? 0)}</td>
    </tr>
  `).join('');
}

function findVmwKader() {
  const kaderMap = state.snapshot?.kader ?? {};
  for (const k of Object.values(kaderMap)) {
    if (k && isVmw(k.team)) return k;
  }
  return null;
}

/* ───────── Utils ───────── */

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
