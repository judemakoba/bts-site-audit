'use strict';

// ── DEBUG ──────────────────────────────────────────────────────────────────
console.log('[BTS] app.js loaded at', new Date().toISOString());

// ── Config ──────────────────────────────────────────────────────────────────
const API = '/api';

// ── Session banner CSS injection (for old index.html without static banner) ──────
(function injectSessionBannerStyle() {
  if (!document.getElementById('bts-session-banner-style')) {
    const style = document.createElement('style');
    style.id = 'bts-session-banner-style';
    style.textContent = [
      '.session-banner { background: #fef3c7; border-bottom: 1px solid #f59e0b; color: #92400e; padding: 8px 1.5rem; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 8px; }',
      '.session-banner.hidden { display: none !important; }',
    ].join('\n');
    document.head.appendChild(style);
  }
})();

// ── State ───────────────────────────────────────────────────────────────────
let token   = localStorage.getItem('bts_token') || '';
let user    = JSON.parse(localStorage.getItem('bts_user') || 'null');
let allSites = [];
let allUsers = [];

// ── Init ────────────────────────────────────────────────────────────────────
async function init() {
  console.log('[BTS] init() running');
  try { setupForms(); console.log('[BTS] setupForms OK'); } catch(e) { console.error('[BTS] setupForms FAILED:', e); }
  try { setupEventDelegation(); console.log('[BTS] setupEventDelegation OK'); } catch(e) { console.error('[BTS] setupEventDelegation FAILED:', e); }
  if (token && user) {
    // Validate the stored token before showing the dashboard
    // to avoid silent 401 → logout → login loop
    try {
      const res = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        showDashboard();
      } else {
        // Token invalid/expired — clear and go to login
        logout();
        showLogin();
        const errEl = document.getElementById('login-error');
        errEl.textContent = 'Your session expired. Please log in again.';
        errEl.classList.remove('hidden');
      }
    } catch {
      // Network error — show dashboard anyway; real API calls will show banners
      showDashboard();
    }
  } else {
    showLogin();
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('login-screen').classList.add('active');
  document.getElementById('dashboard-screen').classList.remove('active');
}

function showDashboard() {
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('dashboard-screen').classList.add('active');
  document.getElementById('user-name').textContent = user.name;
  document.getElementById('role-badge').textContent = user.role;
  document.getElementById('email').value = user.email;
  // Clear any stale session error banner
  const banner = document.getElementById('session-error-banner');
  if (banner) banner.classList.add('hidden');
  // Clear stale login error
  document.getElementById('login-error').classList.add('hidden');
  refreshAll();
}

function logout() {
  token = '';
  user = null;
  localStorage.removeItem('bts_token');
  localStorage.removeItem('bts_user');
  showLogin();
}

function setupForms() {
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    console.log('[BTS] login-form submit fired!');
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const btn = document.getElementById('login-btn');
    const errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      token = data.token;
      user = data.user;
      localStorage.setItem('bts_token', token);
      localStorage.setItem('bts_user', JSON.stringify(user));
      showDashboard();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });

  document.getElementById('site-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id       = document.getElementById('site-id').value;
    const siteId   = document.getElementById('site-siteId').value.trim();
    const siteName = document.getElementById('site-siteName').value.trim();
    const atcNo    = document.getElementById('site-atcNo').value.trim();
    const cluster  = document.getElementById('site-cluster').value.trim();
    const lat      = document.getElementById('site-latitude').value;
    const lng      = document.getElementById('site-longitude').value;
    const address  = document.getElementById('site-address').value.trim();
    const sel      = document.getElementById('site-assigned');
    const assigned = Array.from(sel.selectedOptions).map(o => o.value);

    const payload = { siteId, siteName, atcNo, cluster, latitude: lat, longitude: lng, address, assignedUsers: assigned };
    const errEl = document.getElementById('site-modal-error');
    errEl.classList.add('hidden');

    try {
      const url = id ? `${API}/sites/${id}` : `${API}/sites`;
      const res = await fetch(url, {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      closeSiteModal();
      toast('Site saved!', 'success');
      loadSites();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  document.getElementById('eng-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name     = document.getElementById('eng-name').value.trim();
    const email    = document.getElementById('eng-email').value.trim();
    const password = document.getElementById('eng-password').value;
    const errEl = document.getElementById('eng-modal-error');
    errEl.classList.add('hidden');
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, email, password, role: 'engineer' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      closeEngModal();
      toast('Engineer added!', 'success');
      loadUsers();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ── API Helper ───────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    // Signal session expiry — let the caller handle the UI update before we logout.
    // Throwing a named error lets callers distinguish 401 from other failures.
    const err = new Error('SESSION_EXPIRED');
    err.code = 'SESSION_EXPIRED';
    throw err;
  }
  return res;
}

// ── Refresh All ───────────────────────────────────────────────────────────────
async function refreshAll() {
  const results = await Promise.allSettled([loadHealth(), loadSites(), loadUsers(), loadReviewPending(), loadDrafts()]);
  const sessionExpired = results.some(r =>
    r.status === 'rejected' && r.reason?.code === 'SESSION_EXPIRED'
  );
  if (sessionExpired) {
    const banner = document.getElementById('session-error-banner');
    if (banner) {
      banner.textContent = '⚠️ Your session has expired. Click "Re-login" to log in again.';
      banner.classList.remove('hidden');
    }
    // Don't call logout() here — let the user see the dashboard with the warning banner
    // They can click Re-login to clear everything
    return;
  }
  const failures = results.filter(r => r.status === 'rejected');
  if (failures.length > 0) {
    const banner = document.getElementById('session-error-banner');
    if (banner) {
      banner.textContent = '⚠️ Failed to load some data. Check your connection and refresh.';
      banner.classList.remove('hidden');
    }
  }
  // Update badges after all loads complete
  updateReviewBadge();
  updateDraftsBadge();
}

// ── Health / Overview ────────────────────────────────────────────────────────
async function loadHealth() {
  try {
    const res = await fetch(`${API}/health`);
    const d = await res.json();
    document.getElementById('stat-users').textContent    = d.users;
    document.getElementById('stat-sites').textContent    = d.sites;
    document.getElementById('stat-ground').textContent   = d.groundEquipment;
    document.getElementById('stat-dcdb').textContent    = d.dcdbRecords;
    document.getElementById('stat-tower').textContent   = d.towerEquipment;
    document.getElementById('stat-photos').textContent  = d.photos;
  } catch { /* silent */ }
}

// ── Sites ────────────────────────────────────────────────────────────────────
async function loadSites() {
  const res = await apiFetch('/sites');
  const { sites } = await res.json();
  allSites = sites;
  renderSites(sites);
  populateReportSelect(sites);
  populateAssignedSelect();
  console.log('[BTS] loadSites OK:', sites.length, 'sites');
}

function renderSites(sites) {
  const tbody = document.getElementById('sites-tbody');
  if (!sites.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);padding:24px">No sites yet. Click "Add Site" to create one.</td></tr>';
    return;
  }
  tbody.innerHTML = sites.map(s => `
    <tr>
      <td><code>${esc(s.siteId)}</code></td>
      <td>${esc(s.siteName || '—')}</td>
      <td>${esc(s.atcNo || '—')}</td>
      <td>${esc(s.cluster || '—')}</td>
      <td><span class="status-badge ${s.status === 'active' ? 'status-active' : 'status-inactive'}">${s.status || 'active'}</span></td>
      <td>${(s.assignedUsers || []).length}</td>
      <td>
        <button class="btn-icon" title="Edit" data-action="edit" data-id="${s.id}">✏️</button>
        <button class="btn-icon" title="Delete" data-action="delete" data-id="${s.id}">🗑️</button>
      </td>
    </tr>
  `).join('');
}

// ── Site Modal ────────────────────────────────────────────────────────────────
function openSiteModal(site = null) {
  document.getElementById('site-modal').classList.remove('hidden');
  document.getElementById('site-modal-title').textContent = site ? 'Edit Site' : 'Add Site';
  document.getElementById('site-form').reset();
  document.getElementById('site-id').value = site?.id || '';
  document.getElementById('site-siteId').value = site?.siteId || '';
  document.getElementById('site-siteName').value = site?.siteName || '';
  document.getElementById('site-atcNo').value = site?.atcNo || '';
  document.getElementById('site-cluster').value = site?.cluster || '';
  document.getElementById('site-latitude').value = site?.latitude || '';
  document.getElementById('site-longitude').value = site?.longitude || '';
  document.getElementById('site-address').value = site?.address || '';
  document.getElementById('site-modal-error').classList.add('hidden');
  document.getElementById('site-siteId').disabled = !!site; // lock siteId on edit

  // populate engineer list
  const sel = document.getElementById('site-assigned');
  sel.innerHTML = allUsers
    .filter(u => u.role === 'engineer')
    .map(u => `<option value="${u.id}" ${(site?.assignedUsers || []).includes(u.id) ? 'selected' : ''}>${esc(u.name)} (${esc(u.email)})</option>`)
    .join('');
}

function closeSiteModal() {
  document.getElementById('site-modal').classList.add('hidden');
  document.getElementById('site-siteId').disabled = false;
}

async function editSite(id) {
  const s = allSites.find(x => x.id === id);
  if (s) openSiteModal(s);
}

async function deleteSite(id) {
  const s = allSites.find(x => x.id === id);
  if (!confirm(`Delete site "${s?.siteId}"? This cannot be undone.`)) return;
  try {
    const res = await apiFetch(`/sites/${id}`, { method: 'DELETE' });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error);
    toast('Site deleted', 'success');
    loadSites();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── Users / Engineers ────────────────────────────────────────────────────────
async function loadUsers() {
  try {
    const res = await apiFetch('/users');
    const { engineers } = await res.json();
    allUsers = engineers;
    renderUsers(engineers);
  } catch (e) {
    if (e?.code === 'SESSION_EXPIRED') throw e; // re-throw so caller can handle
    /* non-admin may not have /users — silently skip */
  }
}

function renderUsers(users) {
  const tbody = document.getElementById('eng-tbody');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);padding:24px">No engineers yet.</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${esc(u.name)}</td>
      <td><a href="mailto:${esc(u.email)}">${esc(u.email)}</a></td>
      <td><span class="status-badge ${u.role === 'admin' ? 'status-active' : 'status-inactive'}">${u.role}</span></td>
      <td>
        ${u.id !== user?.id ? `<button class="btn-icon" title="Remove" data-action="delete" data-id="${u.id}" data-email="${esc(u.email)}">🗑️</button>` : ''}
      </td>
    </tr>
  `).join('');
}

async function deleteUser(id, email) {
  if (!confirm(`Remove engineer "${email}"? Their audit data will remain but they won't be able to log in.`)) return;
  try {
    const res = await apiFetch(`/users/${id}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
    toast('Engineer removed', 'success');
    loadUsers();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function openEngModal() {
  document.getElementById('eng-modal').classList.remove('hidden');
  document.getElementById('eng-form').reset();
  document.getElementById('eng-modal-error').classList.add('hidden');
}

function closeEngModal() {
  document.getElementById('eng-modal').classList.add('hidden');
}

// ── Reports ──────────────────────────────────────────────────────────────────
function populateReportSelect(sites) {
  const sel = document.getElementById('report-site-select');
  sel.innerHTML = '<option value="">— Choose a site —</option>' +
    sites.map(s => `<option value="${esc(s.siteId)}">${esc(s.siteId)} — ${esc(s.siteName || s.siteId)}</option>`).join('');
  document.getElementById('report-summary').classList.add('hidden');
  document.getElementById('download-report-btn').disabled = true;
}

async function loadSiteSummary() {
  const siteId = document.getElementById('report-site-select').value;
  const summary = document.getElementById('report-summary');
  if (!siteId) { summary.classList.add('hidden'); document.getElementById('download-report-btn').disabled = true; return; }
  try {
    const res = await apiFetch(`/audit/site/${siteId}`);
    if (!res.ok) throw new Error((await res.json()).error);
    const d = await res.json();
    summary.classList.remove('hidden');
    summary.innerHTML = `
      <div class="report-summary-grid">
        <div class="report-stat"><div class="val">${d.groundEquipment?.length || 0}</div><div class="lbl">Ground Equipment</div></div>
        <div class="report-stat"><div class="val">${d.dcdbRecords?.length || 0}</div><div class="lbl">DCDB Records</div></div>
        <div class="report-stat"><div class="val">${d.towerEquipment?.length || 0}</div><div class="lbl">Tower Equipment</div></div>
      </div>
      <p style="font-size:12px;color:var(--text-secondary)">Site: <strong>${esc(d.site?.siteName || siteId)}</strong> &nbsp;|&nbsp; ATC: ${esc(d.site?.atcNo || '—')} &nbsp;|&nbsp; Cluster: ${esc(d.site?.cluster || '—')}</p>
    `;
    document.getElementById('download-report-btn').disabled = false;
  } catch (err) {
    summary.innerHTML = `<p class="error-msg">${err.message}</p>`;
    summary.classList.remove('hidden');
    document.getElementById('download-report-btn').disabled = true;
  }
}

async function downloadReport() {
  const siteId = document.getElementById('report-site-select').value;
  if (!siteId) return;
  const btn = document.getElementById('download-report-btn');
  btn.disabled = true;
  btn.textContent = 'Generating…';
  try {
    const res = await fetch(`${API}/report/excel?siteId=${encodeURIComponent(siteId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Report failed'); }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BTS_Audit_${siteId}_${fmtDate(new Date())}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Report downloaded!', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '📥 Download Excel Report';
  }
}

// ── Navigation ───────────────────────────────────────────────────────────────
async function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`view-${name}`)?.classList.add('active');
  document.querySelector(`.nav-item[data-view="${name}"]`)?.classList.add('active');

  const showSessionBanner = (msg) => {
    const banner = document.getElementById('session-error-banner');
    if (banner) { banner.textContent = msg; banner.classList.remove('hidden'); }
  };

  if (name === 'overview') {
    await loadHealth().catch(() => {});
  }
  if (name === 'sites') {
    try {
      await loadSites();
    } catch (e) {
      console.error('[BTS] loadSites failed:', e?.code, e?.message, e);
      if (e?.code === 'SESSION_EXPIRED') showSessionBanner('⚠️ Session expired — click "Re-login" to log in again.');
      else showSessionBanner('⚠️ Failed to load sites. Check your connection.');
    }
  }
  if (name === 'engineers') {
    try {
      await loadUsers();
    } catch (e) {
      console.error('[BTS] loadUsers failed:', e?.code, e?.message, e);
      if (e?.code === 'SESSION_EXPIRED') showSessionBanner('⚠️ Session expired — click "Re-login" to log in again.');
      else showSessionBanner('⚠️ Failed to load engineers. Check your connection.');
    }
  }
  if (name === 'review') {
    await loadReviewPending().catch(() => {});
    updateReviewBadge();
  }
  if (name === 'drafts') {
    await loadDrafts().catch(() => {});
    updateDraftsBadge();
  }
}

// ── Review ───────────────────────────────────────────────────────────────────
let reviewFilter = 'all';
let reviewData = {};

let draftsFilter = 'all';
let draftsData = { drafts: {}, inProgress: {} };

async function loadReviewPending() {
  const list = document.getElementById('review-pending-list');
  list.innerHTML = '<div class="card"><p class="loading">Loading submitted reports...</p></div>';
  try {
    const res = await apiFetch('/audit/review/pending');
    if (!res.ok) throw new Error((await res.json()).error);
    reviewData = await res.json();
    renderReviewPending();
    updateReviewBadge();
  } catch (err) {
    list.innerHTML = `<div class="card"><p class="error-msg">Failed to load: ${esc(err.message)}</p></div>`;
  }
}

function updateReviewBadge() {
  const total = (reviewData.ground?.length || 0) + (reviewData.dcdb?.length || 0) + (reviewData.tower?.length || 0);
  const badge = document.getElementById('review-count-badge');
  if (!badge) return;
  if (total > 0) {
    badge.textContent = total;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function renderReviewPending() {
  const list = document.getElementById('review-pending-list');
  const filter = reviewFilter;
  const ground = filter === 'all' || filter === 'ground' ? (reviewData.ground || []) : [];
  const dcdb    = filter === 'all' || filter === 'dcdb'    ? (reviewData.dcdb    || []) : [];
  const tower   = filter === 'all' || filter === 'tower'   ? (reviewData.tower   || []) : [];

  const sections = [
    { label: 'Ground Equipment', type: 'ground', records: ground, color: '#f59e0b' },
    { label: 'DCDB Records',    type: 'dcdb',   records: dcdb,    color: '#3b82f6' },
    { label: 'Tower Equipment', type: 'tower',  records: tower,   color: '#8b5cf6' },
  ];

  const allEmpty = sections.every(s => !s.records.length);
  if (allEmpty) {
    list.innerHTML = `<div class="card" style="text-align:center;padding:2rem;color:var(--text-secondary)">No submitted reports pending review.</div>`;
    return;
  }

  list.innerHTML = sections.filter(s => s.records.length).map(s => `
    <div class="review-section">
      <h3 style="color:${s.color};margin:1.5rem 0 0.75rem">${s.label} (${s.records.length})</h3>
      ${s.records.map(r => `
        <div class="review-card">
          <div class="review-card-header">
            <div>
              <strong style="font-size:15px">${esc(r.site?.siteName || r.siteId)}</strong>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">
                Site: <code>${esc(r.siteId)}</code> &nbsp;|&nbsp;
                Engineer: ${esc(r.user?.name || 'Unknown')} &nbsp;|&nbsp;
                ${fmtDate(r.updatedAt || r.createdAt)}
              </div>
            </div>
            <div class="flex-row" style="gap:0.4rem;flex-shrink:0">
              <button class="btn-success btn-sm" data-review-action="approve" data-type="${s.type}" data-id="${r.id}">✅ Approve</button>
              <button class="btn-danger btn-sm" data-review-action="reject" data-type="${s.type}" data-id="${r.id}">❌ Reject</button>
            </div>
          </div>
          <div class="review-card-body">${renderRecordSummary(r, s.type)}</div>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function renderRecordSummary(record, type) {
  if (type === 'ground') {
    return `<span>${esc(record.towerType || record.towerType || 'Ground Equipment')}</span>`;
  }
  if (type === 'dcdb') {
    return `<span>DCDB Record — ${record.siteId}</span>`;
  }
  if (type === 'tower') {
    return `<span>${esc(record.antennaManufacturer || '')} ${esc(record.antennaModel || '')} — ${esc(record.siteId)}</span>`;
  }
  return `<span>—</span>`;
}

async function approveRecord(type, id) {
  try {
    const res = await apiFetch(`/audit/review/${type}/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ action: 'approve' }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    toast('Report approved!', 'success');
    await loadReviewPending();
  } catch (err) {
    toast(err.message, 'error');
  }
}

let pendingReject = null; // { type, id }

async function rejectRecord() {
  if (!pendingReject) return;
  const reason = document.getElementById('reject-reason-input')?.value?.trim() || 'No reason provided';
  const { type, id } = pendingReject;
  pendingReject = null;
  closeRejectModal();
  try {
    const res = await apiFetch(`/audit/review/${type}/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ action: 'reject', rejectionReason: reason }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    toast('Report rejected — engineer will be notified.', 'success');
    await loadReviewPending();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function showRejectModal(type, id) {
  pendingReject = { type, id };
  const modal = document.getElementById('reject-modal');
  document.getElementById('reject-type').textContent = type.charAt(0).toUpperCase() + type.slice(1);
  document.getElementById('reject-reason-input').value = '';
  modal.classList.remove('hidden');
}

function closeRejectModal() {
  document.getElementById('reject-modal').classList.add('hidden');
  pendingReject = null;
}

// ── Drafts & In Progress ─────────────────────────────────────────────────────
async function loadDrafts() {
  const list = document.getElementById('drafts-list');
  list.innerHTML = '<div class="card"><p class="loading">Loading drafts &amp; in-progress records...</p></div>';
  try {
    const [draftsRes, inProgRes] = await Promise.all([
      apiFetch('/audit/drafts'),
      apiFetch('/audit/in-progress'),
    ]);
    const [drafts, inProgress] = await Promise.all([draftsRes.json(), inProgRes.json()]);
    draftsData = { drafts, inProgress };
    renderDrafts();
    updateDraftsBadge();
  } catch (err) {
    list.innerHTML = `<div class="card"><p class="error-msg">Failed to load: ${esc(err.message)}</p></div>`;
  }
}

function updateDraftsBadge() {
  const total = countDrafts(draftsData.drafts) + countDrafts(draftsData.inProgress);
  const badge = document.getElementById('drafts-count-badge');
  if (!badge) return;
  if (total > 0) {
    badge.textContent = total;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function countDrafts(obj) {
  return (obj.ground?.length || 0) + (obj.dcdb?.length || 0) + (obj.tower?.length || 0);
}

function renderDrafts() {
  const list = document.getElementById('drafts-list');
  const filter = draftsFilter;
  const { drafts, inProgress } = draftsData;

  const sections = [];

  if (filter === 'all' || filter === 'drafts') {
    const gd = drafts.ground || [];
    const dd = drafts.dcdb || [];
    const td = drafts.tower || [];
    if (gd.length + dd.length + td.length > 0) {
      sections.push({ label: 'Drafts (saved, not submitted)', type: 'draft', color: '#f59e0b', ground: gd, dcdb: dd, tower: td });
    }
  }

  if (filter === 'all' || filter === 'inprogress') {
    const gi = inProgress.ground || [];
    const di = inProgress.dcdb || [];
    const ti = inProgress.tower || [];
    if (gi.length + di.length + ti.length > 0) {
      sections.push({ label: 'In Progress (partial / unclear status)', type: 'inprogress', color: '#3b82f6', ground: gi, dcdb: di, tower: ti });
    }
  }

  if (!sections.length) {
    list.innerHTML = `<div class="card" style="text-align:center;padding:2rem;color:var(--text-secondary)">No drafts or in-progress records found.</div>`;
    return;
  }

  list.innerHTML = sections.map(sec => {
    const records = [
      ...sec.ground.map(r => ({ ...r, _type: 'ground' })),
      ...sec.dcdb.map(r => ({ ...r, _type: 'dcdb' })),
      ...sec.tower.map(r => ({ ...r, _type: 'tower' })),
    ];
    return `
      <div style="margin-bottom:1.5rem">
        <h3 style="color:${sec.color};margin:0 0 0.75rem;font-size:15px">
          ${sec.label}
          <span style="font-weight:400;font-size:13px;color:var(--text-secondary)"> — ${records.length} record${records.length !== 1 ? 's' : ''}</span>
        </h3>
        ${records.length ? records.map(r => `
          <div class="review-card" style="margin-bottom:0.75rem">
            <div class="review-card-header">
              <div>
                <strong style="font-size:14px">${esc(r.site?.siteName || r.siteId || 'Unknown Site')}</strong>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">
                  Site: <code>${esc(r.siteId)}</code> &nbsp;|&nbsp;
                  Type: <span style="text-transform:capitalize">${esc(r._type)}</span> &nbsp;|&nbsp;
                  Engineer: ${esc(r.user?.name || 'Unknown')} &nbsp;|&nbsp;
                  Saved: ${fmtDate(r.updatedAt || r.createdAt)}
                </div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">
                  Status: <span class="status-badge status-pending">${esc(r.status || 'in-progress')}</span>
                </div>
              </div>
              <div class="flex-row" style="gap:0.4rem;flex-shrink:0">
                <button class="btn-sm btn-primary" disabled style="opacity:0.5" title="Engineer must submit this record">Awaiting Submit</button>
              </div>
            </div>
            <div class="review-card-body">${renderRecordSummary(r, r._type)}</div>
          </div>
        `).join('') : `<div class="card"><p style="color:var(--text-secondary);font-size:13px;text-align:center">No records in this category.</p></div>`}
      </div>
    `;
  }).join('');
}

// ── Populate assigned engineers select (for site modal) ─────────────────────
async function populateAssignedSelect() {
  if (!allUsers.length) await loadUsers();
}

// ── Utils ────────────────────────────────────────────────────────────────────
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// ── Event Delegation (CSP-safe — no inline onclick handlers) ───────────────
function setupEventDelegation() {
  // Nav sidebar buttons
  document.querySelector('.sidebar').addEventListener('click', e => {
    const btn = e.target.closest('[data-view]');
    if (btn) showView(btn.dataset.view);
  });

  // Quick action buttons in overview
  document.getElementById('quick-sites-btn').addEventListener('click', () => showView('sites'));
  document.getElementById('quick-engineers-btn').addEventListener('click', () => showView('engineers'));
  document.getElementById('quick-reports-btn').addEventListener('click', () => showView('reports'));

  // Logout
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('session-relogin-btn').addEventListener('click', () => { logout(); showLogin(); });

  // Add buttons
  document.getElementById('add-site-btn').addEventListener('click', () => openSiteModal());
  document.getElementById('add-eng-btn').addEventListener('click', () => openEngModal());

  // Report select change
  document.getElementById('report-site-select').addEventListener('change', loadSiteSummary);

  // Download report
  document.getElementById('download-report-btn').addEventListener('click', downloadReport);

  // Review refresh
  document.getElementById('refresh-review-btn').addEventListener('click', () => loadReviewPending());

  // Drafts refresh
  document.getElementById('refresh-drafts-btn').addEventListener('click', () => loadDrafts());

  // Review filter tabs
  document.querySelectorAll('.tab-btn[data-review-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      reviewFilter = btn.dataset.reviewFilter;
      document.querySelectorAll('.tab-btn[data-review-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderReviewPending();
    });
  });

  // Drafts filter tabs
  document.querySelectorAll('.tab-btn[data-drafts-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      draftsFilter = btn.dataset.draftsFilter;
      document.querySelectorAll('.tab-btn[data-drafts-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderDrafts();
    });
  });

  // Reject modal
  document.getElementById('reject-submit-btn').addEventListener('click', rejectRecord);
  document.getElementById('reject-cancel-btn').addEventListener('click', closeRejectModal);
  document.getElementById('reject-modal-close-btn').addEventListener('click', closeRejectModal);

  // Modal close/cancel buttons
  document.getElementById('site-modal-close-btn').addEventListener('click', closeSiteModal);
  document.getElementById('site-modal-cancel-btn').addEventListener('click', closeSiteModal);
  document.getElementById('eng-modal-close-btn').addEventListener('click', closeEngModal);
  document.getElementById('eng-modal-cancel-btn').addEventListener('click', closeEngModal);

  // Table action delegation (sites and engineers tables)
  // These fire after loadSites/loadUsers populate the tbody
  document.addEventListener('click', e => {
    // Sites table actions
    if (e.target.closest('#sites-tbody')) {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      if (action === 'edit') editSite(id);
      if (action === 'delete') deleteSite(id);
    }
    // Engineers table actions
    if (e.target.closest('#eng-tbody')) {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id, email } = btn.dataset;
      if (action === 'delete') deleteUser(id, email);
    }
    // Review card actions
    if (e.target.closest('[data-review-action]')) {
      const btn = e.target.closest('[data-review-action]');
      const { reviewAction, type, id } = btn.dataset;
      if (reviewAction === 'approve') approveRecord(type, id);
      if (reviewAction === 'reject') showRejectModal(type, id);
    }
  });
}

// ── Bootstrap ───────────────────────────────────────────────────────────────
// Script is at end of body — DOM is guaranteed ready when this executes.
// Always call init() directly (no need for DOMContentLoaded check).
init().catch(e => console.error('[BTS] init() failed:', e));
