'use strict';

// ── Config ──────────────────────────────────────────────────────────────────
const API = '/api';

// ── Session banner injection (supports both old and new index.html) ───────────
(function injectSessionBanner() {
  // Inject required CSS if not already present
  if (!document.getElementById('bts-session-banner-style')) {
    const style = document.createElement('style');
    style.id = 'bts-session-banner-style';
    style.textContent = [
      '.session-banner { background: #fef3c7; border-bottom: 1px solid #f59e0b; color: #92400e; padding: 8px 1.5rem; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 8px; }',
      '.session-banner.hidden { display: none !important; }',
    ].join('\n');
    document.head.appendChild(style);
  }
  if (document.getElementById('session-error-banner')) return; // already present
  const banner = document.createElement('div');
  banner.id = 'session-error-banner';
  banner.className = 'session-banner hidden';
  banner.innerHTML = '<span id="session-error-text">⚠️ Your session may have expired. Please refresh the page or log in again.</span>' +
    '<button onclick="logout()" style="margin-left:auto;background:none;border:none;color:inherit;cursor:pointer;font-weight:600;padding:0 4px">Re-login</button>';
  const topbar = document.querySelector('.topbar');
  if (topbar && topbar.parentNode) {
    topbar.parentNode.insertBefore(banner, topbar);
  }
})();

// ── State ───────────────────────────────────────────────────────────────────
let token   = localStorage.getItem('bts_token') || '';
let user    = JSON.parse(localStorage.getItem('bts_user') || 'null');
let allSites = [];
let allUsers = [];

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupForms();
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
});

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
  const results = await Promise.allSettled([loadHealth(), loadSites(), loadUsers()]);
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
        <button class="btn-icon" title="Edit" onclick="editSite('${s.id}')">✏️</button>
        <button class="btn-icon" title="Delete" onclick="deleteSite('${s.id}')">🗑️</button>
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
        ${u.id !== user?.id ? `<button class="btn-icon" title="Remove" onclick="deleteUser('${u.id}','${esc(u.email)}')">🗑️</button>` : ''}
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
    try { await loadSites(); } catch (e) {
      if (e?.code === 'SESSION_EXPIRED') showSessionBanner('⚠️ Session expired — click "Re-login" to log in again.');
      else showSessionBanner('⚠️ Failed to load sites. Check your connection.');
    }
  }
  if (name === 'engineers') {
    try { await loadUsers(); } catch (e) {
      if (e?.code === 'SESSION_EXPIRED') showSessionBanner('⚠️ Session expired — click "Re-login" to log in again.');
      else showSessionBanner('⚠️ Failed to load engineers. Check your connection.');
    }
  }
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
