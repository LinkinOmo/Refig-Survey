// --- Trading Hours Conversion Survey (24hr → Non-24hr readiness) ---
// Operation is converting stores from 3-shift (24hr) to 2-shift operation — see
// meeting notes 19 Aug 2026. Maintenance's two action items: (1) survey + install a
// working front-door lock where missing, (2) inspect and REMOVE the existing 24hr
// sticker/signage (the store is no longer 24hr, so the old sticker must come off —
// this is a removal job, not a "put up new hours signage" job). Built as a generic
// per-store readiness checklist restricted to the target-store allowlist in
// TradingHoursTargetStores.gs (Phase 1 confirmed, Phase 2 added later), same shape
// as LayoutSurvey.gs (Layout Survey module).

var TRADING_HOURS_SURVEY_SHEET = "Trading_Hours_Survey_Database";
var TRADING_HOURS_SURVEY_FOLDER = "Trading_Hours_Survey_Attachments";

function processTradingHoursSurveyForm(form) {
    try {
        var _wlock = _acquireWriteLock_();
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRADING_HOURS_SURVEY_SHEET);

        var id = "HOURS-" + new Date().getTime();

        var attachmentLinks = {};
        if (form.attachments) {
            var folder;
            var folders = DriveApp.getFoldersByName(TRADING_HOURS_SURVEY_FOLDER);
            if (folders.hasNext()) { folder = folders.next(); }
            else { folder = DriveApp.createFolder(TRADING_HOURS_SURVEY_FOLDER); }

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

        // Survey Stage: "Pre-Conversion" (readiness — lock/sticker) or "Post-Conversion"
        // (verification — confirms the conversion held up in real use after go-live).
        // Blank/legacy rows are always Pre-Conversion. See index.html:3108+ for the form.
        var surveyStage = (form.surveyStage === 'Post-Conversion') ? 'Post-Conversion' : 'Pre-Conversion';

        var lockOk = !!form.lockInstalled;
        var stickerRemoved = !!form.stickerRemoved;

        var lockUsedAtClosing = !!form.lockUsedAtClosing;
        var alarmRearmed = !!form.alarmRearmed;
        var refrigTempStable = !!form.refrigTempStable;
        var lightingAcScheduleOk = !!form.lightingAcScheduleOk;
        var afterHoursAccessOk = !!form.afterHoursAccessOk;

        var overallStatus;
        if (surveyStage === 'Post-Conversion') {
            var postAllOk = lockUsedAtClosing && alarmRearmed && refrigTempStable && lightingAcScheduleOk && afterHoursAccessOk;
            overallStatus = postAllOk ? "ตรวจสอบผ่าน (Verified OK)" : "พบปัญหา (Issue Found)";
        } else {
            overallStatus = (lockOk && stickerRemoved) ? "พร้อม (Ready)" : "ยังไม่พร้อม (Not Ready)";
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
            "Phase":                form.phase || "",
            "Target Date":          form.targetDate || "",
            "Survey Date":          form.surveyDate || "",
            "Survey Stage":         surveyStage,
            "Current Hours":        form.currentHours || "",
            "New Hours":            form.newHours || "",
            "Lock Installed":       lockOk ? "Yes" : "No",
            "Sticker Removed":      stickerRemoved ? "Yes" : "No",
            "Exterior Lighting OK": form.exteriorLightingOk ? "Yes" : "No",
            "CCTV OK":              form.cctvOk ? "Yes" : "No",
            "Lock Used At Closing": lockUsedAtClosing ? "Yes" : "No",
            "Alarm Rearmed":        alarmRearmed ? "Yes" : "No",
            "Refrig Temp Stable":   refrigTempStable ? "Yes" : "No",
            "Lighting/AC Schedule OK": lightingAcScheduleOk ? "Yes" : "No",
            "After-Hours Access OK":  afterHoursAccessOk ? "Yes" : "No",
            "Overall Status":       overallStatus,
            "Other Notes":          form.otherNotes || "",
            "DM Area":              form.dmArea || "",
            "CM Area":              form.cmArea || "",
            "AMM MTN":              form.ammMtn || "",
            "Attachments_JSON":     JSON.stringify(attachmentLinks)
        };

        if (!sheet) {
            sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(TRADING_HOURS_SURVEY_SHEET);
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
        _invalidateTradingHoursSlimCache();

        try {
            var toEmail = form.reporterEmail || Session.getActiveUser().getEmail();
            if (toEmail) {
                var htmlBody = '<html><body style="font-family:sans-serif;color:#333;background:#f4f4f4;margin:0;padding:0;">';
                htmlBody += '<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">';
                htmlBody += '<div style="background:#7c3aed;color:white;padding:20px;text-align:center;">';
                htmlBody += '<h2 style="margin:0 0 8px 0;">⏰ Trading Hours Survey' + (surveyStage === 'Post-Conversion' ? ' — Post-Conversion Verification' : '') + '</h2>';
                htmlBody += '<p style="margin:0;font-size:14px;">Branch: ' + form.branchCode + ' - ' + form.branchName + '</p>';
                htmlBody += '</div>';
                htmlBody += '<div style="padding:20px;">';
                htmlBody += '<p><b>Phase:</b> ' + (form.phase || '-') + ' &nbsp; <b>Target Date:</b> ' + (form.targetDate || '-') + '</p>';
                htmlBody += '<p><b>Reporter:</b> ' + (form.reporterName || toEmail) + '</p>';
                htmlBody += '<p><b>Survey Date:</b> ' + (form.surveyDate || '-') + '</p>';
                htmlBody += '<hr/>';
                if (surveyStage === 'Post-Conversion') {
                    htmlBody += '<p><b>ล็อกประตูจริงตอนปิดร้าน:</b> ' + (lockUsedAtClosing ? 'ใช่ (Yes)' : 'ไม่ใช่ (No)') + '</p>';
                    htmlBody += '<p><b>ตั้งเวลาสัญญาณกันขโมยใหม่แล้ว:</b> ' + (alarmRearmed ? 'ใช่ (Yes)' : 'ไม่ใช่ (No)') + '</p>';
                    htmlBody += '<p><b>อุณหภูมิตู้แช่/ห้องเย็นปกติช่วงปิดร้าน:</b> ' + (refrigTempStable ? 'ใช่ (Yes)' : 'ไม่ใช่ (No)') + '</p>';
                    htmlBody += '<p><b>ไฟ/แอร์ทั่วไปตัดตามตารางใหม่ถูกต้อง:</b> ' + (lightingAcScheduleOk ? 'ใช่ (Yes)' : 'ไม่ใช่ (No)') + '</p>';
                    htmlBody += '<p><b>ช่องทางแจ้งเหตุฉุกเฉิน/ซ่อมบำรุงนอกเวลาทำการใช้งานได้:</b> ' + (afterHoursAccessOk ? 'ใช่ (Yes)' : 'ไม่ใช่ (No)') + '</p>';
                } else {
                    htmlBody += '<p><b>กุญแจล็อกประตูหน้าร้าน ใช้งานได้:</b> ' + (lockOk ? 'มี/ใช้งานได้ (Yes)' : 'ไม่มี/ใช้งานไม่ได้ (No)') + '</p>';
                    htmlBody += '<p><b>ถอดสติกเกอร์/ป้าย 24 ชม. ออกแล้ว:</b> ' + (stickerRemoved ? 'ถอดแล้ว (Yes)' : 'ยังไม่ถอด (No)') + '</p>';
                }
                htmlBody += '<p><b>สถานะโดยรวม:</b> ' + overallStatus + '</p>';
                if (form.otherNotes) htmlBody += '<p><b>หมายเหตุอื่นๆ:</b> ' + form.otherNotes + '</p>';
                htmlBody += '</div></div></body></html>';

                sendAppEmail_({
                    to: toEmail,
                    subject: "Trading Hours Survey Submitted: " + form.branchName + " (" + overallStatus + ")",
                    htmlBody: htmlBody
                });
            }
        } catch (mailErr) {
            Logger.log("Trading Hours Survey email error: " + mailErr);
        }

        return { success: true, id: id };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function _invalidateTradingHoursSlimCache() {
    try {
        var _sc = CacheService.getScriptCache();
        var _nStr = _sc.get('HOURS_SLIM_V1_n');
        if (_nStr !== null) {
            var _n = parseInt(_nStr, 10);
            var _keys = ['HOURS_SLIM_V1_n'];
            for (var _ci = 0; _ci < _n; _ci++) _keys.push('HOURS_SLIM_V1_' + _ci);
            _sc.removeAll(_keys);
        }
    } catch (e) {}
}

// ─── Lightweight list for report table (cached 5 min) ─────────────────────────
function getTradingHoursSurveyListSlim() {
    try {
        try {
            var _sc = CacheService.getScriptCache();
            var _nStr = _sc.get('HOURS_SLIM_V1_n');
            if (_nStr !== null) {
                var _n = parseInt(_nStr, 10), _json = '', _ok = true;
                for (var _ci = 0; _ci < _n; _ci++) {
                    var _ch = _sc.get('HOURS_SLIM_V1_' + _ci);
                    if (_ch === null) { _ok = false; break; }
                    _json += _ch;
                }
                if (_ok) return { success: true, data: JSON.parse(_json) };
            }
        } catch (_scE) {}

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRADING_HOURS_SURVEY_SHEET);
        if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

        var lastCol = sheet.getLastColumn();
        var lastRow = sheet.getLastRow();
        var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

        var LIST_KEYS = ['ID', 'Timestamp', 'Branch Code', 'Branch Name', 'Store Format', 'Phase', 'Target Date',
            'Survey Date', 'Survey Stage', 'Reporter Name', 'Reporter Email',
            'Current Hours', 'New Hours', 'Lock Installed', 'Sticker Removed',
            'Exterior Lighting OK', 'CCTV OK',
            'Lock Used At Closing', 'Alarm Rearmed', 'Refrig Temp Stable',
            'Lighting/AC Schedule OK', 'After-Hours Access OK',
            'Overall Status', 'Other Notes',
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
                _store['HOURS_SLIM_V1_' + _nc++] = _cj.substring(_cs, _cs + 90000);
            }
            _store['HOURS_SLIM_V1_n'] = String(_nc);
            _co.putAll(_store, 300);
        } catch (_we) {}

        return { success: true, data: results };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Single full record by ID — used for lazy modal loading ──────────────────
function getTradingHoursSurveyRecordById(id) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRADING_HOURS_SURVEY_SHEET);
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
function updateTradingHoursSurveyRecord(form) {
    try {
        var _wlock = _acquireWriteLock_();
        var userEmail = form.clientEmail || Session.getActiveUser().getEmail();
        var adminCheck = checkSurveyAdminStatus(userEmail);

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRADING_HOURS_SURVEY_SHEET);
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
        // Survey Date — empty string here means the edit form's date input failed to
        // populate, never a deliberate clear (same reasoning as EDMI Reading Date).
        if (form.surveyDate) setVal("Survey Date", form.surveyDate);
        setVal("Current Hours", form.currentHours);
        setVal("New Hours", form.newHours);

        // Survey Stage determines which checklist (and Overall Status formula) applies —
        // existing rows without a stage on file are treated as Pre-Conversion. The edit
        // modal only ever renders ONE stage's checklist (see TradingHoursSurveyReport.html
        // renderModalBody), so this is fixed from the record itself, not resent by the
        // client — recomputing it from a partial form would silently blank whichever
        // stage's checklist columns the modal didn't render (see feedback_survey_edit_data_loss_pattern).
        var existingStage = colMap["Survey Stage"] ? String(data[rowIndex - 1][colMap["Survey Stage"] - 1] || '').trim() : '';
        var surveyStage = existingStage === 'Post-Conversion' ? 'Post-Conversion' : 'Pre-Conversion';

        var overallStatus;
        if (surveyStage === 'Post-Conversion') {
            // Checkboxes always send a real .checked boolean — safe to write unconditionally
            // for the stage that's actually being edited.
            var lockUsedAtClosing = !!form.lockUsedAtClosing;
            var alarmRearmed = !!form.alarmRearmed;
            var refrigTempStable = !!form.refrigTempStable;
            var lightingAcScheduleOk = !!form.lightingAcScheduleOk;
            var afterHoursAccessOk = !!form.afterHoursAccessOk;
            setVal("Lock Used At Closing", lockUsedAtClosing ? "Yes" : "No");
            setVal("Alarm Rearmed", alarmRearmed ? "Yes" : "No");
            setVal("Refrig Temp Stable", refrigTempStable ? "Yes" : "No");
            setVal("Lighting/AC Schedule OK", lightingAcScheduleOk ? "Yes" : "No");
            setVal("After-Hours Access OK", afterHoursAccessOk ? "Yes" : "No");
            var postAllOk = lockUsedAtClosing && alarmRearmed && refrigTempStable && lightingAcScheduleOk && afterHoursAccessOk;
            overallStatus = postAllOk ? "ตรวจสอบผ่าน (Verified OK)" : "พบปัญหา (Issue Found)";
        } else {
            var lockOk = !!form.lockInstalled;
            var stickerRemoved = !!form.stickerRemoved;
            setVal("Lock Installed", lockOk ? "Yes" : "No");
            setVal("Sticker Removed", stickerRemoved ? "Yes" : "No");
            setVal("Exterior Lighting OK", form.exteriorLightingOk ? "Yes" : "No");
            setVal("CCTV OK", form.cctvOk ? "Yes" : "No");
            overallStatus = (lockOk && stickerRemoved) ? "พร้อม (Ready)" : "ยังไม่พร้อม (Not Ready)";
        }
        setVal("Overall Status", overallStatus);
        setVal("Other Notes", form.otherNotes || "");

        _invalidateTradingHoursSlimCache();
        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Delete — admin/schedule-admin only ───────────────────────────────────────
function deleteTradingHoursSurveyRecord(id, clientEmail) {
    try {
        var _wlock = _acquireWriteLock_();
        var adminCheck = checkSurveyAdminStatus(clientEmail || Session.getActiveUser().getEmail());
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin) return { success: false, error: "Administrator privileges required." };

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRADING_HOURS_SURVEY_SHEET);
        if (!sheet) return { success: false, error: "Sheet not found" };

        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        var idColIdx = headers.indexOf("ID");
        if (idColIdx === -1) return { success: false, error: "ID column not found" };

        for (var i = 1; i < data.length; i++) {
            if (data[i][idColIdx] == id) {
                sheet.deleteRow(i + 1);
                _invalidateTradingHoursSlimCache();
                return { success: true };
            }
        }
        return { success: false, error: "Record not found" };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Add extra photos to an existing Trading Hours Survey record (Admin/SMF) ─────
// unitKey: attachment category, e.g. "hoursLockPhoto", "hoursStickerPhoto", "hoursObstaclePhoto"
function addTradingHoursSurveyPhotos(id, unitKey, files, clientEmail) {
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
                var filename = "hours_" + id + "_" + unitKey + "_" + ts + "_" + i + "_" + f.name;
                var blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.mimeType || "image/jpeg", filename);
                var file = folder.createFile(blob);
                file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                newUrls.push("https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId());
            }
        }
        if (newUrls.length === 0) return { success: false, error: "No valid files received." };

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRADING_HOURS_SURVEY_SHEET);
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
        _invalidateTradingHoursSlimCache();
        return { success: true, newUrls: newUrls };
    } catch(e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Delete a single photo from an existing Trading Hours Survey record ──────────
function deleteTradingHoursSurveyPhoto(id, unitKey, url, clientEmail) {
    try {
        var _wlock = _acquireWriteLock_();
        var adminCheck = checkSurveyAdminStatus(clientEmail);
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin && !adminCheck.smfEditAllowed) {
            return { success: false, error: "Administrator privileges required." };
        }

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRADING_HOURS_SURVEY_SHEET);
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
        _invalidateTradingHoursSlimCache();
        return { success: true };
    } catch(e) {
        return { success: false, error: e.toString() };
    }
}
