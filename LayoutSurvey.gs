// --- Layout Survey (pre-installation area survey) ---
// Generic form for "layout change" projects (first requested for the Add Chill Bev
// project, 60 branches getting new chiller cabinets + repositioned equipment — see
// FW email from PPT Yuranan Detphet, Aug 2026). The MTN team surveys the install area
// before work starts and reports back two Yes/No checks plus any other obstacle found.
// Built as a generic "Project Name" field (not hardcoded to one project) so future
// layout-change projects reuse the same form instead of a new one being built each time.

var LAYOUT_SURVEY_SHEET = "Layout_Survey_Database";
var LAYOUT_SURVEY_FOLDER = "Layout_Survey_Attachments";

function processLayoutSurveyForm(form) {
    try {
        var _wlock = _acquireWriteLock_();
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LAYOUT_SURVEY_SHEET);

        var id = "LAYOUT-" + new Date().getTime();

        // Handle Attachments (beam / aircon / obstacle evidence photos)
        var attachmentLinks = {};
        if (form.attachments) {
            var folder;
            var folders = DriveApp.getFoldersByName(LAYOUT_SURVEY_FOLDER);
            if (folders.hasNext()) { folder = folders.next(); }
            else { folder = DriveApp.createFolder(LAYOUT_SURVEY_FOLDER); }

            for (var category in form.attachments) {
                var files = form.attachments[category];
                if (files && files.length > 0) {
                    attachmentLinks[category] = [];
                    files.forEach(function(fileData) {
                        var filename = id + "_" + category + "_" + fileData.name;
                        var blob = Utilities.newBlob(Utilities.base64Decode(fileData.data), fileData.mimeType, filename);
                        var file = folder.createFile(blob);
                        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                        attachmentLinks[category].push("https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId());
                    });
                }
            }
        }

        var dataToSave = {
            "Timestamp":            new Date(),
            "ID":                   id,
            "Reporter Email":       form.reporterEmail || "",
            "Reporter Name":        form.reporterName || "",
            "Reporter Phone":       form.reporterPhone || "",
            "Branch Code":          form.branchCode || "",
            "Branch Name":          form.branchName || "",
            "Store Format":         form.storeFormat || "",
            "Project Name":         form.projectName || "",
            "Survey Date":          form.surveyDate || "",
            "Beam Obstruction":     form.beamObstruction ? "Yes" : "No",
            "Aircon Above Area":    form.airconAboveArea ? "Yes" : "No",
            "Other Obstacles":      form.otherObstacles || "",
            "DM Area":              form.dmArea || "",
            "CM Area":              form.cmArea || "",
            "AMM MTN":              form.ammMtn || "",
            "Attachments_JSON":     JSON.stringify(attachmentLinks)
        };

        // Ensure sheet & headers exist
        if (!sheet) {
            sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(LAYOUT_SURVEY_SHEET);
            sheet.appendRow(Object.keys(dataToSave));
            sheet.setFrozenRows(1);
            var hdrRng = sheet.getRange(1, 1, 1, Object.keys(dataToSave).length);
            hdrRng.setBackground('#7c3aed');
            hdrRng.setFontColor('#ffffff');
            hdrRng.setFontWeight('bold');
        }

        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        Object.keys(dataToSave).forEach(function(key) {
            if (headers.indexOf(key) === -1) {
                headers.push(key);
                sheet.getRange(1, headers.length).setValue(key);
            }
        });

        var row = headers.map(function(h) { return dataToSave[h] !== undefined ? dataToSave[h] : ""; });
        sheet.appendRow(row);
        _invalidateLayoutSlimCache();

        // Email confirmation to reporter
        try {
            var toEmail = form.reporterEmail || Session.getActiveUser().getEmail();
            if (toEmail) {
                var htmlBody = '<html><body style="font-family:sans-serif;color:#333;background:#f4f4f4;margin:0;padding:0;">';
                htmlBody += '<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">';
                htmlBody += '<div style="background:#7c3aed;color:white;padding:20px;text-align:center;">';
                htmlBody += '<h2 style="margin:0 0 8px 0;">📐 Layout Survey</h2>';
                htmlBody += '<p style="margin:0;font-size:14px;">Branch: ' + form.branchCode + ' - ' + form.branchName + '</p>';
                htmlBody += '</div>';
                htmlBody += '<div style="padding:20px;">';
                htmlBody += '<p><b>Project:</b> ' + (form.projectName || '-') + '</p>';
                htmlBody += '<p><b>Reporter:</b> ' + (form.reporterName || toEmail) + '</p>';
                htmlBody += '<p><b>Survey Date:</b> ' + (form.surveyDate || '-') + '</p>';
                htmlBody += '<hr/>';
                htmlBody += '<p><b>บริเวณติดตั้งตู้แช่ ติดคานหรือไม่:</b> ' + (form.beamObstruction ? 'ติดคาน (Yes)' : 'ไม่ติดคาน (No)') + '</p>';
                htmlBody += '<p><b>มีแอร์อยู่เหนือบริเวณติดตั้งหรือไม่:</b> ' + (form.airconAboveArea ? 'มี (Yes)' : 'ไม่มี (No)') + '</p>';
                if (form.otherObstacles) htmlBody += '<p><b>อุปสรรคอื่นๆ:</b> ' + form.otherObstacles + '</p>';
                htmlBody += '</div></div></body></html>';

                sendAppEmail_({
                    to: toEmail,
                    subject: "Layout Survey Submitted: " + form.branchName + " (" + (form.projectName || 'Layout Project') + ")",
                    htmlBody: htmlBody
                });
            }
        } catch (mailErr) {
            Logger.log("Layout Survey email error: " + mailErr);
        }

        return { success: true, id: id };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function _invalidateLayoutSlimCache() {
    try {
        var _sc = CacheService.getScriptCache();
        var _nStr = _sc.get('LAYOUT_SLIM_V1_n');
        if (_nStr !== null) {
            var _n = parseInt(_nStr, 10);
            var _keys = ['LAYOUT_SLIM_V1_n'];
            for (var _ci = 0; _ci < _n; _ci++) _keys.push('LAYOUT_SLIM_V1_' + _ci);
            _sc.removeAll(_keys);
        }
    } catch (e) {}
}

// ─── Lightweight list for report table (cached 5 min) ─────────────────────────
function getLayoutSurveyListSlim() {
    try {
        try {
            var _sc = CacheService.getScriptCache();
            var _nStr = _sc.get('LAYOUT_SLIM_V1_n');
            if (_nStr !== null) {
                var _n = parseInt(_nStr, 10), _json = '', _ok = true;
                for (var _ci = 0; _ci < _n; _ci++) {
                    var _ch = _sc.get('LAYOUT_SLIM_V1_' + _ci);
                    if (_ch === null) { _ok = false; break; }
                    _json += _ch;
                }
                if (_ok) return { success: true, data: JSON.parse(_json) };
            }
        } catch (_scE) {}

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LAYOUT_SURVEY_SHEET);
        if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

        var lastCol = sheet.getLastColumn();
        var lastRow = sheet.getLastRow();
        var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

        var LIST_KEYS = ['ID', 'Timestamp', 'Branch Code', 'Branch Name', 'Store Format', 'Project Name',
            'Survey Date', 'Reporter Name', 'Reporter Email',
            'Beam Obstruction', 'Aircon Above Area', 'Other Obstacles',
            'DM Area', 'CM Area', 'AMM MTN'];
        var keyIdx = {};
        LIST_KEYS.forEach(function(k) { keyIdx[k] = headers.indexOf(k); });

        var maxNeededIdx = -1;
        LIST_KEYS.forEach(function(k) { if (keyIdx[k] > maxNeededIdx) maxNeededIdx = keyIdx[k]; });
        if (maxNeededIdx < 0) return { success: true, data: [] };

        var nRows = lastRow - 1;
        var dataRange = sheet.getRange(2, 1, nRows, maxNeededIdx + 1).getValues();

        var results = [];
        for (var i = 0; i < dataRange.length; i++) {
            var row = dataRange[i];
            var slim = {};
            LIST_KEYS.forEach(function(k) { var idx = keyIdx[k]; slim[k] = idx > -1 ? row[idx] : ''; });
            if (slim['Timestamp'] instanceof Date) slim['Timestamp'] = slim['Timestamp'].toISOString();
            results.push(slim);
        }
        results.reverse();

        try {
            var _cj = JSON.stringify(results);
            var _co = CacheService.getScriptCache();
            var _store = {}, _nc = 0;
            for (var _cs = 0; _cs < _cj.length; _cs += 90000) {
                _store['LAYOUT_SLIM_V1_' + _nc++] = _cj.substring(_cs, _cs + 90000);
            }
            _store['LAYOUT_SLIM_V1_n'] = String(_nc);
            _co.putAll(_store, 300);
        } catch (_we) {}

        return { success: true, data: results };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Single full record by ID — used for lazy modal loading ──────────────────
function getLayoutSurveyRecordById(id) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LAYOUT_SURVEY_SHEET);
        if (!sheet) return { success: false, error: 'Sheet not found' };
        var lastRow = sheet.getLastRow();
        var lastCol = sheet.getLastColumn();
        if (lastRow < 2) return { success: false, error: 'Record not found: ' + String(id) };

        var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        var idIdx = headers.indexOf('ID');
        if (idIdx === -1) return { success: false, error: 'ID column not found' };

        var ids = sheet.getRange(2, idIdx + 1, lastRow - 1, 1).getValues();
        var searchId = String(id).trim();
        var foundRow = -1;
        for (var i = 0; i < ids.length; i++) {
            if (String(ids[i][0]).trim() === searchId) { foundRow = i + 2; break; }
        }
        if (foundRow === -1) return { success: false, error: 'Record not found: ' + searchId };

        var rowVals = sheet.getRange(foundRow, 1, 1, lastCol).getValues()[0];
        var row = {};
        for (var j = 0; j < headers.length; j++) {
            var val = rowVals[j];
            if (val instanceof Date) val = val.toISOString();
            row[headers[j]] = val;
        }
        try { row['Attachments_JSON'] = JSON.parse(row['Attachments_JSON'] || '{}'); } catch (e) { row['Attachments_JSON'] = {}; }
        return { success: true, data: row };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Edit — admin/schedule-admin OR the original reporter may edit their own row ──
function updateLayoutSurveyRecord(form) {
    try {
        var _wlock = _acquireWriteLock_();
        var userEmail = form.clientEmail || Session.getActiveUser().getEmail();
        var adminCheck = checkSurveyAdminStatus(userEmail);

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LAYOUT_SURVEY_SHEET);
        if (!sheet) return { success: false, error: "Sheet not found" };

        var data = sheet.getDataRange().getValues();
        var headers = data[0].map(function(h) { return String(h).trim(); });
        var colMap = {};
        headers.forEach(function(h, idx) { colMap[h] = idx + 1; });

        var idColIdx = (colMap["ID"] || 1) - 1;
        var rowIndex = -1;
        for (var i = 1; i < data.length; i++) {
            if (data[i][idColIdx] == form.id) { rowIndex = i + 1; break; }
        }
        if (rowIndex === -1) return { success: false, error: "Record not found" };

        var ownerEmail = colMap["Reporter Email"] ? String(data[rowIndex - 1][colMap["Reporter Email"] - 1] || '').trim().toLowerCase() : '';
        var isOwner = ownerEmail && userEmail && ownerEmail === String(userEmail).trim().toLowerCase();
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin && !adminCheck.smfEditAllowed && !isOwner) {
            return { success: false, error: "Administrator privileges or original reporter required." };
        }

        function setVal(colKey, value) {
            if (value === undefined || value === null) return;
            if (!colMap[colKey]) {
                headers.push(colKey);
                colMap[colKey] = headers.length;
                sheet.getRange(1, headers.length).setValue(colKey);
            }
            sheet.getRange(rowIndex, colMap[colKey]).setValue(value);
        }

        setVal("Store Format", form.storeFormat);
        setVal("Project Name", form.projectName);
        // Survey Date — empty string here means the edit form's date input failed to
        // populate, never a deliberate clear (same reasoning as EDMI Reading Date).
        if (form.surveyDate) setVal("Survey Date", form.surveyDate);
        // Checkboxes always send a real .checked boolean — safe to write unconditionally.
        setVal("Beam Obstruction", form.beamObstruction ? "Yes" : "No");
        setVal("Aircon Above Area", form.airconAboveArea ? "Yes" : "No");
        setVal("Other Obstacles", form.otherObstacles || "");

        _invalidateLayoutSlimCache();
        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Delete — admin/schedule-admin only ───────────────────────────────────────
function deleteLayoutSurveyRecord(id, clientEmail) {
    try {
        var _wlock = _acquireWriteLock_();
        var adminCheck = checkSurveyAdminStatus(clientEmail || Session.getActiveUser().getEmail());
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin) return { success: false, error: "Administrator privileges required." };

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LAYOUT_SURVEY_SHEET);
        if (!sheet) return { success: false, error: "Sheet not found" };

        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        var idColIdx = headers.indexOf("ID");
        if (idColIdx === -1) return { success: false, error: "ID column not found" };

        for (var i = 1; i < data.length; i++) {
            if (data[i][idColIdx] == id) {
                sheet.deleteRow(i + 1);
                _invalidateLayoutSlimCache();
                return { success: true };
            }
        }
        return { success: false, error: "Record not found" };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Add extra photos to an existing Layout Survey record (Admin/SMF) ────────
// unitKey: attachment category, e.g. "layoutBeamPhoto", "layoutAirconPhoto", "layoutObstaclePhoto"
function addLayoutSurveyPhotos(id, unitKey, files, clientEmail) {
    try {
        var adminCheck = checkSurveyAdminStatus(clientEmail);
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin && !adminCheck.smfEditAllowed) {
            return { success: false, error: "Administrator privileges required." };
        }

        var folderName = "Survey_Photos_Added";
        var folder;
        var folders = DriveApp.getFoldersByName(folderName);
        if (folders.hasNext()) { folder = folders.next(); }
        else { folder = DriveApp.createFolder(folderName); }

        var newUrls = [];
        var ts = new Date().getTime();
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            if (f.data && f.name) {
                var filename = "layout_" + id + "_" + unitKey + "_" + ts + "_" + i + "_" + f.name;
                var blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.mimeType || "image/jpeg", filename);
                var file = folder.createFile(blob);
                file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                newUrls.push("https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId());
            }
        }
        if (newUrls.length === 0) return { success: false, error: "No valid files received." };

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LAYOUT_SURVEY_SHEET);
        if (!sheet) return { success: false, error: "Sheet not found." };

        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        var colMap = {};
        headers.forEach(function(h, idx) { colMap[String(h).trim()] = idx + 1; });

        var idColIdx = (colMap["ID"] || 1) - 1;
        var rowIndex = -1;
        for (var i = 1; i < data.length; i++) {
            if (data[i][idColIdx] == id) { rowIndex = i + 1; break; }
        }
        if (rowIndex === -1) return { success: false, error: "Record not found." };

        var attachCol = colMap["Attachments_JSON"];
        if (!attachCol) return { success: false, error: "Attachments_JSON column not found." };

        var existing = {};
        try { existing = JSON.parse(data[rowIndex - 1][attachCol - 1] || "{}"); } catch(e) {}
        existing[unitKey] = (existing[unitKey] || []).concat(newUrls);

        sheet.getRange(rowIndex, attachCol).setValue(JSON.stringify(existing));
        _invalidateLayoutSlimCache();
        return { success: true, newUrls: newUrls };
    } catch(e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Delete a single photo from an existing Layout Survey record ─────────────
function deleteLayoutSurveyPhoto(id, unitKey, url, clientEmail) {
    try {
        var _wlock = _acquireWriteLock_();
        var adminCheck = checkSurveyAdminStatus(clientEmail);
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin && !adminCheck.smfEditAllowed) {
            return { success: false, error: "Administrator privileges required." };
        }

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LAYOUT_SURVEY_SHEET);
        if (!sheet) return { success: false, error: "Sheet not found." };
        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        var colMap = {};
        headers.forEach(function(h, idx) { colMap[String(h).trim()] = idx + 1; });
        var idColIdx = (colMap["ID"] || 1) - 1;
        var rowIndex = -1;
        for (var i = 1; i < data.length; i++) {
            if (data[i][idColIdx] == id) { rowIndex = i + 1; break; }
        }
        if (rowIndex === -1) return { success: false, error: "Record not found." };
        var attachCol = colMap["Attachments_JSON"];
        if (!attachCol) return { success: false, error: "Attachments_JSON column not found." };
        var existing = {};
        try { existing = JSON.parse(data[rowIndex - 1][attachCol - 1] || "{}"); } catch(e) {}
        if (existing[unitKey]) {
            existing[unitKey] = existing[unitKey].filter(function(u) { return u !== url; });
        }
        sheet.getRange(rowIndex, attachCol).setValue(JSON.stringify(existing));
        _invalidateLayoutSlimCache();
        return { success: true };
    } catch(e) {
        return { success: false, error: e.toString() };
    }
}
