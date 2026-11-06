// ============================================================
// HyperSchedule.gs — Upload schedule for Hyper (Big Format) surveys
// ============================================================
// Mirrors UploadSchedule.gs (Mini Big C) but for the Big Format store list (HYPER_REF_STORES) and the
// 5 Hyper surveys: Ref, Aircon, Equipment, Lighting, Toilet. Kept separate so the Mini plan is untouched.
//   • Plan lives in "Upload_Schedule_Hyper" (+ "Upload_Schedule_Hyper_Meta"); status is NEVER stored —
//     it is computed live from the 5 Hyper_*_Survey_Database sheets (a survey counts for the plan when
//     its Timestamp is on/after the plan start date).
//   • Reuses the date helpers from UploadSchedule.gs (_workingDays, _dateStr, _timeStr, _cellDateStr).

var HSCH_SHEET = "Upload_Schedule_Hyper";
var HSCH_META_SHEET = "Upload_Schedule_Hyper_Meta";
var HSCH_HEADERS = ["Branch Code", "Branch Name", "Format", "Region", "Is Critical", "Assigned Date", "Assigned Time", "Skip Count", "Round", "Updated At"];
var HSCH_TYPES = [
    { key: 'Ref',  label: 'ตู้แช่',      sheet: 'Hyper_Ref_Survey_Database' },
    { key: 'Ac',   label: 'แอร์',        sheet: 'Hyper_Aircon_Survey_Database' },
    { key: 'Eq',   label: 'อุปกรณ์อาคาร', sheet: 'Hyper_Equipment_Survey_Database' },
    { key: 'Fo',   label: 'Fresh Food',   sheet: 'Hyper_FreshFood_Survey_Database' },
    { key: 'Li',   label: 'แสงสว่าง',    sheet: 'Hyper_Lighting_Survey_Database' },
    { key: 'To',   label: 'ห้องน้ำ',     sheet: 'Hyper_Toilet_Survey_Database' },
    { key: 'Pk',   label: 'ที่จอดรถ/ผู้พิการ', sheet: 'Hyper_Parking_Survey_Database' },
    { key: 'Hb',   label: 'เครื่องเป่ามือ', sheet: 'Hyper_HandBlower_Survey_Database' },
    { key: 'Fi',   label: 'ป้องกันอัคคีภัย', sheet: 'Hyper_Fire_Survey_Database' },
];

function _hschSheet_(create) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(HSCH_SHEET);
    if (!sh && create) {
        sh = ss.insertSheet(HSCH_SHEET);
        sh.appendRow(HSCH_HEADERS);
        sh.setFrozenRows(1);
        sh.getRange("F:G").setNumberFormat("@");
    }
    return sh;
}

function _hschMeta_() {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HSCH_META_SHEET);
    var meta = {};
    if (!sh || sh.getLastRow() < 2) return meta;
    // Sheets auto-converts date-looking strings ("2026-10-01", ISO timestamps) into Date cells, and a Date
    // inside the object returned to the page makes google.script.run deliver null — normalise back to text.
    sh.getDataRange().getValues().slice(1).forEach(function(r) {
        var v = r[1];
        meta[r[0]] = v instanceof Date ? (r[0] === 'createdAt' ? v.toISOString() : _cellDateStr(v)) : v;
    });
    return meta;
}

function _hschSetMeta_(obj) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(HSCH_META_SHEET);
    if (!sh) { sh = ss.insertSheet(HSCH_META_SHEET); sh.appendRow(["Key", "Value"]); sh.getRange("B:B").setNumberFormat("@"); }
    var rows = sh.getDataRange().getValues();
    Object.keys(obj).forEach(function(k) {
        for (var i = 1; i < rows.length; i++) {
            if (rows[i][0] === k) { sh.getRange(i + 1, 2).setValue(obj[k]); return; }
        }
        sh.appendRow([k, obj[k]]);
        rows.push([k, obj[k]]);
    });
}

function _hschStores_() {
    return HYPER_REF_STORES.map(function(s) {
        return { code: String(s[0]).trim(), name: String(s[1] || s[2] || s[0]).trim(), nameTh: String(s[2] || '').trim(), format: s[3] || '(ไม่ระบุ)', region: s[4] || '(ไม่ระบุ)' };
    });
}

// code -> { Ref: {ms, str}, Ac: ..., }  — latest submission per type with ms >= sinceMs (0 = any),
// plus _ever[code][type] = true if the store has ANY submission of that type (used for priority tiering)
function _hschSubmissions_(sinceMs) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var inRound = {}, ever = {}, info = {};
    HSCH_TYPES.forEach(function(t) {
        var sh = ss.getSheetByName(t.sheet);
        if (!sh || sh.getLastRow() < 2) return;
        // Read ONLY the 4 columns used here — the survey sheets carry large Units/Attachments JSON
        // columns, and a full getDataRange() of all 8 sheets made the page time out.
        var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(h) { return String(h).trim(); });
        var want = ['Branch Code', 'Timestamp', 'AMM MTN', 'CM Area'].map(function(n) { return hdr.indexOf(n); });
        if (want[0] < 0) return;
        var n = sh.getLastRow() - 1, cols = want.map(function(c) { return c < 0 ? null : sh.getRange(2, c + 1, n, 1).getValues(); });
        var vals = [null];
        for (var r = 0; r < n; r++) vals.push(cols.map(function(col) { return col ? col[r][0] : ''; }));
        var ci = 0, ti = want[1] < 0 ? -1 : 1, ai = want[2] < 0 ? -1 : 2, cmi = want[3] < 0 ? -1 : 3;
        for (var i = 1; i < vals.length; i++) {
            var code = String(vals[i][ci] || '').trim();
            if (!code) continue;
            var d = ti >= 0 ? vals[i][ti] : null;
            var ms = d instanceof Date ? d.getTime() : (d ? new Date(d).getTime() : 0);
            if (isNaN(ms)) ms = 0;
            if (!ever[code]) ever[code] = {};
            ever[code][t.key] = true;
            if (ai >= 0 && vals[i][ai]) info[code] = { amm: String(vals[i][ai]), cm: cmi >= 0 ? String(vals[i][cmi] || '') : '' };
            if (ms < sinceMs) continue;
            if (!inRound[code]) inRound[code] = {};
            var cur = inRound[code][t.key];
            if (!cur || ms > cur.ms) {
                inRound[code][t.key] = { ms: ms, str: ms ? Utilities.formatDate(new Date(ms), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm') : '-' };
            }
        }
    });
    return { inRound: inRound, ever: ever, info: info };
}

function _hschSinceMs_(meta) {
    var s = meta['startDate'];
    if (!s) return 0;
    var d = new Date(String(s) + 'T00:00:00+07:00');
    return isNaN(d.getTime()) ? 0 : d.getTime();
}

function getHyperScheduleOptions() {
    var stores = _hschStores_();
    var fm = {};
    stores.forEach(function(s) { fm[s.format] = (fm[s.format] || 0) + 1; });
    return { success: true, stores: stores, formats: Object.keys(fm).sort().map(function(k) { return { name: k, count: fm[k] }; }), types: HSCH_TYPES.map(function(t) { return { key: t.key, label: t.label }; }) };
}

function createHyperSchedule(params) {
    var lock = null;
    try {
        lock = _acquireWriteLock_();
        var round = String(params.round || '').trim();
        if (!round) return { success: false, error: 'กรุณาระบุรอบสำรวจ (เช่น 2026-H2)' };
        if (!params.deadline) return { success: false, error: 'กรุณาระบุ Deadline' };
        var deadline = new Date(params.deadline);
        var startDate = params.startDate ? new Date(params.startDate) : new Date();
        startDate.setHours(0, 0, 0, 0);
        if (deadline <= startDate) return { success: false, error: 'Deadline ต้องหลังวันเริ่มต้น' };
        var maxPerDay = parseInt(params.maxPerDay, 10) || 20;
        var tf = params.uploadTimeFrom || '08:00', tt = params.uploadTimeTo || '17:00';
        var mins = function(t) { var p = t.split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); };
        var workStart = mins(tf), workEnd = mins(tt);
        if (workEnd <= workStart) return { success: false, error: 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม' };

        var stores = _hschStores_();
        var fmts = (params.formats || []).map(function(f) { return String(f).trim(); });
        if (fmts.length) stores = stores.filter(function(s) { return fmts.indexOf(s.format) > -1; });
        var excluded = {}; (params.excludedCodes || []).forEach(function(c) { excluded[String(c).trim()] = true; });
        stores = stores.filter(function(s) { return !excluded[s.code]; });
        if (!stores.length) return { success: false, error: 'ไม่พบสาขาตามเงื่อนไขที่เลือก' };

        var crit = {}; (params.criticalCodes || []).forEach(function(c) { crit[String(c).trim()] = true; });
        var ever = _hschSubmissions_(0).ever;
        var cmp = function(a, b) { return a.format !== b.format ? a.format.localeCompare(b.format) : a.region !== b.region ? a.region.localeCompare(b.region) : a.code.localeCompare(b.code); };
        var critical = [], noData = [], regular = [];
        stores.forEach(function(s) {
            if (crit[s.code]) { critical.push(s); return; }
            var e = ever[s.code] || {};
            if (HSCH_TYPES.some(function(t) { return !e[t.key]; })) noData.push(s); else regular.push(s);
        });
        noData.sort(cmp); regular.sort(cmp);
        var ordered = critical.concat(noData).concat(regular);

        var days = _workingDays(startDate, deadline);
        if (!days.length) return { success: false, error: 'ไม่มีวันทำงานก่อน Deadline' };
        var perDay = Math.min(maxPerDay, Math.ceil(ordered.length / days.length));
        var rows = [], idx = 0, now = new Date();
        for (var di = 0; di < days.length && idx < ordered.length; di++) {
            var chunk = ordered.slice(idx, idx + perDay);
            var interval = chunk.length > 1 ? Math.floor((workEnd - workStart) / (chunk.length - 1)) : 0;
            chunk.forEach(function(s, si) {
                var m = workStart + interval * si;
                rows.push([s.code, s.name, s.format, s.region, crit[s.code] ? 'Yes' : 'No', _dateStr(days[di]), _timeStr(Math.floor(m / 60), m % 60), 0, round, now]);
            });
            idx += perDay;
        }
        if (idx < ordered.length) return { success: false, error: 'จำนวนสาขา (' + ordered.length + ') มากกว่าที่รองรับได้ (' + (days.length * maxPerDay) + ') — เพิ่มสาขาต่อวัน หรือเลื่อน Deadline' };

        var sh = _hschSheet_(true);
        if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, HSCH_HEADERS.length).clearContent();
        sh.getRange(2, 6, rows.length, 2).setNumberFormat("@");
        sh.getRange(2, 1, rows.length, HSCH_HEADERS.length).setValues(rows);
        _hschSetMeta_({ startDate: params.startDate || _dateStr(startDate), deadline: params.deadline, uploadTimeFrom: tf, uploadTimeTo: tt, maxPerDay: String(maxPerDay),
            round: round, formats: JSON.stringify(fmts), createdAt: new Date().toISOString() });
        _hschClearCache_();
        return { success: true, totalStores: rows.length, totalCritical: critical.length, totalNoData: noData.length, totalDays: days.length, storesPerDay: perDay };
    } catch (e) {
        return { success: false, error: e.toString() };
    } finally {
        if (lock) lock.releaseLock();
    }
}

// Whole plan joined with live submission status. One call feeds Summary / Daily / Report on the page.
// Cached 2 min (status lags a new submission by at most that); plan edits clear it via _hschClearCache_().
// Stored in ≤90KB chunks (CacheService caps one entry at 100KB).
var HSCH_CACHE_KEY = 'HSCH_DATA_V1';
function _hschClearCache_() { try { CacheService.getScriptCache().remove(HSCH_CACHE_KEY + '_n'); } catch (e) {} }

function getHyperScheduleData() {
    var cache = CacheService.getScriptCache();
    try {
        var n = parseInt(cache.get(HSCH_CACHE_KEY + '_n'), 10);
        if (n > 0) {
            var keys = []; for (var i = 0; i < n; i++) keys.push(HSCH_CACHE_KEY + '_' + i);
            var got = cache.getAll(keys), parts = keys.map(function(k) { return got[k]; });
            if (parts.every(function(p) { return p != null; })) return JSON.parse(parts.join(''));
        }
    } catch (e) {}
    var res = _hschBuildData_();
    if (res && res.success) {
        try {
            var s = JSON.stringify(res), put = {}, size = 90000, c = Math.ceil(s.length / size);
            for (var j = 0; j < c; j++) put[HSCH_CACHE_KEY + '_' + j] = s.substr(j * size, size);
            cache.putAll(put, 120);
            cache.put(HSCH_CACHE_KEY + '_n', String(c), 120);
        } catch (e) { /* not cached — still returns fresh data */ }
    }
    return res;
}

function _hschBuildData_() {
    try {
        var sh = _hschSheet_(false);
        var meta = _hschMeta_();
        if (!sh || sh.getLastRow() < 2) return { success: true, exists: false };
        var subs = _hschSubmissions_(_hschSinceMs_(meta));
        var dbInfo = hyperStoreDbMap_();   // AMM / CM from the store DB, not the (possibly wrong) stamp on records
        var todayStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
        var naMap = (typeof _hyperStoreNa_ === 'function') ? _hyperStoreNa_() : {};   // per-store "module doesn't apply" (FollowUpEmail.gs)
        var rows = sh.getDataRange().getValues().slice(1).filter(function(r) { return r[0]; }).map(function(r) {
            var code = String(r[0]).trim(), got = subs.inRound[code] || {};
            var st = {}, n = 0, lastMs = 0, na = naMap[code] || [];
            var need = HSCH_TYPES.filter(function(t) { return na.indexOf(t.key) === -1; }).length;
            HSCH_TYPES.forEach(function(t) {
                var skip = na.indexOf(t.key) > -1;
                if (got[t.key]) { st[t.key] = got[t.key].str; if (!skip) n++; if (got[t.key].ms > lastMs) lastMs = got[t.key].ms; } else st[t.key] = '';
            });
            var date = _cellDateStr(r[5]);
            var info = subs.info[code] || {};
            if (dbInfo[code] && dbInfo[code].amm) info = { amm: dbInfo[code].amm, cm: dbInfo[code].cm || info.cm || '' };
            return { code: code, name: r[1], format: r[2], region: r[3], critical: r[4] === 'Yes', date: date, time: String(r[6]), skip: parseInt(r[7], 10) || 0,
                     amm: info.amm || '', cm: info.cm || '', st: st, done: n, need: need, na: na, complete: n >= need,
                     overdue: n < need && date < todayStr, lastMs: lastMs };
        });
        var total = rows.length, complete = rows.filter(function(r) { return r.complete; }).length;
        var started = rows.filter(function(r) { return r.done > 0 && !r.complete; }).length;
        var perType = {};
        HSCH_TYPES.forEach(function(t) { perType[t.key] = rows.filter(function(r) { return r.st[t.key]; }).length; });
        return { success: true, exists: true, today: todayStr,
            meta: { round: meta['round'] || '', startDate: meta['startDate'] || '', deadline: meta['deadline'] || '', uploadTimeFrom: meta['uploadTimeFrom'] || '08:00', uploadTimeTo: meta['uploadTimeTo'] || '17:00',
                    maxPerDay: parseInt(meta['maxPerDay'], 10) || 20, createdAt: meta['createdAt'] || '', formats: JSON.parse(meta['formats'] || '[]') },
            summary: { total: total, complete: complete, started: started, notStarted: total - complete - started, critical: rows.filter(function(r) { return r.critical; }).length,
                       overdue: rows.filter(function(r) { return r.overdue; }).length, perType: perType },
            types: HSCH_TYPES.map(function(t) { return { key: t.key, label: t.label }; }),
            rows: rows };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// Move every store that is overdue and not complete to the next working days that still have room.
function rescheduleOverdueHyper() {
    var lock = null;
    try {
        lock = _acquireWriteLock_();
        var sh = _hschSheet_(false), meta = _hschMeta_();
        if (!sh || sh.getLastRow() < 2) return { success: true, rescheduled: 0 };
        var subs = _hschSubmissions_(_hschSinceMs_(meta));
        var now = new Date(), todayStr = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd');
        var maxPerDay = parseInt(meta['maxPerDay'], 10) || 20;
        var data = sh.getDataRange().getValues();
        var count = {}, overdue = [];
        var naMap = (typeof _hyperStoreNa_ === 'function') ? _hyperStoreNa_() : {};
        for (var i = 1; i < data.length; i++) {
            if (!data[i][0]) continue;
            var got = subs.inRound[String(data[i][0]).trim()] || {}, na = naMap[String(data[i][0]).trim()] || [];
            var complete = HSCH_TYPES.every(function(t) { return got[t.key] || na.indexOf(t.key) > -1; });
            var d = _cellDateStr(data[i][5]);
            if (complete) continue;
            if (d < todayStr) overdue.push(i + 1); else count[d] = (count[d] || 0) + 1;
        }
        if (!overdue.length) return { success: true, rescheduled: 0 };
        var dl = meta['deadline'] ? new Date(meta['deadline'] + 'T23:59:59') : new Date(now.getTime() + 30 * 864e5);
        var days = _workingDays(new Date(now.getTime() - 864e5 + 1), dl);   // from today
        if (!days.length) days = _workingDays(now, new Date(now.getTime() + 14 * 864e5));
        var ws = 8 * 60, we = 17 * 60;
        overdue.forEach(function(rowNo) {
            var day = null;
            for (var k = 0; k < days.length; k++) { var ds = _dateStr(days[k]); if ((count[ds] || 0) < maxPerDay) { day = ds; break; } }
            if (!day) day = _dateStr(days[days.length - 1]);
            var pos = count[day] || 0, step = maxPerDay > 1 ? Math.floor((we - ws) / (maxPerDay - 1)) : 0, m = Math.min(ws + step * pos, we - 1);
            count[day] = pos + 1;
            sh.getRange(rowNo, 6, 1, 2).setNumberFormat('@').setValues([[day, _timeStr(Math.floor(m / 60), m % 60)]]);
            sh.getRange(rowNo, 8).setValue((parseInt(sh.getRange(rowNo, 8).getValue(), 10) || 0) + 1);
            sh.getRange(rowNo, 10).setValue(new Date());
        });
        _hschClearCache_();
        return { success: true, rescheduled: overdue.length };
    } catch (e) {
        return { success: false, error: e.toString() };
    } finally {
        if (lock) lock.releaseLock();
    }
}

function clearHyperSchedule() {
    var lock = null;
    try {
        lock = _acquireWriteLock_();
        var sh = _hschSheet_(false);
        if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, HSCH_HEADERS.length).clearContent();
        _hschClearCache_();
        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    } finally {
        if (lock) lock.releaseLock();
    }
}
