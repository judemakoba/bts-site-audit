/**
 * Site Audit Mobile App — Capacitor-based cross-platform field data capture
 * Matches exact template: Ground Equipment / DCDB / Tower Equipment Scope
 */

import { Capacitor }  from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Preferences } from '@capacitor/preferences';
import { Network }    from '@capacitor/network';
import { StatusBar, Style } from '@capacitor/status-bar';
import { v4 as uuidv4 } from 'uuid';
import type {
  SiteInfo, GroundEquipment, DCDBRecord, TowerEquipment,
  PhotoRecord, AppState, EQUIPMENT_TYPES, SECTOR_OPTIONS,
} from './types';

// ─── State ─────────────────────────────────────────────────────────────────────
const state: AppState = {
  siteInfo: null,
  groundEquipment: [],
  dcdbRecords: [],
  towerEquipment: [],
  photos: [],
  currentTab: 'site',
  isOnline: true,
};

const PREFIX = 'siteaudit_';
const API_BASE = 'http://localhost:3000/api';

// ─── Storage ────────────────────────────────────────────────────────────────────
async function saveState() {
  await Promise.all([
    Preferences.set({ key: PREFIX + 'site',   value: JSON.stringify(state.siteInfo) }),
    Preferences.set({ key: PREFIX + 'ground',    value: JSON.stringify(state.groundEquipment) }),
    Preferences.set({ key: PREFIX + 'dcdb',     value: JSON.stringify(state.dcdbRecords) }),
    Preferences.set({ key: PREFIX + 'tower',     value: JSON.stringify(state.towerEquipment) }),
    Preferences.set({ key: PREFIX + 'photos',   value: JSON.stringify(state.photos) }),
  ]);
}

async function loadState() {
  const keys = ['site', 'ground', 'dcdb', 'tower', 'photos'];
  const [s, g, d, t, p] = await Promise.all(keys.map(k => Preferences.get({ key: PREFIX + k })));
  if (s.value) state.siteInfo        = JSON.parse(s.value);
  if (g.value) state.groundEquipment = JSON.parse(g.value);
  if (d.value) state.dcdbRecords     = JSON.parse(d.value);
  if (t.value) state.towerEquipment  = JSON.parse(t.value);
  if (p.value) state.photos           = JSON.parse(p.value);
}

// ─── Network ───────────────────────────────────────────────────────────────────
async function initNetwork() {
  try {
    const s = await Network.getStatus();
    state.isOnline = s.connected;
  } catch { state.isOnline = navigator.onLine; }
  Network.addListener('networkStatusChange', ns => { state.isOnline = ns.connected; render(); });
}

// ─── Camera ───────────────────────────────────────────────────────────────────
async function capturePhoto(category: PhotoRecord['category'], equipmentId?: string): Promise<PhotoRecord | null> {
  if (!Capacitor.isNativePlatform()) {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      inp.capture = 'environment';
      inp.onchange = async () => {
        const f = inp.files?.[0];
        if (!f) { resolve(null); return; }
        const id = uuidv4();
        const rec: PhotoRecord = {
          id, filename: `photo_${id.substring(0,8)}.jpg`,
          path: URL.createObjectURL(f), category, equipmentId, uploaded: false,
        };
        state.photos.push(rec);
        await saveState(); render(); resolve(rec);
      };
      inp.click();
    });
  }
  try {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      quality: 80, width: 1920, height: 1920,
    });
    const id = uuidv4();
    const rec: PhotoRecord = {
      id, filename: `photo_${id.substring(0,8)}.jpg`,
      path: photo.dataUrl!, category, equipmentId, uploaded: false,
    };
    state.photos.push(rec);
    await saveState(); render(); return rec;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('cancelled') || msg.includes('User denied')) return null;
    console.error('Camera error', e);
    return null;
  }
}

// ─── Sync ─────────────────────────────────────────────────────────────────────
async function syncAll() {
  if (!state.isOnline) { alert('You are offline. Connect to sync.'); return; }
  try {
    const payload = {
      site: state.siteInfo,
      ground: state.groundEquipment,
      dcdb: state.dcdbRecords,
      tower: state.towerEquipment,
    };
    const res = await fetch(API_BASE + '/audit/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      state.groundEquipment.forEach(a => { a.synced = true; });
      state.dcdbRecords.forEach(a => { a.synced = true; });
      state.towerEquipment.forEach(a => { a.synced = true; });
      await saveState(); render();
      alert('✅ Sync complete! All data uploaded.');
    } else {
      alert('Sync failed: ' + res.status);
    }
  } catch (e) {
    alert('Sync error: ' + (e instanceof Error ? e.message : String(e)));
  }
}

// ─── Forms ──────────────────────────────────────────────────────────────────────

function siteForm(): string {
  const s = state.siteInfo || {} as SiteInfo;
  const f = (k: keyof SiteInfo) => (s[k] as any) || '';
  const cb = (k: keyof SiteInfo, v: boolean) =>
    `<input type="checkbox" id="s_${k}" ${v ? 'checked' : ''} style="width:auto;margin-top:6px">`;

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
      <div class="form-group"><label>Survey Technician Name *</label><input id="s_technicianName" value="${f('technicianName')}" required placeholder="Your name"></div>
      <div class="form-group"><label>Technician Contacts</label><input id="s_technicianContacts" value="${f('technicianContacts')}" placeholder="Phone number"></div>
    </div>
    <div class="form-group"><label>Survey Contractor Name</label><input id="s_contractorName" value="${f('contractorName')}" placeholder="Company name"></div>

    <div class="form-section-title">GPS Coordinates</div>
    <div class="form-row">
      <div class="form-group"><label>Latitude *</label><input id="s_latitude" value="${f('latitude')}" required placeholder="e.g. 0.31462666" type="number" step="0.000001"></div>
      <div class="form-group"><label>Longitude *</label><input id="s_longitude" value="${f('longitude')}" required placeholder="e.g. 32.6222516" type="number" step="0.000001"></div>
    </div>

    <div class="form-section-title">Tower Information</div>
    <div class="form-row">
      <div class="form-group"><label>Tower Type</label>
        <select id="s_towerType">
          <option value="">Select...</option>
          <option ${f('towerType')==='GBT'?'selected':''}>GBT</option>
          <option ${f('towerType')==='RTT'?'selected':''}>RTT</option>
          <option ${f('towerType')==='RTP'?'selected':''}>RTP</option>
        </select>
      </div>
      <div class="form-group"><label>Tower Height (m)</label><input id="s_towerHeight" type="number" value="${f('towerHeight') || ''}" placeholder="e.g. 40"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Building Height (m)</label><input id="s_buildingHeight" type="number" value="${f('buildingHeight') || ''}" placeholder="0 if none"></div>
      <div class="form-group"><label>Total Height (m)</label><input id="s_totalHeight" type="number" value="${f('totalHeight') || ''}" placeholder="Auto: Tower + Building"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Site Indoor/Outdoor</label>
        <select id="s_indoorOutdoor">
          <option value="">Select...</option>
          <option ${f('indoorOutdoor')==='Indoor'?'selected':''}>Indoor</option>
          <option ${f('indoorOutdoor')==='Outdoor'?'selected':''}>Outdoor</option>
        </select>
      </div>
      <div class="form-group"><label>Names of Other Tenants</label><input id="s_otherTenants" value="${f('otherTenants')}" placeholder="N/A if none"></div>
    </div>

    <div class="form-section-title">Power Source</div>
    <div class="form-row three-col">
      <div class="form-group">
        <label>Grid Power ${cb('gridPower', s.gridPower as unknown as boolean || false)}</label>
      </div>
      <div class="form-group">
        <label>DG ${cb('dgPower', s.dgPower as unknown as boolean || false)}</label>
      </div>
      <div class="form-group">
        <label>Solar ${cb('solarPower', s.solarPower as unknown as boolean || false)}</label>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Grid Distance to 3-Phase Line (m)</label><input id="s_gridDistanceTo3Phase" type="number" value="${f('gridDistanceTo3Phase') || ''}" placeholder="e.g. 500"></div>
      <div class="form-group"><label>Guard at Site ${cb('guardAtSite', s.guardAtSite as unknown as boolean || false)}</label></div>
    </div>

    <div class="form-section-title">Connectivity</div>
    <div class="form-row">
      <div class="form-group"><label>TRM Media — Is site on Fiber?</label>
        <select id="s_trmMediaFiber">
          <option value="">Select...</option>
          <option ${f('trmMediaFiber')==='true'?'selected':''}>Yes</option>
          <option ${f('trmMediaFiber')==='false'?'selected':''}>No</option>
        </select>
      </div>
    </div>

    <div class="form-group"><label>Overall Remarks</label>
      <textarea id="s_overallRemarks" rows="3" placeholder="Site access notes, safety info, observations...">${f('overallRemarks')}</textarea>
    </div>

    <button type="submit" class="btn-primary btn-full">💾 Save Site Info</button>
  </form>`;
}

function saveSite(e: Event) {
  e.preventDefault();
  const q = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement).value;
  const g = (id: string) => { const el = document.getElementById(id) as HTMLInputElement; return el?.type === 'checkbox' ? el.checked : q(id); };

  state.siteInfo = {
    siteId: q('s_siteId'), atcNo: q('s_atcNo'), siteName: q('s_siteName'),
    surveyDate: q('s_surveyDate'), technicianName: q('s_technicianName'),
    technicianContacts: q('s_technicianContacts'), contractorName: q('s_contractorName'),
    latitude: q('s_latitude'), longitude: q('s_longitude'),
    towerType: q('s_towerType') as SiteInfo['towerType'],
    towerHeight: parseFloat(q('s_towerHeight')) || 0,
    buildingHeight: parseFloat(q('s_buildingHeight')) || 0,
    totalHeight: parseFloat(q('s_totalHeight')) || 0,
    indoorOutdoor: q('s_indoorOutdoor') as SiteInfo['indoorOutdoor'],
    noOfTenants: parseInt(q('s_noOfTenants')) || 1,
    otherTenants: q('s_otherTenants'),
    gridPower: g('s_gridPower') as boolean,
    dgPower: g('s_dgPower') as boolean,
    solarPower: g('s_solarPower') as boolean,
    gridDistanceTo3Phase: parseFloat(q('s_gridDistanceTo3Phase')) || 0,
    guardAtSite: g('s_guardAtSite') as boolean,
    trmMediaFiber: q('s_trmMediaFiber') === 'true',
    overallRemarks: q('s_overallRemarks'),
  };
  saveState(); toast('Site info saved!'); render();
}
(window as any).saveSite = saveSite;

// ─── Ground Equipment Form ─────────────────────────────────────────────────────
let editingGroundId: string | null = null;

function groundForm(editId?: string): string {
  const edit = editId ? state.groundEquipment.find(a => a.id === editId) : null;
  const f = (k: keyof GroundEquipment) => (edit?.[k] as any) || '';
  const opts = (k: keyof GroundEquipment, opts: string[]) =>
    opts.map(o => `<option value="${o}" ${f(k) === o ? 'selected' : ''}>${o}</option>`).join('');

  return `
  <form onsubmit="saveGround(event)" class="form-scroll">
    <input type="hidden" id="gf_id" value="${editId || ''}">

    <div class="form-section-title">RRU on Ground</div>
    <div class="form-row">
      <div class="form-group"><label>RRU Type on Ground</label><input id="gf_rruTypeOnGround" value="${f('rruTypeOnGround')}" placeholder="e.g. N/A, Huawei RRU5512t"></div>
      <div class="form-group"><label>RRU Count on Ground</label><input id="gf_rruCountOnGround" type="number" value="${f('rruCountOnGround') || ''}" placeholder="0"></div>
    </div>

    <div class="form-section-title">Cabinets</div>
    <div class="form-row">
      <div class="form-group"><label>Cabinet Types (Models)</label><input id="gf_cabinetTypes" value="${f('cabinetTypes')}" placeholder="e.g. BTS3900A"></div>
      <div class="form-group"><label>Cabinet Count</label><input id="gf_cabinetCount" type="number" value="${f('cabinetCount') || ''}" placeholder="0"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Labelling of all Equipment</label>
        <select id="gf_labellingDone"><option value="">Select...</option>${opts('labellingDone', ['Done', 'Not Done'])}</select>
      </div>
      <div class="form-group"><label>Cabinets Comments</label><input id="gf_cabinetComments" value="${f('cabinetComments')}" placeholder="e.g. Active, Redundant"></div>
    </div>
    <div class="form-group"><label>BTS Cabinets Dimensions (L×W×H)</label><input id="gf_cabinetDimensions" value="${f('cabinetDimensions')}" placeholder="e.g. 0.6×0.4×1.2"></div>

    <div class="form-section-title">IDU in Cabinet</div>
    <div class="form-row">
      <div class="form-group"><label>Active IDU Types (Models)</label><input id="gf_activeIduTypes" value="${f('activeIduTypes')}" placeholder="e.g. CX2"></div>
      <div class="form-group"><label>Active IDU Count</label><input id="gf_activeIduCount" type="number" value="${f('activeIduCount') || ''}" placeholder="0"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Non-Active IDU Types</label><input id="gf_nonActiveIduTypes" value="${f('nonActiveIduTypes')}" placeholder="N/A if none"></div>
      <div class="form-group"><label>Non-Active IDU Count</label><input id="gf_nonActiveIduCount" type="number" value="${f('nonActiveIduCount') || ''}" placeholder="0"></div>
    </div>

    <div class="form-section-title">Slabs & Redundant Equipment</div>
    <div class="form-row">
      <div class="form-group"><label>Dimensions of Slabs (L×W in m)</label><input id="gf_slabDimensions" value="${f('slabDimensions')}" placeholder="e.g. 2.0×2.0"></div>
      <div class="form-group"><label>Redundant Equipment on Ground</label><input id="gf_redundantEquipment" value="${f('redundantEquipment')}" placeholder="e.g. MW 0.6m Alcatel"></div>
    </div>
    <div class="form-group"><label>Count of Redundant Equipment</label><input id="gf_redundantCount" type="number" value="${f('redundantCount') || ''}" placeholder="0"></div>

    <div class="form-actions">
      <button type="submit" class="btn-primary">${editId ? '💾 Update' : '✅ Save Ground Equipment'}</button>
      ${editId ? '<button type="button" class="btn-secondary" onclick="cancelGroundEdit()">Cancel</button>' : ''}
    </div>
  </form>`;
}

function saveGround(e: Event) {
  e.preventDefault();
  const q = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement).value;
  const id = q('gf_id') || uuidv4();
  const existing = state.groundEquipment.find(a => a.id === id);
  const rec: GroundEquipment = {
    id,
    siteId: state.siteInfo?.siteId || '',
    rruTypeOnGround: q('gf_rruTypeOnGround'),
    rruCountOnGround: parseInt(q('gf_rruCountOnGround')) || 0,
    cabinetTypes: q('gf_cabinetTypes'),
    cabinetCount: parseInt(q('gf_cabinetCount')) || 0,
    labellingDone: q('gf_labellingDone') as GroundEquipment['labellingDone'],
    cabinetComments: q('gf_cabinetComments'),
    cabinetDimensions: q('gf_cabinetDimensions'),
    activeIduTypes: q('gf_activeIduTypes'),
    activeIduCount: parseInt(q('gf_activeIduCount')) || 0,
    nonActiveIduTypes: q('gf_nonActiveIduTypes'),
    nonActiveIduCount: parseInt(q('gf_nonActiveIduCount')) || 0,
    slabDimensions: q('gf_slabDimensions'),
    redundantEquipment: q('gf_redundantEquipment'),
    redundantCount: parseInt(q('gf_redundantCount')) || 0,
    createdAt: existing?.createdAt || new Date().toISOString(),
    synced: existing?.synced || false,
  };
  const idx = state.groundEquipment.findIndex(a => a.id === id);
  if (idx >= 0) state.groundEquipment[idx] = rec; else state.groundEquipment.push(rec);
  editingGroundId = null;
  saveState(); toast('Ground equipment saved!'); render();
}

function editGround(id: string) { editingGroundId = id; render(); }
function deleteGround(id: string) { if (!confirm('Delete this entry?')) return; state.groundEquipment = state.groundEquipment.filter(a => a.id !== id); saveState(); render(); toast('Deleted'); }
function cancelGroundEdit() { editingGroundId = null; render(); }
(window as any).saveGround = saveGround;
(window as any).editGround = editGround;
(window as any).deleteGround = deleteGround;
(window as any).cancelGroundEdit = cancelGroundEdit;

// ─── DCDB Form ─────────────────────────────────────────────────────────────────
let editingDCDBId: string | null = null;

function dcdbForm(editId?: string): string {
  const edit = editId ? state.dcdbRecords.find(a => a.id === editId) : null;
  const f = (k: keyof DCDBRecord) => (edit?.[k] as any) || '';
  const num = (k: keyof DCDBRecord) => f(k) || '';

  return `
  <form onsubmit="saveDCDB(event)" class="form-scroll">
    <input type="hidden" id="df_id" value="${editId || ''}">

    <div class="form-section-title">DCDB — Non-Priority Cable</div>
    <div class="form-row">
      <div class="form-group"><label>Grid Distance to 3-Phase Line (m)</label><input id="df_gridDistanceTo3Phase" type="number" value="${num('gridDistanceTo3Phase')}" placeholder="e.g. 500"></div>
      <div class="form-group"><label>Supply Cable Size to DCDB (mm²)</label><input id="df_dcdbSupplyCableSize" type="number" value="${num('dcdbSupplyCableSize')}" placeholder="e.g. 35"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Supply Cable Size to DCDU in BTS C (mm²)</label><input id="df_dcdbSupplyCableToDCDU" type="number" value="${num('dcdbSupplyCableToDCDU')}" placeholder="e.g. 16"></div>
      <div class="form-group"><label>Supply Load Measurement (A) — Incoming</label><input id="df_dcdbSupplyLoadMeasurement" type="number" value="${num('dcdbSupplyLoadMeasurement')}" placeholder="e.g. 25"></div>
    </div>
    <div class="form-group"><label>Time When Load was Measured</label><input id="df_dcdbTimeMeasured" type="time" value="${f('dcdbTimeMeasured')}"></div>

    <div class="form-section-title">DCDB Breakers (A)</div>
    <div class="form-row five-col">
      <div class="form-group"><label>Breaker 1</label><input id="df_dcdbBreaker1" type="number" value="${num('dcdbBreaker1')}" placeholder="e.g. 63"></div>
      <div class="form-group"><label>Breaker 2</label><input id="df_dcdbBreaker2" type="number" value="${num('dcdbBreaker2')}" placeholder="e.g. 63"></div>
      <div class="form-group"><label>Breaker 3</label><input id="df_dcdbBreaker3" type="number" value="${num('dcdbBreaker3')}" placeholder="e.g. 63"></div>
      <div class="form-group"><label>Breaker 4</label><input id="df_dcdbBreaker4" type="number" value="${num('dcdbBreaker4')}" placeholder="e.g. 32"></div>
      <div class="form-group"><label>Breaker 5</label><input id="df_dcdbBreaker5" type="number" value="${num('dcdbBreaker5')}" placeholder="e.g. 16"></div>
    </div>

    <div class="form-section-title">DCDB — Priority Cable</div>
    <div class="form-row">
      <div class="form-group"><label>Priority Cable Size to DCDB (mm²)</label><input id="df_prioritySupplyCableSize" type="number" value="${num('prioritySupplyCableSize')}" placeholder="e.g. 50"></div>
      <div class="form-group"><label>Priority Cable Size to DCDU (mm²)</label><input id="df_prioritySupplyCableToDCDU" type="number" value="${num('prioritySupplyCableToDCDU')}" placeholder="e.g. 16"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Priority Load Measurement (A)</label><input id="df_priorityLoadMeasurement" type="number" value="${num('priorityLoadMeasurement')}" placeholder="e.g. 25"></div>
      <div class="form-group"><label>Priority Breaker 1 (A)</label><input id="df_priorityBreaker1" type="number" value="${num('priorityBreaker1')}" placeholder="e.g. 50"></div>
    </div>

    <div class="form-section-title">DCDU Breakers</div>
    <div class="form-row five-col">
      <div class="form-group"><label>Breaker 1 Model</label><input id="df_dcdiBreaker1" value="${f('dcdiBreaker1')}" placeholder="e.g. DCDU12A"></div>
      <div class="form-group"><label>Breaker 2 Model</label><input id="df_dcdiBreaker2" value="${f('dcdiBreaker2')}" placeholder="e.g. DCDU12B"></div>
      <div class="form-group"><label>Breaker 3 Model</label><input id="df_dcdiBreaker3" value="${f('dcdiBreaker3')}" placeholder="e.g. DCDU12B"></div>
      <div class="form-group"><label>Breaker 4 Model</label><input id="df_dcdiBreaker4" value="${f('dcdiBreaker4')}" placeholder="e.g. DCDU16D"></div>
      <div class="form-group"><label>Breaker 5 Model</label><input id="df_dcdiBreaker5" value="${f('dcdiBreaker5')}" placeholder="e.g. DCDU12B"></div>
    </div>
    <div class="form-group"><label>Total DCDU Count</label><input id="df_totalDCDUCount" type="number" value="${num('totalDCDUCount')}" placeholder="e.g. 5"></div>

    <div class="form-section-title">RRU Cable Counts</div>
    <div class="form-row">
      <div class="form-group"><label>RRU Count</label><input id="df_rruCount" type="number" value="${num('rruCount')}" placeholder="e.g. 14"></div>
      <div class="form-group"><label>RRU Power Cable Count (Pcs)</label><input id="df_rruPowerCableCount" type="number" value="${num('rruPowerCableCount')}" placeholder="e.g. 14"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>RRU Power Cable Count Missing</label><input id="df_rruPowerCableMissing" type="number" value="${num('rruPowerCableMissing')}" placeholder="0"></div>
      <div class="form-group"><label>RRU Power Cable Length per Run (m)</label><input id="df_rruPowerCableLengthPerRun" type="number" value="${num('rruPowerCableLengthPerRun')}" placeholder="e.g. 47"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>RRU Power Cable Total Length Missing (m)</label><input id="df_rruPowerCableTotalMissing" type="number" value="${num('rruPowerCableTotalMissing')}" placeholder="0"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>RRU Earthing Cable Count (Pcs)</label><input id="df_rruEarthingCableCount" type="number" value="${num('rruEarthingCableCount')}" placeholder="e.g. 14"></div>
      <div class="form-group"><label>RRU Earthing Cable Missing</label><input id="df_rruEarthingCableMissing" type="number" value="${num('rruEarthingCableMissing')}" placeholder="0"></div>
    </div>
    <div class="form-group"><label>RRU Earthing Cable Length per Run (m)</label><input id="df_rruEarthingCableLength" type="number" value="${num('rruEarthingCableLength')}" placeholder="e.g. 14"></div>

    <div class="form-section-title">AAU Cable Counts</div>
    <div class="form-row">
      <div class="form-group"><label>AAU Count (Pcs)</label><input id="df_aauCount" type="number" value="${num('aauCount')}" placeholder="e.g. 4"></div>
      <div class="form-group"><label>AAU Power Cable Count (Pcs)</label><input id="df_aauPowerCableCount" type="number" value="${num('aauPowerCableCount')}" placeholder="e.g. 4"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>AAU Power Cable Count Missing</label><input id="df_aauPowerCableMissing" type="number" value="${num('aauPowerCableMissing')}" placeholder="0"></div>
      <div class="form-group"><label>AAU Power Cable Length per Run (m)</label><input id="df_aauPowerCableLength" type="number" value="${num('aauPowerCableLength')}" placeholder="e.g. 20"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>AAU Power Cable Total Length Missing (m)</label><input id="df_aauPowerCableTotalMissing" type="number" value="${num('aauPowerCableTotalMissing')}" placeholder="0"></div>
      <div class="form-group"><label>AAU Earthing Cable Count (Pcs)</label><input id="df_aauEarthingCableCount" type="number" value="${num('aauEarthingCableCount')}" placeholder="e.g. 4"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>AAU Earthing Cable Missing</label><input id="df_aauEarthingCableMissing" type="number" value="${num('aauEarthingCableMissing')}" placeholder="0"></div>
      <div class="form-group"><label>AAU Earthing Cable Length per Run (m)</label><input id="df_aauEarthingCableLength" type="number" value="${num('aauEarthingCableLength')}" placeholder="e.g. 14"></div>
    </div>

    <div class="form-section-title">BTS Earthing</div>
    <div class="form-row">
      <div class="form-group"><label>BTS Earthing Cable Count (Pcs)</label><input id="df_btsEarthingCableCount" type="number" value="${num('btsEarthingCableCount')}" placeholder="e.g. 1"></div>
      <div class="form-group"><label>BTS Earthing Cable Missing</label><input id="df_btsEarthingCableMissing" type="number" value="${num('btsEarthingCableMissing')}" placeholder="e.g. 2"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>BTS Earthing Length per Run (m)</label><input id="df_btsEarthingLengthPerRun" type="number" value="${num('btsEarthingLengthPerRun')}" placeholder="e.g. 4"></div>
      <div class="form-group"><label>BTS Earthing Total Length Missing (m)</label><input id="df_btsEarthingTotalMissing" type="number" value="${num('btsEarthingTotalMissing')}" placeholder="e.g. 8"></div>
    </div>
    <div class="form-group"><label>Earthing Connection</label><input id="df_earthingConnection" value="${f('earthingConnection')}" placeholder="Describe earthing connection condition"></div>

    <div class="form-actions">
      <button type="submit" class="btn-primary">${editId ? '💾 Update DCDB' : '✅ Save DCDB Record'}</button>
      ${editId ? '<button type="button" class="btn-secondary" onclick="cancelDCDBEdit()">Cancel</button>' : ''}
    </div>
  </form>`;
}

function saveDCDB(e: Event) {
  e.preventDefault();
  const q = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
  const id = q('df_id') || uuidv4();
  const existing = state.dcdbRecords.find(a => a.id === id);
  const n = (id: string) => parseFloat(q(id)) || 0;
  const rec: DCDBRecord = {
    id,
    siteId: state.siteInfo?.siteId || '',
    gridDistanceTo3Phase: n('df_gridDistanceTo3Phase'),
    dcdbSupplyCableSize: n('df_dcdbSupplyCableSize'),
    dcdbSupplyCableToDCDU: n('df_dcdbSupplyCableToDCDU'),
    dcdbSupplyLoadMeasurement: n('df_dcdbSupplyLoadMeasurement'),
    dcdbTimeMeasured: q('df_dcdbTimeMeasured'),
    dcdbBreaker1: n('df_dcdbBreaker1'), dcdbBreaker2: n('df_dcdbBreaker2'),
    dcdbBreaker3: n('df_dcdbBreaker3'), dcdbBreaker4: n('df_dcdbBreaker4'),
    dcdbBreaker5: n('df_dcdbBreaker5'),
    prioritySupplyCableSize: n('df_prioritySupplyCableSize'),
    prioritySupplyCableToDCDU: n('df_prioritySupplyCableToDCDU'),
    priorityLoadMeasurement: n('df_priorityLoadMeasurement'),
    priorityBreaker1: n('df_priorityBreaker1'),
    dcdiBreaker1: q('df_dcdiBreaker1'), dcdiBreaker2: q('df_dcdiBreaker2'),
    dcdiBreaker3: q('df_dcdiBreaker3'), dcdiBreaker4: q('df_dcdiBreaker4'),
    dcdiBreaker5: q('df_dcdiBreaker5'),
    totalDCDUCount: n('df_totalDCDUCount'),
    rruCount: n('df_rruCount'), rruPowerCableCount: n('df_rruPowerCableCount'),
    rruPowerCableMissing: n('df_rruPowerCableMissing'),
    rruPowerCableLengthPerRun: n('df_rruPowerCableLengthPerRun'),
    rruPowerCableTotalMissing: n('df_rruPowerCableTotalMissing'),
    rruEarthingCableCount: n('df_rruEarthingCableCount'),
    rruEarthingCableMissing: n('df_rruEarthingCableMissing'),
    rruEarthingCableLength: n('df_rruEarthingCableLength'),
    aauCount: n('df_aauCount'), aauPowerCableCount: n('df_aauPowerCableCount'),
    aauPowerCableMissing: n('df_aauPowerCableMissing'),
    aauPowerCableLength: n('df_aauPowerCableLength'),
    aauPowerCableTotalMissing: n('df_aauPowerCableTotalMissing'),
    aauEarthingCableCount: n('df_aauEarthingCableCount'),
    aauEarthingCableMissing: n('df_aauEarthingCableMissing'),
    aauEarthingCableLength: n('df_aauEarthingCableLength'),
    btsEarthingCableCount: n('df_btsEarthingCableCount'),
    btsEarthingCableMissing: n('df_btsEarthingCableMissing'),
    btsEarthingLengthPerRun: n('df_btsEarthingLengthPerRun'),
    btsEarthingTotalMissing: n('df_btsEarthingTotalMissing'),
    earthingConnection: q('df_earthingConnection'),
    createdAt: existing?.createdAt || new Date().toISOString(),
    synced: existing?.synced || false,
  };
  const idx = state.dcdbRecords.findIndex(a => a.id === id);
  if (idx >= 0) state.dcdbRecords[idx] = rec; else state.dcdbRecords.push(rec);
  editingDCDBId = null;
  saveState(); toast('DCDB record saved!'); render();
}
function editDCDB(id: string) { editingDCDBId = id; render(); }
function deleteDCDB(id: string) { if (!confirm('Delete?')) return; state.dcdbRecords = state.dcdbRecords.filter(a => a.id !== id); saveState(); render(); toast('Deleted'); }
function cancelDCDBEdit() { editingDCDBId = null; render(); }
(window as any).saveDCDB = saveDCDB;
(window as any).editDCDB = editDCDB;
(window as any).deleteDCDB = deleteDCDB;
(window as any).cancelDCDBEdit = cancelDCDBEdit;

// ─── Tower Equipment Form ──────────────────────────────────────────────────────
let editingTowerId: string | null = null;

function towerForm(editId?: string): string {
  const edit = editId ? state.towerEquipment.find(a => a.id === editId) : null;
  const f = (k: keyof TowerEquipment) => (edit?.[k] as any) || '';
  const ETYPES = ['RF antenna', 'MW Antenna', 'MW ODU', 'RRU', 'BBU', 'DCDB', 'Other'];
  const SECTORS = ['A', 'B', 'C', 'Alpha', 'Beta', 'Gamma'];

  return `
  <form onsubmit="saveTower(event)" class="form-scroll">
    <input type="hidden" id="tf_id" value="${editId || ''}">

    <div class="form-section-title">Equipment Identity</div>
    <div class="form-row">
      <div class="form-group"><label>Equipment Type *</label>
        <select id="tf_equipmentType" required>
          <option value="">Select type...</option>
          ${ETYPES.map(t => `<option value="${t}" ${f('equipmentType') === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Sector *</label>
        <select id="tf_sector" required>
          <option value="">Select sector...</option>
          ${SECTORS.map(s => `<option value="${s}" ${f('sector') === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Antenna Manufacturer</label><input id="tf_antennaManufacturer" value="${f('antennaManufacturer')}" placeholder="e.g. Huawei, Alcatel"></div>
      <div class="form-group"><label>Antenna Model Number</label><input id="tf_antennaModel" value="${f('antennaModel')}" placeholder="e.g. ASI4518R10v18"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Tenant Owner</label><input id="tf_tenantOwner" value="${f('tenantOwner')}" placeholder="e.g. Airtel"></div>
      <div class="form-group"><label>No. (auto)</label><input id="tf_no" type="number" value="${f('no') || ''}" placeholder="Auto-assigned"></div>
    </div>

    <div class="form-section-title">Antenna / Equipment Dimensions</div>
    <div class="form-row">
      <div class="form-group"><label>Azimuth (°)</label><input id="tf_azimuth" type="number" min="0" max="360" value="${f('azimuth') || ''}" placeholder="e.g. 35"></div>
      <div class="form-group"><label>Height to Centre of Antenna (m)</label><input id="tf_heightToCentre" type="number" step="0.1" value="${f('heightToCentre') || ''}" placeholder="e.g. 35"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Length / Dia (mm)</label><input id="tf_lengthMm" type="number" value="${f('lengthMm') || ''}" placeholder="e.g. 380"></div>
      <div class="form-group"><label>Width (mm)</label><input id="tf_widthMm" type="number" value="${f('widthMm') || ''}" placeholder="e.g. 160"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Height (mm)</label><input id="tf_heightMm" type="number" value="${f('heightMm') || ''}" placeholder="e.g. 2800"></div>
      <div class="form-group"><label>Antenna Count</label><input id="tf_antennaCount" type="number" value="${f('antennaCount') || '1'}" placeholder="1"></div>
    </div>

    <div class="form-section-title">Status</div>
    <div class="form-row">
      <div class="form-group"><label>Active / Inactive</label>
        <select id="tf_activeInactive">
          <option value="">Select...</option>
          <option value="Active" ${f('activeInactive')==='Active'?'selected':''}>Active</option>
          <option value="Inactive" ${f('activeInactive')==='Inactive'?'selected':''}>Inactive</option>
          <option value="Standby" ${f('activeInactive')==='Standby'?'selected':''}>Standby</option>
        </select>
      </div>
      <div class="form-group"><label>Equipment Labelling</label>
        <select id="tf_labelling">
          <option value="">Select...</option>
          <option value="Done" ${f('labelling')==='Done'?'selected':''}>Done</option>
          <option value="Not Done" ${f('labelling')==='Not Done'?'selected':''}>Not Done</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label>Remarks</label>
      <textarea id="tf_remarks" rows="2" placeholder="e.g. Not clear, plate faded">${f('remarks')}</textarea>
    </div>

    <button type="submit" class="btn-primary btn-full">${editId ? '💾 Update Equipment' : '✅ Add Equipment'}</button>
  </form>`;
}

function saveTower(e: Event) {
  e.preventDefault();
  const q = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement).value;
  const id = q('tf_id') || uuidv4();
  const existing = state.towerEquipment.find(a => a.id === id);
  const rec: TowerEquipment = {
    id,
    siteId: state.siteInfo?.siteId || '',
    airtelSiteId: state.siteInfo?.siteId || '',
    siteName: state.siteInfo?.siteName || '',
    no: existing?.no || (state.towerEquipment.length + 1),
    equipmentType: q('tf_equipmentType') as TowerEquipment['equipmentType'],
    antennaManufacturer: q('tf_antennaManufacturer'),
    antennaModel: q('tf_antennaModel'),
    tenantOwner: q('tf_tenantOwner'),
    sector: q('tf_sector') as TowerEquipment['sector'],
    azimuth: parseFloat(q('tf_azimuth')) || 0,
    heightToCentre: parseFloat(q('tf_heightToCentre')) || 0,
    antennaCount: parseInt(q('tf_antennaCount')) || 1,
    lengthMm: parseFloat(q('tf_lengthMm')) || 0,
    widthMm: parseFloat(q('tf_widthMm')) || 0,
    heightMm: parseFloat(q('tf_heightMm')) || 0,
    activeInactive: q('tf_activeInactive') as TowerEquipment['activeInactive'],
    labelling: q('tf_labelling') as TowerEquipment['labelling'],
    remarks: q('tf_remarks'),
    createdAt: existing?.createdAt || new Date().toISOString(),
    synced: existing?.synced || false,
  };
  const idx = state.towerEquipment.findIndex(a => a.id === id);
  if (idx >= 0) state.towerEquipment[idx] = rec; else state.towerEquipment.push(rec);
  editingTowerId = null;
  saveState(); toast('Tower equipment added!'); render();
}
function editTower(id: string) { editingTowerId = id; render(); }
function deleteTower(id: string) { if (!confirm('Delete this equipment entry?')) return; state.towerEquipment = state.towerEquipment.filter(a => a.id !== id); saveState(); render(); toast('Deleted'); }
function cancelTowerEdit() { editingTowerId = null; render(); }
(window as any).saveTower = saveTower;
(window as any).editTower = editTower;
(window as any).deleteTower = deleteTower;
(window as any).cancelTowerEdit = cancelTowerEdit;

// ─── Toast ──────────────────────────────────────────────────────────────────────
let toastTimer: ReturnType<typeof setTimeout> | null = null;
function toast(msg: string) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.className = 'toast visible';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t!.className = 'toast', 2500);
}
(window as any).toast = toast;

function today() { return new Date().toISOString().split('T')[0]; }

// ─── Render ────────────────────────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app')!;
  app.innerHTML = `
  <header class="app-header">
    <div class="header-title">🏗️ Site Audit</div>
    <div class="header-subtitle">${state.siteInfo?.siteName || 'No site loaded'}</div>
    <div class="online-badge ${state.isOnline ? 'online' : 'offline'}" onclick="switchTab('sync')">
      ${state.isOnline ? '🟢 Online' : '🔴 Offline'}
    </div>
  </header>

  <main class="app-main">${renderContent()}</main>

  <nav class="bottom-nav">
    <button class="nav-btn ${state.currentTab==='site'   ? 'active':''}" onclick="switchTab('site')">
      <span class="nav-icon">🏗️</span><span class="nav-label">Site</span>
    </button>
    <button class="nav-btn ${state.currentTab==='ground'  ? 'active':''}" onclick="switchTab('ground')">
      <span class="nav-icon">📦</span><span class="nav-label">Ground</span>
      ${state.groundEquipment.length ? `<span class="nav-count">${state.groundEquipment.length}</span>` : ''}
    </button>
    <button class="nav-btn ${state.currentTab==='dcdb'    ? 'active':''}" onclick="switchTab('dcdb')">
      <span class="nav-icon">⚡</span><span class="nav-label">DCDB</span>
      ${state.dcdbRecords.length ? `<span class="nav-count">${state.dcdbRecords.length}</span>` : ''}
    </button>
    <button class="nav-btn ${state.currentTab==='tower'   ? 'active':''}" onclick="switchTab('tower')">
      <span class="nav-icon">📡</span><span class="nav-label">Tower</span>
      ${state.towerEquipment.length ? `<span class="nav-count">${state.towerEquipment.length}</span>` : ''}
    </button>
    <button class="nav-btn ${state.currentTab==='photos'  ? 'active':''}" onclick="switchTab('photos')">
      <span class="nav-icon">📷</span><span class="nav-label">Photos</span>
      ${state.photos.length ? `<span class="nav-count">${state.photos.length}</span>` : ''}
    </button>
  </nav>`;
}

function renderContent(): string {
  switch (state.currentTab) {
    case 'site':   return `<div class="page"><h2 class="page-title">🏗️ Site Information</h2><p class="page-desc">${state.siteInfo ? `Site: ${state.siteInfo.siteName} (${state.siteInfo.siteId})` : 'Fill in site details first — this applies to all sections.'}</p>${siteForm()}</div>`;
    case 'ground':  return `<div class="page"><h2 class="page-title">📦 Ground Equipment Scope</h2><p class="page-desc">${state.groundEquipment.length} record(s) — ${state.groundEquipment.filter(a => !a.synced).length} pending sync.</p>${editingGroundId ? groundForm(editingGroundId) : ''}${renderGroundList()}</div>`;
    case 'dcdb':    return `<div class="page"><h2 class="page-title">⚡ DCDB Information</h2><p class="page-desc">DC power distribution — cables, breakers, earthing.</p>${editingDCDBId ? dcdbForm(editingDCDBId) : ''}${renderDCDBList()}</div>`;
    case 'tower':   return `<div class="page"><h2 class="page-title">📡 Tower Equipment Scope</h2><p class="page-desc">${state.towerEquipment.length} equipment entries — ${state.towerEquipment.filter(a => !a.synced).length} pending sync.</p>${editingTowerId ? towerForm(editingTowerId) : ''}${renderTowerList()}</div>`;
    case 'photos':  return renderPhotosTab();
    case 'sync':    return renderSyncTab();
    default: return '';
  }
}

// ─── List Renderers ────────────────────────────────────────────────────────────
function renderGroundList(): string {
  if (state.groundEquipment.length === 0) return `<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">No ground equipment records</div><div class="empty-desc">Fill in the form above to add your first record.</div></div>`;
  return `
  <div class="asset-list">
    ${state.groundEquipment.map(a => `
    <div class="asset-card">
      <div class="asset-card-header">
        <div><div class="asset-type">Ground Equipment</div><div class="asset-sn">Cabinets: ${a.cabinetTypes || '—'} × ${a.cabinetCount}</div></div>
        ${!a.synced ? '<span class="unsynced-badge">⬆️ Pending</span>' : '<span class="synced-badge">✅</span>'}
      </div>
      <div class="asset-meta">
        <span>RRU: ${a.rrrTypeOnGround || 'N/A'}</span>
        <span>IDU Active: ${a.activeIduTypes || 'N/A'}</span>
        <span>Labelling: ${a.labellingDone || '—'}</span>
      </div>
      <div class="asset-actions">
        <button class="btn-sm" onclick="editGround('${a.id}')">✏️ Edit</button>
        <button class="btn-sm btn-danger" onclick="deleteGround('${a.id}')">🗑️ Delete</button>
      </div>
    </div>`).join('')}
  </div>`;
}

function renderDCDBList(): string {
  if (state.dcdbRecords.length === 0) return `<div class="empty-state"><div class="empty-icon">⚡</div><div class="empty-title">No DCDB records</div><div class="empty-desc">Fill in the form above to add the DC power data.</div></div>`;
  return `
  <div class="asset-list">
    ${state.dcdbRecords.map(a => `
    <div class="asset-card">
      <div class="asset-card-header">
        <div><div class="asset-type">DCDB Record</div><div class="asset-sn">DCDU Count: ${a.totalDCDUCount} | RRU: ${a.rruCount}</div></div>
        ${!a.synced ? '<span class="unsynced-badge">⬆️</span>' : '<span class="synced-badge">✅</span>'}
      </div>
      <div class="asset-meta">
        <span>Breaker1: ${a.dcdbBreaker1}A</span>
        <span>Grid dist: ${a.gridDistanceTo3Phase}m</span>
        <span>Earthing: ${a.earthingConnection || '—'}</span>
      </div>
      <div class="asset-actions">
        <button class="btn-sm" onclick="editDCDB('${a.id}')">✏️ Edit</button>
        <button class="btn-sm btn-danger" onclick="deleteDCDB('${a.id}')">🗑️ Delete</button>
      </div>
    </div>`).join('')}
  </div>`;
}

function renderTowerList(): string {
  return `
  <div class="asset-list">
    ${state.towerEquipment.map(a => `
    <div class="asset-card">
      <div class="asset-card-header">
        <div>
          <div class="asset-type">${a.equipmentType || '—'} — Sector ${a.sector || '—'}</div>
          <div class="asset-sn">${a.antennaModel || a.antennaManufacturer || '—'} | Ht: ${a.heightToCentre}m | Az: ${a.azimuth}°</div>
        </div>
        <span class="status status-${(a.activeInactive || 'active').toLowerCase()}">${a.activeInactive || 'Active'}</span>
      </div>
      <div class="asset-meta">
        <span>${a.antennaManufacturer || ''}</span>
        <span>Dims: ${a.lengthMm}×${a.widthMm}×${a.heightMm}mm</span>
        <span>Labelling: ${a.labelling || '—'}</span>
        ${!a.synced ? '<span class="unsynced-badge">⬆️ Pending</span>' : '<span class="synced-badge">✅</span>'}
      </div>
      <div class="asset-actions">
        <button class="btn-sm" onclick="editTower('${a.id}')">✏️ Edit</button>
        <button class="btn-sm btn-danger" onclick="deleteTower('${a.id}')">🗑️ Delete</button>
      </div>
    </div>`).join('')}
  </div>
  <div class="form-section-title" style="margin-top:20px">Add New Equipment</div>
  ${towerForm()}`;
}

function renderPhotosTab(): string {
  const cats = ['ground', 'dcdb', 'tower', 'general'] as const;
  return `
  <div class="page">
    <h2 class="page-title">📷 Photo Gallery</h2>
    <p class="page-desc">${state.photos.length} photo(s) captured. Photos are organized by section.</p>
    ${cats.map(cat => {
      const photos = state.photos.filter(p => p.category === cat);
      if (!photos.length) return '';
      return `
      <div class="photo-category-label">${cat === 'ground' ? '📦 Ground' : cat === 'dcdb' ? '⚡ DCDB' : cat === 'tower' ? '📡 Tower' : '🏗️ Site'}</div>
      <div class="photo-gallery">
        ${photos.map(p => `
        <div class="photo-item">
          <img src="${p.path}" alt="${p.filename}" onclick="viewPhoto('${p.id}')">
          <div class="photo-info">
            <div class="photo-name">${p.filename.substring(0,14)}...</div>
            <button class="btn-sm btn-danger" onclick="deletePhoto('${p.id}')">🗑️</button>
          </div>
        </div>`).join('')}
      </div>`;
    }).join('')}
    <div class="photo-actions">
      ${cats.map(cat => `<button class="btn-camera" onclick="takePhoto('${cat}')">📷 Add ${cat === 'ground' ? 'Ground' : cat === 'dcdb' ? 'DCDB' : cat === 'tower' ? 'Tower' : 'Site'} Photo</button>`).join('')}
    </div>
  </div>`;
}

async function takePhoto(category: PhotoRecord['category']) {
  await capturePhoto(category);
}

function viewPhoto(id: string) {
  const p = state.photos.find(x => x.id === id);
  if (!p) return;
  window.open(p.path, '_blank');
}

function deletePhoto(id: string) {
  if (!confirm('Delete this photo?')) return;
  state.photos = state.photos.filter(p => p.id !== id);
  saveState(); render();
}

(window as any).takePhoto = takePhoto;
(window as any).viewPhoto = viewPhoto;
(window as any).deletePhoto = deletePhoto;

function renderSyncTab(): string {
  const total = state.groundEquipment.length + state.dcdbRecords.length + state.towerEquipment.length;
  const pending = [...state.groundEquipment, ...state.dcdbRecords, ...state.towerEquipment].filter(a => !a.synced).length;
  const photoPending = state.photos.filter(p => !p.uploaded).length;

  return `
  <div class="page">
    <h2 class="page-title">🔄 Sync to Server</h2>

    <div class="sync-status-grid">
      <div class="sync-card ${state.isOnline ? 'online' : 'offline'}">
        <div class="sync-icon">${state.isOnline ? '🟢' : '🔴'}</div>
        <div class="sync-label">Connection</div>
        <div class="sync-value">${state.isOnline ? 'Online' : 'Offline'}</div>
      </div>
      <div class="sync-card">
        <div class="sync-icon">📋</div>
        <div class="sync-label">Total Records</div>
        <div class="sync-value">${total}</div>
      </div>
      <div class="sync-card">
        <div class="sync-icon">⬆️</div>
        <div class="sync-label">Pending Sync</div>
        <div class="sync-value">${pending}</div>
      </div>
      <div class="sync-card">
        <div class="sync-icon">📷</div>
        <div class="sync-label">Photos Pending</div>
        <div class="sync-value">${photoPending}</div>
      </div>
    </div>

    <button class="btn-primary btn-full" onclick="syncAll()" ${!state.isOnline ? 'disabled' : ''}>🔄 Sync Now</button>

    ${!state.isOnline ? `
    <div class="offline-notice">
      ⚠️ You are offline. All data is saved locally and will sync when you reconnect.
      ${total > 0 ? `<br>✅ ${total} records safely stored on device.` : ''}
    </div>` : ''}

    <div class="summary-section">
      <h3>Summary by Section</h3>
      <div class="summary-row"><span>Ground Equipment</span><span class="summary-count">${state.groundEquipment.length} records</span></div>
      <div class="summary-row"><span>DCDB Records</span><span class="summary-count">${state.dcdbRecords.length} records</span></div>
      <div class="summary-row"><span>Tower Equipment</span><span class="summary-count">${state.towerEquipment.length} entries</span></div>
      <div class="summary-row"><span>Photos</span><span class="summary-count">${state.photos.length} photos</span></div>
    </div>
  </div>`;
}

(window as any).syncAll = syncAll;

function switchTab(tab: AppState['currentTab']) { state.currentTab = tab; render(); }
(window as any).switchTab = switchTab;

async function init() {
  await loadState();
  await initNetwork();
  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#1F4E79' });
    } catch (_) {}
  }
  render();
  console.log('✅ Site Audit App initialized');
}

init().catch(console.error);
