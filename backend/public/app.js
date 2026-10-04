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
    const phone    = document.getElementById('eng-phone')?.value.trim() || '';
    const errEl = document.getElementById('eng-modal-error');
    errEl.classList.add('hidden');
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, email, password, phone, role: 'engineer' }),
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
              <button class="btn-secondary btn-sm" onclick="viewRecord('${s.type}','${r.id}')">&#x1F441; View</button>
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
          <div class="review-card draft-card" onclick="viewRecord('${r._type}','${r.id}')">
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
              <div class="flex-row" style="gap:0.4rem;flex-shrink:0;pointer-events:none">
                <span style="font-size:11px;color:var(--text-secondary);align-self:center;margin-right:6px">Tap to view &#x1F441;</span>
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

// ── Record Detail Modal ──────────────────────────────────────────────────
let currentRecord = null; // { record, type }

// Fetch photos for a specific record (used for all audit type photo rendering)
async function fetchPhotosForRecord(siteId, recordId) {
  try {
    const res = await fetch(`${API}/audit/photos?siteId=${encodeURIComponent(siteId)}&recordId=${encodeURIComponent(recordId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return {};
    const data = await res.json();
    // Return a map: fieldName -> photo object
    const map = {};
    (data.photos || []).forEach(p => { if (p.fieldName) map[p.fieldName] = p; });
    return map;
  } catch(e) {
    return {};
  }
}

async function viewRecord(type, id) {
  // Find record in reviewData or draftsData
  const findIn = (col) => col.find(r => r.id === id);
  const reviewSources = [reviewData.ground, reviewData.dcdb, reviewData.tower];
  const draftSources  = [draftsData.drafts.ground, draftsData.drafts.dcdb, draftsData.drafts.tower,
                          draftsData.inProgress.ground, draftsData.inProgress.dcdb, draftsData.inProgress.tower];
  let record = null;
  for (const src of [...reviewSources, ...draftSources]) {
    record = findIn(src || []);
    if (record) break;
  }
  if (!record) { toast('Record not found', 'error'); return; }

  // Fetch ALL records + photos for this site so we can show ground + DCDB + tower together
  let allSiteData = { groundEquipment: [], dcdbRecords: [], towerEquipment: [], photos: [], site: record.site };
  try {
    const res = await fetch(`${API}/audit/site/${encodeURIComponent(record.siteId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      allSiteData = data;
    }
  } catch(e) {}

  // Build photos map: recordId -> fieldName -> photo object
  const allPhotosMap = {};
  (allSiteData.photos || []).forEach(p => {
    if (!p.recordId) return;
    if (!allPhotosMap[p.recordId]) allPhotosMap[p.recordId] = {};
    if (p.fieldName) allPhotosMap[p.recordId][p.fieldName] = p;
  });

  currentRecord = { record, type };
  const modal = document.getElementById('record-detail-modal');
  document.getElementById('detail-title').textContent =
    `${esc(record.site?.siteName || record.siteId || 'Unknown')} — Full Audit Report`;
  document.getElementById('detail-meta').textContent =
    `Site: ${esc(record.siteId)} | Engineer: ${esc(record.user?.name || 'Unknown')}`;
  document.getElementById('detail-body').innerHTML = renderFullAuditReport(allSiteData, allPhotosMap, record.userId);
  modal.classList.remove('hidden');
}

function closeRecordDetail() {
  document.getElementById('record-detail-modal').classList.add('hidden');
  currentRecord = null;
}

// ── Full Audit Report (all 3 forms on one page) ─────────────────────────
function renderFullAuditReport(data, allPhotosMap, currentUserId) {
  const { groundEquipment = [], dcdbRecords = [], towerEquipment = [], site } = data;

  const sections = [];

  // ── Ground Equipment ─────────────────────────────────────────────
  if (groundEquipment.length > 0) {
    sections.push(`<div class="detail-section">
      <div class="detail-section-title ground">&#x1F4CD; Ground Equipment</div>
      ${groundEquipment.map(r => {
        const photos = allPhotosMap[r.id] || {};
        const sitePhotos = buildGroundPhotos(r, photos);
        return `
          <div style="margin-bottom:16px">
            <div class="detail-fields" style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">
              Status: ${r.status === 'submitted' ? '&#x2705; Submitted' : r.status === 'draft' ? '&#x1F4CB; Draft' : '&#x274C; '+esc(r.status)} &nbsp;|&nbsp;
              Updated: ${fmtDate(r.updatedAt || r.createdAt)}
            </div>
            ${renderGroundDetail(r, photos)}
          </div>
        `;
      }).join('')}
    </div>`);
  } else {
    sections.push(`<div class="detail-section">
      <div class="detail-section-title ground">&#x1F4CD; Ground Equipment</div>
      <div class="detail-fields"><p class="detail-no-photo">No ground equipment data submitted.</p></div>
    </div>`);
  }

  // ── DCDB Records ────────────────────────────────────────────────
  if (dcdbRecords.length > 0) {
    sections.push(`<div class="detail-section">
      <div class="detail-section-title dcdb">&#x26A1; DCDB Records</div>
      ${dcdbRecords.map(r => {
        const photos = allPhotosMap[r.id] || {};
        return `
          <div style="margin-bottom:16px">
            <div class="detail-fields" style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">
              Status: ${r.status === 'submitted' ? '&#x2705; Submitted' : r.status === 'draft' ? '&#x1F4CB; Draft' : '&#x274C; '+esc(r.status)} &nbsp;|&nbsp;
              Updated: ${fmtDate(r.updatedAt || r.createdAt)}
            </div>
            ${renderDcdbDetail(r, photos)}
          </div>
        `;
      }).join('')}
    </div>`);
  } else {
    sections.push(`<div class="detail-section">
      <div class="detail-section-title dcdb">&#x26A1; DCDB Records</div>
      <div class="detail-fields"><p class="detail-no-photo">No DCDB data submitted.</p></div>
    </div>`);
  }

  // ── Tower Equipment ───────────────────────────────────────────────
  if (towerEquipment.length > 0) {
    sections.push(`<div class="detail-section">
      <div class="detail-section-title tower">&#x1F4CE; Tower Equipment</div>
      ${towerEquipment.map(r => {
        const photos = allPhotosMap[r.id] || {};
        return `
          <div style="margin-bottom:16px">
            <div class="detail-fields" style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">
              Status: ${r.status === 'submitted' ? '&#x2705; Submitted' : r.status === 'draft' ? '&#x1F4CB; Draft' : '&#x274C; '+esc(r.status)} &nbsp;|&nbsp;
              Updated: ${fmtDate(r.updatedAt || r.createdAt)}
            </div>
            ${renderTowerDetail(r, photos)}
          </div>
        `;
      }).join('')}
    </div>`);
  } else {
    sections.push(`<div class="detail-section">
      <div class="detail-section-title tower">&#x1F4CE; Tower Equipment</div>
      <div class="detail-fields"><p class="detail-no-photo">No tower data submitted.</p></div>
    </div>`);
  }

  return sections.join('\n');
}

// Helper: build ground photos list from record + photos map (inline for full report)
function buildGroundPhotos(r, photos) {
  const photoList = [];
  // From record fields
  const fields = ['site_name_plate_photo','gps_screenshot','site_photo','rru_photo',
    'cabinet_photo','slab_photo','redundant_photo','non_active_idu_photo'];
  const labels = {'site_name_plate_photo':'Site Name Plate','gps_screenshot':'GPS Screenshot',
    'site_photo':'Site Photo','rru_photo':'RRU Photo','cabinet_photo':'Cabinet Photo',
    'slab_photo':'Slab Photo','redundant_photo':'Redundant Photo','non_active_idu_photo':'Non-Active IDU'};
  fields.forEach(f => {
    if (r[f]) photoList.push({ label: labels[f] || f, path: r[f] });
  });
  // From photos map (recordPhotos)
  Object.entries(photos).forEach(([fieldName, photo]) => {
    if (photo && photo.original) {
      const label = fieldName.replace(/_photo_?\d*/,' #').replace(/_/g,' ').trim();
      photoList.push({ label: label || fieldName, path: photo.original });
    }
  });
  return photoList;
}

function renderRecordDetail(r, type, recordPhotos = {}) {
  if (type === 'ground') return renderGroundDetail(r, recordPhotos);
  if (type === 'dcdb')  return renderDcdbDetail(r, recordPhotos);
  if (type === 'tower')  return renderTowerDetail(r, recordPhotos);
  return '<p style="color:var(--text-secondary)">Unknown record type.</p>';
}

// ── Ground Equipment Detail ───────────────────────────────────────────────
function renderGroundDetail(r, recordPhotos = {}) {
  const s = r;
  return `
    <div class="detail-section">
      <div class="detail-section-title ground">&#x1F4CD; Site &amp; Survey</div>
      <div class="detail-fields">
        ${f('Site Name',       s.site?.siteName || s.siteId)}
        ${f('ATC ID',          s.atc_id)}
        ${f('Survey Date',      fmtDate(s.survey_date))}
        ${f('Technician',      s.technician_name)}
        ${f('Contractor',       s.contractor_name)}
        ${f('Tower Type',       s.tower_type)}
        ${f('Tower Height',     s.tower_height ? s.tower_height + ' m' : '')}
        ${f('Building Height',   s.building_height ? s.building_height + ' m' : '')}
        ${f('Total Height',     s.total_height ? s.total_height + ' m' : '')}
        ${f('Indoor / Outdoor', s.site_indoor_outdoor)}
        ${f('No. of Tenants',   s.no_of_tenants)}
        ${f('Other Tenants',    s.other_tenants)}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title ground">&#x1F4F1; GPS Coordinates</div>
      <div class="detail-fields">
        ${f('Latitude',   s.latitude)}
        ${f('Longitude',  s.longitude)}
        ${f('Altitude',   s.altitude)}
        ${f('Accuracy',   s.gps_accuracy)}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title ground">&#x26A1; Power Infrastructure</div>
      <div class="detail-fields">
        ${b('Grid Power',           s.has_grid)}
        ${b('DG (Diesel Generator)', s.has_dg)}
        ${b('Solar',               s.has_solar)}
        ${f('Grid Distance (m)',   s.grid_distance_to_3phase)}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title ground">&#x1F5A5; RRU &amp; Cabinets</div>
      <div class="detail-fields">
        ${b('Guard at Site',        s.guard_at_site)}
        ${f('RRU Type',            s.rru_type)}
        ${f('RRU Count',           s.rru_count)}
        ${f('Cabinet Types',       s.cabinet_types)}
        ${f('Cabinet Count',       s.cabinet_count)}
        ${b('Equipment Labelled',   s.equipment_labelled)}
        ${f('Cabinet Comments',    s.cabinet_comments)}
        ${f('BTS Cabinet Dims (L×W×H)', s.cabinet_dimensions_lxwxh)}
        ${f('Active IDU Types',    s.active_idu_types)}
        ${f('Non-Active IDU Types', s.non_active_idu_types)}
        ${f('Non-Active IDU Count', s.non_active_idu_count)}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title ground">&#x1F4CF; Slab</div>
      <div class="detail-fields">
        ${f('Slab Dimensions (L×W m)', s.slab_dimensions)}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title ground">&#x26A0; Redundant Equipment</div>
      <div class="detail-fields">
        ${f('Redundant Count', s.redundant_equipment_count)}
        ${f('Redundant Item',  s.redundant_item_name)}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title ground">&#x1F4E7; Media &amp; Connectivity</div>
      <div class="detail-fields">
        ${b('On Fiber (TRM Media)', s.is_on_fiber)}
        ${f('Overall Remarks',     s.overall_remarks)}
      </div>
    </div>

    ${renderPhotosSection(s, recordPhotos)}
  `;
}

// ── DCDB Detail ─────────────────────────────────────────────────────────
function renderDcdbDetail(r, recordPhotos = {}) {
  // Helper: get photo from recordPhotos map or fallback to record field
  const fp = (field) => recordPhotos[field]?.original || r[field] || null;

  // Parse DCDU slots: "Label:CableSizemm²:BreakerRatingA;..." → display each on its own line
  function renderDcduSlots(raw) {
    if (!raw) return '';
    return raw.split(';').filter(Boolean).map(slot => {
      const parts = slot.split(':');
      const label = parts[0] || '';
      const cable = parts[1] || '';
      const breaker = parts[2] || '';
      return `<div style="font-size:12px;margin:2px 0">
        <strong>${esc(label)}</strong>: ${esc(cable)}${cable ? 'mm²' : ''}${cable && breaker ? ' / ' : ''}${esc(breaker)}${breaker ? 'A' : ''}
      </div>`;
    }).join('');
  }

  // Parse DCDU connections: "label|url_or_empty;label|url;..." → render label + optional photo
  function renderConns(raw) {
    if (!raw) return '';
    return raw.split(';').filter(Boolean).map(c => {
      const parts = c.split('|');
      const label = parts[0] || '';
      const url = parts[1] || '';
      const photoHtml = url ? ` <a href="${esc(url)}" target="_blank" style="font-size:11px">&#x1F4F7; View</a>` : '';
      return `<div style="font-size:12px;margin:2px 0">${esc(label)}${photoHtml}</div>`;
    }).join('');
  }
  const npSlots = renderDcduSlots(r.np_dcdus);
  const pSlots  = renderDcduSlots(r.p_dcdus);
  const npConns = renderConns(r.np_dcdu_connections);
  const pConns  = renderConns(r.p_dcdu_connections);
  return `
    <div class="detail-section">
      <div class="detail-section-title dcdb">&#x1F4CD; Site &amp; Survey</div>
      <div class="detail-fields">
        ${f('Site Name',    r.site?.siteName || r.siteId)}
        ${f('Site ID',     r.siteId)}
        ${f('Survey Date',  fmtDate(r.createdAt || r.updatedAt))}
        ${f('Engineer',     r.user?.name || '—')}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title dcdb">&#x26A1; Power Supply</div>
      <div class="detail-fields">
        ${f('Grid Distance to 3-Phase (m)', r.grid_distance_to_3phase)}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title dcdb">&#x26A1; Non-Priority DCDB</div>
      <div class="detail-fields">
        ${f('Cable Size (mm²)',       r.np_cable_size_dcdb)}
        ${f('Breaker 1 / MCB',        r.np_breaker1_mcb)}
        ${npSlots ? `<div class="detail-field"><span class="detail-field-lbl">DCDU Slots</span><div class="detail-field-val">${npSlots}</div></div>` : ''}
        ${f('Section Photo',          (() => { const p = fp('np_section_photo'); return p ? '<a href="'+esc(p)+'" target="_blank">View Photo</a>' : '—'; })()}
        ${f('Load Measurement (A)',    r.np_load_measurement)}
        ${f('Load Photo',             (() => { const p = fp('np_load_photo'); return p ? '<a href="'+esc(p)+'" target="_blank">View Photo</a>' : '—'; })()}
        ${f('Load Measured Time',     r.np_load_measured_time)}
        ${npConns ? `<div class="detail-field"><span class="detail-field-lbl">DCDU Connections</span><div class="detail-field-val">${npConns}</div></div>` : ''}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title dcdb">&#x26A1; Priority DCDB</div>
      <div class="detail-fields">
        ${f('Cable Size (mm²)',       r.p_cable_size_dcdb)}
        ${f('Breaker 1 / MCB',        r.p_breaker1_mcb)}
        ${pSlots ? `<div class="detail-field"><span class="detail-field-lbl">DCDU Slots</span><div class="detail-field-val">${pSlots}</div></div>` : ''}
        ${f('Section Photo',          (() => { const p = fp('p_section_photo'); return p ? '<a href="'+esc(p)+'" target="_blank">View Photo</a>' : '—'; })()}
        ${f('Load Measurement (A)',    r.p_load_measurement)}
        ${f('Load Photo',             (() => { const p = fp('p_load_photo'); return p ? '<a href="'+esc(p)+'" target="_blank">View Photo</a>' : '—'; })()}
        ${f('Load Measured Time',     r.p_load_measured_time)}
        ${pConns ? `<div class="detail-field"><span class="detail-field-lbl">DCDU Connections</span><div class="detail-field-val">${pConns}</div></div>` : ''}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title dcdb">&#x26A1; Total DCDU Count</div>
      <div class="detail-fields">
        ${f('Total DCDU Count', r.total_dcdu_count)}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title dcdb">&#x26E8; RRU Power Cables</div>
      <div class="detail-fields">
        ${f('RRU Count',                        r.rru_count)}
        ${f('Power Cable Count',                r.rru_power_cable_count)}
        ${f('Power Cable Missing',              r.rru_power_cable_missing)}
        ${f('Power Cable Length/Run (m)',       r.rru_power_cable_length_per_run)}
        ${f('Power Cable Total Missing',        r.rru_power_cable_total_missing)}
        ${f('Earthing Cable Count',             r.rru_earthing_cable_count)}
        ${f('Earthing Cable Missing',           r.rru_earthing_cable_missing)}
        ${f('Earthing Cable Length/Run (m)',    r.rru_earthing_cable_length_per_run)}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title dcdb">&#x26E8; AAU Power Cables</div>
      <div class="detail-fields">
        ${f('AAU Count',                        r.aau_count)}
        ${f('Power Cable Count',                r.aau_power_cable_count)}
        ${f('Power Cable Missing',              r.aau_power_cable_missing)}
        ${f('Power Cable Length/Run (m)',       r.aau_power_cable_length_per_run)}
        ${f('Power Cable Total Missing',        r.aau_power_cable_total_missing)}
        ${f('Earthing Cable Count',             r.aau_earthing_cable_count)}
        ${f('Earthing Cable Missing',           r.aau_earthing_cable_missing)}
        ${f('Earthing Cable Length/Run (m)',   r.aau_earthing_cable_length_per_run)}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title dcdb">&#x26A1; BTS Earthing</div>
      <div class="detail-fields">
        ${f('BTS Earthing Total (m)',          r.bts_earthing_total)}
        ${f('Earthing Cable Count',            r.bts_earthing_cable_count)}
        ${f('Earthing Cable Missing',          r.bts_earthing_cable_missing)}
        ${f('Earthing Cable Length/Run (m)',   r.bts_earthing_cable_length_per_run)}
        ${f('Earthing Connection',             r.bts_earthing_connection)}
        ${f('BTS Earthing Total Missing (m)',   r.bts_earthing_total_missing)}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title dcdb">&#x1F4CD; Notes</div>
      <div class="detail-fields">
        ${f('Notes', r.notes)}
      </div>
    </div>
  `;
}

// ── Tower Detail ─────────────────────────────────────────────────────────
function renderTowerDetail(r, recordPhotos = {}) {
  // Enrich antenna/rrus with photos from the photos table (dynamic field names)
  // recordPhotos is a map: fieldName -> { original, thumbnail, ... }
  // e.g. recordPhotos["ant_<uuid>_model_plate"] -> { original: "/uploads/...", thumbnail: "/uploads/thumb_..." }
  function getAntPhoto(antennaId, suffix) {
    const key = `ant_${antennaId}_${suffix}`;
    const entry = recordPhotos[key];
    return entry ? entry.original || entry.serverUrl : null;
  }
  function getRruPhoto(rruId, suffix) {
    const key = `rru_${rruId}_${suffix}`;
    const entry = recordPhotos[key];
    return entry ? entry.original || entry.serverUrl : null;
  }

  let antennasHtml = '';
  let rrusHtml = '';
  try {
    const antennas = r._antennas_json ? JSON.parse(r._antennas_json) : (r.antennas || []);
    if (antennas.length > 0) {
      antennasHtml = `<div class="detail-section">
        <div class="detail-section-title tower">&#x1F4CE; Antennas (${antennas.length})</div>
        ${antennas.map((a, i) => {
          // Use photo from photos table (dynamic field name), fallback to embedded field
          const modelPlate = getAntPhoto(a.id, 'model_plate') || a.photo_model_plate;
          const ports      = getAntPhoto(a.id, 'ports')      || a.photo_ports;
          const dim1       = getAntPhoto(a.id, 'dim1')       || a.photo_dim1;
          const dim2       = getAntPhoto(a.id, 'dim2')       || a.photo_dim2;
          const dim3       = getAntPhoto(a.id, 'dim3')       || a.photo_dim3;
          const azimuth    = getAntPhoto(a.id, 'azimuth')    || a.photo_azimuth;
          const height     = getAntPhoto(a.id, 'height')      || a.photo_height;
          return `
          <div style="margin-bottom:12px;padding:8px;background:rgba(59,130,246,0.06);border-radius:8px">
            <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">Antenna ${i+1}</div>
            <div class="detail-fields">
              ${f('Type', a.equipment_type)}
              ${f('Manufacturer', a.manufacturer)}
              ${f('Model', a.model_number)}
              ${f('Tenant', a.tenant_owner)}
              ${f('Sector', a.sector)}
              ${f('Azimuth (°)', a.azimuth)}
              ${f('Height to Centre (m)', a.height_to_centre)}
              ${f('Length/Dia (mm)', a.length_dia_mm)}
              ${f('Width (mm)', a.width_mm)}
              ${f('Height (mm)', a.height_mm)}
              ${f('Status', a.active_inactive)}
              ${f('Labelled', a.equipment_labelling)}
              ${modelPlate ? `<div class="detail-field"><span class="detail-field-lbl">Model Plate Photo</span><span class="detail-field-val"><a href="${esc(modelPlate)}" target="_blank">View</a></span></div>` : ''}
              ${ports ? `<div class="detail-field"><span class="detail-field-lbl">Ports Photo</span><span class="detail-field-val"><a href="${esc(ports)}" target="_blank">View</a></span></div>` : ''}
              ${dim1 ? `<div class="detail-field"><span class="detail-field-lbl">Dimension Photo 1</span><span class="detail-field-val"><a href="${esc(dim1)}" target="_blank">View</a></span></div>` : ''}
              ${dim2 ? `<div class="detail-field"><span class="detail-field-lbl">Dimension Photo 2</span><span class="detail-field-val"><a href="${esc(dim2)}" target="_blank">View</a></span></div>` : ''}
              ${dim3 ? `<div class="detail-field"><span class="detail-field-lbl">Dimension Photo 3</span><span class="detail-field-val"><a href="${esc(dim3)}" target="_blank">View</a></span></div>` : ''}
              ${azimuth ? `<div class="detail-field"><span class="detail-field-lbl">Azimuth Photo</span><span class="detail-field-val"><a href="${esc(azimuth)}" target="_blank">View</a></span></div>` : ''}
              ${height ? `<div class="detail-field"><span class="detail-field-lbl">Height Photo</span><span class="detail-field-val"><a href="${esc(height)}" target="_blank">View</a></span></div>` : ''}
            </div>
          </div>
        `}).join('')}
      </div>`;
    }
  } catch(e) {}

  try {
    const rrusArr = r._rrus_json ? JSON.parse(r._rrus_json) : (r.rrus || []);
    if (rrusArr.length > 0) {
      rrusHtml = `<div class="detail-section">
        <div class="detail-section-title tower">&#x26A1; RRUs (${rrusArr.length})</div>
        ${rrusArr.map((rru, i) => {
          const modelPlate = getRruPhoto(rru.id, 'model_plate') || rru.photo_model_plate;
          const dim1       = getRruPhoto(rru.id, 'dim1')          || rru.photo_dim1;
          const dim2       = getRruPhoto(rru.id, 'dim2')          || rru.photo_dim2;
          const dim3       = getRruPhoto(rru.id, 'dim3')          || rru.photo_dim3;
          return `
          <div style="margin-bottom:12px;padding:8px;background:rgba(139,92,246,0.06);border-radius:8px">
            <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px">RRU ${i+1}</div>
            <div class="detail-fields">
              ${f('Type', rru.equipment_type)}
              ${f('Manufacturer', rru.manufacturer)}
              ${f('Model', rru.model_number)}
              ${f('Tenant', rru.tenant_owner)}
              ${f('Sector', rru.sector)}
              ${f('Length/Dia (mm)', rru.length_dia_mm)}
              ${f('Width (mm)', rru.width_mm)}
              ${f('Height (mm)', rru.height_mm)}
              ${f('Status', rru.active_inactive)}
              ${f('Labelled', rru.equipment_labelling)}
              ${modelPlate ? `<div class="detail-field"><span class="detail-field-lbl">Model Plate Photo</span><span class="detail-field-val"><a href="${esc(modelPlate)}" target="_blank">View</a></span></div>` : ''}
              ${dim1 ? `<div class="detail-field"><span class="detail-field-lbl">Dimension Photo 1</span><span class="detail-field-val"><a href="${esc(dim1)}" target="_blank">View</a></span></div>` : ''}
              ${dim2 ? `<div class="detail-field"><span class="detail-field-lbl">Dimension Photo 2</span><span class="detail-field-val"><a href="${esc(dim2)}" target="_blank">View</a></span></div>` : ''}
              ${dim3 ? `<div class="detail-field"><span class="detail-field-lbl">Dimension Photo 3</span><span class="detail-field-val"><a href="${esc(dim3)}" target="_blank">View</a></span></div>` : ''}
            </div>
          </div>
        `}).join('')}
      </div>`;
    }
  } catch(e) {}

  return `
    <div class="detail-section">
      <div class="detail-section-title tower">&#x1F4CD; Site &amp; Survey</div>
      <div class="detail-fields">
        ${f('Site Name',    r.site?.siteName || r.siteId)}
        ${f('Site ID',     r.siteId)}
        ${f('Survey Date',  fmtDate(r.createdAt || r.updatedAt))}
        ${f('Engineer',     r.user?.name || '—')}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title tower">&#x26E8; Tower Structure</div>
      <div class="detail-fields">
        ${f('Tower Type',             r.tower_type)}
        ${f('Tower Height',           r.tower_height ? r.tower_height + ' m' : '')}
        ${f('Structural Integrity',    r.structural_integrity)}
        ${f('Rust / Corrosion',       r.rust_corrosion)}
        ${f('Bolt Condition',          r.bolt_condition)}
        ${f('Lightning Rod',           r.lightning_rod)}
        ${f('Climb Safety',           r.climb_safety)}
        ${f('Antenna Mounting',       r.antenna_mounting)}
        ${f('Notes',                   r.notes)}
      </div>
    </div>
    ${antennasHtml}
    ${rrusHtml}
    ${renderPhotosSection(r, recordPhotos)}
  `;
}

// ── Photos Section ───────────────────────────────────────────────────────
function renderPhotosSection(r, recordPhotos = {}) {
  const photos = [];
  const seenUrls = new Set();
  const pushPhoto = (label, path) => { if (path && !seenUrls.has(path)) { seenUrls.add(path); photos.push({ label, path }); } };
  const pushList  = (label, list) => { if (list) list.split('|').filter(Boolean).forEach(p => pushPhoto(label, p)); };

  pushPhoto('Site Name Plate',     r.site_name_plate_photo);
  pushPhoto('GPS Screenshot',       r.gps_screenshot);
  pushPhoto('Site Photo',           r.site_photo);
  pushPhoto('RRU Photo',            r.rru_photo);
  pushList ('RRU Photos',          r.rru_photos);
  pushPhoto('Cabinet Photo',        r.cabinet_photo);
  pushList ('Cabinet Photos',       r.cabinet_photos);
  pushPhoto('Cabinet Dim Photo',    r.cabinet_dim_photo);
  pushList ('Cabinet Dim Photos',   r.cabinet_dimension_photos);
  pushPhoto('Non-Active IDU Photo',r.non_active_idu_photo);
  pushList ('Non-Active IDU Photos', r.non_active_idu_photos);
  // Also pick up indexed fields like non_active_idu_photo_0, non_active_idu_photo_1
  Object.keys(r).filter(k => k.startsWith('non_active_idu_photo_') && typeof r[k] === 'string' && r[k])
    .forEach(k => photos.push({ label: `Non-Active IDU #${parseInt(k.split('_').pop()) + 1}`, path: r[k] }));
  pushPhoto('Slab Photo',           r.slab_photo);
  pushList ('Slab Photos',          r.slab_photos);
  pushPhoto('Redundant Photo',      r.redundant_photo);
  pushList ('Redundant Photos',     r.redundant_photos);
  // Also pick up indexed fields like cabinet_dim_photo_0, cabinet_dim_photo_1
  Object.keys(r).filter(k => k.startsWith('cabinet_dim_photo_') && typeof r[k] === 'string' && r[k])
    .forEach(k => photos.push({ label: `Cabinet Dim #${parseInt(k.split('_').pop()) + 1}`, path: r[k] }));

  // Also include photos from the photos table (recordPhotos map: fieldName -> photo object)
  Object.entries(recordPhotos).forEach(([fieldName, photo]) => {
    if (!photo || !photo.original) return;
    // Determine label from fieldName
    let label = fieldName.replace(/_photo(_?\d*)$/, ' #$1').replace(/_/g, ' ');
    if (fieldName.startsWith('cabinet_photo'))  label = `Cabinet #${parseInt(fieldName.split('_').pop()) + 1}`;
    if (fieldName.startsWith('slab_photo'))     label = `Slab #${parseInt(fieldName.split('_').pop()) + 1}`;
    if (fieldName.startsWith('site_photo'))      label = 'Site Photo';
    if (fieldName === 'site_name_plate_photo')  label = 'Site Name Plate';
    if (fieldName === 'gps_screenshot')         label = 'GPS Screenshot';
    pushPhoto(label, photo.original);
  });

  if (!photos.length) {
    return `<div class="detail-section">
      <div class="detail-section-title ground">&#x1F4F7; Photos</div>
      <div class="detail-fields"><p class="detail-no-photo">No photos captured.</p></div>
    </div>`;
  }

  const thumbs = photos.map(({ label, path }) => {
    const url = path.startsWith('http') ? path : path;
    return `<div class="detail-photo-thumb" onclick="openLightbox('${esc(url)}','${esc(label)}')" title="${esc(label)}">
      <img src="${esc(url)}" alt="${esc(label)}" loading="lazy" onerror="this.parentElement.innerHTML='<div style=\\'width:80px;height:80px;display:flex;align-items:center;justify-content:center;background:#f1f5f9;color:#94a3b8;font-size:11px;text-align:center;padding:4px\\'>No preview</div>'" />
    </div>`;
  }).join('');

  return `<div class="detail-section">
    <div class="detail-section-title ground">&#x1F4F7; Photos (${photos.length}) — tap to enlarge</div>
    <div class="detail-photos">
      <div class="detail-photo-grid">${thumbs}</div>
    </div>
  </div>`;
}

// ── Field helpers ────────────────────────────────────────────────────────
function f(label, val) {
  const v = val == null || val === '' || val === 'undefined' ? null : val;
  if (v == null) return `<div class="detail-field"><span class="detail-field-lbl">${label}</span><span class="detail-field-val missing">—</span></div>`;
  return `<div class="detail-field"><span class="detail-field-lbl">${label}</span><span class="detail-field-val">${esc(String(v))}</span></div>`;
}
function b(label, val) {
  const v = String(val);
  if (v === 'true' || v === '1' || v === 'true') return `<div class="detail-field"><span class="detail-field-lbl">${label}</span><span class="detail-field-val bool-yes">Yes &#x2705;</span></div>`;
  if (v === 'false' || v === '0' || v === 'false') return `<div class="detail-field"><span class="detail-field-lbl">${label}</span><span class="detail-field-val bool-no">No &#x274C;</span></div>`;
  return `<div class="detail-field"><span class="detail-field-lbl">${label}</span><span class="detail-field-val neutral">${esc(v)}</span></div>`;
}

// ── Photo Lightbox ─────────────────────────────────────────────────────
let lbRotation = 0;
let lbCurrentUrl = '';

function openLightbox(url, caption) {
  lbCurrentUrl = url;
  lbRotation = 0;
  const img = document.getElementById('lb-img');
  img.src = url;
  img.style.transform = '';
  document.getElementById('lb-caption').textContent = caption || '';
  const dl = document.getElementById('lb-download');
  dl.href = url;
  dl.download = caption ? caption.replace(/[^a-z0-9]/gi, '_') + '.jpg' : 'photo.jpg';
  document.getElementById('photo-lightbox').classList.remove('hidden');
  document.addEventListener('keydown', lbKeyHandler);
}
function closeLightbox() {
  document.getElementById('photo-lightbox').classList.add('hidden');
  lbRotation = 0;
  document.removeEventListener('keydown', lbKeyHandler);
}
function rotateLb(deg) {
  lbRotation = (lbRotation + deg) % 360;
  document.getElementById('lb-img').style.transform = `rotate(${lbRotation}deg)`;
}
function lbKeyHandler(e) {
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft')  rotateLb(-90);
  if (e.key === 'ArrowRight') rotateLb(90);
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
  if (!d) return '—';
  if (typeof d === 'string') {
    // Already a string (ISO or YYYYMMDD) — return as-is
    return d.slice(0, 10).replace(/-/g, '');
  }
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
