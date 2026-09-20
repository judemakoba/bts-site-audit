/**
 * Site Audit Excel Template Generator
 * Matches the exact field structure from the reference template:
 * - Ground Equipment Scope
 * - DCDB Information
 * - Tower Equipment Scope
 */

const ExcelJS = require('exceljs');
const path    = require('path');

const OUT = path.join(__dirname, '..', '..', 'template', 'Site_Audit_Template.xlsx');

// ─── Colour palette ─────────────────────────────────────────────────────────────
const C = {
  primary:   '1F4E79',
  accent:    '2E75B6',
  section:   'BDD7EE',
  label:     'D6E4F0',
  altRow:    'EBF3FB',
  white:     'FFFFFF',
  border:    '9DC3E6',
  green:     '375623',
  greenBg:   'E2EFDA',
  red:       'C00000',
  orange:    'ED7D31',
};

function sHdr(ws, r, c, text, bg = C.primary) {
  const cell = ws.getCell(`${c}${r}`);
  cell.value = text;
  cell.style = {
    font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${bg}` } },
    border: {
      top:    { style: 'thin', color: { argb: 'FF9DC3E6' } },
      bottom: { style: 'thin', color: { argb: 'FF9DC3E6' } },
      left:   { style: 'thin', color: { argb: 'FF9DC3E6' } },
      right:  { style: 'thin', color: { argb: 'FF9DC3E6' } },
    },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
  };
  return cell;
}

function sLbl(ws, r, c, text) {
  const cell = ws.getCell(`${c}${r}`);
  cell.value = text;
  cell.style = {
    font: { bold: true, size: 10, color: { argb: 'FF1F4E79' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.section}` } },
    border: {
      top:    { style: 'thin', color: { argb: 'FF9DC3E6' } },
      bottom: { style: 'thin', color: { argb: 'FF9DC3E6' } },
      left:   { style: 'thin', color: { argb: 'FF9DC3E6' } },
      right:  { style: 'thin', color: { argb: 'FF9DC3E6' } },
    },
    alignment: { horizontal: 'left', vertical: 'middle', wrapText: true },
  };
  return cell;
}

function sData(ws, r, c, alt = false) {
  const cell = ws.getCell(`${c}${r}`);
  cell.style = {
    font: { size: 10 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: alt ? `FF${C.altRow}` : `FF${C.white}` } },
    border: {
      top:    { style: 'thin', color: { argb: 'FF9DC3E6' } },
      bottom: { style: 'thin', color: { argb: 'FF9DC3E6' } },
      left:   { style: 'thin', color: { argb: 'FF9DC3E6' } },
      right:  { style: 'thin', color: { argb: 'FF9DC3E6' } },
    },
    alignment: { horizontal: 'left', vertical: 'middle' },
  };
  return cell;
}

function sMerge(ws, r, c1, c2) {
  ws.mergeCells(`${c1}${r}:${c2}${r}`);
}

function col(n) {
  let s = '';
  while (n > 0) { s = String.fromCharCode(((n - 1) % 26) + 65) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function mergeHdr(ws, r, c1, c2, text) {
  ws.mergeCells(`${c1}${r}:${c2}${r}`);
  const cell = ws.getCell(`${c1}${r}`);
  cell.value = text;
  cell.style = {
    font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.primary}` } },
    border: {
      top:    { style: 'medium', color: { argb: 'FF9DC3E6' } },
      bottom: { style: 'medium', color: { argb: 'FF9DC3E6' } },
      left:   { style: 'medium', color: { argb: 'FF9DC3E6' } },
      right:  { style: 'medium', color: { argb: 'FF9DC3E6' } },
    },
    alignment: { horizontal: 'center', vertical: 'middle' },
  };
}

function setRowHeight(ws, r, h) { ws.getRow(r).height = h; }
function setColWidth(ws, c, w) { ws.getColumn(c).width = w; }

// ─── Ground Equipment Scope ──────────────────────────────────────────────────────
function buildGroundSheet(wb) {
  const ws = wb.addWorksheet('Ground Equipment Scope', { properties: { tabColor: { argb: 'FF375623' } } });

  // Row 1: Header banner
  setRowHeight(ws, 1, 45);
  mergeHdr(ws, 1, 'A', 'AK', 'GROUND EQUIPMENT SCOPE — SITE AUDIT');

  // Row 2: GPS coordinates banner
  setRowHeight(ws, 2, 25);
  mergeHdr(ws, 2, 'I', 'J', 'Coordinates at Center of Tower / RTP');

  // Row 3: Power source banner
  mergeHdr(ws, 3, 'S', 'U', 'Power Source (Grid | Solar | DG | Non-DG)');

  // Row 4: Column headers
  setRowHeight(ws, 4, 40);
  const headers4 = [
    ['A', 'Site ID'], ['B', 'ATC No'], ['C', 'Site Name'], ['D', 'Survey Date'],
    ['E', 'Survey Technician Name'], ['F', 'Survey Technician Contacts'],
    ['G', 'Survey Contractor Name'], ['H', 'Latitude'],
    ['I', 'Longitude'], ['J', 'Site Tower Type\n(GBT / RTT / RTP)'],
    ['K', 'Tower Height\n(m)'], ['L', 'Building\nHeight (m)'], ['M', 'Total\nHeight (m)'],
    ['N', 'Site Indoor\n/ Outdoor'], ['O', 'No of\nTenants'],
    ['P', 'Names of Other\nTenants'], ['Q', 'Grid'], ['R', 'DG'],
    ['S', 'Solar'], ['T', 'Grid Distance to 3-Phase\nPower Line (m)'],
    ['U', 'Guard at\nSite'],
  ];
  headers4.forEach(([c, h]) => sHdr(ws, 4, c, h));

  // Row 5: Second header row
  setRowHeight(ws, 5, 45);
  const headers5 = [
    ['V', 'RRU Type\n(Model) on Ground'], ['W', 'RRU Count\non Ground'],
    ['X', 'Cabinet Types\n(Models) on Ground'], ['Y', 'Cabinet Count\non Ground'],
    ['Z', 'Labelling of all\nEquipments'],
    ['AA', 'Cabinets Comments\ne.g. Redundant or Active'],
    ['AB', 'BTS Cabinets\nDimensions\n(L × W × H)'],
    ['AC', 'Active IDU Types\n(Models) in Cabinet'],
    ['AD', 'Active IDU Count\nin Cabinet'],
    ['AE', 'Non-Active IDU Types\n(Models) in Cabinet'],
    ['AF', 'Non-Active IDU\nCount in Cabinet'],
    ['AG', 'Dimensions of\nSlabs (L × W in m)'],
    ['AH', 'Redundant Equipment\non Ground'],
    ['AI', 'Count of Redundant\nEquipment on Ground'],
    ['AJ', 'TRM Media: Is site\non Fiber? (Yes / No)'],
    ['AK', 'Overall Remarks'],
  ];
  headers5.forEach(([c, h]) => sHdr(ws, 5, c, h));

  // Data rows (20 blank)
  for (let r = 6; r <= 25; r++) {
    const alt = (r % 2 === 0);
    setRowHeight(ws, r, 22);
    for (const [c] of [...headers4, ...headers5]) {
      sData(ws, r, c, alt);
    }
    // Default yes/no dropdowns
    ['Q', 'R', 'S', 'U', 'AJ'].forEach(c => {
      ws.getCell(`${c}${r}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: ['"Yes,No"'],
      };
    });
    ['N'].forEach(c => {
      ws.getCell(`${c}${r}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: ['"Indoor,Outdoor"'],
      };
    });
    ['J'].forEach(c => {
      ws.getCell(`${c}${r}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: ['"GBT,RTT,RTP"'],
      };
    });
    ['Z'].forEach(c => {
      ws.getCell(`${c}${r}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: ['"Done,Not Done"'],
      };
    });
  }

  // Column widths
  const widths = {
    A: 10, B: 10, C: 18, D: 14, E: 22, F: 18, G: 20,
    H: 14, I: 14, J: 16, K: 10, L: 10, M: 10,
    N: 12, O: 8, P: 18, Q: 8, R: 8, S: 8, T: 18, U: 10,
    V: 22, W: 10, X: 22, Y: 10, Z: 14,
    AA: 22, AB: 16, AC: 22, AD: 10, AE: 22, AF: 10,
    AG: 16, AH: 22, AI: 12, AJ: 14, AK: 30,
  };
  Object.entries(widths).forEach(([c, w]) => setColWidth(ws, c, w));

  // Freeze
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 5, activeCell: 'A6' }];
}

// ─── DCDB Information ───────────────────────────────────────────────────────────
function buildDCDBSheet(wb) {
  const ws = wb.addWorksheet('DCDB information', { properties: { tabColor: { argb: 'FFC00000' } } });

  // Row 1: Earthing banner
  setRowHeight(ws, 1, 22);
  mergeHdr(ws, 1, 'A', 'N', '');
  ws.getCell('A1').value = 'DCDB INFORMATION';

  // Row 2: Earthing sub-header
  setRowHeight(ws, 2, 22);
  mergeHdr(ws, 2, 'A', 'N', '');

  // Row 3: Main headers
  setRowHeight(ws, 3, 50);
  const hdr3 = [
    ['A', 'Grid Distance\nto 3-Phase Line (m)'],
    ['B', 'DCDB\nSupply Cable Size\nto DCDB (mm²)'],
    ['C', 'DCDB\nSupply Cable Size\nto DCDU (mm²)\nin BTS C'],
    ['D', 'DCDB\nSupply Load Measurement (A)\nDCDB Incoming'],
    ['E', 'DCDB\nTime When Load\nwas Measured'],
    ['F', 'DCDB Breaker 1 (A)'],
    ['G', 'DCDB Breaker 2 (A)'],
    ['H', 'DCDB Breaker 3 (A)'],
    ['I', 'DCDB Breaker 4 (A)'],
    ['J', 'DCDB Breaker 5 (A)'],
    ['K', 'Priority Cable\nSupply Cable Size\nto DCDB (mm²)'],
    ['L', 'Priority Cable\nSupply Cable Size\nto DCDU (mm²)\nin BTS C'],
    ['M', 'Priority Cable\nSupply Load Measurement (A)\nDCDB Incoming'],
    ['N', 'Priority Cable\nBreaker 1 (A)'],
  ];
  hdr3.forEach(([c, h]) => sHdr(ws, 3, c, h, 'FF375623'));

  // Row 4: Sub-headers for DCDU
  setRowHeight(ws, 4, 40);
  const hdr4 = [
    ['O', 'DCDU\nBreaker 1\nModel'],
    ['P', 'DCDU\nBreaker 2\nModel'],
    ['Q', 'DCDU\nBreaker 3\nModel'],
    ['R', 'DCDU\nBreaker 4\nModel'],
    ['S', 'DCDU\nBreaker 5\nModel'],
    ['T', 'Total DCDU Count'],
    ['U', 'RRU Count'],
    ['V', 'RRU Power Cable\nCount (Pcs)'],
    ['W', 'RRU Power Cable\nCount Missing (Pcs)'],
    ['X', 'RRU Power Cable\nLength per run (m)'],
    ['Y', 'RRU Power Cable\nTotal Length Missing (m)'],
    ['Z', 'RRU Earthing Cable\nCount (Pcs)'],
    ['AA', 'RRU Earthing Cable\nCount Missing (Pcs)'],
    ['AB', 'RRU Earthing Cable\nLength per run (m)'],
    ['AC', 'AAU Count (Pcs)'],
    ['AD', 'AAU Power Cable\nCount (Pcs)'],
    ['AE', 'AAU Power Cable\nCount Missing (Pcs)'],
    ['AF', 'AAU Power Cable\nLength per run (m)'],
    ['AG', 'AAU Power Cable\nTotal Length Missing (m)'],
    ['AH', 'AAU Earthing Cable\nCount (Pcs)'],
    ['AI', 'AAU Earthing Cable\nCount Missing (Pcs)'],
    ['AJ', 'AAU Earthing Cable\nLength per run (m)'],
    ['AK', 'BTS Earthing Cable\nCount (Pcs)'],
    ['AL', 'BTS Earthing Cable\nMissing Count'],
    ['AM', 'BTS Earthing Cable\nLength per run (m)'],
    ['AN', 'BTS Earthing Cable\nTotal Length Missing (m)'],
    ['AO', 'Earthing Connection'],
  ];
  hdr4.forEach(([c, h]) => sHdr(ws, 4, c, h, 'FFC00000'));

  // Data rows
  for (let r = 5; r <= 24; r++) {
    const alt = (r % 2 === 0);
    setRowHeight(ws, r, 22);
    for (const [c] of [...hdr3, ...hdr4]) {
      sData(ws, r, c, alt);
    }
  }

  // Column widths
  const widths = {
    A: 14, B: 16, C: 16, D: 18, E: 18,
    F: 10, G: 10, H: 10, I: 10, J: 10,
    K: 16, L: 16, M: 18, N: 10,
    O: 12, P: 12, Q: 12, R: 12, S: 12, T: 10,
    U: 10, V: 12, W: 12, X: 14, Y: 16,
    Z: 12, AA: 12, AB: 14,
    AC: 10, AD: 12, AE: 12, AF: 14, AG: 16,
    AH: 12, AI: 12, AJ: 14,
    AK: 14, AL: 14, AM: 14, AN: 16, AO: 22,
  };
  Object.entries(widths).forEach(([c, w]) => setColWidth(ws, c, w));

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 4, activeCell: 'A5' }];
}

// ─── Tower Equipment Scope ─────────────────────────────────────────────────────
function buildTowerSheet(wb) {
  const ws = wb.addWorksheet('Tower Equipment Scope', { properties: { tabColor: { argb: 'FFED7D31' } } });

  // Row 1: RF/TRM banner
  setRowHeight(ws, 1, 22);
  mergeHdr(ws, 1, 'H', 'I', 'Antenna / RRU');

  // Row 2: Column headers
  setRowHeight(ws, 2, 40);
  const hdr2 = [
    ['A', 'No.'],
    ['B', 'Airtel Site ID'],
    ['C', 'Site Name'],
    ['D', 'RF/TRM\nEquipment Type'],
    ['E', 'Antenna\nManufacturer'],
    ['F', 'Antenna Model\nNumber'],
    ['G', 'Tenant Owner'],
    ['H', 'Antenna / RRU\nper Sector'],
    ['I', 'Antenna / RRU\nCount'],
    ['J', 'Azimuth (°)'],
    ['K', 'Height to Centre\nof Antenna (m)'],
    ['L', 'Antenna\nCount'],
    ['M', 'Length / Dia\n(mm)'],
    ['N', 'Width\n(mm)'],
    ['O', 'Height\n(mm)'],
    ['P', 'Active /\nInactive'],
    ['Q', 'Equipment\nLabelling'],
    ['R', 'Remarks'],
  ];
  hdr2.forEach(([c, h]) => sHdr(ws, 2, c, h));

  // Row 3: sub-headers
  setRowHeight(ws, 3, 40);
  ws.getCell('H3').value = 'Tenant Owner';
  ws.getCell('H3').style = ws.getCell('H2').style;
  ws.mergeCells('H3:H3');
  ws.getCell('I3').value = 'Sector';
  ws.getCell('I3').style = ws.getCell('H2').style;
  ws.mergeCells('I3:I3');

  // Section label rows
  function sectionRow(ws, r, label, fromCol, toCol) {
    setRowHeight(ws, r, 20);
    ws.mergeCells(`${fromCol}${r}:${toCol}${r}`);
    const cell = ws.getCell(`${fromCol}${r}`);
    cell.value = label;
    cell.style = {
      font: { bold: true, size: 10, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFED7D31' } },
      border: {
        top:    { style: 'thin', color: { argb: 'FF9DC3E6' } },
        bottom: { style: 'thin', color: { argb: 'FF9DC3E6' } },
        left:   { style: 'thin', color: { argb: 'FF9DC3E6' } },
        right:  { style: 'thin', color: { argb: 'FF9DC3E6' } },
      },
      alignment: { horizontal: 'center', vertical: 'middle' },
    };
  }

  // Note row
  setRowHeight(ws, 4, 20);
  ws.mergeCells('A4:R4');
  const noteCell = ws.getCell('A4');
  noteCell.value = '* Note: Take a photo of each antenna individually';
  noteCell.style = {
    font: { italic: true, size: 10, color: { argb: 'FFC00000' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } },
    border: {
      top:    { style: 'thin', color: { argb: 'FF9DC3E6' } },
      bottom: { style: 'thin', color: { argb: 'FF9DC3E6' } },
      left:   { style: 'thin', color: { argb: 'FF9DC3E6' } },
      right:  { style: 'thin', color: { argb: 'FF9DC3E6' } },
    },
    alignment: { horizontal: 'left', vertical: 'middle' },
  };

  // Section rows: RF Antenna header
  sectionRow(ws, 5, 'RF ANTENNA SECTION', 'A', 'R');

  // Data rows for RF antenna (rows 6-35)
  for (let r = 6; r <= 35; r++) {
    const alt = (r % 2 === 0);
    setRowHeight(ws, r, 22);
    for (const [c] of hdr2) {
      sData(ws, r, c, alt);
    }
    ws.getCell(`A${r}`).value = r - 5;
    ws.getCell(`A${r}`).style.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getCell(`D${r}`).value = 'RF antenna';
    // Dropdowns
    ws.getCell(`D${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"RF antenna,MW Antenna,MW ODU,RRU,BBU,DCDB,Other"'],
    };
    ws.getCell(`P${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"Active,Inactive,Standby"'],
    };
    ws.getCell(`Q${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"Done,Not Done"'],
    };
    ws.getCell(`I${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"A,B,C,Alpha,Beta,Gamma"'],
    };
  }

  // Column widths
  const widths = {
    A: 6, B: 12, C: 18, D: 14, E: 16, F: 22,
    G: 14, H: 14, I: 10, J: 10, K: 14, L: 10,
    M: 12, N: 10, O: 10, P: 10, Q: 14, R: 22,
  };
  Object.entries(widths).forEach(([c, w]) => setColWidth(ws, c, w));

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 5, activeCell: 'A6' }];
}

// ─── Instructions Sheet ────────────────────────────────────────────────────────
function buildInstructions(wb) {
  const ws = wb.addWorksheet('Instructions', { properties: { tabColor: { argb: 'FF9DC3E6' } } });

  setRowHeight(ws, 1, 50);
  mergeHdr(ws, 1, 'A', 'D', 'SITE AUDIT CHECKLIST — FIELD GUIDE');
  ws.getCell('A1').style.font.size = 16;

  const rows = [
    ['', ''],
    ['SHEET', 'PURPOSE'],
    ['Ground Equipment Scope', 'Capture all ground-level equipment: RRU, cabinets, BTS, IDU, slabs, power source, GPS coordinates, site classification.'],
    ['DCDB Information', 'Capture DC power distribution details: DCDB/DCDU breaker specs, cable counts and lengths, earthing system, missing materials.'],
    ['Tower Equipment Scope', 'Capture every piece of tower-mounted equipment: antenna manufacturer, model, azimuth, height, dimensions, active/inactive status, sector.'],
    ['', ''],
    ['RULES', ''],
    ['Survey Date', 'Enter in DD-MMM-YYYY format (e.g. 20-Sep-2026)'],
    ['Coordinates', 'Use decimal degrees. Latitude first, then Longitude.'],
    ['Active / Inactive', 'Mark "Active" for powered-on communicating units. "Inactive" for decommissioned or faulty.'],
    ['Labelling', '"Done" = equipment has an asset tag label. "Not Done" = missing label.'],
    ['TRM Media', '"Yes" if site has fiber connectivity. "No" if microwave or other.'],
    ['Antenna Photos', 'Take one photo per antenna. Name photos as: SITEID_SECTOR_EQUIPMENT (e.g. KA1108_A_RF1.jpg)'],
    ['DCDB', 'DCDB = DC Distribution Box. Measure all cable lengths with a tape measure.'],
    ['Safety', 'Obtain all required permits before tower climbing. Follow site safety procedures.'],
  ];

  rows.forEach(([label, text], i) => {
    const r = i + 3;
    setRowHeight(ws, r, 28);
    if (label) {
      sLbl(ws, r, 'A', label);
      ws.mergeCells(`B${r}:D${r}`);
      const tCell = ws.getCell(`B${r}`);
      tCell.value = text;
      tCell.style = {
        font: { size: 10 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${C.white}` } },
        border: {
          top:    { style: 'thin', color: { argb: 'FF9DC3E6' } },
          bottom: { style: 'thin', color: { argb: 'FF9DC3E6' } },
          left:   { style: 'thin', color: { argb: 'FF9DC3E6' } },
          right:  { style: 'thin', color: { argb: 'FF9DC3E6' } },
        },
        alignment: { horizontal: 'left', vertical: 'middle', wrapText: true },
      };
    }
  });

  setColWidth(ws, 'A', 30);
  setColWidth(ws, 'B', 25);
  setColWidth(ws, 'C', 25);
  setColWidth(ws, 'D', 25);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Asset Verification System';
  wb.created  = new Date();

  buildInstructions(wb);
  buildGroundSheet(wb);
  buildDCDBSheet(wb);
  buildTowerSheet(wb);

  await wb.xlsx.writeFile(OUT);
  console.log('✅ Template saved:', OUT);
}

main().catch(console.error);
