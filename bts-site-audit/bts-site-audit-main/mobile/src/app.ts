/**
 * BTS Site Audit — Mobile App (Capacitor)
 * Multi-user, multi-site, JWT auth, offline-capable
 */
import { Camera, CameraResultType } from '@capacitor/camera';
import { Preferences } from '@capacitor/preferences';
import { Network } from '@capacitor/network';
import { v4 as uuidv4 } from 'uuid';
import type {
  SiteInfo, GroundEquipment, DCDBRecord, TowerEquipment,
  PhotoRecord, AppState, AuthUser, SiteAssignment, EQUIPMENT_TYPES,
  SECTOR_OPTIONS,
} from './types';

// ─── Config — change API_BASE for production ───────────────────────────────────
// Android emulator: http://10.0.2.2:3000
// Physical device (same LAN): http://<pc-ip>:3000
// Koyeb: https://your-app-name.koyeb.app/api
const API_BASE = 'http://10.0.2.2:3000/api';
const PREFIX   = 'btsaudit_';

// ─── State ────────────────────────────────────────────────────────────────────
const state: AppState = {
  token:         null,
  currentUser:   null,
  selectedSite:  null,
  assignedSites: [],
  siteInfo:      null,
  groundEquipment: [],
  dcdbRecords:  [],
  towerEquipment:  [],
  photos:        [],
  currentTab:    'login',
  isOnline:      true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function el<K extends keyof HTMLElementTagNameMap>(id: string): HTMLElementTagNameMap[K] {
  return document.getElementById(id) as any;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function req(path: string, opts: RequestInit = {}): Promise<any> {
  const headers: Record<string,string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string,string> || {}),
  };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  return fetch(`${API_BASE}${path}`, { ...opts, headers });
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function loadAuth() {
  const [tok, usr, site] = await Promise.all([
    Preferences.get({ key: PREFIX + 'token' }),
    Preferences.get({ key: PREFIX + 'user' }),
    Preferences.get({ key: PREFIX + 'site' }),
  ]);
  if (tok.value && usr.value) {
    state.token       = tok.value;
    state.currentUser = JSON.parse(usr.value);
    if (site.value) {
      state.selectedSite = JSON.parse(site.value);
      await loadState();
      state.currentTab = 'site';
    } else {
      state.currentTab = 'sites';
    }
  } else {
    state.currentTab = 'login';
  }
}

async function doLogin() {
  const email    = (el('loginEmail') as HTMLInputElement).value.trim();
  const password = (el('loginPassword') as HTMLInputElement).value;
  const errEl   = el('loginError');
  errEl.textContent = '';
  if (!email || !password) { errEl.textContent = 'Email and password required'; return; }
  try {
    const res = await fetch(`${API_BASE.replace('/api', '')}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Login failed'; return; }
    state.token       = data.token;
    state.currentUser = data.user;
    await Preferences.set({ key: PREFIX + 'token', value: data.token });
    await Preferences.set({ key: PREFIX + 'user',  value: JSON.stringify(data.user) });
    await fetchSites();
    state.currentTab = 'sites';
    render();
  } catch (e) {
    errEl.textContent = 'Network error — check connection';
  }
}

async function doLogout() {
  await Promise.all([
    Preferences.remove({ key: PREFIX + 'token' }),
    Preferences.remove({ key: PREFIX + 'user' }),
    Preferences.remove({ key: PREFIX + 'site' }),
  ]);
  state.token = null; state.currentUser = null; state.selectedSite = null;
  state.assignedSites = []; state.siteInfo = null;
  state.groundEquipment = []; state.dcdbRecords = [];
  state.towerEquipment = []; state.photos = [];
  state.currentTab = 'login';
  render();
}

async function fetchSites() {
  try {
    const data = await req('/sites');
    state.assignedSites = (data.sites || []).map((s: any) => ({
      id:       s.id,
      siteId:   s.siteId,
      siteName: s.siteName || s.siteId,
      atcNo:    s.atcNo || '',
      latitude: s.latitude || '',
      longitude: s.longitude || '',
      status:   s.status || 'active',
    }));
  } catch {
    state.assignedSites = [];
  }
}

async function selectSite(site: SiteAssignment) {
  state.selectedSite = site;
  await Preferences.set({ key: PREFIX + 'site', value: JSON.stringify(site) });
  await loadState();
  state.currentTab = 'site';
  render();
}

// ─── Storage ──────────────────────────────────────────────────────────────────
async function saveState() {
  await Promise.all([
    Preferences.set({ key: PREFIX + 'siteInfo',  value: JSON.stringify(state.siteInfo) }),
    Preferences.set({ key: PREFIX + 'ground',    value: JSON.stringify(state.groundEquipment) }),
    Preferences.set({ key: PREFIX + 'dcdb',       value: JSON.stringify(state.dcdbRecords) }),
    Preferences.set({ key: PREFIX + 'tower',      value: JSON.stringify(state.towerEquipment) }),
    Preferences.set({ key: PREFIX + 'photos',     value: JSON.stringify(state.photos) }),
  ]);
}

async function loadState() {
  const [si, g, d, t, p] = await Promise.all([
    Preferences.get({ key: PREFIX + 'siteInfo' }),
    Preferences.get({ key: PREFIX + 'ground' }),
    Preferences.get({ key: PREFIX + 'dcdb' }),
    Preferences.get({ key: PREFIX + 'tower' }),
    Preferences.get({ key: PREFIX + 'photos' }),
  ]);
  if (si.value) state.siteInfo        = JSON.parse(si.value);
  if (g.value)  state.groundEquipment = JSON.parse(g.value);
  if (d.value)  state.dcdbRecords    = JSON.parse(d.value);
  if (t.value)  state.towerEquipment  = JSON.parse(t.value);
  if (p.value)  state.photos         = JSON.parse(p.value);
}

// ─── Network ──────────────────────────────────────────────────────────────────
async function checkOnline() {
  try {
    const res = await fetch(`${API_BASE.replace('/api','')}/api/health`, { signal: AbortSignal.timeout(3000) });
    state.isOnline = res.ok;
  } catch { state.isOnline = false; }
}

// ─── Camera ───────────────────────────────────────────────────────────────────
async function capturePhoto(category: PhotoRecord['category']): Promise<PhotoRecord | null> {
  if (!Capacitor.isNativePlatform()) {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = async () => {
        const f = inp.files?.[0]; if (!f) { resolve(null); return; }
        const id = uuidv4();
        const rec: PhotoRecord = { id, filename: `photo_${id.slice(0,8)}.jpg`,
          path: URL.createObjectURL(f), category, uploaded: false };
        state.photos.push(rec);
        await saveState(); render(); resolve(rec);
      };
      inp.click();
    });
  }
  try {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      quality: 80, width: 1920, height: 1920,
    });
    const id = uuidv4();
    const rec: PhotoRecord = { id, filename: `photo_${id.slice(0,8)}.jpg`,
      path: photo.dataUrl!, category, uploaded: false };
    state.photos.push(rec);
    await saveState(); render(); return rec;
  } catch (e) {
    console.warn('Camera error:', e); return null;
  }
}

// ─── Sync ─────────────────────────────────────────────────────────────────────
async function syncAll() {
  if (!state.isOnline) { alert('You are offline. Connect to sync.'); return; }
  if (!state.selectedSite) { alert('Please select a site first.'); return; }
  const siteId = state.selectedSite.siteId;
  try {
    const payload = {
      siteId,
      site:   state.siteInfo,
      ground: state.groundEquipment,
      dcdb:   state.dcdbRecords,
      tower:  state.towerEquipment,
    };
    const res = await req('/audit/sync', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.success) {
      state.groundEquipment.forEach(a => { (a as any).synced = true; });
      state.dcdbRecords.forEach(a => { (a as any).synced = true; });
      state.towerEquipment.forEach(a => { (a as any).synced = true; });
      // Sync photos that haven't been uploaded
      await syncPhotos();
      await saveState(); render();
      alert(`✅ Synced! Ground: ${res.groundEquipment}, DCDB: ${res.dcdbRecords}, Tower: ${res.towerEquipment}`);
    } else {
      alert('Sync failed: ' + (res.error || res.status));
    }
  } catch (e) {
    alert('Sync error: ' + (e instanceof Error ? e.message : String(e)));
  }
}

async function syncPhotos() {
  const pending = state.photos.filter(p => !p.uploaded);
  if (!pending.length || !state.selectedSite) return;
  const siteId = state.selectedSite.siteId;
  const formData = new FormData();
  formData.append('siteId', siteId);
  formData.append('category', 'general');
  for (const photo of pending) {
    const blob = await fetch(photo.path).then(r => r.blob());
    formData.append('photos', blob, photo.filename);
  }
  try {
    const res = await fetch(`${API_BASE}/photos`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${state.token}` },
      body: formData,
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        state.photos.forEach(p => { if (!p.uploaded) p.uploaded = true; });
      }
    }
  } catch (e) {
    console.warn('Photo sync error:', e);
  }
}

// ─── Forms ──────────────────────────────────────────────────────────────────────

function siteForm(): string {
  const s = (state.siteInfo || {}) as SiteInfo;
  const f = (k: keyof SiteInfo) => String((s[k] as any) || '');
  return `
  <form onsubmit="saveSite(event)" class="form-scroll">
    <div class="form-section-title">Site Identification</div>
    <div class="form-row">
      <div class="form-group"><label>Site ID *</label><input id="s_siteId" value="${f('siteId')}" required placeholder="e.g. KA1108"></div>
      <div class="form-group"><label>ATC No.</label><input id="s_atcNo" value="${f('atcNo')}" placeholder="e.g. 607030"></div>
    </div>
    <div class="form-group"><label>Site Name *</label><input id="s_siteName" value="${f('siteName')}" required placeholder="e.g. Bugolobi"></div>
    <div class="form-row">
      <div class="form-group"><label>Survey Date *</label><input id="s_surveyDate" type="date" value="${f('surveyDate') || today()}" required></div>
      <div class="form-group"><label>No. of Tenants</label><input id="s_noOfTenants" type="number" value="${f('noOfTenants') || ''}" placeholder="1"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Technician Name *</label><input id="s_technicianName" value="${f('technicianName')}" required placeholder="Your name"></div>
      <div class="form-group"><label>Contacts</label><input id="s_technicianContacts" value="${f('technicianContacts')}" placeholder="Phone"></div>
    </div>
    <div class="form-group"><label>Contractor</label><input id="s_contractorName" value="${f('contractorName')}" placeholder="Company"></div>
    <div class="form-section-title">GPS Coordinates</div>
    <div class="form-row">
      <div class="form-group"><label>Latitude *</label><input id="s_latitude" value="${f('latitude')}" required type="number" step="0.000001" placeholder="0.3146"></div>
      <div class="form-group"><label>Longitude *</label><input id="s_longitude" value="${f('longitude')}" required type="number" step="0.000001" placeholder="32.6223"></div>
    </div>
    <div class="form-section-title">Tower Details</div>
    <div class="form-row">
      <div class="form-group"><label>Tower Type</label>
        <select id="s_towerType"><option value="">— Select —</option>
          ${['GBT','RTT','RTP'].map(t => `<option value="${t}" ${f('towerType')===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Tower Height (m)</label><input id="s_towerHeight" type="number" value="${f('towerHeight')||''}" placeholder="e.g. 30"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Building Height (m)</label><input id="s_buildingHeight" type="number" value="${f('buildingHeight')||''}" placeholder="0 if GBT/RTT"></div>
      <div class="form-group"><label>Indoor/Outdoor</label>
        <select id="s_indoorOutdoor"><option value="">— Select —</option>
          ${['Indoor','Outdoor'].map(v => `<option value="${v}" ${f('indoorOutdoor')===v?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-section-title">Power Setup</div>
    <div class="form-row">
      <div class="form-group"><label>Grid / DG / Solar</label>
        <select id="s_gridDgSolar"><option value="">— Select —</option>
          ${['Grid','DG','Solar','Grid + DG','Grid + Solar','All'].map(v => `<option value="${v}" ${f('gridPower')===v?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Grid Distance to 3-Phase (m)</label><input id="s_gridDistanceTo3Phase" type="number" value="${f('gridDistanceTo3Phase')||''}" placeholder="e.g. 50"></div>
    </div>
    <div class="form-group"><label>Guard at Site?</label>
      <select id="s_guardAtSite"><option value="Yes" ${f('guardAtSite')==='Yes'?'selected':''}>Yes</option><option value="No" ${f('guardAtSite')==='No'?'selected':''}>No</option></select>
    </div>
    <button type="submit" class="btn-primary">💾 Save Site Info</button>
  </form>`;
}

function saveSite(e: Event) {
  e.preventDefault();
  state.siteInfo = {
    siteId:           (el('s_siteId') as HTMLInputElement).value,
    atcNo:           (el('s_atcNo') as HTMLInputElement).value,
    siteName:        (el('s_siteName') as HTMLInputElement).value,
    surveyDate:      (el('s_surveyDate') as HTMLInputElement).value,
    technicianName:  (el('s_technicianName') as HTMLInputElement).value,
    technicianContacts: (el('s_technicianContacts') as HTMLInputElement).value,
    contractorName:  (el('s_contractorName') as HTMLInputElement).value,
    latitude:        (el('s_latitude') as HTMLInputElement).value,
    longitude:       (el('s_longitude') as HTMLInputElement).value,
    towerType:       (el('s_towerType') as HTMLSelectElement).value as any,
    towerHeight:     Number((el('s_towerHeight') as HTMLInputElement).value) || 0,
    buildingHeight:  Number((el('s_buildingHeight') as HTMLInputElement).value) || 0,
    totalHeight:     0,
    indoorOutdoor:   (el('s_indoorOutdoor') as HTMLSelectElement).value as any,
    noOfTenants:     Number((el('s_noOfTenants') as HTMLInputElement).value) || 1,
    otherTenants:    '',
    gridPower:       false, dgPower: false, solarPower: false,
    gridDistanceTo3Phase: Number((el('s_gridDistanceTo3Phase') as HTMLInputElement).value) || 0,
    guardAtSite:     (el('s_guardAtSite') as HTMLSelectElement).value === 'Yes',
    trmMediaFiber:   false,
    overallRemarks:  '',
  };
  saveState().then(() => { alert('Site info saved'); render(); });
}

// ─── Ground Equipment ─────────────────────────────────────────────────────────
function groundForm(editId?: string): string {
  if (editId) {
    const r = state.groundEquipment.find(x => x.id === editId);
    if (!r) return groundForm();
    return groundEditForm(r);
  }
  const nextNo = state.groundEquipment.length + 1;
  return groundEditForm({ id: '', no: nextNo } as any);
}

function groundEditForm(r: GroundEquipment): string {
  const g = (k: keyof GroundEquipment) => String((r[k] as any) || '');
  const no = g('no');
  return `
  <form onsubmit="saveGround(event, '${r.id || ''}')" class="form-scroll">
    <div class="form-section-title">Ground Equipment Record ${no ? '#'+no : ''}</div>
    <div class="form-group"><label>No.</label><input id="gr_no" type="number" value="${no}" min="1" placeholder="1"></div>
    <div class="form-row">
      <div class="form-group"><label>Tower Type</label>
        <select id="gr_towerType"><option value="">— Select —</option>
          ${['GBT','RTT','RTP'].map(v=>`<option value="${v}" ${g('towerType')===v?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Tower Height (m)</label><input id="gr_towerHeight" type="number" value="${g('towerHeight')||''}" placeholder="e.g. 30"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Indoor / Outdoor</label>
        <select id="gr_indoorOutdoor"><option value="">— Select —</option>
          ${['Indoor','Outdoor'].map(v=>`<option value="${v}" ${g('indoorOutdoor')===v?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Grid / DG / Solar</label>
        <select id="gr_gridDgSolar"><option value="">— Select —</option>
          ${['Grid','DG','Solar','Grid + DG','Grid + Solar','All'].map(v=>`<option value="${v}" ${g('gridDgSolar')===v?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Grid Dist. to 3-Phase (m)</label><input id="gr_gridDistance3Phase" type="number" value="${g('gridDistance3Phase')||''}" placeholder="e.g. 50"></div>
      <div class="form-group"><label>Guard at Site?</label>
        <select id="gr_guardAtSite"><option value="Yes" ${g('guardAtSite')==='Yes'?'selected':''}>Yes</option><option value="No" ${g('guardAtSite')==='No'?'selected':''}>No</option></select>
      </div>
    </div>
    <div class="form-section-title">RRU</div>
    <div class="form-row">
      <div class="form-group"><label>RRU Type on Ground</label><input id="gr_rruTypeOnGround" value="${g('rruTypeOnGround')}" placeholder="e.g. Huawei RRU 4T4R"></div>
      <div class="form-group"><label>RRU Count</label><input id="gr_rruCountOnGround" type="number" value="${g('rruCountOnGround')||''}" placeholder="e.g. 3"></div>
    </div>
    <div class="form-section-title">Cabinets</div>
    <div class="form-row">
      <div class="form-group"><label>Cabinet Types</label><input id="gr_cabinetTypes" value="${g('cabinetTypes')}" placeholder="e.g. Huawei BTS3900"></div>
      <div class="form-group"><label>Cabinet Count</label><input id="gr_cabinetCount" type="number" value="${g('cabinetCount')||''}" placeholder="e.g. 2"></div>
    </div>
    <div class="form-group"><label>Labelling Done?</label>
      <select id="gr_labellingDone"><option value="">— Select —</option>
        ${['Done','Not Done'].map(v=>`<option value="${v}" ${g('labellingDone')===v?'selected':''}>${v}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>BTS Dimensions (L×W×H mm)</label><input id="gr_btsDimensions" value="${g('btsDimensions')||''}" placeholder="e.g. 600×500×900"></div>
    <div class="form-section-title">Active IDU</div>
    <div class="form-row">
      <div class="form-group"><label>Active IDU Types</label><input id="gr_activeIduTypes" value="${g('activeIduTypes')}" placeholder="e.g. BBU 5900"></div>
      <div class="form-group"><label>IDU Count</label><input id="gr_iduCount" type="number" value="${g('iduCount')||''}" placeholder="e.g. 1"></div>
    </div>
    <div class="form-group"><label>Slab Dimensions (L×W m)</label><input id="gr_slabDimensions" value="${g('slabDimensions')||''}" placeholder="e.g. 3×2"></div>
    <div class="form-section-title">Redundant Equipment</div>
    <div class="form-row">
      <div class="form-group"><label>Redundant Equipment</label><input id="gr_redundantEquipment" value="${g('redundantEquipment')}" placeholder="e.g. Spare PSU"></div>
      <div class="form-group"><label>Redundant Count</label><input id="gr_redundantCount" type="number" value="${g('redundantCount')||''}" placeholder="e.g. 1"></div>
    </div>
    <div class="form-group"><label>TRM Media (Fiber)</label><input id="gr_trmMedia" value="${g('trmMedia')||''}" placeholder="e.g. Single Mode Fiber"></div>
    <div class="form-group"><label>Overall Remarks</label><textarea id="gr_remarks" rows="2" placeholder="Any additional notes...">${g('remarks')}</textarea></div>
    <button type="submit" class="btn-primary">💾 Save Record</button>
    <button type="button" class="btn-secondary" onclick="switchTab('ground')" style="margin-left:8px">Cancel</button>
  </form>`;
}

function saveGround(e: Event, editId: string) {
  e.preventDefault();
  const rec: GroundEquipment = {
    id:              editId || uuidv4(),
    siteId:          state.selectedSite?.siteId || '',
    no:              Number((el('gr_no') as HTMLInputElement).value) || 1,
    rruTypeOnGround: (el('gr_rruTypeOnGround') as HTMLInputElement).value,
    rruCountOnGround: Number((el('gr_rruCountOnGround') as HTMLInputElement).value) || 0,
    cabinetTypes:    (el('gr_cabinetTypes') as HTMLInputElement).value,
    cabinetCount:    Number((el('gr_cabinetCount') as HTMLInputElement).value) || 0,
    labellingDone:   (el('gr_labellingDone') as HTMLSelectElement).value as any,
    cabinetComments: '',
    cabinetDimensions: '',
    activeIduTypes:  (el('gr_activeIduTypes') as HTMLInputElement).value,
    activeIduCount:  Number((el('gr_iduCount') as HTMLInputElement).value) || 0,
    nonActiveIduTypes: '',
    nonActiveIduCount: 0,
    slabDimensions:  (el('gr_slabDimensions') as HTMLInputElement).value,
    redundantEquipment: (el('gr_redundantEquipment') as HTMLInputElement).value,
    redundantCount:   Number((el('gr_redundantCount') as HTMLInputElement).value) || 0,
    towerType:       (el('gr_towerType') as HTMLSelectElement).value as any,
    towerHeight:     Number((el('gr_towerHeight') as HTMLInputElement).value) || 0,
    buildingHeight:  0, totalHeight: 0,
    indoorOutdoor:   (el('gr_indoorOutdoor') as HTMLSelectElement).value as any,
    gridDistanceTo3Phase: Number((el('gr_gridDistance3Phase') as HTMLInputElement).value) || 0,
    guardAtSite:     (el('gr_guardAtSite') as HTMLSelectElement).value === 'Yes',
    gridPower: false, dgPower: false, solarPower: false,
    trmMediaFiber: false,
    createdAt:       editId ? (state.groundEquipment.find(x=>x.id===editId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
    synced:          false,
    remarks:        (el('gr_remarks') as HTMLTextAreaElement).value,
    gridDgSolar:    (el('gr_gridDgSolar') as HTMLSelectElement).value,
    trmMedia:       (el('gr_trmMedia') as HTMLInputElement).value,
    btsDimensions:  (el('gr_btsDimensions') as HTMLInputElement).value,
  };
  if (editId) {
    const idx = state.groundEquipment.findIndex(x => x.id === editId);
    if (idx >= 0) state.groundEquipment[idx] = rec;
  } else {
    state.groundEquipment.push(rec);
  }
  saveState().then(() => { alert('Record saved'); switchTab('ground'); render(); });
}

function deleteGround(id: string) {
  if (!confirm('Delete this record?')) return;
  state.groundEquipment = state.groundEquipment.filter(x => x.id !== id);
  saveState().then(() => render());
}

// ─── DCDB Records ─────────────────────────────────────────────────────────────
function dcdbForm(editId?: string): string {
  if (editId) {
    const r = state.dcdbRecords.find(x => x.id === editId);
    if (!r) return dcdbForm();
    return dcdbEditForm(r);
  }
  const nextNo = state.dcdbRecords.length + 1;
  return dcdbEditForm({ id: '', no: nextNo } as any);
}

function dcdbEditForm(r: DCDBRecord): string {
  const g = (k: keyof DCDBRecord) => String((r[k] as any) || '');
  return `
  <form onsubmit="saveDcdb(event, '${r.id || ''}')" class="form-scroll">
    <div class="form-section-title">DCDB Record ${g('no') ? '#'+g('no') : ''}</div>
    <div class="form-group"><label>No.</label><input id="dr_no" type="number" value="${g('no')||'1'}" min="1"></div>
    <div class="form-section-title">DCDB Supply</div>
    <div class="form-row">
      <div class="form-group"><label>Priority Supply Cable Size (mm²)</label><input id="dr_dcdbPrioritySupplyCableSize" value="${g('dcdbPrioritySupplyCableSize')||''}" placeholder="e.g. 16"></div>
      <div class="form-group"><label>Load (A)</label><input id="dr_dcdbLoadAmps" type="number" value="${g('dcdbLoadAmps')||''}" placeholder="e.g. 63"></div>
    </div>
    <div class="form-section-title">DCDB Breakers</div>
    <div class="form-row five-col">
      ${['A1','A2','A3','A4','A5'].map((s,i) => `<div class="form-group"><label>Breaker ${s} (A)</label><input id="dr_dcdbBreaker${s}" type="number" value="${g('dcdbBreaker'+(i+1))||''}"></div>`).join('')}
    </div>
    <div class="form-section-title">DCDU Breakers</div>
    <div class="form-row five-col">
      ${['1','2','3','4','5'].map((s,i) => `<div class="form-group"><label>DCDU Breaker ${s}</label><input id="dr_dduBreakerModel${s}" value="${g('dduBreakerModel'+(i+1))||''}" placeholder="e.g. 63A MCB"></div>`).join('')}
    </div>
    <div class="form-section-title">RRU Power Cables</div>
    <div class="form-row">
      <div class="form-group"><label>Cable Count</label><input id="dr_rruPowerCableCount" type="number" value="${g('rruPowerCableCount')||''}"></div>
      <div class="form-group"><label>Missing Cables</label><input id="dr_rruPowerCableMissing" type="number" value="${g('rruPowerCableMissing')||''}"></div>
      <div class="form-group"><label>Length per Run (m)</label><input id="dr_rruPowerCableLength" type="number" value="${g('rruPowerCableLength')||''}"></div>
    </div>
    <div class="form-section-title">AAU Power Cables</div>
    <div class="form-row">
      <div class="form-group"><label>Cable Count</label><input id="dr_aauPowerCableCount" type="number" value="${g('aauPowerCableCount')||''}"></div>
      <div class="form-group"><label>Missing Cables</label><input id="dr_aauPowerCableMissing" type="number" value="${g('aauPowerCableMissing')||''}"></div>
      <div class="form-group"><label>Length per Run (m)</label><input id="dr_aauPowerCableLength" type="number" value="${g('aauPowerCableLength')||''}"></div>
    </div>
    <div class="form-section-title">Earthing Cables</div>
    <div class="form-row">
      <div class="form-group"><label>RRU Earthing Count</label><input id="dr_rruEarthingCableCount" type="number" value="${g('rruEarthingCableCount')||''}"></div>
      <div class="form-group"><label>RRU Earthing Missing</label><input id="dr_rruEarthingCableMissing" type="number" value="${g('rruEarthingCableMissing')||''}"></div>
      <div class="form-group"><label>RRU Earthing Length (m)</label><input id="dr_rruEarthingCableLength" type="number" value="${g('rruEarthingCableLength')||''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>AAU Earthing Count</label><input id="dr_aauEarthingCableCount" type="number" value="${g('aauEarthingCableCount')||''}"></div>
      <div class="form-group"><label>AAU Earthing Missing</label><input id="dr_aauEarthingCableMissing" type="number" value="${g('aauEarthingCableMissing')||''}"></div>
      <div class="form-group"><label>AAU Earthing Length (m)</label><input id="dr_aauEarthingCableLength" type="number" value="${g('aauEarthingCableLength')||''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>BTS Earthing Count</label><input id="dr_btsEarthingCableCount" type="number" value="${g('btsEarthingCableCount')||''}"></div>
      <div class="form-group"><label>BTS Earthing Missing</label><input id="dr_btsEarthingCableMissing" type="number" value="${g('btsEarthingCableMissing')||''}"></div>
      <div class="form-group"><label>BTS Earthing Length (m)</label><input id="dr_btsEarthingCableLength" type="number" value="${g('btsEarthingCableLength')||''}"></div>
    </div>
    <div class="form-group"><label>Earthing Connection</label>
      <select id="dr_earthingConnection"><option value="">— Select —</option>
        ${['Good','Fair','Poor','Not Connected'].map(v=>`<option value="${v}" ${g('earthingConnection')===v?'selected':''}>${v}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>Remarks</label><textarea id="dr_remarks" rows="2">${g('remarks')}</textarea></div>
    <button type="submit" class="btn-primary">💾 Save DCDB Record</button>
    <button type="button" class="btn-secondary" onclick="switchTab('dcdb')" style="margin-left:8px">Cancel</button>
  </form>`;
}

function saveDcdb(e: Event, editId: string) {
  e.preventDefault();
  const mk = (id: string) => (el('dr_'+id) as HTMLInputElement).value;
  const mn = (id: string) => Number((el('dr_'+id) as HTMLInputElement).value) || 0;
  const rec: DCDBRecord = {
    id:                          editId || uuidv4(),
    siteId:                      state.selectedSite?.siteId || '',
    no:                          mn('no') || 1,
    dcdbPrioritySupplyCableSize: mk('dcdbPrioritySupplyCableSize'),
    dcdbLoadAmps:               mn('dcdbLoadAmps'),
    dcdbBreaker1: mn('dcdbBreakerA1'), dcdbBreaker2: mn('dcdbBreakerA2'),
    dcdbBreaker3: mn('dcdbBreakerA3'), dcdbBreaker4: mn('dcdbBreakerA4'), dcdbBreaker5: mn('dcdbBreakerA5'),
    prioritySupplyCableSize: 0, prioritySupplyCableToDCDU: 0, priorityLoadMeasurement: 0, priorityBreaker1: 0,
    dcdiBreaker1: mk('dduBreakerModel1'), dcdiBreaker2: mk('dduBreakerModel2'),
    dcdiBreaker3: mk('dduBreakerModel3'), dcdiBreaker4: mk('dduBreakerModel4'), dcdiBreaker5: mk('dduBreakerModel5'),
    totalDCDUCount: 0,
    rruCount: 0, rruPowerCableCount: mn('rruPowerCableCount'), rruPowerCableMissing: mn('rruPowerCableMissing'),
    rruPowerCableLengthPerRun: mn('rruPowerCableLength'), rruPowerCableTotalMissing: 0,
    rruEarthingCableCount: mn('rruEarthingCableCount'), rruEarthingCableMissing: mn('rruEarthingCableMissing'),
    rruEarthingCableLength: mn('rruEarthingCableLength'),
    aauCount: 0, aauPowerCableCount: mn('aauPowerCableCount'), aauPowerCableMissing: mn('aauPowerCableMissing'),
    aauPowerCableLength: mn('aauPowerCableLength'), aauPowerCableTotalMissing: 0,
    aauEarthingCableCount: mn('aauEarthingCableCount'), aauEarthingCableMissing: mn('aauEarthingCableMissing'),
    aauEarthingCableLength: mn('aauEarthingCableLength'),
    btsEarthingCableCount: mn('btsEarthingCableCount'), btsEarthingCableMissing: mn('btsEarthingCableMissing'),
    btsEarthingLengthPerRun: mn('btsEarthingCableLength'), btsEarthingTotalMissing: 0,
    earthingConnection: (el('dr_earthingConnection') as HTMLSelectElement).value,
    gridDistanceTo3Phase: 0, dcdbSupplyCableSize: 0, dcdbSupplyCableToDCDU: 0,
    dcdbSupplyLoadMeasurement: 0, dcdbTimeMeasured: '',
    createdAt: editId ? (state.dcdbRecords.find(x=>x.id===editId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
    synced: false,
    remarks: (el('dr_remarks') as HTMLTextAreaElement).value,
  };
  // Map DCDU breaker fields
  ['1','2','3','4','5'].forEach((s,i) => {
    (rec as any)['dduBreakerModel'+s] = mk('dduBreakerModel'+s);
  });
  ['A1','A2','A3','A4','A5'].forEach((s,i) => {
    (rec as any)['dcdbBreaker'+s] = mn('dcdbBreaker'+s);
  });
  if (editId) {
    const idx = state.dcdbRecords.findIndex(x => x.id === editId);
    if (idx >= 0) state.dcdbRecords[idx] = rec;
  } else {
    state.dcdbRecords.push(rec);
  }
  saveState().then(() => { alert('DCDB record saved'); switchTab('dcdb'); render(); });
}

function deleteDcdb(id: string) {
  if (!confirm('Delete this DCDB record?')) return;
  state.dcdbRecords = state.dcdbRecords.filter(x => x.id !== id);
  saveState().then(() => render());
}

// ─── Tower Equipment ───────────────────────────────────────────────────────────
function towerForm(editId?: string): string {
  if (editId) {
    const r = state.towerEquipment.find(x => x.id === editId);
    if (!r) return towerForm();
    return towerEditForm(r);
  }
  const nextNo = state.towerEquipment.length + 1;
  return towerEditForm({ id: '', no: nextNo, sector: '' } as any);
}

function towerEditForm(r: TowerEquipment): string {
  const g = (k: keyof TowerEquipment) => String((r[k] as any) || '');
  return `
  <form onsubmit="saveTower(event, '${r.id || ''}')" class="form-scroll">
    <div class="form-section-title">Tower Equipment ${g('no') ? '#'+g('no') : ''}</div>
    <div class="form-group"><label>No.</label><input id="tr_no" type="number" value="${g('no')||'1'}" min="1"></div>
    <div class="form-row">
      <div class="form-group"><label>Airtel Site ID</label><input id="tr_airtelSiteId" value="${g('airtelSiteId')||state.selectedSite?.siteId||''}" placeholder="e.g. UG0047"></div>
      <div class="form-group"><label>Site Name</label><input id="tr_siteName" value="${g('siteName')||state.selectedSite?.siteName||''}" placeholder="e.g. Bugolobi"></div>
    </div>
    <div class="form-section-title">RF / TRM Equipment</div>
    <div class="form-group"><label>Equipment Type</label>
      <select id="tr_rfEquipmentType"><option value="">— Select —</option>
        ${['RF antenna','MW Antenna','MW ODU','RRU','BBU','DCDB','Other'].map(v=>`<option value="${v}" ${g('rfEquipmentType')===v?'selected':''}>${v}</option>`).join('')}
      </select>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Antenna Manufacturer</label><input id="tr_antennaManufacturer" value="${g('antennaManufacturer')}" placeholder="e.g. Huawei"></div>
      <div class="form-group"><label>Antenna Model</label><input id="tr_antennaModel" value="${g('antennaModel')}" placeholder="e.g. ATNB-Y-3-15"></div>
    </div>
    <div class="form-section-title">Sector Configuration</div>
    <div class="form-row">
      <div class="form-group"><label>Tenant Owner</label><input id="tr_tenantOwner" value="${g('tenantOwner')}" placeholder="e.g. Airtel"></div>
      <div class="form-group"><label>Antenna per Sector</label><input id="tr_antennaPerSector" type="number" value="${g('antennaPerSector')||''}" placeholder="e.g. 1"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Sector</label>
        <select id="tr_sector"><option value="">— Select —</option>
          ${['A','B','C','Alpha','Beta','Gamma'].map(v=>`<option value="${v}" ${g('sector')===v?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Azimuth (°)</label><input id="tr_azimuth" type="number" value="${g('azimuth')||''}" placeholder="e.g. 60"></div>
      <div class="form-group"><label>Height to Centre (m)</label><input id="tr_heightToCentre" type="number" value="${g('heightToCentre')||''}" placeholder="e.g. 28"></div>
    </div>
    <div class="form-section-title">Physical Dimensions</div>
    <div class="form-row">
      <div class="form-group"><label>Antenna Count</label><input id="tr_antennaCount" type="number" value="${g('antennaCount')||''}" placeholder="e.g. 2"></div>
      <div class="form-group"><label>Length (mm)</label><input id="tr_antennaLength" type="number" value="${g('antennaLengthMm')||''}" placeholder="e.g. 1492"></div>
      <div class="form-group"><label>Width (mm)</label><input id="tr_antennaWidth" type="number" value="${g('antennaWidthMm')||''}" placeholder="e.g. 372"></div>
      <div class="form-group"><label>Height (mm)</label><input id="tr_antennaHeight" type="number" value="${g('antennaHeightMm')||''}" placeholder="e.g. 99"></div>
    </div>
    <div class="form-section-title">Status</div>
    <div class="form-row">
      <div class="form-group"><label>Active / Inactive</label>
        <select id="tr_activeStatus"><option value="">— Select —</option>
          ${['Active','Inactive','Standby'].map(v=>`<option value="${v}" ${g('activeStatus')===v?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Equipment Labelling</label>
        <select id="tr_equipmentLabelling"><option value="">— Select —</option>
          ${['Done','Not Done'].map(v=>`<option value="${v}" ${g('equipmentLabelling')===v?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group"><label>Remarks</label><textarea id="tr_remarks" rows="2">${g('remarks')}</textarea></div>
    <button type="submit" class="btn-primary">💾 Save Tower Entry</button>
    <button type="button" class="btn-secondary" onclick="switchTab('tower')" style="margin-left:8px">Cancel</button>
  </form>`;
}

function saveTower(e: Event, editId: string) {
  e.preventDefault();
  const mk = (id: string) => (el('tr_'+id) as HTMLInputElement).value;
  const mn = (id: string) => Number((el('tr_'+id) as HTMLInputElement).value) || 0;
  const rec: TowerEquipment = {
    id:                  editId || uuidv4(),
    siteId:              state.selectedSite?.siteId || '',
    no:                  mn('no') || 1,
    airtelSiteId:        mk('airtelSiteId'),
    siteName:            mk('siteName'),
    rfEquipmentType:     mk('rfEquipmentType') as any,
    antennaManufacturer: mk('antennaManufacturer'),
    antennaModel:        mk('antennaModel'),
    tenantOwner:         mk('tenantOwner'),
    antennaPerSector:   mn('antennaPerSector'),
    sector:              (el('tr_sector') as HTMLSelectElement).value as any,
    azimuth:             mn('azimuth'),
    heightToCentre:      mn('heightToCentre'),
    antennaCount:        mn('antennaCount'),
    antennaLengthMm:      mn('antennaLength'),
    antennaWidthMm:       mn('antennaWidth'),
    antennaHeightMm:      mn('antennaHeight'),
    activeInactive:      (el('tr_activeStatus') as HTMLSelectElement).value as any,
    labelling:           (el('tr_equipmentLabelling') as HTMLSelectElement).value as any,
    remarks:             (el('tr_remarks') as HTMLTextAreaElement).value,
    equipmentType:       mk('rfEquipmentType') as any,
    lengthMm:            mn('antennaLength'),
    widthMm:             mn('antennaWidth'),
    heightMm:            mn('antennaHeight'),
    activeStatus:        (el('tr_activeStatus') as HTMLSelectElement).value,
    equipmentLabelling:  (el('tr_equipmentLabelling') as HTMLSelectElement).value,
    createdAt: editId ? (state.towerEquipment.find(x=>x.id===editId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
    synced: false,
  };
  if (editId) {
    const idx = state.towerEquipment.findIndex(x => x.id === editId);
    if (idx >= 0) state.towerEquipment[idx] = rec;
  } else {
    state.towerEquipment.push(rec);
  }
  saveState().then(() => { alert('Tower entry saved'); switchTab('tower'); render(); });
}

function deleteTower(id: string) {
  if (!confirm('Delete this tower entry?')) return;
  state.towerEquipment = state.towerEquipment.filter(x => x.id !== id);
  saveState().then(() => render());
}

// ─── Render Helpers ────────────────────────────────────────────────────────────
function renderGroundList(): string {
  if (!state.groundEquipment.length) return '<p class="empty-state">No ground equipment records. Tap + to add.</p>';
  return state.groundEquipment.map(r => `
  <div class="record-card ${(r as any).synced ? 'synced' : 'pending'}">
    <div class="record-header">
      <strong>#${r.no || '—'} — ${r.towerType || '—'}</strong>
      ${(r as any).synced ? '<span class="sync-badge synced">Synced</span>' : '<span class="sync-badge pending">Pending</span>'}
    </div>
    <div class="record-fields">
      <div class="field-row"><span class="field-label">RRU</span><span>${r.rruTypeOnGround || '—'} ×${r.rruCountOnGround || 0}</span></div>
      <div class="field-row"><span class="field-label">Cabinet</span><span>${r.cabinetTypes || '—'} ×${r.cabinetCount || 0}</span></div>
      <div class="field-row"><span class="field-label">Labelling</span><span>${r.labellingDone || '—'}</span></div>
      <div class="field-row"><span class="field-label">Remarks</span><span>${r.remarks || '—'}</span></div>
    </div>
    <div class="record-actions">
      <button class="btn-sm" onclick="groundFormRender('${r.id}')">Edit</button>
      <button class="btn-danger-sm" onclick="deleteGround('${r.id}')">Delete</button>
    </div>
  </div>`).join('');
}

function renderDcdbList(): string {
  if (!state.dcdbRecords.length) return '<p class="empty-state">No DCDB records. Tap + to add.</p>';
  return state.dcdbRecords.map(r => `
  <div class="record-card ${(r as any).synced ? 'synced' : 'pending'}">
    <div class="record-header">
      <strong>#${r.no || '—'} — DCDB Record</strong>
      ${(r as any).synced ? '<span class="sync-badge synced">Synced</span>' : '<span class="sync-badge pending">Pending</span>'}
    </div>
    <div class="record-fields">
      <div class="field-row"><span class="field-label">Priority Cable</span><span>${(r as any).dcdbPrioritySupplyCableSize || '—'} mm²</span></div>
      <div class="field-row"><span class="field-label">Load</span><span>${(r as any).dcdbLoadAmps || '—'} A</span></div>
      <div class="field-row"><span class="field-label">Earthing</span><span>${r.earthingConnection || '—'}</span></div>
      <div class="field-row"><span class="field-label">Remarks</span><span>${r.remarks || '—'}</span></div>
    </div>
    <div class="record-actions">
      <button class="btn-sm" onclick="dcdbFormRender('${r.id}')">Edit</button>
      <button class="btn-danger-sm" onclick="deleteDcdb('${r.id}')">Delete</button>
    </div>
  </div>`).join('');
}

function renderTowerList(): string {
  if (!state.towerEquipment.length) return '<p class="empty-state">No tower entries. Tap + to add.</p>';
  return state.towerEquipment.map(r => `
  <div class="record-card ${(r as any).synced ? 'synced' : 'pending'}">
    <div class="record-header">
      <strong>#${r.no || '—'} — ${r.antennaManufacturer || '—'} ${r.antennaModel || '—'}</strong>
      ${(r as any).synced ? '<span class="sync-badge synced">Synced</span>' : '<span class="sync-badge pending">Pending</span>'}
    </div>
    <div class="record-fields">
      <div class="field-row"><span class="field-label">Sector</span><span>${r.sector || '—'} / Azimuth: ${r.azimuth || '—'}°</span></div>
      <div class="field-row"><span class="field-label">Height</span><span>${r.heightToCentre || '—'} m</span></div>
      <div class="field-row"><span class="field-label">Status</span><span>${(r as any).activeStatus || '—'}</span></div>
      <div class="field-row"><span class="field-label">Labelling</span><span>${(r as any).equipmentLabelling || '—'}</span></div>
      <div class="field-row"><span class="field-label">Remarks</span><span>${r.remarks || '—'}</span></div>
    </div>
    <div class="record-actions">
      <button class="btn-sm" onclick="towerFormRender('${r.id}')">Edit</button>
      <button class="btn-danger-sm" onclick="deleteTower('${r.id}')">Delete</button>
    </div>
  </div>`).join('');
}

// Form render bridges (called from onclick, not render loop)
function groundFormRender(editId?: string) {
  const content = document.getElementById('tab-content')!;
  content.innerHTML = groundForm(editId);
  switchTab('ground');
}
function dcdbFormRender(editId?: string) {
  const content = document.getElementById('tab-content')!;
  content.innerHTML = dcdbForm(editId);
  switchTab('dcdb');
}
function towerFormRender(editId?: string) {
  const content = document.getElementById('tab-content')!;
  content.innerHTML = towerForm(editId);
  switchTab('tower');
}

// Make form renderers globally accessible
(window as any).groundFormRender = groundFormRender;
(window as any).dcdbFormRender  = dcdbFormRender;
(window as any).towerFormRender = towerFormRender;

function switchTab(tab: AppState['currentTab']) {
  state.currentTab = tab;
  render();
}

function renderPhotoGallery(): string {
  const cats = ['ground', 'dcdb', 'tower', 'general'] as const;
  return `
  <div class="page">
    <h2 class="page-title">📷 Photo Gallery</h2>
    <p class="page-desc">${state.photos.length} photo(s) captured.</p>
    ${cats.map(cat => {
      const photos = state.photos.filter(p => p.category === cat);
      if (!photos.length) return '';
      const label = cat === 'ground' ? '📦 Ground' : cat === 'dcdb' ? '⚡ DCDB' : cat === 'tower' ? '📡 Tower' : '🏗️ General';
      return `
      <div class="photo-category-label">${label}</div>
      <div class="photo-grid">
        ${photos.map(p => `
        <div class="photo-item">
          <img src="${p.path}" alt="${p.filename}" onclick="viewPhoto('${p.id}')">
          <div class="photo-info">
            <span class="photo-status ${p.uploaded ? 'uploaded' : 'pending'}">${p.uploaded ? '↑ Synced' : '○ Local'}</span>
            <button class="btn-danger-sm" onclick="deletePhoto('${p.id}')">×</button>
          </div>
        </div>`).join('')}
      </div>`;
    }).join('')}
    <div class="photo-actions">
      ${cats.map(cat => {
        const label = cat === 'ground' ? '📦 Ground' : cat === 'dcdb' ? '⚡ DCDB' : cat === 'tower' ? '📡 Tower' : '🏗️ General';
        return `<button class="btn-secondary" onclick="takePhoto('${cat}')" style="margin:4px">${label}</button>`;
      }).join('')}
    </div>
  </div>`;
}

async function takePhoto(category: PhotoRecord['category']) {
  await capturePhoto(category);
}

function viewPhoto(id: string) {
  const p = state.photos.find(x => x.id === id);
  if (p) window.open(p.path, '_blank');
}

function deletePhoto(id: string) {
  if (!confirm('Delete this photo?')) return;
  state.photos = state.photos.filter(p => p.id !== id);
  saveState().then(() => render());
}

function renderSyncTab(): string {
  const pending = [...state.groundEquipment, ...state.dcdbRecords, ...state.towerEquipment].filter(a => !(a as any).synced).length;
  const photoPending = state.photos.filter(p => !p.uploaded).length;
  return `
  <div class="page">
    <h2 class="page-title">🔄 Sync to Server</h2>
    <div class="sync-status-card ${state.isOnline ? 'online' : 'offline'}">
      <div class="sync-status-icon">${state.isOnline ? '🟢' : '🔴'}</div>
      <div>
        <strong>${state.isOnline ? 'Online' : 'Offline'}</strong><br>
        <small>${state.isOnline ? 'Connected — ready to sync' : 'No connection — data saved locally'}</small>
      </div>
    </div>
    <div class="summary-section">
      <div class="summary-row"><span>Ground Equipment</span><span class="summary-count">${state.groundEquipment.length} records</span></div>
      <div class="summary-row"><span>DCDB Records</span><span class="summary-count">${state.dcdbRecords.length} records</span></div>
      <div class="summary-row"><span>Tower Equipment</span><span class="summary-count">${state.towerEquipment.length} entries</span></div>
      <div class="summary-row"><span>Photos</span><span class="summary-count">${state.photos.length} photos</span></div>
      <div class="summary-row pending"><span>Pending sync</span><span class="summary-count">${pending} records + ${photoPending} photos</span></div>
    </div>
    <button class="btn-primary" onclick="syncAll()" ${!state.isOnline ? 'disabled' : ''} style="width:100%;margin-top:16px">
      ${state.isOnline ? '🚀 Sync All Data' : '⚠️ Connect to sync'}
    </button>
    <div class="site-info-bar">
      <strong>Site:</strong> ${state.selectedSite?.siteId || '—'} — ${state.selectedSite?.siteName || ''}
    </div>
  </div>`;
}

// ─── Main Render ───────────────────────────────────────────────────────────────
function render() {
  const app = el('app');

  if (state.currentTab === 'login') {
    app.innerHTML = `
    <div class="login-screen">
      <div class="login-logo">📡</div>
      <h1 class="login-title">BTS Site Audit</h1>
      <p class="login-subtitle">Sign in to continue</p>
      <input class="login-input" id="loginEmail" type="email" placeholder="Email address" value="admin@bts-audit.com">
      <input class="login-input" id="loginPassword" type="password" placeholder="Password" value="admin123" onkeydown="if(event.key==='Enter')doLogin()">
      <div id="loginError" class="login-error"></div>
      <button class="btn-primary" onclick="doLogin()">Sign In</button>
    </div>`;
    return;
  }

  if (state.currentTab === 'sites') {
    app.innerHTML = `
    <div class="login-header">
      <span>👋 ${state.currentUser?.name || ''}</span>
      <button class="btn-secondary btn-sm" onclick="doLogout()">Logout</button>
    </div>
    <div class="sites-screen">
      <h2 class="page-title">🏗️ Select a Site</h2>
      <p class="page-desc">Choose the BTS site you are auditing today.</p>
      ${state.assignedSites.length === 0 ? '<p class="empty-state">No sites assigned to you. Contact your administrator.</p>' :
        state.assignedSites.map(s => `
        <div class="site-card" onclick="selectSiteById('${s.siteId}')">
          <div class="site-card-id">${s.siteId}</div>
          <div class="site-card-name">${s.siteName}</div>
          ${s.atcNo ? `<div class="site-card-meta">ATC: ${s.atcNo}</div>` : ''}
          ${s.latitude ? `<div class="site-card-meta">📍 ${s.latitude}, ${s.longitude}</div>` : ''}
        </div>`).join('')
      }
    </div>`;
    return;
  }

  // Main app — site selected
  const tabs: Array<{id: AppState['currentTab'], icon: string, label: string}> = [
    { id: 'site',   icon: '🏗️', label: 'Site' },
    { id: 'ground', icon: '📦', label: 'Ground' },
    { id: 'dcdb',   icon: '⚡', label: 'DCDB' },
    { id: 'tower',  icon: '📡', label: 'Tower' },
    { id: 'photos', icon: '📷', label: 'Photos' },
    { id: 'sync',   icon: '🔄', label: 'Sync' },
  ];

  const pendingCount = [...state.groundEquipment, ...state.dcdbRecords, ...state.towerEquipment]
    .filter(a => !(a as any).synced).length;

  let tabContent = '';

  if (state.currentTab === 'site') {
    tabContent = siteForm();
  } else if (state.currentTab === 'ground') {
    tabContent = `
    <div class="tab-toolbar">
      <button class="btn-primary btn-sm" onclick="groundFormRender()">+ Add Record</button>
    </div>
    ${renderGroundList()}`;
  } else if (state.currentTab === 'dcdb') {
    tabContent = `
    <div class="tab-toolbar">
      <button class="btn-primary btn-sm" onclick="dcdbFormRender()">+ Add Record</button>
    </div>
    ${renderDcdbList()}`;
  } else if (state.currentTab === 'tower') {
    tabContent = `
    <div class="tab-toolbar">
      <button class="btn-primary btn-sm" onclick="towerFormRender()">+ Add Entry</button>
    </div>
    ${renderTowerList()}`;
  } else if (state.currentTab === 'photos') {
    tabContent = renderPhotoGallery();
  } else if (state.currentTab === 'sync') {
    tabContent = renderSyncTab();
  }

  app.innerHTML = `
  <div class="app-header">
    <div class="app-header-title">📡 BTS Audit</div>
    <div class="app-header-info">
      <span class="site-badge">${state.selectedSite?.siteId || ''}</span>
      <span class="online-dot ${state.isOnline ? 'online' : 'offline'}"></span>
      ${pendingCount > 0 ? `<span class="pending-badge">${pendingCount}</span>` : ''}
      <button class="btn-sm" onclick="showSiteSwitcher()" style="margin-left:6px">🏗️</button>
    </div>
  </div>

  <div id="tab-content" class="tab-content-area">
    ${tabContent}
  </div>

  <nav class="bottom-nav">
    ${tabs.map(t => `
    <button class="nav-btn ${state.currentTab===t.id?'active':''}" onclick="switchTab('${t.id}')">
      <span class="nav-icon">${t.icon}</span>
      <span class="nav-label">${t.label}</span>
      ${t.id==='sync' && pendingCount>0 ? `<span class="nav-count">${pendingCount}</span>` : ''}
    </button>`).join('')}
  </nav>`;
}

// Site switcher modal
function showSiteSwitcher() {
  const html = `
  <div class="modal-overlay" onclick="closeSiteSwitcher()">
    <div class="modal-panel" onclick="event.stopPropagation()">
      <div class="modal-header">
        <h3>Switch Site</h3>
        <button class="btn-secondary btn-sm" onclick="closeSiteSwitcher()">Close</button>
      </div>
      <div class="site-list">
        ${state.assignedSites.map(s => `
        <div class="site-card ${s.siteId===state.selectedSite?.siteId?'active':''}" onclick="selectSite('${JSON.stringify(s).replace(/'/g,"\\'")}')">
          <div class="site-card-id">${s.siteId}</div>
          <div class="site-card-name">${s.siteName}</div>
        </div>`).join('')}
      </div>
    </div>
  </div>`;
  const existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', html);
}

function closeSiteSwitcher() {
  document.querySelector('.modal-overlay')?.remove();
}

// Global bridges
(window as any).doLogin = doLogin;
(window as any).doLogout = doLogout;
(window as any).saveSite = saveSite;
(window as any).saveGround = saveGround;
(window as any).saveDcdb = saveDcdb;
(window as any).saveTower = saveTower;
(window as any).deleteGround = deleteGround;
(window as any).deleteDcdb = deleteDcdb;
(window as any).deleteTower = deleteTower;
(window as any).switchTab = switchTab;
(window as any).takePhoto = takePhoto;
(window as any).viewPhoto = viewPhoto;
(window as any).deletePhoto = deletePhoto;
(window as any).syncAll = syncAll;
(window as any).selectSite = selectSite;
(window as any).showSiteSwitcher = showSiteSwitcher;
(window as any).closeSiteSwitcher = closeSiteSwitcher;

// Expose selectSiteById for inline onclick (escaped JSON won't work inline)
(window as any).selectSiteById = (siteId: string) => {
  const s = state.assignedSites.find(x => x.siteId === siteId);
  if (s) selectSite(s);
};

// ─── Boot ──────────────────────────────────────────────────────────────────────
async function main() {
  // Set up network listener
  Network.addListener('networkStatusChange', async ({ connected }) => {
    state.isOnline = connected;
    render();
  });
  await checkOnline();

  // Load auth and render
  await loadAuth();
  render();

  // Check online every 30s
  setInterval(checkOnline, 30_000);
}

main();
