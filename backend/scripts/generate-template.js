/**
 * Asset Capture Excel Template Generator
 * Generates a comprehensive multi-sheet Excel workbook for telco BTS site asset verification
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function generateTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Asset Verification System';
  workbook.created = new Date();

  // ─── COLOR PALETTE ───────────────────────────────────────────────────────────
  const C = {
    headerBg:  '1F4E79',  // Dark blue
    headerFg:  'FFFFFF',  // White
    sectionBg: '2E75B6',  // Medium blue
    sectionFg: 'FFFFFF',
    altRow:    'DEEAF1',  // Light blue tint
    whiteRow:  'FFFFFF',
    labelBg:   'BDD7EE',  // Light blue label
    border:    '9DC3E6',
    titleBg:   '1F4E79',
    noteBg:    'FFF2CC',
  };

  function headerStyle() {
    return {
      font:  { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
      fill:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } },
      border: { top: { style: 'thin', color: { argb: 'FF9DC3E6' } }, bottom: { style: 'thin', color: { argb: 'FF9DC3E6' } }, left: { style: 'thin', color: { argb: 'FF9DC3E6' } }, right: { style: 'thin', color: { argb: 'FF9DC3E6' } } },
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    };
  }

  function sectionStyle() {
    return {
      font:  { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
      fill:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } },
      border: { top: { style: 'thin', color: { argb: 'FF9DC3E6' } }, bottom: { style: 'thin', color: { argb: 'FF9DC3E6' } }, left: { style: 'thin', color: { argb: 'FF9DC3E6' } }, right: { style: 'thin', color: { argb: 'FF9DC3E6' } } },
      alignment: { horizontal: 'left', vertical: 'middle' },
    };
  }

  function dataStyle(alt = false) {
    return {
      font: { size: 10 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: alt ? 'FFDEEAF1' : 'FFFFFFFF' } },
      border: { top: { style: 'thin', color: { argb: 'FF9DC3E6' } }, bottom: { style: 'thin', color: { argb: 'FF9DC3E6' } }, left: { style: 'thin', color: { argb: 'FF9DC3E6' } }, right: { style: 'thin', color: { argb: 'FF9DC3E6' } } },
      alignment: { horizontal: 'left', vertical: 'middle' },
    };
  }

  function labelStyle() {
    return {
      font:  { bold: true, size: 10 },
      fill:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } },
      border: { top: { style: 'thin', color: { argb: 'FF9DC3E6' } }, bottom: { style: 'thin', color: { argb: 'FF9DC3E6' } }, left: { style: 'thin', color: { argb: 'FF9DC3E6' } }, right: { style: 'thin', color: { argb: 'FF9DC3E6' } } },
      alignment: { horizontal: 'left', vertical: 'middle' },
    };
  }

  // Convert 1-based column index to Excel letter(s) — handles AA, AB, etc.
  function col(n) {
    let s = '';
    while (n > 0) { s = String.fromCharCode(((n - 1) % 26) + 65) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  function setColWidths(ws, widths) {
    Object.entries(widths).forEach(([col, w]) => {
      ws.getColumn(col).width = w;
    });
  }

  function applyRowStyle(ws, rowNum, style, cols = null) {
    const row = ws.getRow(rowNum);
    const colLetters = cols || Object.keys(style);
    colLetters.forEach(col => {
      const cell = ws.getCell(`${col}${rowNum}`);
      cell.style = style[col] || style;
    });
  }

  // ─── SHEET 1: INSTRUCTIONS ───────────────────────────────────────────────────
  {
    const ws = workbook.addWorksheet('📋 Instructions', { properties: { tabColor: { argb: 'FF1F4E79' } } });
    ws.getRow(1).height = 50;
    ws.getCell('A1').value = 'TELCO BTS ASSET VERIFICATION — CAPTURE TEMPLATE';
    ws.getCell('A1').style = {
      font: { bold: true, size: 18, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
    };
    ws.mergeCells('A1:E1');

    const instructions = [
      ['', ''],
      ['PURPOSE', 'This workbook is the standard template for capturing physical asset data at BTS (Base Transceiver Station) sites.'],
      ['HOW TO USE', 'Each sheet represents a category of equipment. Fill in one row per physical asset found on site.'],
      ['PHOTOS', 'Use the Photo ID column to match an asset row to a photo filename (e.g. PHOTO_001.jpg). Photos are stored separately and referenced by ID in the final report.'],
      ['SITE INFO', 'Always fill in the Site Information sheet first — all other sheets reference it.'],
      ['SERIAL & MODEL', 'Be precise. Serial Number and Model No. are critical for warranty and inventory tracking.'],
      ['ACTIVE/INACTIVE', 'Mark "Active" if the unit is powered on and communicating. "Inactive" if decommissioned or faulty.'],
      ['TOWER LEG', 'For On-Tower equipment: specify which leg (A/B/C/D) and sector (Alpha/Beta/Gamma).'],
      ['SUBMISSION', 'After completing all sheets, submit this workbook along with the /photos folder to your supervisor.'],
      ['HELP', 'For column definitions, hover over the header cell — a description will appear in the formula bar.'],
    ];

    instructions.forEach(([label, text], i) => {
      const row = ws.getRow(i + 3);
      row.height = 30;
      if (label) {
        ws.getCell(`A${i+3}`).value = label;
        ws.getCell(`A${i+3}`).style = labelStyle();
        ws.getCell(`A${i+3}`).border.right = { style: 'medium', color: { argb: 'FF2E75B6' } };
      }
      ws.getCell(`B${i+3}`).value = text;
      ws.getCell(`B${i+3}`).style = { font: { size: 10 }, alignment: { horizontal: 'left', vertical: 'middle' }, wrapText: true };
      ws.mergeCells(`B${i+3}:E${i+3}`);
    });

    // Color legend
    ws.getRow(14).height = 20;
    const legendRow = 15;
    ws.getCell(`A${legendRow}`).value = 'COLOR LEGEND';
    ws.getCell(`A${legendRow}`).style = sectionStyle();
    ws.mergeCells(`A${legendRow}:E${legendRow}`);

    const legendItems = [
      ['🔵 Blue Header', 'Mandatory field — must be filled'],
      ['⚪ White Row', 'Normal data entry'],
      ['🔷 Blue Row', 'Alternating row — for readability'],
      ['🟡 Yellow Note', 'Requires special attention or verification'],
    ];
    legendItems.forEach(([name, desc], i) => {
      const r = legendRow + 1 + i;
      ws.getCell(`A${r}`).value = name;
      ws.getCell(`A${r}`).style = { font: { bold: true, size: 10 }, alignment: { horizontal: 'left', vertical: 'middle' } };
      ws.getCell(`B${r}`).value = desc;
      ws.getCell(`B${r}`).style = { font: { size: 10 }, alignment: { horizontal: 'left', vertical: 'middle' } };
      ws.mergeCells(`B${r}:E${r}`);
    });

    setColWidths(ws, { A: 22, B: 35, C: 25, D: 25, E: 25 });
  }

  // ─── SHEET 2: SITE INFORMATION ───────────────────────────────────────────────
  {
    const ws = workbook.addWorksheet('🏗️ Site Information', { properties: { tabColor: { argb: 'FF2E75B6' } } });
    ws.getRow(1).height = 45;
    ws.getCell('A1').value = 'SITE INFORMATION';
    ws.getCell('A1').style = { font: { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }, alignment: { horizontal: 'center', vertical: 'middle' } };
    ws.mergeCells('A1:D1');

    const fields = [
      ['Site Name', '', 'Site ID / Code', ''],
      ['Site Address', '', 'Region / Cluster', ''],
      ['Site Type', '', 'Tower Height (m)', ''],
      ['Site Owner', '', 'Tower Type', ''],
      ['GPS Latitude', '', 'GPS Longitude', ''],
      ['Site Access Point', '', 'Access Restrictions', ''],
      ['Verification Date', '', 'Verification Engineer', ''],
      ['Supervisor Name', '', 'Weather Conditions', ''],
      ['Power Supply (kVA)', '', 'Generator Available', ''],
      ['Site Status', '', 'Remarks / Notes', ''],
    ];

    fields.forEach(([label1, val1, label2, val2], i) => {
      const r = i + 3;
      ws.getRow(r).height = 28;
      ws.getCell(`A${r}`).value = label1;
      ws.getCell(`A${r}`).style = labelStyle();
      ws.getCell(`B${r}`).value = val1;
      ws.getCell(`B${r}`).style = dataStyle(i % 2 === 0);
      ws.getCell(`C${r}`).value = label2;
      ws.getCell(`C${r}`).style = labelStyle();
      ws.getCell(`D${r}`).value = val2;
      ws.getCell(`D${r}`).style = dataStyle(i % 2 === 0);
    });

    // Photo inventory section
    const photoStart = 14;
    ws.getRow(photoStart).height = 25;
    ws.getCell(`A${photoStart}`).value = 'PHOTO INVENTORY';
    ws.getCell(`A${photoStart}`).style = sectionStyle();
    ws.mergeCells(`A${photoStart}:D${photoStart}`);

    const photoHeaders = ['Photo ID', 'Filename', 'Asset Reference', 'Description'];
    ws.getRow(photoStart + 1).height = 25;
    photoHeaders.forEach((h, i) => {
      ws.getCell(col(i + 1) + (photoStart + 1)).value = h;
      ws.getCell(col(i + 1) + (photoStart + 1)).style = headerStyle();
    });

    for (let i = 0; i < 10; i++) {
      const r = photoStart + 2 + i;
      ws.getRow(r).height = 22;
      ws.getCell(`A${r}`).value = `PHOTO_${String(i + 1).padStart(3, '0')}`;
      ws.getCell(`A${r}`).style = dataStyle(i % 2 === 0);
      ws.getCell(`B${r}`).style = dataStyle(i % 2 === 0);
      ws.getCell(`C${r}`).style = dataStyle(i % 2 === 0);
      ws.getCell(`D${r}`).style = dataStyle(i % 2 === 0);
    }

    setColWidths(ws, { A: 28, B: 35, C: 28, D: 35 });
  }

  // ─── SHARED COLUMN DEFINITIONS ───────────────────────────────────────────────
  // All equipment sheets share these columns with some variations
  const baseCols = [
    { header: 'Row ID',        key: 'rowId',        width: 10,  note: 'Auto-assigned row number' },
    { header: 'Site ID',        key: 'siteId',       width: 18,  note: 'Site identifier from Site Info sheet' },
    { header: 'Device Type',    key: 'deviceType',   width: 22,  note: 'Category of equipment (dropdown in app)' },
    { header: 'Equipment Brand', key: 'brand',       width: 20,  note: 'Manufacturer name (e.g. Huawei, Nokia, Ericsson)' },
    { header: 'Model No.',      key: 'model',        width: 22,  note: 'Model number as on equipment label' },
    { header: 'Serial Number',   key: 'serialNo',    width: 22,  note: 'S/N from equipment label — critical for warranty' },
    { header: 'Hardware Rev',   key: 'hwRev',       width: 14,  note: 'Hardware revision (if printed on label)' },
    { header: 'Firmware Ver',    key: 'fwVer',        width: 14,  note: 'Firmware/software version running' },
    { header: 'Installation Location', key: 'location', width: 20, note: 'On Tower / On Ground / Rooftop / Shelter / Cabinet' },
    { header: 'Tower Leg / Position', key: 'towerPos', width: 18, note: 'Leg identifier (A/B/C/D) or shelter bay number' },
    { header: 'Sector / Zone',  key: 'sector',       width: 14,  note: 'Sector (Alpha/Beta/Gamma) or zone identifier' },
    { header: 'Rack / Shelf No', key: 'rackShelf',   width: 14,  note: 'Rack number and shelf position' },
    { header: 'Active?',        key: 'active',       width: 12,  note: 'Active / Inactive / Standby' },
    { header: 'Power Draw (W)', key: 'powerW',       width: 14,  note: 'Rated power consumption in Watts' },
    { header: 'Input Voltage',  key: 'voltage',      width: 14,  note: 'Operating voltage (e.g. -48V DC, 220V AC)' },
    { header: 'Port Count',     key: 'portCount',    width: 12,  note: 'Number of RF ports, ETH ports, etc.' },
    { header: 'Connection To',  key: 'connectedTo',  width: 20,  note: 'Upstream equipment this device connects to' },
    { header: 'Asset Tag',      key: 'assetTag',     width: 18,  note: 'Operator-assigned asset/inventory tag number' },
    { header: 'Date Installed', key: 'dateInstalled', width: 16, note: 'Installation date (DD-MMM-YYYY)' },
    { header: 'Photo ID(s)',    key: 'photoIds',     width: 18,  note: 'Photo ID(s) for this asset (e.g. PHOTO_001, PHOTO_002)' },
    { header: 'Remarks',        key: 'remarks',      width: 30,  note: 'Additional observations, faults, or notes' },
    { header: 'Verified By',    key: 'verifiedBy',    width: 18,  note: 'Name of field engineer who verified' },
    { header: 'Verification Date', key: 'verifyDate', width: 16, note: 'Date of verification' },
  ];

  // Antenna-specific columns (inserted after base columns)
  const antennaCols = [
    { header: 'Antenna Height (m)', key: 'antHeight', width: 18, note: 'Centerline height from ground in metres' },
    { header: 'MDT (m)',            key: 'mdt',       width: 14, note: 'Mechanical Downtilt in degrees' },
    { header: 'EDT (m)',            key: 'edt',       width: 14, note: 'Electrical Downtilt in degrees' },
    { header: 'Total Downtilt',     key: 'totalDt',    width: 14, note: 'MDT + EDT combined' },
    { header: 'Azimuth (°)',         key: 'azimuth',   width: 14, note: 'Compass bearing in degrees (0-360)' },
    { header: 'Beamwidth (°)',       key: 'beamwidth',  width: 14, note: 'Horizontal beamwidth in degrees' },
    { header: 'Gain (dBi)',          key: 'gain',       width: 12, note: 'Antenna gain in dBi' },
    { header: 'Frequency Band',      key: 'freqBand',   width: 16, note: 'e.g. 900MHz, 1800MHz, 2100MHz, 2600MHz' },
    { header: 'Dimensions H×W×L (mm)', key: 'dims',    width: 22, note: 'Height × Width × Length in millimetres' },
    { header: 'Polarization',       key: 'polarization', width: 16, note: '+45°/-45° or V/H dual-polarization' },
    { header: 'Feeder Type',        key: 'feederType', width: 16, note: 'e.g. 1/2" coax, 7/8" coax, fiber' },
    { header: 'Feeder Length (m)',   key: 'feederLen',  width: 14, note: 'Feeder cable length in metres' },
    { header: 'Combiner / Splitter', key: 'combiner', width: 18, note: 'Combiner/splitter model if present' },
    { header: 'RET Configured?',    key: 'retConfigured', width: 14, note: 'Remote Electrical Tilt — Yes/No/NA' },
    { header: 'Tower Leg Installed', key: 'towerLeg',   width: 16, note: 'A / B / C / D or Leg 1/2/3/4' },
  ];

  // ─── HELPER: create equipment sheet ─────────────────────────────────────────
  function createEquipmentSheet(sheetName, tabColor, extraCols = []) {
    const ws = workbook.addWorksheet(sheetName, { properties: { tabColor: { argb: tabColor } } });
    ws.getRow(1).height = 40;
    ws.getCell('A1').value = sheetName.replace(/[🏗️📋🔵🔷🟡]/g, '').trim().toUpperCase() + ' — ASSET CAPTURE';
    ws.getCell('A1').style = { font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }, alignment: { horizontal: 'center', vertical: 'middle' } };

    const allCols = [...baseCols, ...extraCols];
    const totalCols = allCols.length;

    ws.mergeCells(`A1:${col(totalCols)}1`);

    // Header row
    ws.getRow(2).height = 45;
    allCols.forEach((c, i) => {
      const cell = ws.getCell(`${col(i + 1)}2`);
      cell.value = c.header;
      cell.style = headerStyle();
      cell.note = c.note;
    });

    // Data rows (25 blank rows)
    for (let r = 0; r < 25; r++) {
      ws.getRow(r + 3).height = 22;
      allCols.forEach((c, i) => {
        const cell = ws.getCell(`${col(i + 1)}${r + 3}`);
        cell.style = dataStyle(r % 2 === 0);
        if (c.key === 'active') {
          cell.dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['"Active,Inactive,Standby,Unknown"'],
          };
        }
        if (c.key === 'location') {
          cell.dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['"On Tower,On Ground,Rooftop,Shelter,Cabinet,Indoor,Outdoor"'],
          };
        }
        if (c.key === 'towerLeg') {
          cell.dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['"A,B,C,D,Leg 1,Leg 2,Leg 3,Leg 4,N/A"'],
          };
        }
        if (c.key === 'sector') {
          cell.dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['"Alpha,Beta,Gamma,All,Sector 1,Sector 2,Sector 3,N/A"'],
          };
        }
      });
    }

    // Column widths
    allCols.forEach((c, i) => {
      ws.getColumn(col(i + 1)).width = c.width;
    });

    // Freeze panes at row 3 (keep headers visible)
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2, activeCell: 'A3' }];

    return ws;
  }

  // ─── SHEETS: Equipment Categories ───────────────────────────────────────────
  createEquipmentSheet('📡 GSM Antennas',        'FF70AD47', antennaCols);
  createEquipmentSheet('🔊 RRUs (Radio Units)',  'FFED7D31');
  createEquipmentSheet('🖥️ BTS Cabinets',         'FF5B9BD5');
  createEquipmentSheet('📦 BBUs (Baseband Units)', 'FF4472C4');
  createEquipmentSheet('🔌 DCPDs',               'FFA9D18E');
  createEquipmentSheet('🌐 IPRAN Equipment',     'FF70AD47');
  createEquipmentSheet('📡 Microwave IDUs',       'FFFFC000');
  createEquipmentSheet('📡 Microwave ODUs',      'FFE26B0A');
  createEquipmentSheet('💡 DWDM Equipment',      'FF7030A0');
  createEquipmentSheet('🔀 ODFs (Optical Dist.)', 'FF2E75B6');
  createEquipmentSheet('⚙️ Other Equipment',      'FF808080');

  // ─── SHEET: Summary Dashboard ────────────────────────────────────────────────
  {
    const ws = workbook.addWorksheet('📊 Summary', { properties: { tabColor: { argb: 'FF1F4E79' } } });
    ws.getRow(1).height = 45;
    ws.getCell('A1').value = 'ASSET VERIFICATION SUMMARY';
    ws.getCell('A1').style = { font: { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }, alignment: { horizontal: 'center', vertical: 'middle' } };
    ws.mergeCells('A1:D1');

    const summaryRows = [
      ['Total GSM Antennas', '=COUNTA(\'📡 GSM Antennas\'!C3:C27)'],
      ['Total RRUs', '=COUNTA(\'🔊 RRUs (Radio Units)\'!C3:C27)'],
      ['Total BTS Cabinets', '=COUNTA(\'🖥️ BTS Cabinets\'!C3:C27)'],
      ['Total BBUs', '=COUNTA(\'📦 BBUs (Baseband Units)\'!C3:C27)'],
      ['Total DCPDs', '=COUNTA(\'🔌 DCPDs\'!C3:C27)'],
      ['Total IPRAN Equipment', '=COUNTA(\'🌐 IPRAN Equipment\'!C3:C27)'],
      ['Total Microwave IDUs', '=COUNTA(\'📡 Microwave IDUs\'!C3:C27)'],
      ['Total Microwave ODUs', '=COUNTA(\'📡 Microwave ODUs\'!C3:C27)'],
      ['Total DWDM Equipment', '=COUNTA(\'💡 DWDM Equipment\'!C3:C27)'],
      ['Total ODFs', '=COUNTA(\'🔀 ODFs (Optical Dist.)\'!C3:C27)'],
      ['Total Other Equipment', '=COUNTA(\'⚙️ Other Equipment\'!C3:C27)'],
      ['', ''],
      ['Grand Total Assets', '=SUM(A3:A13)'],
    ];

    summaryRows.forEach(([label, formula], i) => {
      const r = i + 3;
      ws.getRow(r).height = 24;
      ws.getCell(`A${r}`).value = label;
      ws.getCell(`A${r}`).style = labelStyle();
      ws.getCell(`B${r}`).value = formula;
      ws.getCell(`B${r}`).style = dataStyle(i % 2 === 0);
    });

    setColWidths(ws, { A: 30, B: 20, C: 25, D: 25 });
  }

  // ─── SAVE ────────────────────────────────────────────────────────────────────
  const outPath = path.join(__dirname, '..', '..', 'template', 'BTS_Asset_Capture_Template.xlsx');
  await workbook.xlsx.writeFile(outPath);
  console.log(`✅ Template saved: ${outPath}`);
}

generateTemplate().catch(console.error);
