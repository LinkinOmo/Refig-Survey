// ============================================================
// UploadSchedule.gs  —  Survey Upload Schedule Management
// ============================================================

var UPLOAD_SCHEDULE_SHEET = "Upload_Schedule";
var UPLOAD_SCHEDULE_META_SHEET = "Upload_Schedule_Meta";
var STORE_DB_URL = "https://docs.google.com/spreadsheets/d/1PiFiOJyxoI6aDR9xdU4HIl8KoDG-50PwYuL4Bm9f8Fk/edit";

// ─── Helpers ────────────────────────────────────────────────

function _getScheduleSheet(createIfMissing) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(UPLOAD_SCHEDULE_SHEET);
    if (!sheet && createIfMissing) {
        sheet = ss.insertSheet(UPLOAD_SCHEDULE_SHEET);
        sheet.appendRow(["Branch Code", "Branch Name", "BU", "Is Critical",
                         "Assigned Date", "Assigned Time", "Status", "Updated At", "Skip Count", "Round"]);
        sheet.setFrozenRows(1);
        // Force date & time columns to plain text so Sheets doesn't auto-convert
        sheet.getRange("E:F").setNumberFormat("@");
    }
    return sheet;
}

function _getMetaSheet(createIfMissing) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(UPLOAD_SCHEDULE_META_SHEET);
    if (!sheet && createIfMissing) {
        sheet = ss.insertSheet(UPLOAD_SCHEDULE_META_SHEET);
        sheet.appendRow(["Key", "Value"]);
    }
    return sheet;
}

function _readMeta() {
    var sheet = _getMetaSheet(false);
    if (!sheet || sheet.getLastRow() < 2) return {};
    var rows = sheet.getDataRange().getValues();
    var meta = {};
    for (var i = 1; i < rows.length; i++) {
        meta[rows[i][0]] = rows[i][1];
    }
    return meta;
}

function _writeMeta(key, value) {
    var sheet = _getMetaSheet(true);
    var rows = sheet.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] === key) {
            sheet.getRange(i + 1, 2).setValue(value);
            return;
        }
    }
    sheet.appendRow([key, value]);
}

// Round label of the currently active Upload Schedule plan (e.g. "2026-Q1").
// Used by the Aircon/Ref survey forms to stamp new submissions with the round
// they were collected under.
function getActiveScheduleRound() {
    try {
        return { round: _readMeta()['round'] || '' };
    } catch (e) {
        return { round: '' };
    }
}

// Return list of working dates (Mon–Sat) between start (exclusive) and end (inclusive)
function _workingDays(startDate, endDate) {
    var days = [];
    var cur = new Date(startDate);
    cur.setDate(cur.getDate() + 1); // start from tomorrow
    cur.setHours(0, 0, 0, 0);
    var end = new Date(endDate);
    end.setHours(23, 59, 59, 0);
    while (cur <= end) {
        var dow = cur.getDay(); // 0=Sun
        if (dow !== 0) { // skip Sunday only
            days.push(new Date(cur));
        }
        cur.setDate(cur.getDate() + 1);
    }
    return days;
}

function _dateStr(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + "-" + m + "-" + day;
}

function _timeStr(h, m) {
    return String(h).padStart(2, '0') + ":" + String(m).padStart(2, '0');
}

// Convert a cell value that may be a Date object or string to "YYYY-MM-DD"
function _cellDateStr(v) {
    if (!v) return "";
    if (v instanceof Date) {
        var y = v.getFullYear();
        var mo = String(v.getMonth() + 1).padStart(2, '0');
        var d  = String(v.getDate()).padStart(2, '0');
        return y + "-" + mo + "-" + d;
    }
    var s = String(v).trim();
    // If it looks like YYYY-MM-DD already, return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // Try parsing (e.g. "MM/DD/YYYY" or locale string)
    var parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
        var y2 = parsed.getFullYear();
        var mo2 = String(parsed.getMonth() + 1).padStart(2, '0');
        var d2  = String(parsed.getDate()).padStart(2, '0');
        return y2 + "-" + mo2 + "-" + d2;
    }
    return s;
}

// ─── Load all stores from external sheet ────────────────────

function _loadAllStores(includeInactive) {
    try {
        var ss = SpreadsheetApp.openByUrl(STORE_DB_URL);
        var sheet = ss.getSheets()[0];
        var data = sheet.getDataRange().getValues();
        var headers = data[0];

        var idIdx = -1, nameIdx = -1, buIdx = -1, statusIdx = -1;
        for (var i = 0; i < headers.length; i++) {
            var h = String(headers[i]).trim().toLowerCase();
            if (h.includes("store id") || h.includes("site id") || h === "code") idIdx = i;
            if (h.includes("store name") || h.includes("site name")) nameIdx = i;
            if (h === "bu" || h.includes("business unit") || h === "format") buIdx = i;
            if (h === "status") statusIdx = i;
        }

        var stores = [];
        for (var r = 1; r < data.length; r++) {
            var row = data[r];
            var code       = idIdx     >= 0 ? String(row[idIdx]).trim()     : "";
            var name       = nameIdx   >= 0 ? String(row[nameIdx]).trim()   : "";
            var bu         = buIdx     >= 0 ? String(row[buIdx]).trim()     : "";
            var storeStatus = statusIdx >= 0 ? String(row[statusIdx]).trim() : "A";

            // If includeInactive is falsy, only include active stores (Status = "A")
            if (!includeInactive && storeStatus !== "A") continue;

            // Fallback: extract code from name if missing (e.g. "StoreName-12345")
            if ((!code || code === "" || code === "undefined") && name.includes("-")) {
                var lastDash = name.lastIndexOf("-");
                var potentialId = name.substring(lastDash + 1).trim();
                if (/^\d+$/.test(potentialId)) {
                    code = potentialId;
                    name = name.substring(0, lastDash).trim();
                }
            }

            if (name && name !== "" && name !== "undefined") {
                stores.push({ code: code || name, name: name, bu: bu, storeStatus: storeStatus });
            }
        }
        return stores;
    } catch (e) {
        Logger.log("_loadAllStores Error: " + e.toString());
        return [];
    }
}

// For each branch code, whether Aircon_Survey_Database / Ref_Survey_Database
// has at least one real (non-Draft) submission on file. A code that never
// appears in a sheet at all, or only appears with Status="Draft" rows, comes
// back false for that type — used by createUploadSchedule to prioritize
// stores we have no usable data on.
function _getSurveyDataCoverage() {
    var coverage = {}; // code -> { Aircon: bool, Ref: bool }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetDefs = [
        { name: 'Aircon_Survey_Database', typeKey: 'Aircon' },
        { name: 'Ref_Survey_Database',    typeKey: 'Ref' }
    ];

    sheetDefs.forEach(function(def) {
        var sheet = ss.getSheetByName(def.name);
        if (!sheet || sheet.getLastRow() < 2) return;

        var data    = sheet.getDataRange().getValues();
        var headers = data[0];
        var codeIdx = -1, statusIdx = -1;
        for (var h = 0; h < headers.length; h++) {
            var hdr = String(headers[h]).toLowerCase().trim();
            if (hdr === 'branch code') codeIdx   = h;
            if (hdr === 'status')      statusIdx = h;
        }
        if (codeIdx < 0) return;

        for (var i = 1; i < data.length; i++) {
            var row    = data[i];
            var code   = String(row[codeIdx] || '').trim();
            if (!code) continue;
            var status = statusIdx >= 0 ? String(row[statusIdx] || '').trim() : '';

            if (!coverage[code]) coverage[code] = {};
            if (status && status !== 'Draft') {
                coverage[code][def.typeKey] = true;
            } else if (coverage[code][def.typeKey] === undefined) {
                coverage[code][def.typeKey] = false; // seen only Draft rows so far
            }
        }
    });

    return coverage;
}

// ─── Create Schedule ────────────────────────────────────────

function createUploadSchedule(params) {
    /*
     params = {
       startDate:      "YYYY-MM-DD"  (optional, default today),
       deadline:       "YYYY-MM-DD",
       uploadTimeFrom: "HH:MM"       (optional, default "08:00"),
       uploadTimeTo:   "HH:MM"       (optional, default "17:00"),
       criticalCodes:  ["12345","67890", ...],
       excludedCodes:  ["11111","22222", ...],
       maxPerDay:      60  (optional, default 80)
     }
    */
    try {
        var _wlock = _acquireWriteLock_();
        var round = String(params.round || '').trim();
        if (!round) {
            return { success: false, error: "Round label is required (e.g. \"2026-Q1\")" };
        }
        var deadline    = new Date(params.deadline);
        var criticalSet = {};
        (params.criticalCodes || []).forEach(function(c) { criticalSet[c.trim()] = true; });
        var maxPerDay   = parseInt(params.maxPerDay) || 80;

        // Start date (defaults to today)
        var startDate = params.startDate ? new Date(params.startDate) : new Date();
        startDate.setHours(0, 0, 0, 0);

        // Upload time window
        var timeFromStr = params.uploadTimeFrom || "08:00";
        var timeToStr   = params.uploadTimeTo   || "17:00";
        var _parseMins  = function(t) { var p = t.split(':'); return parseInt(p[0]) * 60 + parseInt(p[1]); };
        var workStart   = _parseMins(timeFromStr);
        var workEnd     = _parseMins(timeToStr);
        if (workEnd <= workStart) {
            return { success: false, error: "uploadTimeTo must be after uploadTimeFrom" };
        }

        if (deadline <= startDate) {
            return { success: false, error: "Deadline must be after start date" };
        }

        // 1. Load all stores
        var allStores = _loadAllStores();
        if (allStores.length === 0) {
            return { success: false, error: "Could not load store data" };
        }

        // 1b. Filter by selectedBUs if provided
        var selectedBUs = params.selectedBUs || [];
        if (selectedBUs.length > 0) {
            var buSet = {};
            selectedBUs.forEach(function(b) { buSet[b.trim().toLowerCase()] = true; });
            allStores = allStores.filter(function(s) {
                return s.bu && buSet[s.bu.trim().toLowerCase()];
            });
            if (allStores.length === 0) {
                return { success: false, error: "ไม่พบสาขาใน BU ที่เลือก: " + selectedBUs.join(', ') };
            }
        }

        // 1c. Filter out excluded stores
        var excludedSet = {};
        (params.excludedCodes || []).forEach(function(c) { excludedSet[c.trim()] = true; });
        if (Object.keys(excludedSet).length > 0) {
            allStores = allStores.filter(function(s) { return !excludedSet[s.code]; });
        }

        // 2. Split into critical / no-data-or-fragmented / regular.
        // "No data" = for Aircon and/or Ref, this store has never had a real
        // (non-Draft) submission on file — either no row at all, or only
        // abandoned Drafts. These get scheduled right after Critical so gaps
        // in our data get closed first, without stealing the Critical badge
        // from stores an admin explicitly flagged.
        var coverage = _getSurveyDataCoverage();
        var byBuCode = function(a, b) {
            if (a.bu !== b.bu) return a.bu.localeCompare(b.bu);
            return a.code.localeCompare(b.code);
        };

        var critical = [], noData = [], regular = [];
        allStores.forEach(function(s) {
            if (criticalSet[s.code]) { critical.push(s); return; }
            var cov = coverage[s.code];
            var hasAircon = !!(cov && cov.Aircon);
            var hasRef    = !!(cov && cov.Ref);
            if (!hasAircon || !hasRef) noData.push(s);
            else regular.push(s);
        });

        noData.sort(byBuCode);
        regular.sort(byBuCode);

        // All stores ordered: critical first, then no-data/fragmented, then regular
        var ordered = critical.concat(noData).concat(regular);

        // 3. Get working days (from startDate to deadline)
        var days = _workingDays(startDate, deadline);
        if (days.length === 0) {
            return { success: false, error: "No working days found before deadline" };
        }

        // 4. Calculate slots per day (cap at maxPerDay)
        var totalStores = ordered.length;
        var slotsPerDay = Math.min(maxPerDay, Math.ceil(totalStores / days.length));

        // Distribute stores into days
        var schedule = []; // [{store, date, time}]
        var storeIdx = 0;
        // workStart / workEnd already set above from params

        for (var di = 0; di < days.length && storeIdx < ordered.length; di++) {
            var dayStores = ordered.slice(storeIdx, storeIdx + slotsPerDay);
            var interval  = dayStores.length > 1
                ? Math.floor((workEnd - workStart) / (dayStores.length - 1))
                : 0;
            dayStores.forEach(function(store, si) {
                var mins  = workStart + (interval * si);
                var h     = Math.floor(mins / 60);
                var m     = mins % 60;
                schedule.push({
                    code:     store.code,
                    name:     store.name,
                    bu:       store.bu,
                    critical: criticalSet[store.code] ? "Yes" : "No",
                    date:     _dateStr(days[di]),
                    time:     _timeStr(h, m),
                    status:   "Pending",
                    round:    round
                });
            });
            storeIdx += slotsPerDay;
        }

        // 5. Write to sheet (clear + rewrite)
        var sheet = _getScheduleSheet(true);
        var lastRow = sheet.getLastRow();
        if (lastRow > 1) {
            sheet.getRange(2, 1, lastRow - 1, 10).clearContent();
        }

        if (schedule.length > 0) {
            var rows = schedule.map(function(s) {
                return [s.code, s.name, s.bu, s.critical, s.date, s.time, s.status, new Date(), 0, s.round];
            });
            // Force text format on date (col 5) and time (col 6) before writing
            sheet.getRange(2, 5, rows.length, 1).setNumberFormat("@");
            sheet.getRange(2, 6, rows.length, 1).setNumberFormat("@");
            sheet.getRange(2, 1, rows.length, 10).setValues(rows);
        }

        // 6. Save meta
        _writeMeta("startDate",      params.startDate || _dateStr(startDate));
        _writeMeta("deadline",       params.deadline);
        _writeMeta("uploadTimeFrom", timeFromStr);
        _writeMeta("uploadTimeTo",   timeToStr);
        _writeMeta("criticalCodes",  JSON.stringify(params.criticalCodes || []));
        _writeMeta("maxPerDay",      String(maxPerDay));
        _writeMeta("totalStores",    String(schedule.length));
        _writeMeta("createdAt",      new Date().toISOString());
        _writeMeta("round",          round);

        // Invalidate cache
        CacheService.getScriptCache().remove("UPLOAD_SCHEDULE_SUMMARY");

        return {
            success:      true,
            totalStores:  schedule.length,
            totalCritical: critical.length,
            totalNoData:  noData.length,
            totalDays:    days.length,
            storesPerDay: slotsPerDay,
            deadline:     params.deadline
        };

    } catch (e) {
        Logger.log("createUploadSchedule Error: " + e.toString());
        return { success: false, error: e.toString() };
    }
}

// ─── Get Schedule Summary ───────────────────────────────────

function getUploadScheduleSummary() {
    try {
        var cache = CacheService.getScriptCache();
        var cached = cache.get("UPLOAD_SCHEDULE_SUMMARY");
        if (cached) {
            try {
                return JSON.parse(cached);
            } catch (parseErr) {
                // Corrupted/truncated cache — evict and re-read from sheet
                cache.remove("UPLOAD_SCHEDULE_SUMMARY");
            }
        }

        var sheet = _getScheduleSheet(false);
        if (!sheet || sheet.getLastRow() < 2) {
            return { exists: false };
        }

        var meta = _readMeta();
        var data = sheet.getDataRange().getValues();
        // headers: code, name, bu, critical, date, time, status, updatedAt

        var total = 0, critical = 0, uploaded = 0;
        var dateCountMap = {};
        var lastUploadedMs = 0;

        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            if (!row[0]) continue;
            total++;
            if (row[3] === "Yes") critical++;
            if (row[6] === "Uploaded") {
                uploaded++;
                if (row[7]) {
                    var uTs = row[7] instanceof Date ? row[7].getTime() : new Date(row[7]).getTime();
                    if (!isNaN(uTs) && uTs > lastUploadedMs) lastUploadedMs = uTs;
                }
            }
            var d = _cellDateStr(row[4]);
            dateCountMap[d] = (dateCountMap[d] || 0) + 1;
        }

        // Build day list sorted
        var days = Object.keys(dateCountMap).sort();

        var result = {
            exists:          true,
            round:           meta["round"]          || "",
            startDate:       meta["startDate"]      || "",
            deadline:        meta["deadline"]       || "",
            uploadTimeFrom:  meta["uploadTimeFrom"] || "08:00",
            uploadTimeTo:    meta["uploadTimeTo"]   || "17:00",
            createdAt:       meta["createdAt"]      || "",
            maxPerDay:       parseInt(meta["maxPerDay"]) || 80,
            criticalCodes:   JSON.parse(meta["criticalCodes"] || "[]"),
            total:           total,
            critical:        critical,
            uploaded:        uploaded,
            pending:         total - uploaded,
            days:            days,
            dayCount:        days.length,
            lastUploadedAt:  lastUploadedMs > 0 ? new Date(lastUploadedMs).toISOString() : ""
        };

        cache.put("UPLOAD_SCHEDULE_SUMMARY", JSON.stringify(result), 120);
        return result;

    } catch (e) {
        Logger.log("getUploadScheduleSummary Error: " + e.toString());
        return { exists: false, error: e.toString() };
    }
}

// ─── Get Schedule by Date ───────────────────────────────────

function getScheduleByDate(dateStr) {
    try {
        var sheet = _getScheduleSheet(false);
        if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

        var data = sheet.getDataRange().getValues();
        var result = [];

        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            if (!row[0]) continue;
            if (_cellDateStr(row[4]) === dateStr) {
                result.push({
                    code:      String(row[0]),
                    name:      String(row[1]),
                    bu:        String(row[2]),
                    critical:  String(row[3]),
                    date:      _cellDateStr(row[4]),
                    time:      String(row[5]),
                    status:    String(row[6]),
                    skipCount: parseInt(row[8]) || 0,
                    round:     String(row[9] || '').trim(),
                    rowIdx:    i + 1
                });
            }
        }

        // Sort by time
        result.sort(function(a, b) { return a.time.localeCompare(b.time); });
        return { success: true, data: result, total: result.length };

    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Search Branch Schedule ─────────────────────────────────

function getScheduleForBranch(searchTerm) {
    try {
        var sheet = _getScheduleSheet(false);
        if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

        var data   = sheet.getDataRange().getValues();
        var term   = searchTerm.trim().toLowerCase();
        var result = [];
        var codeSet = {};

        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            if (!row[0]) continue;
            var code = String(row[0]);
            if (code.toLowerCase().includes(term) || String(row[1]).toLowerCase().includes(term)) {
                result.push({
                    code:         code,
                    name:         String(row[1]),
                    bu:           String(row[2]),
                    critical:     String(row[3]),
                    date:         _cellDateStr(row[4]),
                    time:         String(row[5]),
                    status:       String(row[6]),
                    skipCount:    parseInt(row[8]) || 0,
                    round:        String(row[9] || '').trim(),
                    hasAircon: false, airconStatus: '', airconTs: '',
                    hasRef:    false, refStatus:    '', refTs:    ''
                });
                codeSet[code] = true;
            }
        }
        if (result.length === 0) return { success: true, data: result };

        // Enrich with latest non-Draft survey status per branch
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheetDefs = [
            { name: 'Aircon_Survey_Database', isAircon: true },
            { name: 'Ref_Survey_Database',    isAircon: false }
        ];
        var byCode       = { Aircon: {}, Ref: {} }; // key: "code|round"
        var byCodeLegacy = { Aircon: {}, Ref: {} }; // key: code (no round on either side)
        sheetDefs.forEach(function(def) {
            var sht = ss.getSheetByName(def.name);
            if (!sht || sht.getLastRow() < 2) return;
            var sData = sht.getDataRange().getValues();
            var hdrs = sData[0];
            var tsIdx = -1, codeIdx = -1, statusIdx = -1, roundIdx = -1;
            for (var h = 0; h < hdrs.length; h++) {
                var hdr = String(hdrs[h]).toLowerCase().trim();
                if (hdr === 'timestamp')    tsIdx     = h;
                if (hdr === 'branch code')  codeIdx   = h;
                if (hdr === 'status')       statusIdx = h;
                if (hdr === 'survey round') roundIdx  = h;
            }
            if (codeIdx < 0) return;
            var typeKey = def.isAircon ? 'Aircon' : 'Ref';
            for (var i = 1; i < sData.length; i++) {
                var sRow  = sData[i];
                var sCode = String(sRow[codeIdx] || '').trim();
                if (!sCode || !codeSet[sCode]) continue;
                var status = statusIdx >= 0 ? String(sRow[statusIdx] || '').trim() : '';
                if (!status || status === 'Draft') continue;
                var sRound = roundIdx >= 0 ? String(sRow[roundIdx] || '').trim() : '';
                var tsRaw  = tsIdx >= 0 ? sRow[tsIdx] : '';
                var tsDate = tsRaw instanceof Date ? tsRaw : new Date(String(tsRaw));
                var tsMs   = isNaN(tsDate) ? 0 : tsDate.getTime();
                var tsStr  = tsMs > 0 ? Utilities.formatDate(tsDate, Session.getScriptTimeZone(), 'dd/MM/yy HH:mm') : '-';
                var sKey = sCode + '|' + sRound;
                var existing = byCode[typeKey][sKey];
                if (!existing || tsMs > existing.tsMs) {
                    byCode[typeKey][sKey] = { status: status, tsMs: tsMs, tsStr: tsStr };
                }
                if (!sRound) {
                    var legacyExisting = byCodeLegacy[typeKey][sCode];
                    if (!legacyExisting || tsMs > legacyExisting.tsMs) {
                        byCodeLegacy[typeKey][sCode] = { status: status, tsMs: tsMs, tsStr: tsStr };
                    }
                }
            }
        });
        result.forEach(function(r) {
            var key = r.code + '|' + r.round;
            var ac = byCode.Aircon[key] || (!r.round ? byCodeLegacy.Aircon[r.code] : null);
            if (ac) { r.hasAircon = true; r.airconStatus = ac.status; r.airconTs = ac.tsStr; }
            var rf = byCode.Ref[key] || (!r.round ? byCodeLegacy.Ref[r.code] : null);
            if (rf) { r.hasRef = true; r.refStatus = rf.status; r.refTs = rf.tsStr; }
        });

        return { success: true, data: result };

    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Reschedule Overdue Pending Branches ────────────────────

function rescheduleOverdue() {
    try {
        var _wlock = _acquireWriteLock_();
        var sheet = _getScheduleSheet(false);
        if (!sheet || sheet.getLastRow() < 2) return { success: true, rescheduled: 0 };

        var now = new Date();
        var todayStr = _dateStr(now);
        var currentTimeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

        var data = sheet.getDataRange().getValues();
        var meta = _readMeta();
        var maxPerDay = parseInt(meta['maxPerDay']) || 80;
        var deadline  = meta['deadline'] || '';

        // Build date → count of Pending rows AFTER today (for capacity checking)
        var dateCount = {};
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            if (!row[0] || row[6] === 'Uploaded') continue;
            var d = _cellDateStr(row[4]);
            if (d > todayStr) dateCount[d] = (dateCount[d] || 0) + 1;
        }

        // Collect overdue rows (Pending, date is past, or today and time has passed)
        var overdueRows = [];
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            if (!row[0] || row[6] === 'Uploaded') continue;
            var rowDate = _cellDateStr(row[4]);
            var rowTime = String(row[5]);
            var overdue = rowDate < todayStr ||
                          (rowDate === todayStr && rowTime <= currentTimeStr);
            if (overdue) overdueRows.push({ rowIdx: i + 1, skipCount: parseInt(row[8]) || 0 });
        }

        if (overdueRows.length === 0) return { success: true, rescheduled: 0 };

        // Working days from tomorrow up to deadline (or +30 days as fallback)
        var tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        var deadlineDate = deadline
            ? new Date(deadline + 'T23:59:59')
            : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        var futureDays = _workingDays(new Date(now.getTime() - 86400000), deadlineDate);
        if (futureDays.length === 0) futureDays = [tomorrow]; // safety fallback

        var workStart = 8 * 60;   // 08:00
        var workEnd   = 17 * 60;  // 17:00

        overdueRows.forEach(function(item) {
            // Find first future day with capacity
            var assignedDay = null;
            for (var k = 0; k < futureDays.length; k++) {
                var ds = _dateStr(futureDays[k]);
                if ((dateCount[ds] || 0) < maxPerDay) {
                    assignedDay = ds;
                    break;
                }
            }
            if (!assignedDay) assignedDay = _dateStr(futureDays[futureDays.length - 1]);

            // Compute time: spread across working hours based on slot position
            var slotPos = dateCount[assignedDay] || 0;
            var interval = maxPerDay > 1 ? Math.floor((workEnd - workStart) / (maxPerDay - 1)) : 0;
            var mins = workStart + interval * slotPos;
            if (mins >= workEnd) mins = workEnd - 1;
            var newTime = _timeStr(Math.floor(mins / 60), mins % 60);

            dateCount[assignedDay] = (dateCount[assignedDay] || 0) + 1;

            // Write new date (col5), time (col6), updatedAt (col8), skipCount (col9)
            sheet.getRange(item.rowIdx, 5).setNumberFormat('@').setValue(assignedDay);
            sheet.getRange(item.rowIdx, 6).setNumberFormat('@').setValue(newTime);
            sheet.getRange(item.rowIdx, 8).setValue(new Date());
            sheet.getRange(item.rowIdx, 9).setValue(item.skipCount + 1);
        });

        CacheService.getScriptCache().remove('UPLOAD_SCHEDULE_SUMMARY');
        return { success: true, rescheduled: overdueRows.length };

    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Get Schedule by Date Range (enriched with survey data) ──

function getDailyScheduleWithSurvey(fromDate, toDate) {
    try {
        var sheet = _getScheduleSheet(false);
        if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

        var data = sheet.getDataRange().getValues();
        var rows = [];
        var codeSet = {};

        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            if (!row[0]) continue;
            var d = _cellDateStr(row[4]);
            if (d < fromDate || d > toDate) continue;
            var code = String(row[0]).trim();
            codeSet[code] = true;
            rows.push({
                code:         code,
                name:         String(row[1] || '').trim(),
                bu:           String(row[2] || '').trim(),
                critical:     String(row[3] || ''),
                date:         d,
                time:         String(row[5] || '').trim(),
                status:       String(row[6] || '').trim(),
                skipCount:    parseInt(row[8]) || 0,
                round:        String(row[9] || '').trim(),
                rowIdx:       i + 1,
                hasAircon:    false, airconStatus: '', airconTs: '',
                hasRef:       false, refStatus:    '', refTs:    ''
            });
        }

        if (rows.length === 0) return { success: true, data: [] };

        // Enrich from survey sheets (latest non-Draft per code)
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheetDefs = [
            { name: 'Aircon_Survey_Database', isAircon: true },
            { name: 'Ref_Survey_Database',    isAircon: false }
        ];
        var byCode       = { Aircon: {}, Ref: {} }; // key: "code|round"
        var byCodeLegacy = { Aircon: {}, Ref: {} }; // key: code (rows with no round on either side)

        sheetDefs.forEach(function(def) {
            var sht = ss.getSheetByName(def.name);
            if (!sht || sht.getLastRow() < 2) return;
            var sData   = sht.getDataRange().getValues();
            var hdrs    = sData[0];
            var tsIdx = -1, codeIdx = -1, statusIdx = -1, roundIdx = -1;
            for (var h = 0; h < hdrs.length; h++) {
                var hdr = String(hdrs[h]).toLowerCase().trim();
                if (hdr === 'timestamp')    tsIdx     = h;
                if (hdr === 'branch code')  codeIdx   = h;
                if (hdr === 'status')       statusIdx = h;
                if (hdr === 'survey round') roundIdx  = h;
            }
            if (codeIdx < 0) return;
            var typeKey = def.isAircon ? 'Aircon' : 'Ref';
            for (var i = 1; i < sData.length; i++) {
                var row    = sData[i];
                var code   = String(row[codeIdx] || '').trim();
                if (!code || !codeSet[code]) continue;
                var status = statusIdx >= 0 ? String(row[statusIdx] || '').trim() : '';
                if (!status || status === 'Draft') continue;
                var round  = roundIdx >= 0 ? String(row[roundIdx] || '').trim() : '';
                var tsRaw  = tsIdx >= 0 ? row[tsIdx] : '';
                var tsDate = tsRaw instanceof Date ? tsRaw : new Date(String(tsRaw));
                var tsMs   = isNaN(tsDate) ? 0 : tsDate.getTime();
                var tsStr  = tsMs > 0 ? Utilities.formatDate(tsDate, Session.getScriptTimeZone(), 'dd/MM/yy HH:mm') : '-';

                // Key on "code|round" so a completed survey from an earlier round
                // doesn't get credited against a later round's schedule entry.
                // The legacy (code-only) map keeps the old behavior for records
                // submitted before the Survey Round field existed.
                var key = code + '|' + round;
                var existing = byCode[typeKey][key];
                if (!existing || tsMs > existing.tsMs) {
                    byCode[typeKey][key] = { status: status, tsMs: tsMs, tsStr: tsStr };
                }
                if (!round) {
                    var legacyExisting = byCodeLegacy[typeKey][code];
                    if (!legacyExisting || tsMs > legacyExisting.tsMs) {
                        byCodeLegacy[typeKey][code] = { status: status, tsMs: tsMs, tsStr: tsStr };
                    }
                }
            }
        });

        rows.forEach(function(r) {
            var key = r.code + '|' + r.round;
            var ac = byCode.Aircon[key] || (!r.round ? byCodeLegacy.Aircon[r.code] : null);
            if (ac) { r.hasAircon = true; r.airconStatus = ac.status; r.airconTs = ac.tsStr; }
            var rf = byCode.Ref[key] || (!r.round ? byCodeLegacy.Ref[r.code] : null);
            if (rf) { r.hasRef = true; r.refStatus = rf.status; r.refTs = rf.tsStr; }
        });

        rows.sort(function(a, b) {
            var da = (a.date || '') + (a.time || '');
            var db = (b.date || '') + (b.time || '');
            return da < db ? -1 : da > db ? 1 : 0;
        });

        return { success: true, data: rows };
    } catch(e) {
        Logger.log('getDailyScheduleWithSurvey Error: ' + e.toString());
        return { success: false, error: e.toString() };
    }
}

// ─── Sync Schedule Status from Survey Databases ──────────────
// A branch is marked "Uploaded" only when ALL submitted survey types
// (Aircon AND/OR Ref, whichever were submitted) are in a done status.

function syncScheduleWithSurveyDb() {
    try {
        var _wlock = _acquireWriteLock_();
        var scheduleSheet = _getScheduleSheet(false);
        if (!scheduleSheet || scheduleSheet.getLastRow() < 2) {
            return { success: true, synced: 0 };
        }

        var ss          = SpreadsheetApp.getActiveSpreadsheet();

        // byCompound: "code|type" -> { tsDate, status }
        var byCompound = {};

        var sheetDefs = [
            { name: 'Aircon_Survey_Database', type: 'Aircon' },
            { name: 'Ref_Survey_Database',    type: 'Ref' }
        ];

        sheetDefs.forEach(function(def) {
            var sheet = ss.getSheetByName(def.name);
            if (!sheet || sheet.getLastRow() < 2) return;

            var data    = sheet.getDataRange().getValues();
            var headers = data[0];
            var tsIdx = -1, codeIdx = -1, statusIdx = -1;

            for (var h = 0; h < headers.length; h++) {
                var hdr = String(headers[h]).toLowerCase().trim();
                if (hdr === 'timestamp')   tsIdx     = h;
                if (hdr === 'branch code') codeIdx   = h;
                if (hdr === 'status')      statusIdx = h;
            }
            if (codeIdx < 0) codeIdx = 4;
            if (tsIdx   < 0) tsIdx   = 0;

            for (var i = 1; i < data.length; i++) {
                var row    = data[i];
                var code   = String(row[codeIdx] || '').trim();
                var status = statusIdx >= 0 ? String(row[statusIdx] || '').trim() : '';
                var ts     = row[tsIdx];
                var tsDate = ts instanceof Date ? ts : new Date(ts);
                // Any non-Draft submission counts as uploaded for schedule purposes
                if (!code || isNaN(tsDate) || !status || status === 'Draft') continue;

                var key      = code + '|' + def.type;
                var existing = byCompound[key];
                if (!existing || tsDate > existing.tsDate) {
                    byCompound[key] = { tsDate: tsDate, status: status };
                }
            }
        });

        // Group by branch code; any non-Draft submission qualifies
        var branchReady = {};  // code -> latest tsDate
        var branchTypes = {};  // code -> { Aircon: entry, Ref: entry }
        Object.keys(byCompound).forEach(function(key) {
            var parts = key.split('|');
            var code  = parts[0], type = parts[1];
            if (!branchTypes[code]) branchTypes[code] = {};
            branchTypes[code][type] = byCompound[key];
        });
        Object.keys(branchTypes).forEach(function(code) {
            var types   = branchTypes[code];
            var entries = Object.keys(types).map(function(t) { return types[t]; });
            var latest = entries.reduce(function(mx, e) { return e.tsDate > mx ? e.tsDate : mx; }, new Date(0));
            branchReady[code] = latest;
        });

        // Scan schedule sheet and mark matching Pending rows as Uploaded
        var schedData = scheduleSheet.getDataRange().getValues();
        var synced    = 0;
        for (var j = 1; j < schedData.length; j++) {
            var srow  = schedData[j];
            if (!srow[0] || srow[6] === 'Uploaded') continue;
            var sCode = String(srow[0]).trim();
            if (branchReady[sCode]) {
                scheduleSheet.getRange(j + 1, 7).setValue('Uploaded');
                scheduleSheet.getRange(j + 1, 8).setValue(branchReady[sCode]);
                synced++;
            }
        }

        if (synced > 0) CacheService.getScriptCache().remove('UPLOAD_SCHEDULE_SUMMARY');

        return { success: true, synced: synced };

    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Mark Branch as Uploaded ────────────────────────────────

function markBranchUploaded(branchCode) {
    try {
        var _wlock = _acquireWriteLock_();
        var sheet = _getScheduleSheet(false);
        if (!sheet) return { success: false, error: "Schedule not found" };

        var data = sheet.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) {
            if (String(data[i][0]).trim() === String(branchCode).trim()) {
                sheet.getRange(i + 1, 7).setValue("Uploaded");
                sheet.getRange(i + 1, 8).setValue(new Date());
                CacheService.getScriptCache().remove("UPLOAD_SCHEDULE_SUMMARY");
                return { success: true };
            }
        }
        return { success: false, error: "Branch not found in schedule" };

    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Clear Schedule ─────────────────────────────────────────

function clearUploadSchedule() {
    try {
        var sheet = _getScheduleSheet(false);
        if (sheet && sheet.getLastRow() > 1) {
            sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).clearContent();
        }
        var metaSheet = _getMetaSheet(false);
        if (metaSheet && metaSheet.getLastRow() > 1) {
            metaSheet.getRange(2, 1, metaSheet.getLastRow() - 1, 2).clearContent();
        }
        CacheService.getScriptCache().remove("UPLOAD_SCHEDULE_SUMMARY");
        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Get list of days that have scheduled stores ─────────────

function getScheduleDayList() {
    try {
        var summary = getUploadScheduleSummary();
        if (!summary.exists) return { success: true, days: [] };
        return { success: true, days: summary.days, total: summary.total, uploaded: summary.uploaded };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Guest Button Setting ────────────────────────────────────

function getGuestButtonSetting() {
    var val = PropertiesService.getScriptProperties().getProperty('GUEST_BUTTON_ENABLED');
    return val === null ? false : (val === 'true');
}

function setGuestButtonSetting(enabled) {
    try {
        PropertiesService.getScriptProperties().setProperty('GUEST_BUTTON_ENABLED', enabled ? 'true' : 'false');
        return { success: true, enabled: enabled };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── General-User Tab Visibility Setting ──────────────────────
// Lets an Admin/System Admin temporarily restrict which of the general-user
// tabs (Aircon/Ref/NP/EDMI surveys, Register Profile) are shown to non-admin
// users — e.g. showing only the EDMI Solar Meter survey on a collection day.
// Stored as a JSON map {tabId: true/false}; a tab missing from the map
// defaults to visible (so adding a brand-new tab never silently hides it).
// Also stores which of those tabs opens by default when the app first loads
// (GENERAL_DEFAULT_TAB_V1), so an Admin can e.g. land everyone on EDMI Solar
// Meter on a collection day instead of the usual Aircon Survey tab.

function getGeneralTabVisibility() {
    try {
        var val = PropertiesService.getScriptProperties().getProperty('GENERAL_TAB_VISIBILITY_V1');
        var config = val ? JSON.parse(val) : {};
        var defaultTab = PropertiesService.getScriptProperties().getProperty('GENERAL_DEFAULT_TAB_V1') || 'tab-aircon-survey';
        return { success: true, data: config, defaultTab: defaultTab };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function setGeneralTabVisibility(config, defaultTab, clientEmail) {
    try {
        var status = checkAdminStatus(clientEmail);
        if (!status.isAdmin && !status.isSysAdmin) return { success: false, error: "Administrator privileges required." };
        PropertiesService.getScriptProperties().setProperty('GENERAL_TAB_VISIBILITY_V1', JSON.stringify(config || {}));
        if (defaultTab) {
            PropertiesService.getScriptProperties().setProperty('GENERAL_DEFAULT_TAB_V1', defaultTab);
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Team-Restricted Tab Access ────────────────────────────────
// Generalizes the Trading Hours Survey's "SMF team only" requirement so any future
// tab can be locked to a specific team (rather than all general/Operation users) via
// admin config instead of a hardcoded check. Stored as {tabId: 'SMF'|'MMS'|'ALL'};
// a tab missing from the stored config falls back to TEAM_TAB_DEFAULTS below, so a
// newly added restricted tab is never silently opened to everyone before an Admin
// configures it. Mirrors General Tab Visibility above (same modal on the client).
var TEAM_TAB_DEFAULTS = { 'tab-hours-survey': 'SMF' };

function getTeamTabAccess() {
    try {
        var val = PropertiesService.getScriptProperties().getProperty('TEAM_TAB_ACCESS_V1');
        var stored = val ? JSON.parse(val) : {};
        var merged = {};
        Object.keys(TEAM_TAB_DEFAULTS).forEach(function(id) { merged[id] = TEAM_TAB_DEFAULTS[id]; });
        Object.keys(stored).forEach(function(id) { merged[id] = stored[id]; });
        return { success: true, data: merged };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function setTeamTabAccess(config, clientEmail) {
    try {
        var status = checkAdminStatus(clientEmail);
        if (!status.isAdmin && !status.isSysAdmin) return { success: false, error: "Administrator privileges required." };
        PropertiesService.getScriptProperties().setProperty('TEAM_TAB_ACCESS_V1', JSON.stringify(config || {}));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── SMF Admin Access Setting ────────────────────────────────

function getSMFAdminSetting() {
    var val = PropertiesService.getScriptProperties().getProperty('SMF_ADMIN_ENABLED');
    return val === 'true';
}

function setSMFAdminSetting(enabled) {
    try {
        PropertiesService.getScriptProperties().setProperty('SMF_ADMIN_ENABLED', enabled ? 'true' : 'false');
        return { success: true, enabled: enabled };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── SMF Survey Data Edit Setting ─────────────────────────────
// Narrower than SMF_ADMIN_ENABLED above — that toggle grants SMF team members
// full Admin rights everywhere. This one only controls whether SMF can edit
// survey data (Ref/EDMI report fields + photo reupload), checked via
// checkSurveyAdminStatus().smfEditAllowed in Survey.gs. Defaults to true so
// existing SMF edit access (previously hardcoded on) doesn't regress silently.

function getSmfSurveyEditSetting() {
    var val = PropertiesService.getScriptProperties().getProperty('SMF_SURVEY_EDIT_ENABLED_V1');
    return val === null ? true : (val === 'true');
}

function setSmfSurveyEditSetting(enabled, clientEmail) {
    try {
        var status = checkAdminStatus(clientEmail);
        if (!status.isAdmin && !status.isSysAdmin) return { success: false, error: "Administrator privileges required." };
        PropertiesService.getScriptProperties().setProperty('SMF_SURVEY_EDIT_ENABLED_V1', enabled ? 'true' : 'false');
        return { success: true, enabled: enabled };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Export Schedule as Excel URL ──────────────────────────────

function getScheduleExportUrl() {
    try {
        var ss     = SpreadsheetApp.getActiveSpreadsheet();
        var sheet  = ss.getSheetByName(UPLOAD_SCHEDULE_SHEET);
        if (!sheet) return { success: false, error: 'ยังไม่มีแผน Upload' };
        var ssId  = ss.getId();
        var gid   = sheet.getSheetId();
        var url   = 'https://docs.google.com/spreadsheets/d/' + ssId +
                    '/export?format=xlsx&gid=' + gid +
                    '&portrait=false&fitw=true';
        return { success: true, url: url, sheetName: UPLOAD_SCHEDULE_SHEET };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Update critical status for a single branch ──────────────

function updateScheduleBranchCritical(branchCode, isCritical) {
    try {
        var _wlock = _acquireWriteLock_();
        var sheet = _getScheduleSheet(false);
        if (!sheet) return { success: false, error: "Schedule not found" };
        var data = sheet.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) {
            if (String(data[i][0]).trim() === String(branchCode).trim()) {
                sheet.getRange(i + 1, 4).setValue(isCritical ? "Yes" : "No");
                sheet.getRange(i + 1, 8).setValue(new Date());
                CacheService.getScriptCache().remove("UPLOAD_SCHEDULE_SUMMARY");
                return { success: true };
            }
        }
        return { success: false, error: "Branch not found" };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Bulk Add / Mark Critical in Existing Schedule ───────────────────
// codes: array of branch code strings
// For each code: if found Pending → mark Critical=Yes; if not found → add new row.
function addCriticalToSchedule(codes) {
    try {
        var _wlock = _acquireWriteLock_();
        if (!codes || codes.length === 0) return { success: true, marked: 0, added: 0 };

        var sheet  = _getScheduleSheet(false);
        if (!sheet) return { success: false, error: "Schedule not found" };

        var data    = sheet.getDataRange().getValues();
        var meta    = _readMeta();
        var now     = new Date();
        var todayStr = _dateStr(now);

        // Build lookup: code (upper) → row index (1-based)
        var existingMap = {};
        for (var i = 1; i < data.length; i++) {
            if (!data[i][0]) continue;
            existingMap[String(data[i][0]).trim().toUpperCase()] = i + 1; // rowNum
        }

        // Prepare to assign dates for NEW branches
        var maxPerDay   = parseInt(meta['maxPerDay']) || 80;
        var deadline    = meta['deadline'] || '';
        var deadlineDate = deadline
            ? new Date(deadline + 'T23:59:59')
            : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        var futureDays  = _workingDays(now, deadlineDate);
        if (futureDays.length === 0) futureDays = [new Date(now.getTime() + 86400000)];

        // Count existing Pending per day (for slot assignment)
        var dateCount = {};
        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            if (!row[0] || row[6] === 'Uploaded') continue;
            var d = _cellDateStr(row[4]);
            if (d >= todayStr) dateCount[d] = (dateCount[d] || 0) + 1;
        }

        // Load store DB for new branch info
        var allStores  = _loadAllStores();
        var storeMap   = {};
        allStores.forEach(function(s) { storeMap[s.code.toUpperCase()] = s; });

        var marked = 0, added = 0;
        var newRows = [];

        codes.forEach(function(code) {
            var key = String(code).trim().toUpperCase();
            if (!key) return;

            if (existingMap[key]) {
                // Found in schedule — mark Critical=Yes on that row
                var rn = existingMap[key];
                sheet.getRange(rn, 4).setValue('Yes');
                sheet.getRange(rn, 8).setValue(now);
                marked++;
            } else {
                // Not in schedule — add as new Critical row
                var storeInfo  = storeMap[key] || { code: key, name: key, bu: '' };
                // Find first future day with capacity
                var assignedDay = null;
                for (var k = 0; k < futureDays.length; k++) {
                    var ds = _dateStr(futureDays[k]);
                    if ((dateCount[ds] || 0) < maxPerDay) { assignedDay = ds; break; }
                }
                if (!assignedDay) assignedDay = _dateStr(futureDays[0]);
                var slotPos  = dateCount[assignedDay] || 0;
                var workStart = 8 * 60, workEnd = 17 * 60;
                var interval  = maxPerDay > 1 ? Math.floor((workEnd - workStart) / (maxPerDay - 1)) : 0;
                var mins = workStart + interval * slotPos;
                if (mins >= workEnd) mins = workEnd - 1;
                var newTime = _timeStr(Math.floor(mins / 60), mins % 60);
                dateCount[assignedDay] = slotPos + 1;

                newRows.push([storeInfo.code, storeInfo.name, storeInfo.bu || '',
                              'Yes', assignedDay, newTime, 'Pending', now, 0, meta['round'] || '']);
                added++;
            }
        });

        // Append new rows
        if (newRows.length > 0) {
            var lastRow = sheet.getLastRow();
            sheet.getRange(lastRow + 1, 5, newRows.length, 1).setNumberFormat('@');
            sheet.getRange(lastRow + 1, 6, newRows.length, 1).setNumberFormat('@');
            sheet.getRange(lastRow + 1, 1, newRows.length, 10).setValues(newRows);
        }

        CacheService.getScriptCache().remove('UPLOAD_SCHEDULE_SUMMARY');
        return { success: true, marked: marked, added: added };

    } catch (e) {
        Logger.log('addCriticalToSchedule Error: ' + e.toString());
        return { success: false, error: e.toString() };
    }
}

// ─── Survey Submission Status ─────────────────────────────────────────

function getSurveySubmissionStatus() {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        // Track the latest submission per code+type
        var byCompound = {};  // "code|type" -> { code, name, type, status, tsMs, tsStr }

        var sheetDefs = [
            { name: 'Aircon_Survey_Database', type: 'Aircon' },
            { name: 'Ref_Survey_Database',    type: 'Ref' }
        ];

        sheetDefs.forEach(function(def) {
            var sheet = ss.getSheetByName(def.name);
            if (!sheet || sheet.getLastRow() < 2) return;

            var data    = sheet.getDataRange().getValues();
            var headers = data[0];
            var tsIdx = -1, codeIdx = -1, nameIdx = -1, statusIdx = -1;

            for (var h = 0; h < headers.length; h++) {
                var hdr = String(headers[h]).toLowerCase().trim();
                if (hdr === 'timestamp')    tsIdx     = h;
                if (hdr === 'branch code')  codeIdx   = h;
                if (hdr === 'branch name')  nameIdx   = h;
                if (hdr === 'status')       statusIdx = h;
            }
            if (codeIdx < 0) return;

            for (var i = 1; i < data.length; i++) {
                var row    = data[i];
                var code   = String(row[codeIdx] || '').trim();
                var name   = nameIdx >= 0 ? String(row[nameIdx] || '').trim() : '';
                var status = statusIdx >= 0 ? String(row[statusIdx] || '').trim() : '';
                var tsRaw  = tsIdx >= 0 ? row[tsIdx] : '';
                if (!code || status === 'Draft') continue;

                var tsDate = tsRaw instanceof Date ? tsRaw : new Date(String(tsRaw));
                var tsMs   = isNaN(tsDate) ? 0 : tsDate.getTime();
                var tsStr  = tsMs > 0 ? Utilities.formatDate(tsDate, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') : '-';

                var compoundKey = code + '|' + def.type;
                var existing = byCompound[compoundKey];
                // Keep only the latest submission per code+type
                if (!existing || tsMs > existing.tsMs) {
                    byCompound[compoundKey] = { code: code, name: name, type: def.type, status: status, tsMs: tsMs, tsStr: tsStr };
                }
            }
        });

        // Group by branch code
        var branchMap = {};  // code -> { name, types: { Aircon: entry, Ref: entry } }
        Object.keys(byCompound).forEach(function(key) {
            var e = byCompound[key];
            if (!branchMap[e.code]) branchMap[e.code] = { name: e.name, types: {} };
            branchMap[e.code].types[e.type] = e;
        });

        var DONE_STATUSES = ['Acknowledged', 'Corrected', 'Closed', 'Rejected'];
        var acknowledged = [], pendingReview = [];

        Object.keys(branchMap).forEach(function(code) {
            var branch  = branchMap[code];
            var entries = Object.keys(branch.types).map(function(t) { return branch.types[t]; });

            // All submitted types must be >= Acknowledged to be in the done bucket
            var allDone = entries.every(function(e) { return DONE_STATUSES.indexOf(e.status) >= 0; });

            // Use the latest timestamp across all types
            var latestTs = 0, latestTsStr = '-';
            entries.forEach(function(e) {
                if (e.tsMs > latestTs) { latestTs = e.tsMs; latestTsStr = e.tsStr; }
            });

            var row = {
                code: code, name: branch.name,
                hasAircon:    !!branch.types['Aircon'],
                airconStatus: branch.types['Aircon'] ? branch.types['Aircon'].status : '',
                airconTs:     branch.types['Aircon'] ? branch.types['Aircon'].tsStr  : '',
                hasRef:       !!branch.types['Ref'],
                refStatus:    branch.types['Ref'] ? branch.types['Ref'].status : '',
                refTs:        branch.types['Ref'] ? branch.types['Ref'].tsStr  : '',
                _ts: latestTs
            };

            if (allDone) acknowledged.push(row);
            else         pendingReview.push(row);
        });

        acknowledged.sort(function(a, b) { return b._ts - a._ts; });
        pendingReview.sort(function(a, b) { return b._ts - a._ts; });
        acknowledged.forEach(function(r) { delete r._ts; });
        pendingReview.forEach(function(r) { delete r._ts; });

        return {
            success:      true,
            acknowledged: acknowledged,
            pendingReview: pendingReview
        };
    } catch (e) {
        Logger.log('getSurveySubmissionStatus Error: ' + e.toString());
        return { success: false, error: e.toString() };
    }
}
// ─── Survey Stats (used as fallback when no schedule) ──────────────────────────

function _getSurveyStats() {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var DONE = ['Acknowledged', 'Corrected', 'Closed'];
        var byCompound = {};  // "code|type" -> status
        var sheetDefs = [
            { name: 'Aircon_Survey_Database', type: 'Aircon' },
            { name: 'Ref_Survey_Database',    type: 'Ref' }
        ];
        var totals = { Aircon: 0, Ref: 0 };

        sheetDefs.forEach(function(def) {
            var sht = ss.getSheetByName(def.name);
            if (!sht || sht.getLastRow() < 2) return;
            var data    = sht.getDataRange().getValues();
            var headers = data[0];
            var codeIdx = -1, statusIdx = -1;
            for (var h = 0; h < headers.length; h++) {
                var hdr = String(headers[h]).toLowerCase().trim();
                if (hdr === 'branch code') codeIdx   = h;
                if (hdr === 'status')      statusIdx = h;
            }
            if (codeIdx < 0) return;
            for (var i = 1; i < data.length; i++) {
                var code   = String(data[i][codeIdx] || '').trim();
                var status = statusIdx >= 0 ? String(data[i][statusIdx] || '').trim() : '';
                if (!code || status === 'Draft') continue;
                totals[def.type]++;
                var key = code + '|' + def.type;
                if (!byCompound[key] || DONE.indexOf(status) >= 0) byCompound[key] = status;
            }
        });

        // Count acknowledged branches (all submitted types done)
        var branchTypes = {};
        Object.keys(byCompound).forEach(function(key) {
            var parts = key.split('|'), code = parts[0], type = parts[1];
            if (!branchTypes[code]) branchTypes[code] = {};
            branchTypes[code][type] = byCompound[key];
        });
        var ackCount = 0, pendCount = 0;
        Object.keys(branchTypes).forEach(function(code) {
            var entries = Object.values(branchTypes[code]);
            var allDone = entries.every(function(s) { return DONE.indexOf(s) >= 0; });
            if (allDone) ackCount++; else pendCount++;
        });

        return { airconTotal: totals.Aircon, refTotal: totals.Ref, ackCount: ackCount, pendCount: pendCount };
    } catch(e) {
        return { airconTotal: 0, refTotal: 0, ackCount: 0, pendCount: 0 };
    }
}

// ─── Dashboard Data ──────────────────────────────────────────

function getDashboardData() {
    try {
        // Cache 60s — full Upload_Schedule scan on every call, fired on every
        // admin dashboard load.
        var _udCache = CacheService.getScriptCache();
        var _udHit = _udCache.get('UPLOAD_DASHBOARD_V1');
        if (_udHit) return JSON.parse(_udHit);

        var sheet = _getScheduleSheet(false);
        if (!sheet || sheet.getLastRow() < 2) {
            // No schedule yet — still return basic survey stats for display
            return { exists: false, surveyStats: _getSurveyStats() };
        }

        var meta = _readMeta();
        var data = sheet.getDataRange().getValues();

        var total = 0, uploaded = 0, critical = 0, criticalUploaded = 0;
        var buMap  = {}; // bu -> {total, uploaded}
        var dayMap = {}; // dateStr -> {total, uploaded}
        var recentUploads = [];

        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            if (!row[0]) continue;

            var code       = String(row[0]).trim();
            var name       = String(row[1]).trim();
            var bu         = String(row[2]).trim() || '(ไม่ระบุ)';
            var isCritical = row[3] === 'Yes';
            var dateStr    = _cellDateStr(row[4]);
            var status     = String(row[6]).trim();
            var updatedAt  = row[7];

            total++;
            if (isCritical) critical++;

            if (!buMap[bu]) buMap[bu] = { total: 0, uploaded: 0 };
            buMap[bu].total++;

            if (!dayMap[dateStr]) dayMap[dateStr] = { total: 0, uploaded: 0 };
            dayMap[dateStr].total++;

            if (status === 'Uploaded') {
                uploaded++;
                if (isCritical) criticalUploaded++;
                buMap[bu].uploaded++;
                dayMap[dateStr].uploaded++;

                var uploadTs = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
                recentUploads.push({ code: code, name: name, bu: bu,
                    uploadedAt: isNaN(uploadTs) ? '' : _dateStr(uploadTs),
                    _ts: isNaN(uploadTs) ? 0 : uploadTs.getTime() });
            }
        }

        // Sort recentUploads newest first, top 15
        recentUploads.sort(function(a, b) { return b._ts - a._ts; });
        recentUploads = recentUploads.slice(0, 15);
        recentUploads.forEach(function(r) { delete r._ts; });

        // BU list sorted by total desc
        var byBU = Object.keys(buMap).map(function(bu) {
            return { bu: bu, total: buMap[bu].total, uploaded: buMap[bu].uploaded };
        }).sort(function(a, b) { return b.total - a.total; });

        // Day list: all dates in schedule + sorted
        var allDays = Object.keys(dayMap).sort();
        // Show window: up to 30 days from the first day or today-7, whichever smaller range
        var today = new Date(); today.setHours(0,0,0,0);
        var todayStr = _dateStr(today);
        var pastCutoff = _dateStr(new Date(today.getTime() - 7 * 86400000));
        var byDay = allDays
            .filter(function(d) { return d >= pastCutoff; })
            .slice(0, 35)
            .map(function(d) {
                return { date: d, total: dayMap[d].total, uploaded: dayMap[d].uploaded };
            });

        var deadline = meta['deadline'] || '';
        var daysLeft = 0;
        if (deadline) {
            var dl = new Date(deadline + 'T23:59:59');
            daysLeft = Math.ceil((dl - today) / 86400000);
        }

        var _udResult = {
            exists:           true,
            total:            total,
            uploaded:         uploaded,
            pending:          total - uploaded,
            critical:         critical,
            criticalUploaded: criticalUploaded,
            deadline:         deadline,
            daysLeft:         daysLeft,
            byBU:             byBU,
            byDay:            byDay,
            recentUploads:    recentUploads
        };
        try { _udCache.put('UPLOAD_DASHBOARD_V1', JSON.stringify(_udResult), 60); } catch (e) {}
        return _udResult;

    } catch (e) {
        Logger.log('getDashboardData Error: ' + e.toString());
        return { exists: false, error: e.toString() };
    }
}

// ─────────────────────────────────────────────────────────
// getAcknowledgedPerformanceDashboard
// Returns per-branch status summary for the Performance tab.
// Visible only to Admin / Schedule Admin (frontend enforces).
// ─────────────────────────────────────────────────────────
function getAcknowledgedPerformanceDashboard(round) {
    try {
        // Defaults to the currently active plan's round, so the dashboard
        // reflects only this round's submissions and not an all-time mixture
        // once quarterly resurveys start accumulating in the survey databases.
        round = (round === undefined || round === null) ? (_readMeta()['round'] || '') : String(round).trim();

        // Cache 60s — full scan of BOTH Aircon_Survey_Database and Ref_Survey_Database
        // on every call, fired on every Performance tab load.
        var _apdCache = CacheService.getScriptCache();
        var _apdCacheKey = 'ACK_PERF_DASHBOARD_V2_' + round;
        var _apdHit = _apdCache.get(_apdCacheKey);
        if (_apdHit) return JSON.parse(_apdHit);

        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var DONE = ['Acknowledged', 'Corrected', 'Closed', 'Rejected'];

        var sheetDefs = [
            { name: 'Aircon_Survey_Database', typeKey: 'acStatus' },
            { name: 'Ref_Survey_Database',    typeKey: 'refStatus' }
        ];

        // branchMap[code] = { code, name, dm, cm, am, acStatus, refStatus }
        var branchMap = {};

        sheetDefs.forEach(function(def) {
            var sheet = ss.getSheetByName(def.name);
            if (!sheet || sheet.getLastRow() < 2) return;

            var data    = sheet.getDataRange().getValues();
            var headers = data[0];

            var idxCode = -1, idxName = -1, idxStatus = -1,
                idxDM   = -1, idxCM   = -1, idxAM     = -1, idxTs = -1, idxRound = -1;

            for (var h = 0; h < headers.length; h++) {
                var hdr = String(headers[h]).toLowerCase().trim();
                if (hdr === 'branch code')  idxCode   = h;
                if (hdr === 'branch name')  idxName   = h;
                if (hdr === 'status')       idxStatus = h;
                if (hdr === 'dm area')      idxDM     = h;
                if (hdr === 'cm area')      idxCM     = h;
                if (hdr === 'amm mtn')      idxAM     = h;
                if (hdr === 'timestamp')    idxTs     = h;
                if (hdr === 'survey round') idxRound  = h;
            }
            // Fallback column positions if headers not found
            if (idxCode   < 0) idxCode   = 4;
            if (idxName   < 0) idxName   = 5;
            if (idxTs     < 0) idxTs     = 0;

            // Collect latest row per branch code (by timestamp)
            var latestTs = {};  // code -> tsDate
            var latestRow = {}; // code -> row data object

            for (var i = 1; i < data.length; i++) {
                var row    = data[i];
                var code   = String(row[idxCode] || '').trim();
                var status = idxStatus >= 0 ? String(row[idxStatus] || '').trim() : '';
                if (!code || status === 'Draft') continue;

                // When a round is active, exclude rows explicitly tagged with a
                // DIFFERENT round — rows with no round tag (pre-migration data,
                // or off-schedule submissions) still count.
                var rowRound = idxRound >= 0 ? String(row[idxRound] || '').trim() : '';
                if (round && rowRound && rowRound !== round) continue;

                var ts     = row[idxTs];
                var tsDate = ts instanceof Date ? ts : new Date(ts);
                if (isNaN(tsDate.getTime())) tsDate = new Date(0);

                if (!latestTs[code] || tsDate > latestTs[code]) {
                    latestTs[code]  = tsDate;
                    latestRow[code] = {
                        code:   code,
                        name:   idxName   >= 0 ? String(row[idxName]   || '').trim() : code,
                        dm:     idxDM     >= 0 ? String(row[idxDM]     || '').trim() : '',
                        cm:     idxCM     >= 0 ? String(row[idxCM]     || '').trim() : '',
                        am:     idxAM     >= 0 ? String(row[idxAM]     || '').trim() : '',
                        status: status
                    };
                }
            }

            // Merge into branchMap
            Object.keys(latestRow).forEach(function(code) {
                var r = latestRow[code];
                if (!branchMap[code]) {
                    branchMap[code] = { code: code, name: r.name, dm: r.dm, cm: r.cm, am: r.am,
                                        acStatus: '-', refStatus: '-' };
                } else {
                    // Fill in DM/CM/AM if missing
                    if (!branchMap[code].dm && r.dm) branchMap[code].dm = r.dm;
                    if (!branchMap[code].cm && r.cm) branchMap[code].cm = r.cm;
                    if (!branchMap[code].am && r.am) branchMap[code].am = r.am;
                }
                branchMap[code][def.typeKey] = r.status;
            });
        });

        // Build stores array with acknowledged flag
        var stores = Object.values(branchMap).map(function(b) {
            var acDone  = DONE.indexOf(b.acStatus)  >= 0;
            var refDone = DONE.indexOf(b.refStatus) >= 0;
            var hasAny  = b.acStatus !== '-' || b.refStatus !== '-';
            // Acknowledged = at least one type submitted AND all submitted ones are done
            var submitted = [];
            if (b.acStatus  !== '-') submitted.push(acDone);
            if (b.refStatus !== '-') submitted.push(refDone);
            var acknowledged = submitted.length > 0 && submitted.every(function(v) { return v; });
            return {
                code:         b.code,
                name:         b.name,
                dm:           b.dm,
                cm:           b.cm,
                am:           b.am,
                acStatus:     b.acStatus,
                refStatus:    b.refStatus,
                acknowledged: acknowledged
            };
        });

        // Build unique sorted lists
        function uniqueSorted(arr) {
            var seen = {}, out = [];
            arr.forEach(function(v) { if (v && !seen[v]) { seen[v] = true; out.push(v); } });
            return out.sort();
        }
        var dmList = uniqueSorted(stores.map(function(s) { return s.dm; }));
        var cmList = uniqueSorted(stores.map(function(s) { return s.cm; }));
        var amList = uniqueSorted(stores.map(function(s) { return s.am; }));

        var totalAck = stores.filter(function(s) { return s.acknowledged; }).length;

        var _apdResult = {
            success:  true,
            stores:   stores,
            dmList:   dmList,
            cmList:   cmList,
            amList:   amList,
            totalAck: totalAck,
            total:    stores.length
        };
        try { _apdCache.put(_apdCacheKey, JSON.stringify(_apdResult), 60); } catch (e) {}
        return _apdResult;

    } catch (e) {
        Logger.log('getAcknowledgedPerformanceDashboard Error: ' + e.toString());
        return { success: false, error: e.toString() };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// getScheduleUploadProgressReport
// Lists ALL branches from Store Master, enriches with Upload_Schedule data
// and Aircon & Ref survey submissions for the "📋 รายงาน" tab.
// ─────────────────────────────────────────────────────────────────────────────
function getScheduleUploadProgressReport() {
    try {
        // Cache 60s — this is the heaviest of the three dashboard endpoints: Store
        // Master + Upload_Schedule + Aircon_Survey_Database + Ref_Survey_Database,
        // all read in full on every call, fired on every report tab load.
        var _supCache = CacheService.getScriptCache();
        var _supHit = _supCache.get('SCHED_UPLOAD_PROGRESS_V1');
        if (_supHit) return JSON.parse(_supHit);

        var ss = SpreadsheetApp.getActiveSpreadsheet();

        // 1. Load ALL branches from Store Master as the primary source (including inactive)
        var allStores = _loadAllStores(true);
        if (allStores.length === 0) {
            return { success: false, error: 'ไม่สามารถโหลดข้อมูล Store Master ได้' };
        }

        var branches = {};  // code -> branch obj
        allStores.forEach(function(s) {
            var code = String(s.code || '').trim();
            if (!code) return;
            branches[code] = {
                code:         code,
                name:         String(s.name || '').trim(),
                bu:           String(s.bu  || '').trim(),
                storeStatus:  String(s.storeStatus || 'A').trim(),
                critical:     false,
                inSchedule:   false,
                date:         '',
                time:         '',
                schedStatus:  '',
                hasAircon:    false,
                airconStatus: '',
                airconTs:     '',
                airconTsMs:   0,
                hasRef:       false,
                refStatus:    '',
                refTs:        '',
                refTsMs:      0
            };
        });

        // 2. Enrich from Upload_Schedule (mark inSchedule + scheduled date/time)
        var schedSheet = _getScheduleSheet(false);
        if (schedSheet && schedSheet.getLastRow() >= 2) {
            var schedData = schedSheet.getDataRange().getValues();
            for (var i = 1; i < schedData.length; i++) {
                var sRow = schedData[i];
                if (!sRow[0]) continue;
                var code = String(sRow[0]).trim();
                if (!code) continue;
                if (!branches[code]) {
                    // In schedule but not in Store Master — add it
                    branches[code] = {
                        code:         code,
                        name:         String(sRow[1] || '').trim(),
                        bu:           String(sRow[2] || '').trim(),
                        storeStatus:  'A',
                        critical:     String(sRow[3] || '') === 'Yes',
                        inSchedule:   true,
                        date:         _cellDateStr(sRow[4]),
                        time:         String(sRow[5] || '').trim(),
                        schedStatus:  String(sRow[6] || 'Pending').trim(),
                        hasAircon:    false,
                        airconStatus: '',
                        airconTs:     '',
                        airconTsMs:   0,
                        hasRef:       false,
                        refStatus:    '',
                        refTs:        '',
                        refTsMs:      0
                    };
                } else if (!branches[code].inSchedule) {
                    // First occurrence — enrich Store Master entry with schedule data
                    branches[code].critical    = String(sRow[3] || '') === 'Yes';
                    branches[code].inSchedule  = true;
                    branches[code].date        = _cellDateStr(sRow[4]);
                    branches[code].time        = String(sRow[5] || '').trim();
                    branches[code].schedStatus = String(sRow[6] || 'Pending').trim();
                }
            }
        }

        // 3. Enrich from survey sheets (latest submission per branch code)
        function enrichFromSheet(sheetName, isAircon) {
            var sht = ss.getSheetByName(sheetName);
            if (!sht || sht.getLastRow() < 2) return;
            var data    = sht.getDataRange().getValues();
            var headers = data[0];
            var tsIdx = -1, codeIdx = -1, statusIdx = -1;
            for (var h = 0; h < headers.length; h++) {
                var hdr = String(headers[h]).toLowerCase().trim();
                if (hdr === 'timestamp')   tsIdx     = h;
                if (hdr === 'branch code') codeIdx   = h;
                if (hdr === 'status')      statusIdx = h;
            }
            if (codeIdx < 0) return;

            var byCode = {};
            for (var i = 1; i < data.length; i++) {
                var row    = data[i];
                var code   = String(row[codeIdx] || '').trim();
                var status = statusIdx >= 0 ? String(row[statusIdx] || '').trim() : '';
                if (!code || status === 'Draft') continue;
                var tsRaw  = tsIdx >= 0 ? row[tsIdx] : '';
                var tsDate = tsRaw instanceof Date ? tsRaw : new Date(String(tsRaw));
                var tsMs   = isNaN(tsDate) ? 0 : tsDate.getTime();
                var tsStr  = tsMs > 0 ? Utilities.formatDate(tsDate, Session.getScriptTimeZone(), 'dd/MM/yy HH:mm') : '-';
                if (!byCode[code] || tsMs > byCode[code].tsMs) {
                    byCode[code] = { status: status, tsMs: tsMs, tsStr: tsStr };
                }
            }

            Object.keys(byCode).forEach(function(code) {
                if (!branches[code]) return;
                var info = byCode[code];
                if (isAircon) {
                    branches[code].hasAircon    = true;
                    branches[code].airconStatus = info.status;
                    branches[code].airconTs     = info.tsStr;
                    branches[code].airconTsMs   = info.tsMs;
                } else {
                    branches[code].hasRef    = true;
                    branches[code].refStatus = info.status;
                    branches[code].refTs     = info.tsStr;
                    branches[code].refTsMs   = info.tsMs;
                }
            });
        }

        enrichFromSheet('Aircon_Survey_Database', true);
        enrichFromSheet('Ref_Survey_Database',    false);

        // 4. Sort: in-schedule branches first (not-uploaded → uploaded by date),
        //    then not-in-schedule (has survey → none)
        var result = Object.keys(branches).map(function(c) { return branches[c]; });
        result.sort(function(a, b) {
            var aInSched = a.inSchedule ? 0 : 1;
            var bInSched = b.inSchedule ? 0 : 1;
            if (aInSched !== bInSched) return aInSched - bInSched;
            var aUp = a.hasAircon || a.hasRef;
            var bUp = b.hasAircon || b.hasRef;
            if (!aUp && bUp)  return -1;
            if (aUp  && !bUp) return  1;
            if (a.date < b.date) return -1;
            if (a.date > b.date) return  1;
            return a.time < b.time ? -1 : 1;
        });

        // Strip internal tsMs fields before returning
        result.forEach(function(r) { delete r.airconTsMs; delete r.refTsMs; });

        // Summary counts
        var inScheduleCount = result.filter(function(r) { return r.inSchedule; }).length;
        var withBoth        = result.filter(function(r) { return r.hasAircon && r.hasRef; }).length;
        var withAirconOnly  = result.filter(function(r) { return r.hasAircon && !r.hasRef; }).length;
        var withRefOnly     = result.filter(function(r) { return !r.hasAircon && r.hasRef; }).length;
        var withNone        = result.filter(function(r) { return !r.hasAircon && !r.hasRef; }).length;

        var _supResult = {
            success: true,
            data: result,
            summary: {
                total:          result.length,
                inSchedule:     inScheduleCount,
                withBoth:       withBoth,
                withAirconOnly: withAirconOnly,
                withRefOnly:    withRefOnly,
                withNone:       withNone
            }
        };
        try { _supCache.put('SCHED_UPLOAD_PROGRESS_V1', JSON.stringify(_supResult), 60); } catch (e) { Logger.log('SUP cache put skipped: ' + e); }
        return _supResult;

    } catch (e) {
        Logger.log('getScheduleUploadProgressReport Error: ' + e.toString());
        return { success: false, error: e.toString() };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// getDuplicateSurveyData
// Scans Aircon_Survey_Database and Ref_Survey_Database for sites that have
// more than one non-Draft submission. Returns a grouped list for the
// "📌 ตรวจซ้ำ" tab in upload-schedule.html.
// ─────────────────────────────────────────────────────────────────────────────
function getDuplicateSurveyData() {
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheetDefs = [
            { name: 'Aircon_Survey_Database', typeKey: 'aircon' },
            { name: 'Ref_Survey_Database',    typeKey: 'ref' }
        ];

        // Keyed by "code|round" (not code alone) — a store legitimately gets one
        // submission per round now, so only >1 submission WITHIN the same round
        // should ever surface here. Rows with no round tag (pre-migration data)
        // group under their own "code|" bucket, preserving the old behavior.
        var siteMap = {};  // "code|round" -> { code, round, name, bu, dm, cm, am, aircon: [], ref: [] }

        sheetDefs.forEach(function(def) {
            var sheet = ss.getSheetByName(def.name);
            if (!sheet || sheet.getLastRow() < 2) return;

            var data    = sheet.getDataRange().getValues();
            var headers = data[0];

            var tsIdx = -1, codeIdx = -1, nameIdx = -1, statusIdx = -1,
                buIdx = -1, dmIdx   = -1, cmIdx   = -1, amIdx     = -1, roundIdx = -1;

            for (var h = 0; h < headers.length; h++) {
                var hdr = String(headers[h]).toLowerCase().trim();
                if (hdr === 'timestamp')    tsIdx     = h;
                if (hdr === 'branch code')  codeIdx   = h;
                if (hdr === 'branch name')  nameIdx   = h;
                if (hdr === 'status')       statusIdx = h;
                if (hdr === 'bu')           buIdx     = h;
                if (hdr === 'dm area')      dmIdx     = h;
                if (hdr === 'cm area')      cmIdx     = h;
                if (hdr === 'amm mtn')      amIdx     = h;
                if (hdr === 'survey round') roundIdx  = h;
            }
            if (codeIdx < 0) return;

            for (var i = 1; i < data.length; i++) {
                var row    = data[i];
                var code   = String(row[codeIdx] || '').trim();
                var status = statusIdx >= 0 ? String(row[statusIdx] || '').trim() : '';
                if (!code || status === 'Draft') continue;

                var round  = roundIdx >= 0 ? String(row[roundIdx] || '').trim() : '';
                var key    = code + '|' + round;

                var tsRaw  = tsIdx >= 0 ? row[tsIdx] : '';
                var tsDate = tsRaw instanceof Date ? tsRaw : new Date(String(tsRaw));
                var tsMs   = isNaN(tsDate.getTime()) ? 0 : tsDate.getTime();
                var tsStr  = tsMs > 0
                    ? Utilities.formatDate(tsDate, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
                    : '-';

                if (!siteMap[key]) {
                    siteMap[key] = {
                        code:   code,
                        round:  round,
                        name:   nameIdx >= 0 ? String(row[nameIdx] || '').trim() : '',
                        bu:     buIdx   >= 0 ? String(row[buIdx]   || '').trim() : '',
                        dm:     dmIdx   >= 0 ? String(row[dmIdx]   || '').trim() : '',
                        cm:     cmIdx   >= 0 ? String(row[cmIdx]   || '').trim() : '',
                        am:     amIdx   >= 0 ? String(row[amIdx]   || '').trim() : '',
                        aircon: [],
                        ref:    []
                    };
                } else {
                    // Fill missing name/bu/dm/cm/am from later rows
                    if (!siteMap[key].name && nameIdx >= 0) siteMap[key].name = String(row[nameIdx] || '').trim();
                    if (!siteMap[key].bu   && buIdx   >= 0) siteMap[key].bu   = String(row[buIdx]   || '').trim();
                    if (!siteMap[key].dm   && dmIdx   >= 0) siteMap[key].dm   = String(row[dmIdx]   || '').trim();
                    if (!siteMap[key].cm   && cmIdx   >= 0) siteMap[key].cm   = String(row[cmIdx]   || '').trim();
                    if (!siteMap[key].am   && amIdx   >= 0) siteMap[key].am   = String(row[amIdx]   || '').trim();
                }

                siteMap[key][def.typeKey].push({ ts: tsStr, tsMs: tsMs, status: status });
            }
        });

        // Keep only sites with at least one type having >1 submission
        var duplicates = [];
        Object.keys(siteMap).forEach(function(key) {
            var site = siteMap[key];
            if (site.aircon.length <= 1 && site.ref.length <= 1) return;

            // Sort submissions oldest-first within each type
            site.aircon.sort(function(a, b) { return a.tsMs - b.tsMs; });
            site.ref.sort(function(a, b)    { return a.tsMs - b.tsMs; });

            duplicates.push({
                code:        site.code,
                round:       site.round,
                name:        site.name,
                bu:          site.bu,
                dm:          site.dm,
                cm:          site.cm,
                am:          site.am,
                airconCount: site.aircon.length,
                airconSubs:  site.aircon.map(function(s) { return { ts: s.ts, status: s.status }; }),
                refCount:    site.ref.length,
                refSubs:     site.ref.map(function(s)    { return { ts: s.ts, status: s.status }; })
            });
        });

        // Sort by most extra rows first
        duplicates.sort(function(a, b) {
            var aExtra = Math.max(0, a.airconCount - 1) + Math.max(0, a.refCount - 1);
            var bExtra = Math.max(0, b.airconCount - 1) + Math.max(0, b.refCount - 1);
            return bExtra - aExtra;
        });

        var airconDupeSites = duplicates.filter(function(s) { return s.airconCount > 1; }).length;
        var refDupeSites    = duplicates.filter(function(s) { return s.refCount    > 1; }).length;
        var bothDupeSites   = duplicates.filter(function(s) { return s.airconCount > 1 && s.refCount > 1; }).length;
        var totalExtraRows  = duplicates.reduce(function(acc, s) {
            return acc + Math.max(0, s.airconCount - 1) + Math.max(0, s.refCount - 1);
        }, 0);

        return {
            success:  true,
            sites:    duplicates,
            summary: {
                totalSites:      duplicates.length,
                airconDupeSites: airconDupeSites,
                refDupeSites:    refDupeSites,
                bothDupeSites:   bothDupeSites,
                totalExtraRows:  totalExtraRows
            }
        };

    } catch (e) {
        Logger.log('getDuplicateSurveyData Error: ' + e.toString());
        return { success: false, error: e.toString() };
    }
}
