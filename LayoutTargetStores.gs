// --- Layout Survey: Add Chill Bev target-store reference docs (ASIS / To-Be) ---
// The SRD team's "Add Chill Bev" email included ASIS.zip and "To be.zip" — matched
// pairs of Fixture Layout PDFs (one per store, 51 stores confirmed so far) showing the
// current ("ASIS") and target ("To Be") equipment layout. setupLayoutTargetDocs() is a
// one-time admin setup: it unzips both archives (already uploaded to Drive as
// ASIS.zip / To be.zip), re-saves each PDF individually with ANYONE_WITH_LINK sharing
// (matching every other attachment in this app), and records the per-store URLs in the
// LAYOUT_TARGET_DOCS_SHEET. getLayoutTargetDocs() then serves that list (cached) so the
// Layout Survey tab can restrict branch search to just these target stores and show
// "View ASIS / View To-Be" reference links per store.

var LAYOUT_TARGET_DOCS_SHEET = "Layout_Target_Docs";
var LAYOUT_TARGET_DOCS_FOLDER = "Layout_Survey_Reference_Docs";

// Run once from the Apps Script editor (or via google.script.run as an already-
// authenticated admin) after uploading ASIS.zip / "To be.zip" to this project's Drive.
function setupLayoutTargetDocs(asisZipFileId, tobeZipFileId) {
    var rootFolder = _getOrCreateFolder_(LAYOUT_TARGET_DOCS_FOLDER);
    var asisFolder = _getOrCreateSubfolder_(rootFolder, "ASIS");
    var tobeFolder = _getOrCreateSubfolder_(rootFolder, "ToBe");

    var asisMap = _unzipAndPublish_(asisZipFileId, asisFolder);
    var tobeMap = _unzipAndPublish_(tobeZipFileId, tobeFolder);

    var codes = {};
    Object.keys(asisMap).forEach(function(c) { codes[c] = true; });
    Object.keys(tobeMap).forEach(function(c) { codes[c] = true; });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(LAYOUT_TARGET_DOCS_SHEET);
    if (sheet) { ss.deleteSheet(sheet); }
    sheet = ss.insertSheet(LAYOUT_TARGET_DOCS_SHEET);
    var headers = ["Store Code", "ASIS URL", "ToBe URL"];
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    var hdrRng = sheet.getRange(1, 1, 1, headers.length);
    hdrRng.setBackground('#7c3aed');
    hdrRng.setFontColor('#ffffff');
    hdrRng.setFontWeight('bold');

    var rows = Object.keys(codes).sort().map(function(code) {
        return [code, asisMap[code] || "", tobeMap[code] || ""];
    });
    if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }

    _invalidateLayoutTargetDocsCache();
    return { success: true, storeCount: rows.length, asisCount: Object.keys(asisMap).length, tobeCount: Object.keys(tobeMap).length };
}

function _getOrCreateFolder_(name) {
    var folders = DriveApp.getFoldersByName(name);
    if (folders.hasNext()) return folders.next();
    return DriveApp.createFolder(name);
}

function _getOrCreateSubfolder_(parent, name) {
    var it = parent.getFoldersByName(name);
    if (it.hasNext()) return it.next();
    return parent.createFolder(name);
}

// Unzips the given Drive zip file, saves each PDF into folder with public view sharing,
// and returns { storeCode: url }. Filenames start with a 5-digit store code + "_".
function _unzipAndPublish_(zipFileId, folder) {
    var map = {};
    var zipBlob = DriveApp.getFileById(zipFileId).getBlob();
    var entries = Utilities.unzip(zipBlob);
    entries.forEach(function(entry) {
        var name = entry.getName();
        var m = /^(\d{5})_/.exec(name);
        if (!m) return;
        var code = m[1];
        var file = folder.createFile(entry.setName(name));
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        map[code] = "https://drive.google.com/file/d/" + file.getId() + "/view";
    });
    return map;
}

function _invalidateLayoutTargetDocsCache() {
    try { CacheService.getScriptCache().remove('LAYOUT_TARGET_DOCS_V1'); } catch (e) {}
}

// ─── Read (cached 10 min) — used by both the fill form and the report dashboard ──────
function getLayoutTargetDocs() {
    try {
        try {
            var cached = CacheService.getScriptCache().get('LAYOUT_TARGET_DOCS_V1');
            if (cached) return { success: true, data: JSON.parse(cached) };
        } catch (e) {}

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LAYOUT_TARGET_DOCS_SHEET);
        if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

        var lastRow = sheet.getLastRow();
        var values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
        var data = values.map(function(row) {
            return { code: String(row[0]).trim(), asisUrl: row[1] || "", tobeUrl: row[2] || "" };
        }).filter(function(r) { return r.code; });

        try { CacheService.getScriptCache().put('LAYOUT_TARGET_DOCS_V1', JSON.stringify(data), 600); } catch (e) {}
        return { success: true, data: data };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Manual add/replace of one store's ASIS or To-Be doc (Admin) ─────────────
// unitKey: 'asis' or 'tobe'. Upserts a row in LAYOUT_TARGET_DOCS_SHEET — if the
// store code isn't listed yet, this is how a new store gets added to the target
// list (and so becomes searchable in the Layout Survey tab); if it's already
// listed, the existing URL for that category is replaced. PDF or Word doc, same
// as any other attachment in this app (ANYONE_WITH_LINK view sharing).
function upsertLayoutTargetDoc(code, unitKey, file, clientEmail) {
    try {
        var adminCheck = checkSurveyAdminStatus(clientEmail);
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin) {
            return { success: false, error: "Administrator privileges required." };
        }
        code = String(code || '').trim();
        if (!/^\d{4,6}$/.test(code)) return { success: false, error: "รหัสสาขาไม่ถูกต้อง (Invalid store code)" };
        if (unitKey !== 'asis' && unitKey !== 'tobe') return { success: false, error: "Invalid category" };
        if (!file || !file.data || !file.name) return { success: false, error: "No file received" };

        var rootFolder = _getOrCreateFolder_(LAYOUT_TARGET_DOCS_FOLDER);
        var subFolder = _getOrCreateSubfolder_(rootFolder, unitKey === 'asis' ? 'ASIS' : 'ToBe');
        var blob = Utilities.newBlob(Utilities.base64Decode(file.data), file.mimeType || 'application/pdf', code + '_' + file.name);
        var driveFile = subFolder.createFile(blob);
        driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        var url = "https://drive.google.com/file/d/" + driveFile.getId() + "/view";

        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName(LAYOUT_TARGET_DOCS_SHEET);
        if (!sheet) {
            sheet = ss.insertSheet(LAYOUT_TARGET_DOCS_SHEET);
            sheet.appendRow(["Store Code", "ASIS URL", "ToBe URL"]);
            sheet.setFrozenRows(1);
            var hdrRng = sheet.getRange(1, 1, 1, 3);
            hdrRng.setBackground('#7c3aed');
            hdrRng.setFontColor('#ffffff');
            hdrRng.setFontWeight('bold');
        }

        var lastRow = sheet.getLastRow();
        var targetCol = unitKey === 'asis' ? 2 : 3;
        var rowIndex = -1;
        if (lastRow >= 2) {
            var codes = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
            for (var i = 0; i < codes.length; i++) {
                if (String(codes[i][0]).trim() === code) { rowIndex = i + 2; break; }
            }
        }
        if (rowIndex === -1) {
            sheet.appendRow(unitKey === 'asis' ? [code, url, ""] : [code, "", url]);
        } else {
            sheet.getRange(rowIndex, targetCol).setValue(url);
        }

        _invalidateLayoutTargetDocsCache();
        return { success: true, url: url };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// Removes a store from the target list entirely (Admin). Only un-restricts that
// code from the Layout Survey branch search — does not delete the underlying
// Drive files, in case they need to be re-linked later.
function removeLayoutTargetStore(code, clientEmail) {
    try {
        var adminCheck = checkSurveyAdminStatus(clientEmail);
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin) {
            return { success: false, error: "Administrator privileges required." };
        }
        code = String(code || '').trim();
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LAYOUT_TARGET_DOCS_SHEET);
        if (!sheet) return { success: false, error: "Sheet not found" };
        var lastRow = sheet.getLastRow();
        if (lastRow < 2) return { success: false, error: "Store not found" };
        var codes = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (var i = 0; i < codes.length; i++) {
            if (String(codes[i][0]).trim() === code) {
                sheet.deleteRow(i + 2);
                _invalidateLayoutTargetDocsCache();
                return { success: true };
            }
        }
        return { success: false, error: "Store not found" };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}
