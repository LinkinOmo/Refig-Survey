// ─── Server-side survey drafts (resume on any device) ─────────────────────────
// Every survey tab with a "Save Draft" button (Aircon, NP, the 5 Hyper surveys)
// used to keep its draft only in that browser's localStorage, so a surveyor who
// came back on another phone/browser (or whose LINE in-app browser wiped storage)
// found nothing. Each section's "save" button and Save Draft now also store the
// tab's own draft object here, plus the Drive links of photos already uploaded
// one by one (hyperUploadSurveyPhoto). Submit passes draftId so the draft is
// closed in the same call that creates the real record.
//
// The Ref survey does NOT use this store — it saves module-by-module straight
// into Ref_Survey_Database as a Status=Draft row (processRefSurveyForm surveyId).

var SURVEY_DRAFT_SHEET = 'Survey_Drafts';
var SURVEY_DRAFT_TYPES = { aircon: 1, np: 1, hyperRef: 1, hyperAc: 1, hyperEq: 1, hyperFo: 1, hyperLi: 1, hyperTo: 1, hyperPk: 1, hyperFa: 1, hyperHb: 1, hyperFi: 1, hyperSc: 1, cctv: 1 };
var SURVEY_DRAFT_BASE_COLS = ['Draft ID', 'Type', 'Status', 'Branch Code', 'Branch Name', 'Reporter Email',
                              'Reporter Phone', 'Created', 'Updated', 'Photos_JSON'];
var SURVEY_DRAFT_CHUNK = 40000;   // a Sheets cell holds max 50,000 chars; big Hyper stores exceed one cell
var SURVEY_DRAFT_MAX_DAYS = 45;

function _sdSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SURVEY_DRAFT_SHEET);
    if (!sheet) {
        sheet = ss.insertSheet(SURVEY_DRAFT_SHEET);
        sheet.appendRow(SURVEY_DRAFT_BASE_COLS.concat(['Data_JSON_1']));
        sheet.setFrozenRows(1);
        sheet.getRange(1, 1, 1, SURVEY_DRAFT_BASE_COLS.length + 1).setFontWeight('bold');
    }
    return sheet;
}

function _sdPhoneKey_(v) { return String(v || '').replace(/\D/g, '').replace(/^0+/, ''); }

function _sdCleanPhotos_(photos) {
    var out = {};
    Object.keys(photos || {}).forEach(function(cat) {
        var urls = (photos[cat] || []).filter(function(u) { return /^https:\/\/drive\.google\.com\//.test(String(u)); });
        if (urls.length) out[String(cat)] = urls;
    });
    return out;
}

// p: { type, draftId?, branchCode, branchName, reporterEmail, reporterPhone, draft: {...}, photos: {cat:[url]} }
function saveSurveyDraft(p) {
    try {
        p = p || {};
        if (!SURVEY_DRAFT_TYPES[p.type]) return { success: false, error: 'Unknown survey type: ' + p.type };
        var code = String(p.branchCode || '').trim();
        if (!code) return { success: false, error: 'กรุณาเลือกสาขาก่อนบันทึก' };
        var json = JSON.stringify(p.draft || {});
        var chunks = [];
        for (var c = 0; c < json.length; c += SURVEY_DRAFT_CHUNK) chunks.push(json.substring(c, c + SURVEY_DRAFT_CHUNK));
        if (!chunks.length) chunks.push('{}');

        var _wlock = _acquireWriteLock_();
        var sheet = _sdSheet_();
        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) { return String(h).trim(); });
        for (var k = 1; k <= chunks.length; k++) {
            if (headers.indexOf('Data_JSON_' + k) === -1) {
                headers.push('Data_JSON_' + k);
                sheet.getRange(1, headers.length).setValue('Data_JSON_' + k);
            }
        }

        var now = new Date();
        var draftId = String(p.draftId || '').trim();
        var rowNum = -1, created = now;
        if (/^SD-\d+$/.test(draftId)) {
            var found = _sdFindRow_(sheet, headers, draftId);
            if (found) {
                var st = String(found.rec['Status'] || '').trim();
                if (st !== 'Open') {
                    return { success: false, code: 'ALREADY_SUBMITTED', error: 'แบบสำรวจนี้ถูกส่งไปแล้ว — กรุณาเริ่มแบบสำรวจใหม่' };
                }
                rowNum = found.rowNum;
                created = found.rec['Created'] || now;
            }
        } else {
            draftId = 'SD-' + now.getTime();
        }

        var rec = {
            'Draft ID': draftId, 'Type': p.type, 'Status': 'Open', 'Branch Code': code,
            'Branch Name': p.branchName || '', 'Reporter Email': String(p.reporterEmail || '').trim().toLowerCase(),
            'Reporter Phone': "'" + String(p.reporterPhone || '').trim(),   // keep leading 0
            'Created': created, 'Updated': now, 'Photos_JSON': JSON.stringify(_sdCleanPhotos_(p.photos))
        };
        var row = headers.map(function(h) {
            var m = /^Data_JSON_(\d+)$/.exec(h);
            if (m) return chunks[parseInt(m[1], 10) - 1] || '';
            return rec[h] !== undefined ? rec[h] : '';
        });
        if (rowNum > 0) sheet.getRange(rowNum, 1, 1, row.length).setValues([row]);
        else sheet.appendRow(row);
        return { success: true, draftId: draftId, savedAt: now.toISOString() };
    } catch (e) {
        Logger.log('saveSurveyDraft Error: ' + e);
        return { success: false, error: e.toString() };
    }
}

function _sdFindRow_(sheet, headers, draftId) {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    var idCol = headers.indexOf('Draft ID');
    if (idCol < 0) return null;
    var ids = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
    for (var i = ids.length - 1; i >= 0; i--) {
        if (String(ids[i][0]).trim() !== draftId) continue;
        var values = sheet.getRange(i + 2, 1, 1, headers.length).getValues()[0];
        var rec = {};
        headers.forEach(function(h, k) { rec[h] = values[k]; });
        return { rowNum: i + 2, values: values, rec: rec };
    }
    return null;
}

// Latest Open draft of this type for this branch + surveyor (email when signed in,
// otherwise phone), within SURVEY_DRAFT_MAX_DAYS.
function getSurveyDraft(type, branchCode, reporterEmail, reporterPhone) {
    try {
        if (!SURVEY_DRAFT_TYPES[type]) return { success: true, draft: null };
        var code = String(branchCode || '').trim();
        var email = String(reporterEmail || '').trim().toLowerCase();
        var phone = _sdPhoneKey_(reporterPhone);
        if (!code || (!email && !phone)) return { success: true, draft: null };
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SURVEY_DRAFT_SHEET);
        if (!sheet || sheet.getLastRow() < 2) return { success: true, draft: null };

        var data = sheet.getDataRange().getValues();
        var headers = data[0].map(function(h) { return String(h).trim(); });
        var ix = {};
        headers.forEach(function(h, k) { ix[h] = k; });
        var cutoff = new Date().getTime() - SURVEY_DRAFT_MAX_DAYS * 24 * 3600 * 1000;
        var best = null, bestTs = 0;
        for (var i = 1; i < data.length; i++) {
            var r = data[i];
            if (String(r[ix['Type']]) !== type || String(r[ix['Status']]).trim() !== 'Open') continue;
            if (String(r[ix['Branch Code']]).trim() !== code) continue;
            var rowEmail = String(r[ix['Reporter Email']] || '').trim().toLowerCase();
            var mine = (email && rowEmail === email) || (!email && phone && _sdPhoneKey_(r[ix['Reporter Phone']]) === phone);
            if (!mine) continue;
            var ts = r[ix['Updated']] instanceof Date ? r[ix['Updated']].getTime() : 0;
            if (ts && ts < cutoff) continue;
            if (!best || ts >= bestTs) { best = r; bestTs = ts; }
        }
        if (!best) return { success: true, draft: null };

        var json = '';
        for (var n = 1; ix['Data_JSON_' + n] !== undefined; n++) json += String(best[ix['Data_JSON_' + n]] || '');
        var draft = {}, photos = {};
        try { draft = JSON.parse(json || '{}'); } catch (pe) { return { success: false, error: 'Draft data is damaged: ' + pe }; }
        try { photos = JSON.parse(best[ix['Photos_JSON']] || '{}'); } catch (ph) {}
        return { success: true, draft: {
            draftId: best[ix['Draft ID']], savedAt: bestTs ? new Date(bestTs).toISOString() : '',
            data: draft, photos: photos
        } };
    } catch (e) {
        Logger.log('getSurveyDraft Error: ' + e);
        return { success: false, error: e.toString() };
    }
}

// Called by the real submit functions once their record is written. Never throws —
// a draft left Open only means the resume banner may still offer it.
function _closeSurveyDraft_(draftId, recordId) {
    try {
        draftId = String(draftId || '').trim();
        if (!/^SD-\d+$/.test(draftId)) return;
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SURVEY_DRAFT_SHEET);
        if (!sheet) return;
        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) { return String(h).trim(); });
        var found = _sdFindRow_(sheet, headers, draftId);
        if (!found) return;
        sheet.getRange(found.rowNum, headers.indexOf('Status') + 1).setValue('Submitted' + (recordId ? ' (' + recordId + ')' : ''));
        sheet.getRange(found.rowNum, headers.indexOf('Updated') + 1).setValue(new Date());
    } catch (e) {
        Logger.log('_closeSurveyDraft_ Error: ' + e);
    }
}

// Drive links passed from the client for photos it already uploaded one by one.
function _sdUploadedLinks_(form) {
    return _sdCleanPhotos_(form && form.uploadedLinks);
}
