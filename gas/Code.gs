/**
 * Butler Coffee — Google Apps Script Backend
 * Spreadsheet: https://docs.google.com/spreadsheets/d/1nT5v6u7pz8qv1cloSDT7GpDDfodXk1LID8rMeRkzIeY
 *
 * DEPLOY:
 *  1. Open Extensions → Apps Script in the spreadsheet
 *  2. Paste this entire file, replacing any existing code
 *  3. Deploy → Manage Deployments → Edit (pencil icon on your existing deployment)
 *     - Create a new version, click Deploy — the URL stays the same
 *  4. (First-time only) Set VITE_BUTLER_COFFEE_API_URL in Netlify env vars
 *
 * ROUTING:
 *  GET  /exec                  → Coffee sheet
 *  GET  /exec?sheet=subs       → Subscription sheet
 *  GET  /exec?sheet=machines   → Machines sheet
 *  GET  /exec?sheet=blog       → Blog sheet
 *  POST /exec                  → Coffee   (body.sheet undefined)
 *  POST /exec                  → Subs     (body.sheet === 'subs')
 *  POST /exec                  → Machines (body.sheet === 'machines')
 *  POST /exec                  → Blog     (body.sheet === 'blog')
 */

const SS_ID    = '1nT5v6u7pz8qv1cloSDT7GpDDfodXk1LID8rMeRkzIeY';
const SHEET_NAME = 'Coffee';

// ─── Column indices (0-based) in the Coffee sheet ────────────────────────────
const C = {
  ID:           0,
  PROVIDER:     1,
  PROV_NAME:    2,
  PROV_LEVEL:   3,
  PROV_LINK:    4,
  NAME:         5,   // Butler Name
  SUBTITLE:     6,
  DESCRIPTION:  7,
  LEVEL:        8,   // Subscription Level
  PARALLEL:     9,
  NOTES:        10,
  RECOMMENDED:  11,  // Recommended for
  REGION:       12,
  FARM:         13,
  FARMER:       14,
  ORIGIN:       15,
  ALTITUDE:     16,
  VARIETY:      17,
  PROCESS:      18,
  ROAST:        19,
  ROASTED_BY:   20,
  ROASTERS:     21,
  BAG_SIZE:     22,
  SLUG:         23,
  URL:          24,
  // 25–27: costs (read + written by this script)
  COST_1KG:     25,
  COST_500G:    26,
  COST_250G:    27,
  SALE_1KG:     31,
  SALE_500G:    32,
  SALE_250G:    33,
  // 28–30: multipliers; 34–39: $ and % margin formulas (formula cells — never overwritten)
  IMG_DRIVE_ID: 40,
  DRIVE_URL:    41,
  DRIVE_ALT:    42,
  VISIBLE:      43,
  BASE:         44,
  EXPLORER:     45,
  ALPINE:       46,
  SUMMIT:       47,
  GRIND:        48,
  ROAST_DATE:   49,
  SUBTITLE_ES:    50,  // column AY — "Subtitle ES"
  DESCRIPTION_ES: 51   // column AZ — "Description ES"
};

const TOTAL_COLS = 52; // columns A–AZ

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Pad a row array to the required length */
function ensureRowLength(row, len) {
  if (!Array.isArray(row)) row = [];          // guard against GAS spread quirks
  while (row.length < len) row.push('');
  return row;
}

/** Safe row copy — GAS-compatible alternative to the spread operator */
function copyRow(row) {
  return Array.isArray(row) ? row.slice() : [];
}

/** Strip currency symbols / spaces and return a plain numeric string, or '' */
function parseMoney(val) {
  if (val === '' || val === null || val === undefined) return '';
  // If it's already a number (e.g. from a formula cell), just return it
  if (typeof val === 'number') return String(val);
  // Strip currency symbols and spaces first
  let s = String(val).replace(/[€$£\s]/g, '').trim();
  if (s === '') return '';
  // Detect European decimal format: "12,50" or "1.234,50"
  // (ends with comma + 1–2 digits, and dots are thousands separators)
  if (/^[\d.]*,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // Assume US format: commas are thousands separators
    s = s.replace(/,/g, '');
  }
  return isNaN(Number(s)) ? '' : s;
}

/**
 * DIAGNOSTIC — run this once in the Apps Script editor to check column mapping.
 * Open Extensions → Apps Script → select debugColumns → Run → Execution log.
 * This prints:
 *   1. Every header and its 0-based index, so you can see where your columns actually are.
 *   2. The pricing + ES values for the first real data row.
 */
function debugColumns() {
  const sheet   = getSheet();
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];

  Logger.log('=== HEADERS (0-based index → name) ===');
  headers.forEach(function(h, i) {
    if (String(h).trim()) Logger.log('  col ' + i + ' → "' + h + '"');
  });

  // Find first real data row
  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    if (!String(row[C.NAME]).trim()) continue;
    Logger.log('=== FIRST DATA ROW: ' + row[C.NAME] + ' ===');
    // Pricing
    Logger.log('COST_1KG  (expect col 25): col25=' + row[25] + ' | col26=' + row[26] + ' | col27=' + row[27]);
    Logger.log('SALE_1KG  (expect col 31): col31=' + row[31] + ' | col32=' + row[32] + ' | col33=' + row[33]);
    Logger.log('parseMoney → cost1kg=' + parseMoney(row[25]) + '  sale1kg=' + parseMoney(row[31]));
    // Spanish
    Logger.log('SUBTITLE_ES (expect col 53): "' + row[53] + '"');
    Logger.log('DESCRIPTION_ES (expect col 54): "' + row[54] + '"');
    break;
  }
}

// Keep the old name as an alias so existing references still work
function debugPricing() { debugColumns(); }

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Convert a sheet row array → app-friendly object */
function rowToApp(row) {
  const bagRaw = String(row[C.BAG_SIZE] || '');
  const bagSizes = bagRaw
    ? bagRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  return {
    id:          String(row[C.ID]),
    name:        String(row[C.NAME]        || ''),
    subtitle:    String(row[C.SUBTITLE]    || ''),
    slug:        String(row[C.SLUG]        || ''),
    description: String(row[C.DESCRIPTION] || ''),
    notes:       String(row[C.NOTES]       || ''),
    recommended: String(row[C.RECOMMENDED] || ''),
    origin:      String(row[C.ORIGIN]      || ''),
    region:      String(row[C.REGION]      || ''),
    farm:        String(row[C.FARM]        || ''),
    farmer:      String(row[C.FARMER]      || ''),
    altitude:    String(row[C.ALTITUDE]    || ''),
    variety:     String(row[C.VARIETY]     || ''),
    process:     String(row[C.PROCESS]     || ''),
    roast:       String(row[C.ROAST]       || ''),
    roaster:     String(row[C.ROASTED_BY]  || ''),
    level:       String(row[C.LEVEL]       || ''),
    bagSizes:    bagSizes,
    image:       String(row[C.DRIVE_URL]   || ''),
    cost1kg:     parseMoney(row[C.COST_1KG]),
    cost500g:    parseMoney(row[C.COST_500G]),
    cost250g:    parseMoney(row[C.COST_250G]),
    sale1kg:     parseMoney(row[C.SALE_1KG]),
    sale500g:      parseMoney(row[C.SALE_500G]),
    sale250g:      parseMoney(row[C.SALE_250G]),
    subtitle_es:    String(row[C.SUBTITLE_ES]    || ''),
    description_es: String(row[C.DESCRIPTION_ES] || ''),
    visible: (row[C.VISIBLE] === true
           || String(row[C.VISIBLE]).toUpperCase() === 'TRUE'
           || String(row[C.VISIBLE]).toUpperCase() === 'YES'),
    updatedAt:      new Date().toISOString()
  };
}

/** Write app-object fields back into a row array (preserves untouched columns) */
function applyToRow(row, coffee) {
  const bagStr = Array.isArray(coffee.bagSizes)
    ? coffee.bagSizes.join(', ')
    : String(coffee.bagSizes || '');

  row[C.NAME]        = coffee.name        || '';
  row[C.SUBTITLE]    = coffee.subtitle    || '';
  row[C.DESCRIPTION] = coffee.description || '';
  row[C.LEVEL]       = coffee.level       || '';
  row[C.NOTES]       = coffee.notes       || '';
  row[C.RECOMMENDED] = coffee.recommended || '';
  row[C.REGION]      = coffee.region      || '';
  row[C.FARM]        = coffee.farm        || '';
  row[C.FARMER]      = coffee.farmer      || '';
  row[C.ORIGIN]      = coffee.origin      || '';
  row[C.ALTITUDE]    = coffee.altitude    || '';
  row[C.VARIETY]     = coffee.variety     || '';
  row[C.PROCESS]     = coffee.process     || '';
  row[C.ROAST]       = coffee.roast       || '';
  row[C.ROASTED_BY]  = coffee.roaster     || '';
  row[C.BAG_SIZE]    = bagStr;
  row[C.SLUG]        = coffee.slug        || '';
  row[C.DRIVE_URL]   = coffee.image       || '';
  // Pricing — store as plain numbers (sheet formulas for margins will recalculate)
  if (coffee.cost1kg  !== undefined) row[C.COST_1KG]  = coffee.cost1kg  === '' ? '' : Number(coffee.cost1kg)  || '';
  if (coffee.cost500g !== undefined) row[C.COST_500G]  = coffee.cost500g === '' ? '' : Number(coffee.cost500g) || '';
  if (coffee.cost250g !== undefined) row[C.COST_250G]  = coffee.cost250g === '' ? '' : Number(coffee.cost250g) || '';
  if (coffee.sale1kg  !== undefined) row[C.SALE_1KG]   = coffee.sale1kg  === '' ? '' : Number(coffee.sale1kg)  || '';
  if (coffee.sale500g     !== undefined) row[C.SALE_500G]      = coffee.sale500g     === '' ? '' : Number(coffee.sale500g)     || '';
  if (coffee.sale250g     !== undefined) row[C.SALE_250G]      = coffee.sale250g     === '' ? '' : Number(coffee.sale250g)     || '';
  if (coffee.subtitle_es    !== undefined) row[C.SUBTITLE_ES]    = coffee.subtitle_es    || '';
  if (coffee.description_es !== undefined) row[C.DESCRIPTION_ES] = coffee.description_es || '';
  if (coffee.visible        !== undefined) row[C.VISIBLE]        = coffee.visible === true || coffee.visible === 'true';
  return row;
}

function getSheet() {
  return SpreadsheetApp.openById(SS_ID).getSheetByName(SHEET_NAME);
}

// ─── doGet — read all coffees OR subscriptions ───────────────────────────────

function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.sheet === 'subs')     return doGetSubs();
    if (e && e.parameter && e.parameter.sheet === 'machines') return doGetMachines();
    if (e && e.parameter && e.parameter.sheet === 'blog')     return doGetBlog();
    const sheet = getSheet();
    const data  = sheet.getDataRange().getValues();
    const coffees = [];

    // Row 0 = header row, Row 1 = template row (ID=0) → start at row index 2
    for (let i = 2; i < data.length; i++) {
      const row = data[i];
      const id  = String(row[C.ID]).trim();
      const name = String(row[C.NAME]).trim();
      // Skip fully empty rows
      if (id === '' && name === '') continue;
      coffees.push(rowToApp(row));
    }

    return jsonOut({ ok: true, data: coffees });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// ─── doPost — save / delete / import ─────────────────────────────────────────

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // Route to Subscription handlers
    if (body.sheet === 'subs') {
      if (body.action === 'save')        return handleSaveSub(body.subscription);
      if (body.action === 'delete')      return handleDeleteSub(body.id);
      if (body.action === 'import')      return handleImportSubs(body.subscriptions);
      if (body.action === 'uploadImage') return handleUploadImage(body.filename, body.mimeType, body.data, 'Butler Subscription Images');
      return jsonOut({ ok: false, error: 'Unknown subs action: ' + body.action });
    }

    // Route to Machines handlers
    if (body.sheet === 'machines') {
      if (body.action === 'save')   return handleSaveMachine(body.machine);
      if (body.action === 'delete') return handleDeleteMachine(body.id);
      if (body.action === 'import') return handleImportMachines(body.machines);
      return jsonOut({ ok: false, error: 'Unknown machines action: ' + body.action });
    }

    // Route to Blog handlers
    if (body.sheet === 'blog') {
      if (body.action === 'save')      return handleSaveBlogPost(body.post);
      if (body.action === 'delete')    return handleDeleteBlogPost(body.id);
      if (body.action === 'translate') return doTranslateBlog(body);
      return jsonOut({ ok: false, error: 'Unknown blog action: ' + body.action });
    }

    // Coffee handlers (default)
    if (body.action === 'save')        return handleSave(body.coffee);
    if (body.action === 'delete')      return handleDelete(body.id);
    if (body.action === 'import')      return handleImport(body.coffees);
    if (body.action === 'uploadImage') return handleUploadImage(body.filename, body.mimeType, body.data);

    return jsonOut({ ok: false, error: 'Unknown action: ' + body.action });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// ─── Save (create or update) ──────────────────────────────────────────────────

function handleSave(coffee) {
  const sheet = getSheet();
  const data  = sheet.getDataRange().getValues();

  // Try to find an existing row whose sheet ID matches coffee.id
  for (let i = 2; i < data.length; i++) {
    if (String(data[i][C.ID]) === String(coffee.id)) {
      // Update in place — only overwrite app-managed columns
      const sheetRow = i + 1; // 1-based for Range
      const updatedRow = applyToRow(ensureRowLength(copyRow(data[i]), TOTAL_COLS), coffee);
      sheet.getRange(sheetRow, 1, 1, TOTAL_COLS).setValues([updatedRow]);
      return jsonOut({ ok: true, data: rowToApp(updatedRow) });
    }
  }

  // No match → new row; assign the next numeric ID
  let maxId = 0;
  for (let i = 1; i < data.length; i++) {
    const id = parseInt(data[i][C.ID], 10);
    if (!isNaN(id) && id > maxId) maxId = id;
  }
  const newId = maxId + 1;

  const newRow = new Array(TOTAL_COLS).fill('');
  newRow[C.ID] = newId;
  applyToRow(newRow, coffee);

  sheet.appendRow(newRow);
  return jsonOut({ ok: true, data: rowToApp(newRow) });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

function handleDelete(id) {
  const sheet = getSheet();
  const data  = sheet.getDataRange().getValues();

  for (let i = 2; i < data.length; i++) {
    if (String(data[i][C.ID]) === String(id)) {
      sheet.deleteRow(i + 1); // 1-based
      return jsonOut({ ok: true, data: { deleted: id } });
    }
  }
  return jsonOut({ ok: false, error: 'Row not found for id: ' + id });
}

// ─── Image Upload to Drive ────────────────────────────────────────────────────

/**
 * Upload a base64-encoded image to a Drive folder.
 * @param {string} filename
 * @param {string} mimeType
 * @param {string} base64data
 * @param {string} [folderName] — defaults to 'Butler Coffee Images'
 */
function handleUploadImage(filename, mimeType, base64data, folderName) {
  try {
    const bytes  = Utilities.base64Decode(base64data);
    const blob   = Utilities.newBlob(bytes, mimeType, filename || 'butler-image');
    const name   = folderName || 'Butler Coffee Images';

    // Find or create the target folder
    const it     = DriveApp.getFoldersByName(name);
    const folder = it.hasNext() ? it.next() : DriveApp.createFolder(name);

    const file   = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileId = file.getId();
    const url    = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w400';
    return jsonOut({ ok: true, data: { url: url, fileId: fileId } });
  } catch (err) {
    return jsonOut({ ok: false, error: 'Image upload failed: ' + err.message });
  }
}

// ─── Import (bulk replace) ────────────────────────────────────────────────────

function handleImport(coffees) {
  if (!Array.isArray(coffees) || coffees.length === 0) {
    return jsonOut({ ok: false, error: 'No coffees provided for import' });
  }

  const sheet   = getSheet();
  const lastRow = sheet.getLastRow();

  // Delete all rows after the template row (keep row 1=header, row 2=template)
  if (lastRow > 2) {
    sheet.deleteRows(3, lastRow - 2);
  }

  // Append each imported coffee as a new row
  const rows = coffees.map((coffee, i) => {
    const newRow = new Array(TOTAL_COLS).fill('');
    newRow[C.ID] = i + 1;
    applyToRow(newRow, coffee);
    return newRow;
  });

  if (rows.length > 0) {
    sheet.getRange(3, 1, rows.length, TOTAL_COLS).setValues(rows);
  }

  return jsonOut({ ok: true, data: coffees });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── SUBSCRIPTION SHEET ───────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const SHEET_NAME_SUBS = 'Subscription'; // exact tab name (note: typo is intentional — matches the sheet)

// Column indices (0-based) — match the row-1 headers in your Subscription sheet exactly.
// Columns A–AJ (0–35) are your defined headers; AK (36) = "image" (add to sheet).
const SC = {
  ID:             0,
  TITLE:          1,
  EYEBROW_EN:     2,
  SHORT_DESC_EN:  3,   // sheet header: shortDescEn
  LONG_DESC_EN:   4,
  FEAT01_EN:      5,
  FEAT02_EN:      6,
  FEAT03_EN:      7,
  FEAT04_EN:      8,
  COMPOSITION_EN: 9,
  FLAVOR_EN:      10,
  STRUCTURE_EN:   11,
  PURPOSE_EN:     12,
  EYEBROW_ES:     13,
  SHORT_DESC_ES:  14,
  LONG_DESC_ES:   15,
  FEAT01_ES:      16,
  FEAT02_ES:      17,
  FEAT03_ES:      18,
  FEAT04_ES:      19,
  COMPOSITION_ES: 20,
  FLAVOR_ES:      21,
  STRUCTURE_ES:   22,
  PURPOSE_ES:     23,
  COST_200G:      24,  // 200gCost
  COST_250G:      25,  // 250gCost
  COST_500G:      26,  // 500gCost
  COST_1KG:       27,  // 1kgCost
  PRICE_200G:     28,  // 200gPrice
  PRICE_250G:     29,  // 250gPrice
  PRICE_500G:     30,  // 500gPrice
  PRICE_1KG:      31,  // 1kgPrice
  LINK_200G:      32,  // 200gLink
  LINK_250G:      33,  // 250gLink
  LINK_500G:      34,  // 500gLink
  LINK_1KG:       35,  // 1kgLink
  IMAGE:          36   // add header "image" (column AK) to your sheet
};

const TOTAL_COLS_SUBS = 37;

function getSheetSubs() {
  return SpreadsheetApp.openById(SS_ID).getSheetByName(SHEET_NAME_SUBS);
}

function rowToAppSub(row) {
  return {
    id:            String(row[SC.ID]             || ''),
    title:         String(row[SC.TITLE]          || ''),
    eyebrowEN:     String(row[SC.EYEBROW_EN]     || ''),
    shortDescEN:   String(row[SC.SHORT_DESC_EN]  || ''),
    longDescEN:    String(row[SC.LONG_DESC_EN]   || ''),
    feat01EN:      String(row[SC.FEAT01_EN]      || ''),
    feat02EN:      String(row[SC.FEAT02_EN]      || ''),
    feat03EN:      String(row[SC.FEAT03_EN]      || ''),
    feat04EN:      String(row[SC.FEAT04_EN]      || ''),
    compositionEN: String(row[SC.COMPOSITION_EN] || ''),
    flavorEN:      String(row[SC.FLAVOR_EN]      || ''),
    structureEN:   String(row[SC.STRUCTURE_EN]   || ''),
    purposeEN:     String(row[SC.PURPOSE_EN]     || ''),
    eyebrowES:     String(row[SC.EYEBROW_ES]     || ''),
    shortDescES:   String(row[SC.SHORT_DESC_ES]  || ''),
    longDescES:    String(row[SC.LONG_DESC_ES]   || ''),
    feat01ES:      String(row[SC.FEAT01_ES]      || ''),
    feat02ES:      String(row[SC.FEAT02_ES]      || ''),
    feat03ES:      String(row[SC.FEAT03_ES]      || ''),
    feat04ES:      String(row[SC.FEAT04_ES]      || ''),
    compositionES: String(row[SC.COMPOSITION_ES] || ''),
    flavorES:      String(row[SC.FLAVOR_ES]      || ''),
    structureES:   String(row[SC.STRUCTURE_ES]   || ''),
    purposeES:     String(row[SC.PURPOSE_ES]     || ''),
    cost200g:      parseMoney(row[SC.COST_200G]),
    cost250g:      parseMoney(row[SC.COST_250G]),
    cost500g:      parseMoney(row[SC.COST_500G]),
    cost1kg:       parseMoney(row[SC.COST_1KG]),
    price200g:     parseMoney(row[SC.PRICE_200G]),
    price250g:     parseMoney(row[SC.PRICE_250G]),
    price500g:     parseMoney(row[SC.PRICE_500G]),
    price1kg:      parseMoney(row[SC.PRICE_1KG]),
    link200g:      String(row[SC.LINK_200G]      || ''),
    link250g:      String(row[SC.LINK_250G]      || ''),
    link500g:      String(row[SC.LINK_500G]      || ''),
    link1kg:       String(row[SC.LINK_1KG]       || ''),
    image:         String(row[SC.IMAGE]          || ''),
    updatedAt:     new Date().toISOString()
  };
}

function applyToRowSub(row, sub) {
  row[SC.TITLE]          = sub.title          || '';
  row[SC.EYEBROW_EN]     = sub.eyebrowEN      || '';
  row[SC.SHORT_DESC_EN]  = sub.shortDescEN    || '';
  row[SC.LONG_DESC_EN]   = sub.longDescEN     || '';
  row[SC.FEAT01_EN]      = sub.feat01EN       || '';
  row[SC.FEAT02_EN]      = sub.feat02EN       || '';
  row[SC.FEAT03_EN]      = sub.feat03EN       || '';
  row[SC.FEAT04_EN]      = sub.feat04EN       || '';
  row[SC.COMPOSITION_EN] = sub.compositionEN  || '';
  row[SC.FLAVOR_EN]      = sub.flavorEN       || '';
  row[SC.STRUCTURE_EN]   = sub.structureEN    || '';
  row[SC.PURPOSE_EN]     = sub.purposeEN      || '';
  row[SC.EYEBROW_ES]     = sub.eyebrowES      || '';
  row[SC.SHORT_DESC_ES]  = sub.shortDescES    || '';
  row[SC.LONG_DESC_ES]   = sub.longDescES     || '';
  row[SC.FEAT01_ES]      = sub.feat01ES       || '';
  row[SC.FEAT02_ES]      = sub.feat02ES       || '';
  row[SC.FEAT03_ES]      = sub.feat03ES       || '';
  row[SC.FEAT04_ES]      = sub.feat04ES       || '';
  row[SC.COMPOSITION_ES] = sub.compositionES  || '';
  row[SC.FLAVOR_ES]      = sub.flavorES       || '';
  row[SC.STRUCTURE_ES]   = sub.structureES    || '';
  row[SC.PURPOSE_ES]     = sub.purposeES      || '';
  function pm(v) { return v === undefined || v === '' ? '' : Number(v) || ''; }
  row[SC.COST_200G]  = pm(sub.cost200g);
  row[SC.COST_250G]  = pm(sub.cost250g);
  row[SC.COST_500G]  = pm(sub.cost500g);
  row[SC.COST_1KG]   = pm(sub.cost1kg);
  row[SC.PRICE_200G] = pm(sub.price200g);
  row[SC.PRICE_250G] = pm(sub.price250g);
  row[SC.PRICE_500G] = pm(sub.price500g);
  row[SC.PRICE_1KG]  = pm(sub.price1kg);
  row[SC.LINK_200G]  = sub.link200g  || '';
  row[SC.LINK_250G]  = sub.link250g  || '';
  row[SC.LINK_500G]  = sub.link500g  || '';
  row[SC.LINK_1KG]   = sub.link1kg   || '';
  row[SC.IMAGE]      = sub.image     || '';
  return row;
}

// ─── Subs doGet ───────────────────────────────────────────────────────────────

function doGetSubs() {
  const sheet = getSheetSubs();
  const data  = sheet.getDataRange().getValues();
  const subs  = [];

  // Row 0 = headers, Row 1 = template (ID=0) → start at index 2
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    if (String(row[SC.ID]).trim() === '' && String(row[SC.TITLE]).trim() === '') continue;
    subs.push(rowToAppSub(row));
  }
  return jsonOut({ ok: true, data: subs });
}

// ─── Subs Save ────────────────────────────────────────────────────────────────

function handleSaveSub(sub) {
  const sheet = getSheetSubs();
  const data  = sheet.getDataRange().getValues();

  for (let i = 2; i < data.length; i++) {
    if (String(data[i][SC.ID]) === String(sub.id)) {
      const sheetRow   = i + 1;
      const updatedRow = applyToRowSub(ensureRowLength(copyRow(data[i]), TOTAL_COLS_SUBS), sub);
      sheet.getRange(sheetRow, 1, 1, TOTAL_COLS_SUBS).setValues([updatedRow]);
      return jsonOut({ ok: true, data: rowToAppSub(updatedRow) });
    }
  }

  // New row
  let maxId = 0;
  for (let i = 1; i < data.length; i++) {
    const id = parseInt(data[i][SC.ID], 10);
    if (!isNaN(id) && id > maxId) maxId = id;
  }
  const newId = maxId + 1;
  const newRow = new Array(TOTAL_COLS_SUBS).fill('');
  newRow[SC.ID] = newId;
  applyToRowSub(newRow, sub);
  sheet.appendRow(newRow);
  return jsonOut({ ok: true, data: rowToAppSub(newRow) });
}

// ─── Subs Delete ──────────────────────────────────────────────────────────────

function handleDeleteSub(id) {
  const sheet = getSheetSubs();
  const data  = sheet.getDataRange().getValues();

  for (let i = 2; i < data.length; i++) {
    if (String(data[i][SC.ID]) === String(id)) {
      sheet.deleteRow(i + 1);
      return jsonOut({ ok: true, data: { deleted: id } });
    }
  }
  return jsonOut({ ok: false, error: 'Row not found for id: ' + id });
}

// ─── Subs Import (bulk replace) ───────────────────────────────────────────────

function handleImportSubs(subs) {
  if (!Array.isArray(subs) || subs.length === 0) {
    return jsonOut({ ok: false, error: 'No subscriptions provided for import' });
  }

  const sheet   = getSheetSubs();
  const lastRow = sheet.getLastRow();

  // Delete all data rows — keep row 1 (headers) and row 2 (template)
  if (lastRow > 2) {
    sheet.deleteRows(3, lastRow - 2);
  }

  const rows = subs.map(function(sub, i) {
    const newRow = new Array(TOTAL_COLS_SUBS).fill('');
    newRow[SC.ID] = i + 1;
    applyToRowSub(newRow, sub);
    return newRow;
  });

  if (rows.length > 0) {
    sheet.getRange(3, 1, rows.length, TOTAL_COLS_SUBS).setValues(rows);
  }

  return jsonOut({ ok: true, data: subs });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MACHINES SHEET ───────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const SHEET_NAME_MACHINES = 'Machines'; // exact tab name

// Column indices (0-based) — 36 existing + 6 image columns (AK–AP)
// IMPORTANT: MC.PROFIT (col 11) and MC.MARGIN (col 12) are formula cells — NEVER overwrite them.
const MC = {
  ID:           0,
  PROVIDER:     1,
  BRAND:        2,
  NAME:         3,
  MODEL:        4,
  CATEGORY:     5,
  VISIBLE:      6,
  FEATURED:     7,
  PVPR:         8,   // Recommended Retail Price
  COST:         9,
  SALE_PRICE:   10,
  PROFIT:       11,  // FORMULA — never overwrite
  MARGIN:       12,  // FORMULA — never overwrite
  VAT:          13,
  SUBTITLE_EN:  14,
  SHORT_DESC_EN: 15,
  LONG_DESC_EN: 16,
  FEAT01_EN:    17,
  FEAT02_EN:    18,
  FEAT03_EN:    19,
  FEAT04_EN:    20,
  FEAT05_EN:    21,
  FEAT06_EN:    22,
  JURA_COFFEES: 23,
  AREAS:        24,
  DAILY_OUTPUT: 25,
  STRIPE_LINK:  26,
  SUBTITLE_ES:  27,
  SHORT_DESC_ES: 28,
  LONG_DESC_ES: 29,
  FEAT01_ES:    30,
  FEAT02_ES:    31,
  FEAT03_ES:    32,
  FEAT04_ES:    33,
  FEAT05_ES:    34,
  FEAT06_ES:    35,
  IMAGE1:       36,  // Add headers Image1–Image6 (cols AK–AP) to your sheet
  IMAGE2:       37,
  IMAGE3:       38,
  IMAGE4:       39,
  IMAGE5:       40,
  IMAGE6:       41
};

const TOTAL_COLS_MACHINES = 42;

function getSheetMachines() {
  return SpreadsheetApp.openById(SS_ID).getSheetByName(SHEET_NAME_MACHINES);
}

function rowToAppMachine(row) {
  return {
    id:           String(row[MC.ID]           || ''),
    provider:     String(row[MC.PROVIDER]     || ''),
    brand:        String(row[MC.BRAND]        || ''),
    name:         String(row[MC.NAME]         || ''),
    model:        String(row[MC.MODEL]        || ''),
    category:     String(row[MC.CATEGORY]     || ''),
    visible:      (row[MC.VISIBLE] === true
                || String(row[MC.VISIBLE]).toUpperCase() === 'TRUE'
                || String(row[MC.VISIBLE]).toUpperCase() === 'YES'),
    featured:     (row[MC.FEATURED] === true
                || String(row[MC.FEATURED]).toUpperCase() === 'TRUE'
                || String(row[MC.FEATURED]).toUpperCase() === 'YES'),
    pvpr:         parseMoney(row[MC.PVPR]),
    cost:         parseMoney(row[MC.COST]),
    salePrice:    parseMoney(row[MC.SALE_PRICE]),
    profit:       parseMoney(row[MC.PROFIT]),   // read-only from formula
    margin:       parseMoney(row[MC.MARGIN]),   // read-only from formula
    vat:          parseMoney(row[MC.VAT]),
    subtitleEN:   String(row[MC.SUBTITLE_EN]   || ''),
    shortDescEN:  String(row[MC.SHORT_DESC_EN] || ''),
    longDescEN:   String(row[MC.LONG_DESC_EN]  || ''),
    feat01EN:     String(row[MC.FEAT01_EN]     || ''),
    feat02EN:     String(row[MC.FEAT02_EN]     || ''),
    feat03EN:     String(row[MC.FEAT03_EN]     || ''),
    feat04EN:     String(row[MC.FEAT04_EN]     || ''),
    feat05EN:     String(row[MC.FEAT05_EN]     || ''),
    feat06EN:     String(row[MC.FEAT06_EN]     || ''),
    juraCoffees:  String(row[MC.JURA_COFFEES]  || ''),
    areas:        String(row[MC.AREAS]         || ''),
    dailyOutput:  String(row[MC.DAILY_OUTPUT]  || ''),
    stripeLink:   String(row[MC.STRIPE_LINK]   || ''),
    subtitleES:   String(row[MC.SUBTITLE_ES]   || ''),
    shortDescES:  String(row[MC.SHORT_DESC_ES] || ''),
    longDescES:   String(row[MC.LONG_DESC_ES]  || ''),
    feat01ES:     String(row[MC.FEAT01_ES]     || ''),
    feat02ES:     String(row[MC.FEAT02_ES]     || ''),
    feat03ES:     String(row[MC.FEAT03_ES]     || ''),
    feat04ES:     String(row[MC.FEAT04_ES]     || ''),
    feat05ES:     String(row[MC.FEAT05_ES]     || ''),
    feat06ES:     String(row[MC.FEAT06_ES]     || ''),
    image1:       String(row[MC.IMAGE1]        || ''),
    image2:       String(row[MC.IMAGE2]        || ''),
    image3:       String(row[MC.IMAGE3]        || ''),
    image4:       String(row[MC.IMAGE4]        || ''),
    image5:       String(row[MC.IMAGE5]        || ''),
    image6:       String(row[MC.IMAGE6]        || ''),
    updatedAt:    new Date().toISOString()
  };
}

/** Write app-object back into a row array.
 *  Skips MC.PROFIT and MC.MARGIN — those are formula cells. */
function applyToRowMachine(row, m) {
  function pm(v) { return v === undefined || v === '' ? '' : Number(v) || ''; }

  row[MC.PROVIDER]      = m.provider     || '';
  row[MC.BRAND]         = m.brand        || '';
  row[MC.NAME]          = m.name         || '';
  row[MC.MODEL]         = m.model        || '';
  row[MC.CATEGORY]      = m.category     || '';
  row[MC.VISIBLE]       = m.visible  === true || m.visible  === 'true';
  row[MC.FEATURED]      = m.featured === true || m.featured === 'true';
  row[MC.PVPR]          = pm(m.pvpr);
  row[MC.COST]          = pm(m.cost);
  row[MC.SALE_PRICE]    = pm(m.salePrice);
  // MC.PROFIT and MC.MARGIN intentionally skipped (formula cells)
  row[MC.VAT]           = pm(m.vat);
  row[MC.SUBTITLE_EN]   = m.subtitleEN   || '';
  row[MC.SHORT_DESC_EN] = m.shortDescEN  || '';
  row[MC.LONG_DESC_EN]  = m.longDescEN   || '';
  row[MC.FEAT01_EN]     = m.feat01EN     || '';
  row[MC.FEAT02_EN]     = m.feat02EN     || '';
  row[MC.FEAT03_EN]     = m.feat03EN     || '';
  row[MC.FEAT04_EN]     = m.feat04EN     || '';
  row[MC.FEAT05_EN]     = m.feat05EN     || '';
  row[MC.FEAT06_EN]     = m.feat06EN     || '';
  row[MC.JURA_COFFEES]  = m.juraCoffees  || '';
  row[MC.AREAS]         = m.areas        || '';
  row[MC.DAILY_OUTPUT]  = m.dailyOutput  || '';
  row[MC.STRIPE_LINK]   = m.stripeLink   || '';
  row[MC.SUBTITLE_ES]   = m.subtitleES   || '';
  row[MC.SHORT_DESC_ES] = m.shortDescES  || '';
  row[MC.LONG_DESC_ES]  = m.longDescES   || '';
  row[MC.FEAT01_ES]     = m.feat01ES     || '';
  row[MC.FEAT02_ES]     = m.feat02ES     || '';
  row[MC.FEAT03_ES]     = m.feat03ES     || '';
  row[MC.FEAT04_ES]     = m.feat04ES     || '';
  row[MC.FEAT05_ES]     = m.feat05ES     || '';
  row[MC.FEAT06_ES]     = m.feat06ES     || '';
  row[MC.IMAGE1]        = m.image1       || '';
  row[MC.IMAGE2]        = m.image2       || '';
  row[MC.IMAGE3]        = m.image3       || '';
  row[MC.IMAGE4]        = m.image4       || '';
  row[MC.IMAGE5]        = m.image5       || '';
  row[MC.IMAGE6]        = m.image6       || '';
  return row;
}

// ─── Machines doGet ───────────────────────────────────────────────────────────

function doGetMachines() {
  const sheet    = getSheetMachines();
  const data     = sheet.getDataRange().getValues();
  const machines = [];

  // Row 0 = headers, Row 1 = template (ID=0) → start at index 2
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    if (String(row[MC.ID]).trim() === '' && String(row[MC.NAME]).trim() === '') continue;
    machines.push(rowToAppMachine(row));
  }
  return jsonOut({ ok: true, data: machines });
}

// ─── Machines Save ────────────────────────────────────────────────────────────

function handleSaveMachine(machine) {
  const sheet = getSheetMachines();
  const data  = sheet.getDataRange().getValues();

  for (let i = 2; i < data.length; i++) {
    if (String(data[i][MC.ID]) === String(machine.id)) {
      const sheetRow   = i + 1;
      const updatedRow = applyToRowMachine(ensureRowLength(copyRow(data[i]), TOTAL_COLS_MACHINES), machine);
      sheet.getRange(sheetRow, 1, 1, TOTAL_COLS_MACHINES).setValues([updatedRow]);
      return jsonOut({ ok: true, data: rowToAppMachine(updatedRow) });
    }
  }

  // New row — assign next numeric ID
  let maxId = 0;
  for (let i = 1; i < data.length; i++) {
    const id = parseInt(data[i][MC.ID], 10);
    if (!isNaN(id) && id > maxId) maxId = id;
  }
  const newId  = maxId + 1;
  const newRow = new Array(TOTAL_COLS_MACHINES).fill('');
  newRow[MC.ID] = newId;
  applyToRowMachine(newRow, machine);
  sheet.appendRow(newRow);
  return jsonOut({ ok: true, data: rowToAppMachine(newRow) });
}

// ─── Machines Delete ──────────────────────────────────────────────────────────

function handleDeleteMachine(id) {
  const sheet = getSheetMachines();
  const data  = sheet.getDataRange().getValues();

  for (let i = 2; i < data.length; i++) {
    if (String(data[i][MC.ID]) === String(id)) {
      sheet.deleteRow(i + 1);
      return jsonOut({ ok: true, data: { deleted: id } });
    }
  }
  return jsonOut({ ok: false, error: 'Row not found for id: ' + id });
}

// ─── Machines Import (bulk replace) ──────────────────────────────────────────

function handleImportMachines(machines) {
  if (!Array.isArray(machines) || machines.length === 0) {
    return jsonOut({ ok: false, error: 'No machines provided for import' });
  }

  const sheet   = getSheetMachines();
  const lastRow = sheet.getLastRow();

  // Delete all data rows — keep row 1 (headers) and row 2 (template)
  if (lastRow > 2) {
    sheet.deleteRows(3, lastRow - 2);
  }

  const rows = machines.map(function(machine, i) {
    const newRow = new Array(TOTAL_COLS_MACHINES).fill('');
    newRow[MC.ID] = i + 1;
    applyToRowMachine(newRow, machine);
    return newRow;
  });

  if (rows.length > 0) {
    sheet.getRange(3, 1, rows.length, TOTAL_COLS_MACHINES).setValues(rows);
  }

  return jsonOut({ ok: true, data: machines });
}

// ════════════════════════════════════════════════════════════════════════════
// ── BLOG ─────────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════
//
// Sheet "Blog" — row 1 is the header row. Structure:
//   A: id  |  B: title  |  C: slug  |  D: status  |  E: content  |  F: updatedAt
//
// status values: 'draft' | 'published'
// content: HTML (from WYSIWYG editor)
// Languages: English (primary), Spanish (translation)

const BLOG_SHEET_NAME = 'Blog';

// Column map — 17 columns total (A–Q)
const BL = {
  ID:         0,   // A  — internal ID
  COPY_TITLE: 1,   // B  — mirrors title_en (sheet display / user-managed formula)
  SLUG:       2,   // C  — URL slug
  STATUS:     3,   // D  — 'draft' | 'published'
  UPDATED_AT: 4,   // E  — ISO timestamp
  CATEGORY:   5,   // F  — category string
  TAGS:       6,   // G  — comma-separated tags
  AUTHOR:     7,   // H  — author name
  FEATURED:   8,   // I  — 'true' | 'false'
  IMAGE_URL:    9,   // J  — hero image URL
  IMAGE_ALT:    10,  // K  — image ALT text
  IMAGE_CREDIT: 11,  // L  — image credit / attribution
  TITLE_EN:     12,  // M  — English title (primary)
  EXCERPT_EN:   13,  // N  — English excerpt (plain text)
  CONTENT_EN:   14,  // O  — English HTML body
  TITLE_ES:     15,  // P  — Spanish title
  EXCERPT_ES:   16,  // Q  — Spanish excerpt (plain text)
  CONTENT_ES:   17,  // R  — Spanish HTML body
};
const TOTAL_COLS_BLOG = 18;

function getSheetBlog() {
  var ss    = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName(BLOG_SHEET_NAME);
  if (!sheet) throw new Error(
    'Blog sheet not found — add a sheet named "Blog" with 17 header columns (A–Q): ' +
    'ID | Copy of Title | Slug | Status | updatedAt | category | tags | author | featured | ImageURL | imageALT | title_en | excerpt_en | content_en | title_es | excerpt_es | content_es'
  );
  return sheet;
}

function rowToAppBlog(row) {
  return {
    id:         String(row[BL.ID]         || ''),
    slug:       String(row[BL.SLUG]       || ''),
    status:     String(row[BL.STATUS]     || 'draft'),
    updatedAt:  String(row[BL.UPDATED_AT] || ''),
    category:   String(row[BL.CATEGORY]   || ''),
    tags:       String(row[BL.TAGS]       || ''),
    author:     String(row[BL.AUTHOR]     || ''),
    featured:   row[BL.FEATURED] === true || String(row[BL.FEATURED]) === 'true',
    imageUrl:   String(row[BL.IMAGE_URL]  || ''),
    imageAlt:   String(row[BL.IMAGE_ALT]  || ''),
    title_en:   String(row[BL.TITLE_EN]   || ''),
    excerpt_en: String(row[BL.EXCERPT_EN] || ''),
    content_en: String(row[BL.CONTENT_EN] || ''),
    title_es:     String(row[BL.TITLE_ES]     || ''),
    excerpt_es:   String(row[BL.EXCERPT_ES]   || ''),
    content_es:   String(row[BL.CONTENT_ES]   || ''),
    imageCredit:  String(row[BL.IMAGE_CREDIT] || ''),
  };
}

function applyToRowBlog(row, post) {
  if (post.id         !== undefined) row[BL.ID]         = post.id;
  if (post.title_en   !== undefined) row[BL.COPY_TITLE] = post.title_en; // mirror for sheet readability
  if (post.slug       !== undefined) row[BL.SLUG]       = post.slug;
  if (post.status     !== undefined) row[BL.STATUS]     = post.status;
  if (post.updatedAt  !== undefined) row[BL.UPDATED_AT] = post.updatedAt;
  if (post.category   !== undefined) row[BL.CATEGORY]   = post.category;
  if (post.tags       !== undefined) row[BL.TAGS]       = post.tags;
  if (post.author     !== undefined) row[BL.AUTHOR]     = post.author;
  if (post.featured   !== undefined) row[BL.FEATURED]   = String(post.featured);
  if (post.imageUrl   !== undefined) row[BL.IMAGE_URL]  = post.imageUrl;
  if (post.imageAlt   !== undefined) row[BL.IMAGE_ALT]  = post.imageAlt;
  if (post.title_en   !== undefined) row[BL.TITLE_EN]   = post.title_en;
  if (post.excerpt_en !== undefined) row[BL.EXCERPT_EN] = post.excerpt_en;
  if (post.content_en !== undefined) row[BL.CONTENT_EN] = post.content_en;
  if (post.title_es     !== undefined) row[BL.TITLE_ES]     = post.title_es;
  if (post.excerpt_es   !== undefined) row[BL.EXCERPT_ES]   = post.excerpt_es;
  if (post.content_es   !== undefined) row[BL.CONTENT_ES]   = post.content_es;
  if (post.imageCredit  !== undefined) row[BL.IMAGE_CREDIT] = post.imageCredit;
  return row;
}

// ─── Blog Auto-translate (bidirectional via LanguageApp) ─────────────────────
//
// Strategy:
//  • HTML source  → parse into typed blocks (h1–h4, p, li, blockquote, hr)
//                   → batch-translate all text in ONE LanguageApp call, using
//                     a separator that Google Translate passes through unchanged
//                   → reassemble as Markdown (frontend is already in Markdown mode)
//  • Markdown/plain source → split on double-newlines → same batch trick → rejoin
//
// This preserves headings, paragraphs, list items and blockquotes across
// any language pair, instead of collapsing everything into one big paragraph.

var TRANS_SEP = ' ||| '; // Google Translate reliably passes ||| through unchanged

/** Strip inline HTML tags and decode common entities. */
function stripInlineTags(s) {
  return (s || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,  '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function isHtmlString(s) { return /^\s*<[a-zA-Z]/.test(s || ''); }

/**
 * Parse HTML into an ordered array of { type, text } blocks.
 * Types: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'li' | 'bq' | 'hr'
 * Nested matches (e.g. <p> inside <blockquote>) are skipped to avoid duplication.
 */
function parseHtmlBlocks(html) {
  var h = (html || '').replace(/[ \t]+/g, ' ');

  var matchers = [
    { tag: 'h1',         type: 'h1' },
    { tag: 'h2',         type: 'h2' },
    { tag: 'h3',         type: 'h3' },
    { tag: 'h4',         type: 'h4' },
    { tag: 'li',         type: 'li' },
    { tag: 'blockquote', type: 'bq' },
    { tag: 'p',          type: 'p'  },
  ];

  var allMatches = [];

  matchers.forEach(function(m) {
    var re = new RegExp('<' + m.tag + '[^>]*>([\\s\\S]*?)<\\/' + m.tag + '>', 'gi');
    var match;
    while ((match = re.exec(h)) !== null) {
      var text = stripInlineTags(match[1]);
      if (text) {
        allMatches.push({
          index: match.index,
          end:   match.index + match[0].length,
          type:  m.type,
          text:  text,
        });
      }
    }
  });

  // HR is self-closing
  var hrRe = /<hr[^>]*\/?>/gi, hrM;
  while ((hrM = hrRe.exec(h)) !== null) {
    allMatches.push({ index: hrM.index, end: hrM.index + hrM[0].length, type: 'hr', text: '' });
  }

  // Sort by document position; skip matches that fall inside an already-claimed range
  allMatches.sort(function(a, b) { return a.index - b.index; });
  var blocks = [], lastEnd = 0;
  allMatches.forEach(function(m) {
    if (m.index >= lastEnd) {
      blocks.push({ type: m.type, text: m.text });
      lastEnd = m.end;
    }
  });

  // Fallback: no block elements found → treat whole thing as one paragraph
  if (blocks.length === 0) {
    var plain = stripInlineTags(h);
    if (plain) blocks.push({ type: 'p', text: plain });
  }

  return blocks;
}

/**
 * Translate an array of blocks in one LanguageApp call and return Markdown.
 * HR blocks are passed through as '---'.
 */
function translateBlocksToMarkdown(blocks, from, to) {
  if (!blocks.length) return '';

  // Collect only translatable text and remember which block each piece belongs to
  var texts    = [];
  var blockIdx = [];
  blocks.forEach(function(b, i) {
    if (b.type !== 'hr' && b.text) { texts.push(b.text); blockIdx.push(i); }
  });

  var translatedTexts = [];
  if (texts.length > 0) {
    var joined     = texts.join(TRANS_SEP);
    var translated = LanguageApp.translate(joined, from, to);
    translatedTexts = translated.split(TRANS_SEP).map(function(t) { return t.trim(); });
  }

  return blocks.map(function(b, i) {
    if (b.type === 'hr') return '---';
    var pos  = blockIdx.indexOf(i);
    var text = (pos >= 0 && translatedTexts[pos]) ? translatedTexts[pos] : b.text;
    switch (b.type) {
      case 'h1': return '# '   + text;
      case 'h2': return '## '  + text;
      case 'h3': return '### ' + text;
      case 'h4': return '#### '+ text;
      case 'li': return '- '   + text;
      case 'bq': return '> '   + text;
      default:   return text;
    }
  }).join('\n\n');
}

/**
 * Translate plain-text / Markdown content while preserving paragraph breaks.
 * Splits on double-newlines, batch-translates, rejoins.
 */
function translateMarkdownContent(content, from, to) {
  var paras = (content || '').split(/\n\n+/).map(function(p) { return p.trim(); }).filter(Boolean);
  if (!paras.length) return '';
  if (paras.length === 1) return LanguageApp.translate(paras[0], from, to);
  var joined     = paras.join(TRANS_SEP);
  var translated = LanguageApp.translate(joined, from, to);
  return translated.split(TRANS_SEP).map(function(p) { return p.trim(); }).filter(Boolean).join('\n\n');
}

function doTranslateBlog(body) {
  var from    = String(body.from    || 'en');
  var to      = String(body.to      || 'es');
  var title   = String(body.title   || '');
  var excerpt = String(body.excerpt || '');
  var content = String(body.content || '');

  try {
    var translatedContent = '';
    if (content) {
      translatedContent = isHtmlString(content)
        ? translateBlocksToMarkdown(parseHtmlBlocks(content), from, to)
        : translateMarkdownContent(content, from, to);
    }

    return jsonOut({
      ok: true,
      data: {
        title:   title   ? LanguageApp.translate(title,   from, to) : '',
        excerpt: excerpt ? LanguageApp.translate(excerpt, from, to) : '',
        content: translatedContent,
      }
    });
  } catch(e) {
    return jsonOut({ ok: false, error: 'Translation failed: ' + e.message });
  }
}

// ─── Blog doGet ───────────────────────────────────────────────────────────────

function doGetBlog() {
  const sheet = getSheetBlog();
  const data  = sheet.getDataRange().getValues();
  const posts = [];

  // Row 0 = header row → start at row index 1
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[BL.ID]).trim() === '') continue; // skip empty rows
    posts.push(rowToAppBlog(row));
  }

  // Return all posts (admin sees drafts too); sort newest-first
  posts.sort(function(a, b) {
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });

  return jsonOut({ ok: true, data: posts });
}

// ─── Blog Save (create or update) ─────────────────────────────────────────────

function handleSaveBlogPost(post) {
  const sheet = getSheetBlog();
  const data  = sheet.getDataRange().getValues();

  // Update existing post
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][BL.ID]) === String(post.id)) {
      const row = ensureRowLength(copyRow(data[i]), TOTAL_COLS_BLOG);
      applyToRowBlog(row, post);
      sheet.getRange(i + 1, 1, 1, TOTAL_COLS_BLOG).setValues([row]);
      return jsonOut({ ok: true, data: rowToAppBlog(row) });
    }
  }

  // New post
  const newRow = new Array(TOTAL_COLS_BLOG).fill('');
  applyToRowBlog(newRow, post);
  sheet.appendRow(newRow);
  return jsonOut({ ok: true, data: rowToAppBlog(newRow) });
}

// ─── Blog Delete ──────────────────────────────────────────────────────────────

function handleDeleteBlogPost(id) {
  const sheet = getSheetBlog();
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][BL.ID]) === String(id)) {
      sheet.deleteRow(i + 1);
      return jsonOut({ ok: true, data: { deleted: id } });
    }
  }
  return jsonOut({ ok: false, error: 'Post not found for id: ' + id });
}
