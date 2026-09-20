/**
 * BTS Site Audit Backend — Express API
 * Handles: audit sync, photo upload with folder routing, Excel report, web dashboard
 *
 * Data model:
 *   siteInfo        — SiteInfo object (one per audit)
 *   groundEquipment — GroundEquipment[]  (site-level equipment: RRU, cabinet, power, etc.)
 *   dcdbRecords     — DCDBRecord[]     (DCDB / power distribution records)
 *   towerEquipment  — TowerEquipment[]  (tower-mounted RF/antenna equipment per sector)
 *   photos          — PhotoRecord[]     (with category: ground|dcdb|tower|general)
 */

'use strict';
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── DATA STORE ────────────────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, 'data.json');

let db = {
  siteInfo:        null,
  groundEquipment: [],
  dcdbRecords:     [],
  towerEquipment:  [],
  photos:          [],
};

function loadDb() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      // Migrate old schema if needed
      db = {
        siteInfo:        raw.siteInfo        || raw.siteInfo        || null,
        groundEquipment: raw.groundEquipment || raw.groundEquipment || raw.assets  || [],
        dcdbRecords:     raw.dcdbRecords     || [],
        towerEquipment:  raw.towerEquipment  || [],
        photos:          raw.photos          || [],
      };
    } catch (e) {
      console.error('Failed to load data.json, starting fresh', e.message);
    }
  }
}

function saveDb() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

loadDb();

// ─── MULTER: Photo Upload (category-based folder routing) ─────────────────────
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const sharp  = require('sharp');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
// Ensure all 3 category folders + general exist
['ground', 'dcdb', 'tower', 'general'].forEach(cat => {
  const d = path.join(UPLOADS_DIR, cat);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const cat  = req.body.category || 'general';
    const safe = ['ground', 'dcdb', 'tower', 'general'].includes(cat) ? cat : 'general';
    const dir  = path.join(UPLOADS_DIR, safe);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  cb(null, allowed.includes(file.mimetype));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status:           'ok',
    timestamp:        new Date().toISOString(),
    groundEquipment:  db.groundEquipment.length,
    dcdbRecords:      db.dcdbRecords.length,
    towerEquipment:   db.towerEquipment.length,
    photos:           db.photos.length,
  });
});

// ── Audit Sync (mobile app → server) ────────────────────────────────────────
app.post('/api/audit/sync', (req, res) => {
  try {
    const { site, ground, dcdb, tower } = req.body;

    if (site) {
      db.siteInfo = { ...site, syncedAt: new Date().toISOString() };
    }

    if (Array.isArray(ground)) {
      ground.forEach(item => {
        item.id = item.id || uuidv4();
        const idx = db.groundEquipment.findIndex(e => e.id === item.id);
        if (idx >= 0) {
          db.groundEquipment[idx] = { ...db.groundEquipment[idx], ...item, syncedAt: new Date().toISOString() };
        } else {
          db.groundEquipment.push({ ...item, syncedAt: new Date().toISOString() });
        }
      });
    }

    if (Array.isArray(dcdb)) {
      dcdb.forEach(item => {
        item.id = item.id || uuidv4();
        const idx = db.dcdbRecords.findIndex(e => e.id === item.id);
        if (idx >= 0) {
          db.dcdbRecords[idx] = { ...db.dcdbRecords[idx], ...item, syncedAt: new Date().toISOString() };
        } else {
          db.dcdbRecords.push({ ...item, syncedAt: new Date().toISOString() });
        }
      });
    }

    if (Array.isArray(tower)) {
      tower.forEach(item => {
        item.id = item.id || uuidv4();
        const idx = db.towerEquipment.findIndex(e => e.id === item.id);
        if (idx >= 0) {
          db.towerEquipment[idx] = { ...db.towerEquipment[idx], ...item, syncedAt: new Date().toISOString() };
        } else {
          db.towerEquipment.push({ ...item, syncedAt: new Date().toISOString() });
        }
      });
    }

    saveDb();
    res.json({
      success:          true,
      syncedAt:         new Date().toISOString(),
      groundEquipment:  db.groundEquipment.length,
      dcdbRecords:      db.dcdbRecords.length,
      towerEquipment:   db.towerEquipment.length,
    });
  } catch (e) {
    console.error('Sync error:', e);
    res.status(500).json({ error: 'Sync failed', details: e.message });
  }
});

// ── Legacy compat routes ──────────────────────────────────────────────────────
app.route('/api/site')
  .get((req, res) => res.json(db.siteInfo || {}))
  .post((req, res) => {
    db.siteInfo = { ...req.body, updatedAt: new Date().toISOString() };
    saveDb();
    res.json({ success: true, siteInfo: db.siteInfo });
  });

// ── Ground Equipment ──────────────────────────────────────────────────────────
app.route('/api/ground')
  .get((req, res) => res.json({ records: db.groundEquipment, total: db.groundEquipment.length }))
  .post((req, res) => {
    const item = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString() };
    db.groundEquipment.push(item);
    saveDb();
    res.json({ success: true, record: item });
  });

app.route('/api/ground/:id')
  .put((req, res) => {
    const idx = db.groundEquipment.findIndex(e => e.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    db.groundEquipment[idx] = { ...db.groundEquipment[idx], ...req.body };
    saveDb();
    res.json({ success: true, record: db.groundEquipment[idx] });
  })
  .delete((req, res) => {
    const idx = db.groundEquipment.findIndex(e => e.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    db.groundEquipment.splice(idx, 1);
    saveDb();
    res.json({ success: true });
  });

// ── DCDB Records ─────────────────────────────────────────────────────────────
app.route('/api/dcdb')
  .get((req, res) => res.json({ records: db.dcdbRecords, total: db.dcdbRecords.length }))
  .post((req, res) => {
    const item = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString() };
    db.dcdbRecords.push(item);
    saveDb();
    res.json({ success: true, record: item });
  });

app.route('/api/dcdb/:id')
  .put((req, res) => {
    const idx = db.dcdbRecords.findIndex(e => e.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    db.dcdbRecords[idx] = { ...db.dcdbRecords[idx], ...req.body };
    saveDb();
    res.json({ success: true, record: db.dcdbRecords[idx] });
  })
  .delete((req, res) => {
    const idx = db.dcdbRecords.findIndex(e => e.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    db.dcdbRecords.splice(idx, 1);
    saveDb();
    res.json({ success: true });
  });

// ── Tower Equipment ───────────────────────────────────────────────────────────
app.route('/api/tower')
  .get((req, res) => res.json({ records: db.towerEquipment, total: db.towerEquipment.length }))
  .post((req, res) => {
    const item = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString() };
    db.towerEquipment.push(item);
    saveDb();
    res.json({ success: true, record: item });
  });

app.route('/api/tower/:id')
  .put((req, res) => {
    const idx = db.towerEquipment.findIndex(e => e.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    db.towerEquipment[idx] = { ...db.towerEquipment[idx], ...req.body };
    saveDb();
    res.json({ success: true, record: db.towerEquipment[idx] });
  })
  .delete((req, res) => {
    const idx = db.towerEquipment.findIndex(e => e.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Not found' });
    db.towerEquipment.splice(idx, 1);
    saveDb();
    res.json({ success: true });
  });

// ── Photos ────────────────────────────────────────────────────────────────────
app.post('/api/photos', upload.array('photos', 20), async (req, res) => {
  const uploaded = [];
  for (const file of req.files) {
    const cat      = req.body.category || 'general';
    const thumbName = `thumb_${file.filename}`;
    const thumbPath = path.join(UPLOADS_DIR, cat, thumbName);

    try {
      await sharp(file.path)
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toFile(thumbPath);
    } catch (e) {
      console.warn('Thumbnail failed for', file.filename, e.message);
    }

    const photo = {
      id:         uuidv4(),
      original:   `/uploads/${cat}/${file.filename}`,
      thumbnail:  `/uploads/${cat}/${thumbName}`,
      filename:   file.filename,
      size:       file.size,
      category:   cat,
      uploadedAt: new Date().toISOString(),
    };
    db.photos.push(photo);
    uploaded.push(photo);
  }
  saveDb();
  res.json({ success: true, photos: uploaded });
});

app.get('/api/photos', (req, res) => {
  const { category } = req.query;
  const photos = category ? db.photos.filter(p => p.category === category) : db.photos;
  res.json({ photos, total: photos.length });
});

app.delete('/api/photos/:id', (req, res) => {
  const idx = db.photos.findIndex(p => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Photo not found' });
  const photo = db.photos[idx];
  // Delete files
  [photo.original, photo.thumbnail].forEach(p => {
    const fp = path.join(__dirname, p.replace(/^\/uploads\//, 'uploads\\'));
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
  db.photos.splice(idx, 1);
  saveDb();
  res.json({ success: true });
});

// ─── EXCEL REPORT GENERATION ──────────────────────────────────────────────────
const ExcelJS = require('exceljs');

// Colour palette
const C = {
  headerBg:   'FF1F4E79',
  sectionBg:  'FF2E75B6',
  labelBg:    'FFBDD7EE',
  altRow:     'FFDEEAF1',
  whiteRow:   'FFFFFFFF',
  border:     'FF9DC3E6',
  groundTab:  'FF375623',
  dcdbTab:    'FF833C00',
  towerTab:   'FF7030A0',
  coverTab:   'FF1F4E79',
  green:      'FFFFC000',
};

function ls(style) {
  const b = C.border;
  const thin = { style: 'thin', color: { argb: b } };
  const base = {
    label:  { font: { bold: true, size: 10 }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.labelBg } }, border: { top: thin, bottom: thin, left: thin, right: thin }, alignment: { horizontal: 'left', vertical: 'middle' } },
    data:   { font: { size: 10 },              fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.whiteRow } }, border: { top: thin, bottom: thin, left: thin, right: thin }, alignment: { horizontal: 'left', vertical: 'middle' } },
    header: { font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } }, border: { top: thin, bottom: thin, left: thin, right: thin }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } },
  };
  return base[style];
}

function styleCell(cell, style, rowHeight) {
  cell.style = style;
  if (rowHeight) cell.worksheet.getRow(cell.worksheet.rowCount).height = rowHeight;
}

async function generateExcelReport(siteInfo, groundEquipment, dcdbRecords, towerEquipment, photos) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator  = 'BTS Site Audit System';
  workbook.created   = new Date();
  workbook.modified  = new Date();

  const photoMap = {};
  photos.forEach(p => { photoMap[p.id] = p; });

  // ═══════════════════════════════════════════════════════════════════════════════
  // SHEET 1 — Cover / Site Summary
  // ═══════════════════════════════════════════════════════════════════════════════
  const cover = workbook.addWorksheet('Site Summary', { properties: { tabColor: { argb: C.coverTab } } });
  cover.getRow(1).height = 60;
  cover.getCell('A1').value = 'BTS SITE AUDIT REPORT';
  cover.getCell('A1').style = {
    font:       { bold: true, size: 22, color: { argb: 'FFFFFFFF' } },
    fill:       { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } },
    alignment:  { horizontal: 'center', vertical: 'middle' },
  };
  cover.mergeCells('A1:D1');

  if (siteInfo) {
    const rows = [
      ['Site ID',                  siteInfo.siteId           || ''],
      ['Site Name',                siteInfo.siteName         || ''],
      ['ATC No.',                  siteInfo.atcNo            || ''],
      ['Survey Date',              siteInfo.surveyDate       || ''],
      ['Technician',               siteInfo.technicianName   || ''],
      ['Technician Contacts',      siteInfo.technicianContacts || ''],
      ['Contractor',              siteInfo.contractorName   || ''],
      ['Latitude',                siteInfo.latitude         || ''],
      ['Longitude',               siteInfo.longitude        || ''],
      ['No. of Tenants',          siteInfo.noOfTenants      || ''],
    ];
    rows.forEach(([label, val], i) => {
      const r = i + 3;
      cover.getRow(r).height = 24;
      cover.getCell(`A${r}`).value = label;
      cover.getCell(`A${r}`).style = ls('label');
      cover.getCell(`B${r}`).value = val;
      cover.getCell(`B${r}`).style = ls('data');
      cover.mergeCells(`B${r}:D${r}`);
    });
  }

  // Summary section
  const summaryStart = siteInfo ? 14 : 3;
  cover.getRow(summaryStart).height = 25;
  cover.getCell(`A${summaryStart}`).value = 'AUDIT SUMMARY';
  cover.getCell(`A${summaryStart}`).style = {
    font:      { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: C.sectionBg } },
    alignment: { horizontal: 'left', vertical: 'middle' },
  };
  cover.mergeCells(`A${summaryStart}:D${summaryStart}`);

  const summaryRows = [
    ['Ground Equipment Records',  groundEquipment.length],
    ['DCDB Records',               dcdbRecords.length],
    ['Tower Equipment Entries',   towerEquipment.length],
    ['Photos',                     photos.length],
  ];
  summaryRows.forEach(([label, val], i) => {
    const r = summaryStart + 1 + i;
    cover.getRow(r).height = 22;
    cover.getCell(`A${r}`).value = label;
    cover.getCell(`A${r}`).style = ls('data');
    cover.getCell(`B${r}`).value = val;
    cover.getCell(`B${r}`).style = ls('data');
    cover.getCell('B' + r).alignment = { horizontal: 'center', vertical: 'middle' };
  });

  cover.getColumn('A').width = 30;
  cover.getColumn('B').width = 16;
  cover.getColumn('C').width = 16;
  cover.getColumn('D').width = 16;

  // ═══════════════════════════════════════════════════════════════════════════════
  // SHEET 2 — Ground Equipment Scope
  // ═══════════════════════════════════════════════════════════════════════════════
  const groundSheet = workbook.addWorksheet('Ground Equipment Scope', {
    properties: { tabColor: { argb: C.groundTab } },
  });

  // Title row
  groundSheet.getRow(1).height = 40;
  groundSheet.getCell('A1').value = `GROUND EQUIPMENT SCOPE  (${groundEquipment.length} records)`;
  groundSheet.getCell('A1').style = {
    font:      { bold: true, size: 13, color: { argb: 'FFFFFFFF' } },
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: C.groundTab } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  };
  groundSheet.mergeCells('A1:S1');

  const groundCols = [
    { header: 'No',             key: 'no',                    width: 6  },
    { header: 'Tower Type',      key: 'towerType',             width: 18 },
    { header: 'Tower Height (m)', key: 'towerHeight',          width: 16 },
    { header: 'Indoor/Outdoor',  key: 'indoorOutdoor',         width: 16 },
    { header: 'Grid/DG/Solar',   key: 'gridDgSolar',           width: 16 },
    { header: 'Grid Distance (m)', key: 'gridDistance3Phase',  width: 18 },
    { header: 'Guard at Site',   key: 'guardAtSite',           width: 14 },
    { header: 'RRU Type',        key: 'rruTypeOnGround',       width: 18 },
    { header: 'RRU Count',       key: 'rruCountOnGround',      width: 12 },
    { header: 'Cabinet Types',   key: 'cabinetTypes',          width: 22 },
    { header: 'Cabinet Count',   key: 'cabinetCount',          width: 14 },
    { header: 'Labelling Done',  key: 'labellingDone',         width: 16 },
    { header: 'BTS Dimensions',  key: 'btsDimensions',         width: 20 },
    { header: 'Active IDU Types', key: 'activeIduTypes',       width: 22 },
    { header: 'IDU Count',       key: 'iduCount',              width: 12 },
    { header: 'Slab Dimensions', key: 'slabDimensions',        width: 20 },
    { header: 'Redundant Equip.', key: 'redundantEquipment',   width: 20 },
    { header: 'Redundant Count', key: 'redundantCount',       width: 16 },
    { header: 'TRM Media',       key: 'trmMedia',              width: 20 },
    { header: 'Remarks',         key: 'remarks',               width: 30 },
  ];

  groundSheet.getRow(2).height = 40;
  groundCols.forEach((col, i) => {
    const cell = groundSheet.getCell(`${String.fromCharCode(65 + i)}2`);
    cell.value = col.header;
    cell.style = ls('header');
    groundSheet.getColumn(String.fromCharCode(65 + i)).width = col.width;
  });

  groundEquipment.forEach((item, idx) => {
    const r = idx + 3;
    groundSheet.getRow(r).height = 22;
    const altStyle = r % 2 === 0 ? ls('data') : { ...ls('data'), fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.altRow } } };
    groundCols.forEach((col, i) => {
      const cell = groundSheet.getCell(`${String.fromCharCode(65 + i)}${r}`);
      cell.value = item[col.key] !== undefined ? item[col.key] : '';
      cell.style = altStyle;
    });
  });

  groundSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2, activeCell: 'A3' }];

  // ═══════════════════════════════════════════════════════════════════════════════
  // SHEET 3 — DCDB Information
  // ═══════════════════════════════════════════════════════════════════════════════
  const dcdbSheet = workbook.addWorksheet('DCDB Information', {
    properties: { tabColor: { argb: C.dcdbTab } },
  });

  dcdbSheet.getRow(1).height = 40;
  dcdbSheet.getCell('A1').value = `DCDB INFORMATION  (${dcdbRecords.length} records)`;
  dcdbSheet.getCell('A1').style = {
    font:      { bold: true, size: 13, color: { argb: 'FFFFFFFF' } },
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: C.dcdbTab } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  };
  dcdbSheet.mergeCells('A1:S1');

  const dcdbCols = [
    { header: 'No',                         key: 'no',                          width: 6  },
    { header: 'DCDB Priority Supply (mm²)',  key: 'dcdbPrioritySupplyCableSize',  width: 26 },
    { header: 'DCDB Load (A)',              key: 'dcdbLoadAmps',                 width: 16 },
    { header: 'DCDB Breaker A1 (A)',         key: 'dcdbBreakerA1',               width: 18 },
    { header: 'DCDB Breaker A2 (A)',         key: 'dcdbBreakerA2',               width: 18 },
    { header: 'DCDB Breaker A3 (A)',         key: 'dcdbBreakerA3',               width: 18 },
    { header: 'DCDB Breaker A4 (A)',         key: 'dcdbBreakerA4',               width: 18 },
    { header: 'DCDB Breaker A5 (A)',         key: 'dcdbBreakerA5',               width: 18 },
    { header: 'DCDU Breaker 1',              key: 'dduBreakerModel1',            width: 20 },
    { header: 'DCDU Breaker 2',              key: 'dduBreakerModel2',            width: 20 },
    { header: 'DCDU Breaker 3',              key: 'dduBreakerModel3',            width: 20 },
    { header: 'DCDU Breaker 4',              key: 'dduBreakerModel4',            width: 20 },
    { header: 'DCDU Breaker 5',              key: 'dduBreakerModel5',            width: 20 },
    { header: 'RRU Power Cables (#)',         key: 'rruPowerCableCount',         width: 18 },
    { header: 'RRU Missing Cables',           key: 'rruPowerCableMissing',        width: 18 },
    { header: 'RRU Cable Length (m)',          key: 'rruPowerCableLength',        width: 20 },
    { header: 'AAU Power Cables (#)',         key: 'aauPowerCableCount',         width: 18 },
    { header: 'AAU Missing Cables',            key: 'aauPowerCableMissing',       width: 18 },
    { header: 'AAU Cable Length (m)',          key: 'aauPowerCableLength',        width: 20 },
    { header: 'RRU Earthing Cables (#)',       key: 'rruEarthingCableCount',      width: 20 },
    { header: 'RRU Earthing Missing',          key: 'rruEarthingCableMissing',    width: 20 },
    { header: 'RRU Earthing Length (m)',       key: 'rruEarthingCableLength',     width: 22 },
    { header: 'AAU Earthing Cables (#)',       key: 'aauEarthingCableCount',      width: 20 },
    { header: 'AAU Earthing Missing',          key: 'aauEarthingCableMissing',    width: 20 },
    { header: 'AAU Earthing Length (m)',       key: 'aauEarthingCableLength',     width: 22 },
    { header: 'BTS Earthing Cables (#)',       key: 'btsEarthingCableCount',      width: 20 },
    { header: 'BTS Earthing Missing',          key: 'btsEarthingCableMissing',    width: 20 },
    { header: 'BTS Earthing Length (m)',       key: 'btsEarthingCableLength',     width: 22 },
    { header: 'Earthing Connection',           key: 'earthingConnection',         width: 22 },
    { header: 'Remarks',                      key: 'remarks',                     width: 30 },
  ];

  dcdbSheet.getRow(2).height = 50;
  dcdbCols.forEach((col, i) => {
    const cell = dcdbSheet.getCell(`${String.fromCharCode(65 + i)}2`);
    cell.value = col.header;
    cell.style = ls('header');
    dcdbSheet.getColumn(String.fromCharCode(65 + i)).width = col.width;
  });

  dcdbRecords.forEach((item, idx) => {
    const r = idx + 3;
    dcdbSheet.getRow(r).height = 22;
    const altStyle = r % 2 === 0 ? ls('data') : { ...ls('data'), fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.altRow } } };
    dcdbCols.forEach((col, i) => {
      const cell = dcdbSheet.getCell(`${String.fromCharCode(65 + i)}${r}`);
      cell.value = item[col.key] !== undefined ? item[col.key] : '';
      cell.style = altStyle;
    });
  });

  dcdbSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2, activeCell: 'A3' }];

  // ═══════════════════════════════════════════════════════════════════════════════
  // SHEET 4 — Tower Equipment Scope
  // ═══════════════════════════════════════════════════════════════════════════════
  const towerSheet = workbook.addWorksheet('Tower Equipment Scope', {
    properties: { tabColor: { argb: C.towerTab } },
  });

  towerSheet.getRow(1).height = 40;
  towerSheet.getCell('A1').value = `TOWER EQUIPMENT SCOPE  (${towerEquipment.length} entries)`;
  towerSheet.getCell('A1').style = {
    font:      { bold: true, size: 13, color: { argb: 'FFFFFFFF' } },
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: C.towerTab } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  };
  towerSheet.mergeCells('A1:S1');

  const towerCols = [
    { header: 'No',                    key: 'no',                width: 6  },
    { header: 'Airtel Site ID',        key: 'airtelSiteId',      width: 18 },
    { header: 'Site Name',             key: 'siteName',          width: 20 },
    { header: 'RF/TRM Equipment Type', key: 'rfEquipmentType',   width: 22 },
    { header: 'Antenna Manufacturer',  key: 'antennaManufacturer', width: 22 },
    { header: 'Antenna Model',         key: 'antennaModel',      width: 22 },
    { header: 'Tenant Owner',          key: 'tenantOwner',       width: 18 },
    { header: 'Antenna per Sector',    key: 'antennaPerSector',  width: 18 },
    { header: 'Sector',                key: 'sector',             width: 10 },
    { header: 'Azimuth (°)',           key: 'azimuth',           width: 12 },
    { header: 'Height to Centre (m)',  key: 'heightToCentre',   width: 18 },
    { header: 'Antenna Count',         key: 'antennaCount',      width: 15 },
    { header: 'Length (mm)',           key: 'antennaLength',    width: 14 },
    { header: 'Width (mm)',            key: 'antennaWidth',     width: 14 },
    { header: 'Height (mm)',           key: 'antennaHeight',    width: 14 },
    { header: 'Active / Inactive',     key: 'activeStatus',     width: 16 },
    { header: 'Equipment Labelling',    key: 'equipmentLabelling', width: 20 },
    { header: 'Remarks',               key: 'remarks',          width: 30 },
  ];

  towerSheet.getRow(2).height = 40;
  towerCols.forEach((col, i) => {
    const cell = towerSheet.getCell(`${String.fromCharCode(65 + i)}2`);
    cell.value = col.header;
    cell.style = ls('header');
    towerSheet.getColumn(String.fromCharCode(65 + i)).width = col.width;
  });

  towerEquipment.forEach((item, idx) => {
    const r = idx + 3;
    towerSheet.getRow(r).height = 22;
    const altStyle = r % 2 === 0 ? ls('data') : { ...ls('data'), fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: C.altRow } } };
    towerCols.forEach((col, i) => {
      const cell = towerSheet.getCell(`${String.fromCharCode(65 + i)}${r}`);
      cell.value = item[col.key] !== undefined ? item[col.key] : '';
      cell.style = altStyle;
    });
  });

  towerSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2, activeCell: 'A3' }];

  // ═══════════════════════════════════════════════════════════════════════════════
  // SHEET 5 — Photo Gallery (thumbnails)
  // ═══════════════════════════════════════════════════════════════════════════════
  if (photos.length > 0) {
    const photoSheet = workbook.addWorksheet('Photo Gallery', {
      properties: { tabColor: { argb: 'FFFFC000' } },
    });

    photoSheet.getRow(1).height = 40;
    photoSheet.getCell('A1').value = `PHOTO GALLERY  (${photos.length} photos)`;
    photoSheet.getCell('A1').style = {
      font:      { bold: true, size: 13, color: { argb: 'FFFFFFFF' } },
      fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } },
      alignment: { horizontal: 'center', vertical: 'middle' },
    };
    photoSheet.mergeCells('A1:F1');

    const photoHdrs = ['ID', 'Filename', 'Category', 'Preview', 'Uploaded', 'Remarks'];
    photoSheet.getRow(2).height = 30;
    photoHdrs.forEach((h, i) => {
      const cell = photoSheet.getCell(`${String.fromCharCode(65 + i)}2`);
      cell.value = h;
      cell.style = ls('header');
    });

    const photoColWidths = [20, 35, 14, 30, 22, 25];
    photoColWidths.forEach((w, i) => photoSheet.getColumn(String.fromCharCode(65 + i)).width = w);

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const r = i + 3;
      photoSheet.getRow(r).height = 80;

      photoSheet.getCell(`A${r}`).value = photo.id.substring(0, 8).toUpperCase();
      photoSheet.getCell(`A${r}`).style = ls('data');

      photoSheet.getCell(`B${r}`).value = photo.filename;
      photoSheet.getCell(`B${r}`).style = ls('data');

      photoSheet.getCell(`C${r}`).value = photo.category?.toUpperCase() || 'GENERAL';
      photoSheet.getCell(`C${r}`).style = ls('data');
      photoSheet.getCell(`C${r}`).alignment = { horizontal: 'center', vertical: 'middle' };

      // Embed thumbnail
      const thumbPath = path.join(__dirname, photo.thumbnail.replace(/^\/uploads\//, 'uploads\\'));
      if (fs.existsSync(thumbPath)) {
        try {
          const imgId = workbook.addImage({
            filename: thumbPath,
            extension: 'jpg',
          });
          photoSheet.addImage(imgId, {
            tl: { col: 3, row: r - 1 },
            br: { col: 4, row: r },
          });
        } catch (_) {
          photoSheet.getCell(`D${r}`).value = '[image]';
          photoSheet.getCell(`D${r}`).style = ls('data');
        }
      } else {
        photoSheet.getCell(`D${r}`).value = photo.original;
        photoSheet.getCell(`D${r}`).style = ls('data');
      }

      photoSheet.getCell(`E${r}`).value = new Date(photo.uploadedAt).toLocaleString();
      photoSheet.getCell(`E${r}`).style = ls('data');

      photoSheet.getCell(`F${r}`).style = ls('data');
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  const reportsDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const siteSlug   = (siteInfo?.siteId || siteInfo?.siteName || 'site').replace(/[^a-zA-Z0-9]/g, '_');
  const filename   = `BTS_Audit_${siteSlug}_${Date.now()}.xlsx`;
  const outPath    = path.join(reportsDir, filename);
  await workbook.xlsx.writeFile(outPath);
  return { path: outPath, filename };
}

// Download report
app.get('/api/report/excel', async (req, res) => {
  try {
    const result = await generateExcelReport(
      db.siteInfo, db.groundEquipment, db.dcdbRecords, db.towerEquipment, db.photos,
    );
    res.download(result.path, result.filename, err => {
      if (err) res.status(500).json({ error: 'Download failed', details: err.message });
    });
  } catch (e) {
    console.error('Report generation error:', e);
    res.status(500).json({ error: 'Report generation failed', details: e.message });
  }
});

// JSON preview + download link
app.post('/api/report/generate', async (req, res) => {
  try {
    const result = await generateExcelReport(
      db.siteInfo, db.groundEquipment, db.dcdbRecords, db.towerEquipment, db.photos,
    );
    res.json({ success: true, downloadUrl: `/reports/${result.filename}`, filename: result.filename });
  } catch (e) {
    res.status(500).json({ error: 'Report generation failed', details: e.message });
  }
});

// Serve reports and uploads
app.use('/reports', express.static(path.join(__dirname, 'reports')));
app.use('/uploads', express.static(UPLOADS_DIR));

// ── Dashboard (static HTML) ──────────────────────────────────────────────────
const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BTS Site Audit — Dashboard</title>
<style>
  :root{--bg:#f4f7fb;--card:#fff;--primary:#1F4E79;--accent:#2E75B6;--green:#375623;--orange:#833C00;--purple:#7030A0;--border:#e0e8f0;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:#222;}
  header{background:var(--primary);color:#fff;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;}
  header h1{font-size:18px;font-weight:600;}
  .badge{background:rgba(255,255,255,0.2);border-radius:12px;padding:4px 12px;font-size:13px;}
  main{max-width:1400px;margin:24px auto;padding:0 24px;}
  .stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:24px;}
  .stat-card{background:var(--card);border-radius:10px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.08);}
  .stat-card .label{font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;}
  .stat-card .value{font-size:32px;font-weight:700;margin-top:4px;}
  .stat-card.green .value{color:var(--green);}
  .stat-card.orange .value{color:var(--orange);}
  .stat-card.purple .value{color:var(--purple);}
  .stat-card.blue .value{color:var(--primary);}
  .card{background:var(--card);border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,0.08);margin-bottom:24px;overflow:hidden;}
  .card-header{padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;}
  .card-header h2{font-size:15px;color:var(--primary);}
  .card-header button{background:var(--accent);color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;}
  .card-header button:hover{background:var(--primary);}
  table{width:100%;border-collapse:collapse;}
  th{background:#f0f4f8;padding:10px 14px;text-align:left;font-size:12px;font-weight:600;color:#555;border-bottom:2px solid var(--border);}
  td{padding:10px 14px;font-size:13px;border-bottom:1px solid var(--border);}
  tr:hover td{background:#f8fafc;}
  .tab-bar{display:flex;gap:4px;padding:0 20px;background:var(--card);border-bottom:1px solid var(--border);}
  .tab-btn{padding:10px 16px;border:none;background:none;cursor:pointer;font-size:13px;color:#666;border-bottom:2px solid transparent;}
  .tab-btn.active{color:var(--primary);border-bottom-color:var(--primary);font-weight:600;}
  .tab-content{display:none;}
  .tab-content.active{display:block;}
  .photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;padding:20px;}
  .photo-thumb{border-radius:8px;overflow:hidden;border:1px solid var(--border);background:#f8fafc;}
  .photo-thumb img{width:100%;height:130px;object-fit:cover;display:block;}
  .photo-thumb .info{padding:8px 10px;font-size:11px;color:#666;}
  .photo-thumb .info .name{font-weight:600;color:#333;word-break:break-all;}
  .tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;}
  .tag-ground{background:#e8f5e9;color:#2e7d32;}
  .tag-dcdb{background:#fff3e0;color:#e65100;}
  .tag-tower{background:#f3e5f5;color:#6a1b9a;}
  .tag-general{background:#e3f2fd;color:#1565c0;}
  .btn-download{background:#1F4E79;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:13px;margin:20px;}
  .btn-download:hover{background:#0d2f4a;}
</style>
</head>
<body>
<header>
  <h1>📡 BTS Site Audit Dashboard</h1>
  <span class="badge" id="siteBadge">—</span>
</header>
<main>
  <div class="stats">
    <div class="stat-card green"><div class="label">Ground Equipment</div><div class="value" id="statGround">0</div><div class="label">records</div></div>
    <div class="stat-card orange"><div class="label">DCDB Records</div><div class="value" id="statDcdb">0</div><div class="label">records</div></div>
    <div class="stat-card purple"><div class="label">Tower Equipment</div><div class="value" id="statTower">0</div><div class="label">entries</div></div>
    <div class="stat-card blue"><div class="label">Photos</div><div class="value" id="statPhotos">0</div><div class="label">captured</div></div>
  </div>
  <button class="btn-download" onclick="downloadReport()">📥 Download Excel Report</button>
  <div class="card">
    <div class="tab-bar">
      <button class="tab-btn active" onclick="showTab('ground')">Ground</button>
      <button class="tab-btn" onclick="showTab('dcdb')">DCDB</button>
      <button class="tab-btn" onclick="showTab('tower')">Tower</button>
      <button class="tab-btn" onclick="showTab('photos')">Photos</button>
    </div>

    <div id="tab-ground" class="tab-content active">
      <table id="groundTable">
        <thead><tr><th>No</th><th>Tower Type</th><th>Tower Ht</th><th>Indoor/Outdoor</th><th>Grid/DG/Solar</th><th>RRU Type</th><th>RRU Count</th><th>Cabinet Types</th><th>Labelling</th><th>Remarks</th></tr></thead>
        <tbody id="groundBody"></tbody>
      </table>
    </div>

    <div id="tab-dcdb" class="tab-content">
      <table id="dcdbTable">
        <thead><tr><th>No</th><th>Priority Cable (mm²)</th><th>Load (A)</th><th>Breaker A1</th><th>DCDU Breaker 1</th><th>RRU Power Cables</th><th>RRU Earthing</th><th>Earthing Connection</th><th>Remarks</th></tr></thead>
        <tbody id="dcdbBody"></tbody>
      </table>
    </div>

    <div id="tab-tower" class="tab-content">
      <table id="towerTable">
        <thead><tr><th>No</th><th>Airtel Site ID</th><th>Site Name</th><th>RF/TRM Type</th><th>Antenna Manufacturer</th><th>Antenna Model</th><th>Tenant</th><th>Sector</th><th>Azimuth</th><th>Height (m)</th><th>Antenna Count</th><th>Active</th><th>Remarks</th></tr></thead>
        <tbody id="towerBody"></tbody>
      </table>
    </div>

    <div id="tab-photos" class="tab-content">
      <div class="photo-grid" id="photoGrid"></div>
    </div>
  </div>
</main>
<script>
async function loadData() {
  const [siteRes, groundRes, dcdbRes, towerRes, photoRes] = await Promise.all([
    fetch('/api/site'),
    fetch('/api/ground'),
    fetch('/api/dcdb'),
    fetch('/api/tower'),
    fetch('/api/photos'),
  ]);
  const site   = await siteRes.json();
  const ground  = (await groundRes.json()).records || [];
  const dcdb    = (await dcdbRes.json()).records   || [];
  const tower   = (await towerRes.json()).records  || [];
  const { photos } = await photoRes.json();

  document.getElementById('siteBadge').textContent = site.siteId ? site.siteId + ' — ' + (site.siteName||'') : 'No site data';
  document.getElementById('statGround').textContent = ground.length;
  document.getElementById('statDcdb').textContent   = dcdb.length;
  document.getElementById('statTower').textContent  = tower.length;
  document.getElementById('statPhotos').textContent = photos.length;

  function td(v){ const e=document.createElement('td'); e.textContent=v??''; return e; }

  const groundBody = document.getElementById('groundBody');
  ground.forEach(r => {
    const tr=document.createElement('tr');
    [r.no, r.towerType, r.towerHeight, r.indoorOutdoor, r.gridDgSolar, r.rruTypeOnGround, r.rruCountOnGround, r.cabinetTypes, r.labellingDone, r.remarks].forEach(v=>tr.appendChild(td(v)));
    groundBody.appendChild(tr);
  });

  const dcdbBody = document.getElementById('dcdbBody');
  dcdb.forEach(r => {
    const tr=document.createElement('tr');
    [r.no, r.dcdbPrioritySupplyCableSize, r.dcdbLoadAmps, r.dcdbBreakerA1, r.dduBreakerModel1, r.rruPowerCableCount, r.rruEarthingCableCount, r.earthingConnection, r.remarks].forEach(v=>tr.appendChild(td(v)));
    dcdbBody.appendChild(tr);
  });

  const towerBody = document.getElementById('towerBody');
  tower.forEach(r => {
    const tr=document.createElement('tr');
    [r.no, r.airtelSiteId, r.siteName, r.rfEquipmentType, r.antennaManufacturer, r.antennaModel, r.tenantOwner, r.sector, r.azimuth, r.heightToCentre, r.antennaCount, r.activeStatus, r.remarks].forEach(v=>tr.appendChild(td(v)));
    towerBody.appendChild(tr);
  });

  const photoGrid = document.getElementById('photoGrid');
  photos.forEach(p => {
    const div=document.createElement('div');
    div.className='photo-thumb';
    const tagClass = 'tag-' + (p.category||'general');
    div.innerHTML='<img src="'+p.thumbnail+'" alt="'+p.filename+'" onerror="this.src=\''+p.original+'\'"><div class="info"><span class="tag '+tagClass+'">'+p.category+'</span> <span class="name">'+p.filename+'</span></div>';
    photoGrid.appendChild(div);
  });
}

function showTab(name){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
  document.querySelector('.tab-btn[onclick*="'+name+'"]').classList.add('active');
  document.getElementById('tab-'+name).classList.add('active');
}

function downloadReport(){ window.location='/api/report/excel'; }

loadData();
</script>
</body>
</html>`;

app.get('/', (req, res) => res.send(dashboardHtml));

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`BTS Site Audit API running on http://localhost:${PORT}`);
  console.log(`Dashboard:             http://localhost:${PORT}/`);
  console.log(`Health:                http://localhost:${PORT}/api/health`);
  console.log(`Sync:                  POST http://localhost:${PORT}/api/audit/sync`);
  console.log(`Download Excel Report: http://localhost:${PORT}/api/report/excel`);
});
