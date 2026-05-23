/**
 * Butler Coffee — Google Apps Script Backend
 * Spreadsheet: https://docs.google.com/spreadsheets/d/1nT5v6u7pz8qv1cloSDT7GpDDfodXk1LID8rMeRkzIeY
 *
 * DEPLOY:
 *  1. Open Extensions → Apps Script in the spreadsheet
 *  2. Paste this entire file, replacing any existing code
 *  3. Deploy → New Deployment → Web App
 *     - Execute as: Me
 *     - Who has access: Anyone
 *  4. Copy the /exec URL and paste it into your .env.local as VITE_BUTLER_COFFEE_API_URL
 *  5. Re-deploy (New Deployment) every time you change this script
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
  // 25–39: pricing/margin columns (preserved, never overwritten by this script)
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
  LABEL_BAG:    50,
  LOT_NO:       51,
  PRINT:        52
};

const TOTAL_COLS = 53; // columns A–BA

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    updatedAt:   new Date().toISOString()
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
  return row;
}

function getSheet() {
  return SpreadsheetApp.openById(SS_ID).getSheetByName(SHEET_NAME);
}

// ─── doGet — read all coffees ─────────────────────────────────────────────────

function doGet(e) {
  try {
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

    if (body.action === 'save')   return handleSave(body.coffee);
    if (body.action === 'delete') return handleDelete(body.id);
    if (body.action === 'import') return handleImport(body.coffees);

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
      const updatedRow = applyToRow([...data[i]], coffee);
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
