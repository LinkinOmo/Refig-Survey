// --- EDMI Solar Meter Reading Survey ---
// Weekly manual meter-reading form (requested by PPT Netiphong Sarasit, Energy team)
// for stores fitted with Solar Rooftop systems. Technicians photograph the EDMI meter
// display every Friday 11:00-12:00 and record 4 codes:
//   Code 000 = kWh Total (all periods)
//   Code 001 = kWh Total Rate A (Peak, 09:00-22:00)
//   Code 002 = kWh Total Rate B (Off Peak, 22:00-09:00)
//   Code 003 = kWh Total Rate C (Holiday, 00:00-24:00 Sat/Sun/public holiday)

var EDMI_SURVEY_SHEET = "EDMI_Solar_Survey_Database";
var EDMI_SURVEY_FOLDER = "EDMI_Solar_Survey_Attachments";

function processEdmiSolarSurveyForm(form) {
    try {
        var _wlock = _acquireWriteLock_();
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EDMI_SURVEY_SHEET);

        var id = "EDMI-" + new Date().getTime();

        // Handle Attachments (EDMI meter display photo(s))
        var attachmentLinks = {};
        if (form.attachments) {
            var folder;
            var folders = DriveApp.getFoldersByName(EDMI_SURVEY_FOLDER);
            if (folders.hasNext()) { folder = folders.next(); }
            else { folder = DriveApp.createFolder(EDMI_SURVEY_FOLDER); }

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
            "Timestamp":        new Date(),
            "ID":               id,
            "Reporter Email":   form.reporterEmail || "",
            "Reporter Name":    form.reporterName || "",
            "Reporter Phone":   form.reporterPhone || "",
            "Branch Code":      form.branchCode || "",
            "Branch Name":      form.branchName || "",
            "Store Format":     form.storeFormat || "",
            "Solar Phase":      form.solarPhase || "",
            "Reading Date":     form.readingDate || "",
            "Reading Time":     form.readingTime || "",
            "Code000 kWh Total":                form.code000 || "",
            "Code001 kWh Total Rate A (Peak)":   form.code001 || "",
            "Code002 kWh Total Rate B (OffPeak)":form.code002 || "",
            "Code003 kWh Total Rate C (Holiday)":form.code003 || "",
            "Comments":         form.comments || "",
            "DM Area":          form.dmArea || "",
            "CM Area":          form.cmArea || "",
            "AMM MTN":          form.ammMtn || "",
            // Real-world case: the meter's control box/panel was locked or otherwise
            // inaccessible, so no Code values could be read this round. Distinct from
            // just leaving the Codes blank — this is an explicit, reasoned report.
            "Access Blocked":        form.accessBlocked ? "Yes" : "No",
            "Access Blocked Reason": form.accessBlockedReason || "",
            "Attachments_JSON": JSON.stringify(attachmentLinks)
        };

        // Ensure sheet & headers exist
        if (!sheet) {
            sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(EDMI_SURVEY_SHEET);
            sheet.appendRow(Object.keys(dataToSave));
            sheet.setFrozenRows(1);
            var hdrRng = sheet.getRange(1, 1, 1, Object.keys(dataToSave).length);
            hdrRng.setBackground('#b45309');
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
        _invalidateEdmiSlimCache();

        // Email confirmation to reporter
        try {
            var toEmail = form.reporterEmail || Session.getActiveUser().getEmail();
            if (toEmail) {
                var htmlBody = '<html><body style="font-family:sans-serif;color:#333;background:#f4f4f4;margin:0;padding:0;">';
                htmlBody += '<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">';
                htmlBody += '<div style="background:#b45309;color:white;padding:20px;text-align:center;">';
                htmlBody += '<h2 style="margin:0 0 8px 0;">☀️ EDMI Solar Meter Reading</h2>';
                htmlBody += '<p style="margin:0;font-size:14px;">Branch: ' + form.branchCode + ' - ' + form.branchName + '</p>';
                htmlBody += '</div>';
                htmlBody += '<div style="padding:20px;">';
                htmlBody += '<p><b>Reporter:</b> ' + (form.reporterName || toEmail) + '</p>';
                htmlBody += '<p><b>Solar Phase:</b> ' + (form.solarPhase || '-') + ' | <b>Format:</b> ' + (form.storeFormat || '-') + '</p>';
                htmlBody += '<p><b>Reading:</b> ' + (form.readingDate || '-') + ' ' + (form.readingTime || '') + '</p>';
                htmlBody += '<hr/>';

                if (form.accessBlocked) {
                    var _blockedPhotos = attachmentLinks.edmiAccessBlockedPhoto || attachmentLinks.EdmiAccessBlockedPhoto || [];
                    htmlBody += '<div style="margin:0 0 16px;padding:14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;">';
                    htmlBody += '<p style="margin:0 0 6px;color:#b91c1c;font-weight:bold;">🔒 ไม่สามารถอ่านค่าได้ (ตู้ควบคุมมิเตอร์ถูกล็อค / เข้าถึงไม่ได้)</p>';
                    htmlBody += '<p style="margin:0;color:#7f1d1d;">' + (form.accessBlockedReason || '-') + '</p>';
                    if (_blockedPhotos.length > 0) {
                        htmlBody += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">';
                        _blockedPhotos.forEach(function(url) {
                            htmlBody += '<a href="' + url + '" target="_blank" style="display:block;border:2px solid #fca5a5;border-radius:8px;overflow:hidden;">';
                            htmlBody += '<img src="' + url + '" style="max-width:160px;height:auto;display:block;">';
                            htmlBody += '</a>';
                        });
                        htmlBody += '</div>';
                    }
                    htmlBody += '</div>';
                } else {
                    var _codeRows = [
                        { key: 'code000', cat: 'edmiMeter000', label: 'Code 000 (Total)' },
                        { key: 'code001', cat: 'edmiMeter001', label: 'Code 001 (Peak)' },
                        { key: 'code002', cat: 'edmiMeter002', label: 'Code 002 (Off Peak)' },
                        { key: 'code003', cat: 'edmiMeter003', label: 'Code 003 (Holiday)' }
                    ];
                    _codeRows.forEach(function(row) {
                        var photos = attachmentLinks[row.cat] || [];
                        htmlBody += '<div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #f1f5f9;">';
                        htmlBody += '<p style="margin:0 0 6px 0;"><b>' + row.label + ':</b> ' + (form[row.key] || '-') + ' kWh</p>';
                        if (photos.length > 0) {
                            htmlBody += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
                            photos.forEach(function(url) {
                                htmlBody += '<a href="' + url + '" target="_blank" style="display:block;border:2px solid #fcd34d;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">';
                                htmlBody += '<img src="' + url + '" style="max-width:160px;height:auto;display:block;">';
                                htmlBody += '</a>';
                            });
                            htmlBody += '</div>';
                        }
                        htmlBody += '</div>';
                    });
                }

                if (form.comments) htmlBody += '<p style="margin-top:12px;"><b>Comments:</b> ' + form.comments + '</p>';
                htmlBody += '</div></div></body></html>';

                sendAppEmail_({
                    to: toEmail,
                    subject: (form.accessBlocked ? "🔒 EDMI Solar Meter — Access Blocked: " : "EDMI Solar Meter Reading Submitted: ") + form.branchName,
                    htmlBody: htmlBody
                });
            }
        } catch (mailErr) {
            Logger.log("EDMI Survey email error: " + mailErr);
        }

        return { success: true, id: id };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function _invalidateEdmiSlimCache() {
    try {
        var _sc = CacheService.getScriptCache();
        var _nStr = _sc.get('EDMI_SLIM_V1_n');
        if (_nStr !== null) {
            var _n = parseInt(_nStr, 10);
            var _keys = ['EDMI_SLIM_V1_n'];
            for (var _ci = 0; _ci < _n; _ci++) _keys.push('EDMI_SLIM_V1_' + _ci);
            _sc.removeAll(_keys);
        }
    } catch (e) {}
}

// ─── Lightweight list for report table (cached 5 min) ─────────────────────────
function getEdmiSolarSurveyListSlim() {
    try {
        try {
            var _sc = CacheService.getScriptCache();
            var _nStr = _sc.get('EDMI_SLIM_V1_n');
            if (_nStr !== null) {
                var _n = parseInt(_nStr, 10), _json = '', _ok = true;
                for (var _ci = 0; _ci < _n; _ci++) {
                    var _ch = _sc.get('EDMI_SLIM_V1_' + _ci);
                    if (_ch === null) { _ok = false; break; }
                    _json += _ch;
                }
                if (_ok) return { success: true, data: JSON.parse(_json) };
            }
        } catch (_scE) {}

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EDMI_SURVEY_SHEET);
        if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

        var lastCol = sheet.getLastColumn();
        var lastRow = sheet.getLastRow();
        var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

        var LIST_KEYS = ['ID', 'Timestamp', 'Branch Code', 'Branch Name', 'Store Format', 'Solar Phase',
            'Reading Date', 'Reading Time', 'Reporter Name', 'Reporter Email',
            'Code000 kWh Total', 'Code001 kWh Total Rate A (Peak)', 'Code002 kWh Total Rate B (OffPeak)', 'Code003 kWh Total Rate C (Holiday)',
            'DM Area', 'CM Area', 'AMM MTN', 'Access Blocked', 'Access Blocked Reason'];
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
                _store['EDMI_SLIM_V1_' + _nc++] = _cj.substring(_cs, _cs + 90000);
            }
            _store['EDMI_SLIM_V1_n'] = String(_nc);
            _co.putAll(_store, 300);
        } catch (_we) {}

        return { success: true, data: results };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Single full record by ID — used for lazy modal loading ──────────────────
function getEdmiSolarSurveyRecordById(id) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EDMI_SURVEY_SHEET);
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
function updateEdmiSolarSurveyRecord(form) {
    try {
        var _wlock = _acquireWriteLock_();
        var userEmail = form.clientEmail || Session.getActiveUser().getEmail();
        var adminCheck = checkSurveyAdminStatus(userEmail);

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EDMI_SURVEY_SHEET);
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
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin && !adminCheck.smfEditAllowed && !adminCheck.opsEditAllowed && !isOwner) {
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
        setVal("Solar Phase", form.solarPhase);
        // Reading Date/Time are required fields — an empty string here means the edit
        // form's date/time input failed to populate, never a deliberate clear. Writing
        // it would silently wipe a previously-good value (this is how several records
        // lost their Reading Date/Time before the modal's value-formatting was fixed).
        if (form.readingDate) setVal("Reading Date", form.readingDate);
        if (form.readingTime) setVal("Reading Time", form.readingTime);
        setVal("Code000 kWh Total", form.code000);
        setVal("Code001 kWh Total Rate A (Peak)", form.code001);
        setVal("Code002 kWh Total Rate B (OffPeak)", form.code002);
        setVal("Code003 kWh Total Rate C (Holiday)", form.code003);
        setVal("Comments", form.comments);
        // form.accessBlocked is a checkbox .checked boolean from the client, always present —
        // safe to write unconditionally (unlike Reading Date/Time above, there's no "input
        // failed to populate" case for a checkbox).
        setVal("Access Blocked", form.accessBlocked ? "Yes" : "No");
        setVal("Access Blocked Reason", form.accessBlockedReason || "");

        _invalidateEdmiSlimCache();
        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Delete — admin/schedule-admin only ───────────────────────────────────────
function deleteEdmiSolarSurveyRecord(id, clientEmail) {
    try {
        var _wlock = _acquireWriteLock_();
        var adminCheck = checkSurveyAdminStatus(clientEmail || Session.getActiveUser().getEmail());
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin) return { success: false, error: "Administrator privileges required." };

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EDMI_SURVEY_SHEET);
        if (!sheet) return { success: false, error: "Sheet not found" };

        var data = sheet.getDataRange().getValues();
        var headers = data[0];
        var idColIdx = headers.indexOf("ID");
        if (idColIdx === -1) return { success: false, error: "ID column not found" };

        for (var i = 1; i < data.length; i++) {
            if (data[i][idColIdx] == id) {
                sheet.deleteRow(i + 1);
                _invalidateEdmiSlimCache();
                return { success: true };
            }
        }
        return { success: false, error: "Record not found" };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Add extra photos to an existing EDMI record (Admin/SMF, same as Ref Survey) ──
// unitKey: attachment category, e.g. "edmiMeter000".."edmiMeter003" or "edmiAccessBlockedPhoto"
function addEdmiSurveyPhotos(id, unitKey, files, clientEmail) {
    try {
        var adminCheck = checkSurveyAdminStatus(clientEmail);
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin && !adminCheck.smfEditAllowed && !adminCheck.opsEditAllowed) {
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
                var filename = "edmi_" + id + "_" + unitKey + "_" + ts + "_" + i + "_" + f.name;
                var blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.mimeType || "image/jpeg", filename);
                var file = folder.createFile(blob);
                file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                newUrls.push("https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId());
            }
        }
        if (newUrls.length === 0) return { success: false, error: "No valid files received." };

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EDMI_SURVEY_SHEET);
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
        _invalidateEdmiSlimCache();
        return { success: true, newUrls: newUrls };
    } catch(e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Delete a single photo from an existing EDMI record ──────────────────────
function deleteEdmiSurveyPhoto(id, unitKey, url, clientEmail) {
    try {
        var _wlock = _acquireWriteLock_();
        var adminCheck = checkSurveyAdminStatus(clientEmail);
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin && !adminCheck.smfEditAllowed && !adminCheck.opsEditAllowed) {
            return { success: false, error: "Administrator privileges required." };
        }

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EDMI_SURVEY_SHEET);
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
        _invalidateEdmiSlimCache();
        return { success: true };
    } catch(e) {
        return { success: false, error: e.toString() };
    }
}
