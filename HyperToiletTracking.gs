// ─── Hyper Toilet — Restroom Tracking reference (Big C Better Restroom Challenge) ─────────────
// The LCD / Operation "Restroom Tracking" workbook (one sheet per month, one row per store) gives the
// store context the toilet survey shows next to the branch: restroom count, customer / staff restroom
// points, housekeepers, HAS certificate, Readiness (Ready / Improve / Urgent Action) and the 4-source
// score (Adopter, Area MTN, HO, Customer → TOTAL SCORE, KPI ≥ 90%).
// Admins upload a newer workbook on ?page=to-tracking: the page reads the chosen sheet in the browser
// (SheetJS) and sends the rows here; _htkMap_() finds the columns by header text (the monthly sheets
// shift columns around), preview → confirm writes Hyper_Toilet_Tracking. Until an upload exists the
// built-in copy HYPER_TO_TRACKING_BUILTIN (HyperToiletTrackingData.gs, 28 Oct 2026 file) is used.

var HTK_SHEET = 'Hyper_Toilet_Tracking';
var HTK_PREV_SHEET = 'Hyper_Toilet_Tracking_Prev';
var HTK_META = 'HYPER_TO_TRACKING_META_V1';
var HTK_PREV_META = 'HYPER_TO_TRACKING_PREV_META_V1';
var HTK_CACHE = 'HTK_MAP_V1';
var HTK_KPI = 90;   // TOTAL SCORE pass mark

function _htkNorm_(h) { return String(h == null ? '' : h).replace(/\s+/g, ' ').trim(); }
function _htkNum_(v) {
    if (v === null || v === undefined || v === '') return '';
    var n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? '' : Math.round(n * 100) / 100;
}
function _htkReady_(v) {
    var s = String(v || '').trim().toLowerCase();
    if (!s) return '';
    if (s.indexOf('urgent') > -1 || s.indexOf('เร่งด่วน') > -1) return 'Urgent Action';
    if (s.indexOf('improve') > -1 || s.indexOf('ควรปรับปรุง') > -1) return 'Improve';
    if (s.indexOf('ready') > -1 || s.indexOf('พร้อมใช้') > -1) return 'Ready';
    return '';
}

// aoa = [headerRow, row, row ...] → { map: {code: rec}, stats, missing: [field], unmatched: [code], rows }
// Pure (no sheet access) so the node build script can run it on the original workbook too.
function _htkMap_(aoa) {
    aoa = aoa || [];
    var head = (aoa[0] || []).map(_htkNorm_);
    var find = function(test, nth) {
        var hits = [];
        head.forEach(function(h, i) { if (test(h)) hits.push(i); });
        return hits.length > (nth || 0) ? hits[nth || 0] : -1;
    };
    var eq = function(t) { return function(h) { return h === t; }; };
    var starts = function(t) { return function(h) { return h.indexOf(t) === 0; }; };
    var col = {
        code: find(eq('Oracle')),
        levels: find(eq('No. Level')),
        custPts: find(eq('ลูกค้า')),
        staffPts: find(eq('พนักงาน')),
        rooms: find(eq('No. of restrooms')) > -1 ? find(eq('No. of restrooms')) : find(eq('รวมจำนวนห้องน้ำ')),
        keepers: find(eq('No. of House Keeper')),
        size: find(eq('Size')),
        format: find(function(h) { return h === 'Fomat' || h === 'Format'; }),
        readiness: find(eq('Readiness'), 1) > -1 ? find(eq('Readiness'), 1) : find(eq('Readiness')),
        startMonth: find(eq('Start Month')),
        vp: find(eq('VP Opt.')),
        region: find(eq('Region')),
        adopterName: find(eq('Adopter')),
        adopter: find(eq('Adopter'), 1),
        hasCert: find(function(h) { return h.indexOf('HAS Cer') === 0 && /yes/i.test(h); }) > -1 ? find(function(h) { return h.indexOf('HAS Cer') === 0 && /yes/i.test(h); }) : find(eq('HAS Certificate')),
        hasColor: find(function(h) { return h.indexOf('HAS Cer') === 0 && /green/i.test(h); }),
        areaMtn: find(eq('Area MTN')),
        ho: find(function(h) { return h === 'HO' || h.indexOf('HO Total Score') === 0; }),
        customer: find(starts('Customer Total Score')) > -1 ? find(starts('Customer Total Score')) : find(eq('Customer')),
        total: find(eq('TOTAL SCORE')),
        plan: find(eq('Improvement Plan Submission')),
        planSent: find(eq('สถานะการส่ง'))
    };
    var missing = ['code', 'rooms', 'readiness', 'total'].filter(function(k) { return col[k] < 0; });
    var known = {};
    (typeof HYPER_REF_STORES !== 'undefined' ? HYPER_REF_STORES : []).forEach(function(s) { known[String(s[0])] = 1; });
    var map = {}, unmatched = [], rows = 0;
    if (col.code < 0) return { map: map, stats: { stores: 0, matched: 0 }, missing: missing, unmatched: unmatched, rows: 0 };
    var v = function(r, k) { return col[k] < 0 ? '' : r[col[k]]; };
    var t = function(r, k, m) { var x = v(r, k); return x === null || x === undefined ? '' : String(x).trim().substring(0, m || 60); };
    aoa.slice(1).forEach(function(r) {
        if (!r) return;
        var code = String(v(r, 'code') == null ? '' : v(r, 'code')).trim().replace(/\.0+$/, '');
        if (!/^\d{6}$/.test(code)) return;
        rows++;
        var plan = t(r, 'plan', 40);
        map[code] = {
            levels: t(r, 'levels', 40), custPts: _htkNum_(v(r, 'custPts')), staffPts: _htkNum_(v(r, 'staffPts')),
            rooms: _htkNum_(v(r, 'rooms')), keepers: _htkNum_(v(r, 'keepers')), size: t(r, 'size', 4), format: t(r, 'format', 8),
            ready: _htkReady_(v(r, 'readiness')), startMonth: t(r, 'startMonth', 20), vp: t(r, 'vp', 60), region: t(r, 'region', 30),
            adopterName: t(r, 'adopterName', 60),
            hasCert: t(r, 'hasCert', 4).toUpperCase(), hasColor: t(r, 'hasColor', 4).toUpperCase(),
            adopter: _htkNum_(v(r, 'adopter')), areaMtn: _htkNum_(v(r, 'areaMtn')), ho: _htkNum_(v(r, 'ho')), customer: _htkNum_(v(r, 'customer')),
            total: _htkNum_(v(r, 'total')),
            plan: plan ? (plan.indexOf('ไม่ต้อง') > -1 ? 'ไม่ต้องส่ง' : 'ต้องส่ง') : '',
            planSent: t(r, 'planSent', 10).toUpperCase()
        };
        if (!known[code]) unmatched.push(code);
    });
    var codes = Object.keys(map);
    return { map: map, stats: { stores: codes.length, matched: codes.length - unmatched.length }, missing: missing, unmatched: unmatched, rows: rows };
}

function _htkIsAdmin_(email) {
    if (!email) return false;
    try { var c = checkAdminStatus(email); return !!(c && (c.isAdmin || c.isSysAdmin)); } catch (e) { return false; }
}
function _htkMeta_(key) { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || 'null'); } catch (e) { return null; } }

function _htkReadSheet_(name) {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return null;
    var map = {};
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function(x) {
        var code = String(x[0]).trim();
        if (!code) return;
        try { map[code] = JSON.parse(x[1]); } catch (e) {}
    });
    return map;
}
function _htkWriteSheet_(name, map) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.clearContents();
    var out = [['Store Code', 'Tracking JSON']];
    Object.keys(map).sort().forEach(function(code) { out.push([code, JSON.stringify(map[code])]); });
    sh.getRange(1, 1, out.length, 2).setValues(out);
    sh.setFrozenRows(1);
}

// Active tracking: { map, source, uploaded }. Uploaded copy cached 6 h (≈60 KB, one cache key).
function getHyperToTracking_() {
    var meta = _htkMeta_(HTK_META);
    if (meta && meta.active) {
        var cache = CacheService.getScriptCache();
        try { var hit = cache.get(HTK_CACHE); if (hit) return { map: JSON.parse(hit), source: meta.source, uploaded: true }; } catch (e) {}
        var map = _htkReadSheet_(HTK_SHEET);
        if (map) {
            try { cache.put(HTK_CACHE, JSON.stringify(map), 21600); } catch (e2) {}
            return { map: map, source: meta.source, uploaded: true };
        }
    }
    return {
        map: typeof HYPER_TO_TRACKING_BUILTIN !== 'undefined' ? HYPER_TO_TRACKING_BUILTIN : {},
        source: typeof HYPER_TO_TRACKING_SOURCE !== 'undefined' ? HYPER_TO_TRACKING_SOURCE : '',
        uploaded: false
    };
}

// ── Survey tab: one store ──
function getHyperToTrackingFor(code) {
    try {
        var a = getHyperToTracking_();
        return { success: true, t: a.map[String(code)] || null, source: a.source, kpi: HTK_KPI };
    } catch (e) { return { success: false, error: e.toString() }; }
}

// ── Upload page API ──
function getHyperToTrackingAdminInfo(clientEmail) {
    if (!_htkIsAdmin_(clientEmail)) return { success: false, error: 'Admins only' };
    var a = getHyperToTracking_();
    return { success: true, uploaded: a.uploaded, source: a.source, stores: Object.keys(a.map).length, meta: _htkMeta_(HTK_META), prev: _htkMeta_(HTK_PREV_META),
             builtInSource: typeof HYPER_TO_TRACKING_SOURCE !== 'undefined' ? HYPER_TO_TRACKING_SOURCE : '' };
}
function previewHyperToTracking(aoa, clientEmail) {
    if (!_htkIsAdmin_(clientEmail)) return { success: false, error: 'Admins only' };
    try {
        var m = _htkMap_(aoa);
        var cur = getHyperToTracking_().map;
        var changed = 0;
        Object.keys(m.map).forEach(function(c) { if (!cur[c] || cur[c].total !== m.map[c].total || cur[c].ready !== m.map[c].ready) changed++; });
        var ready = {};
        Object.keys(m.map).forEach(function(c) { var k = m.map[c].ready || '(ว่าง)'; ready[k] = (ready[k] || 0) + 1; });
        var under = Object.keys(m.map).filter(function(c) { return m.map[c].total !== '' && m.map[c].total < HTK_KPI; }).length;
        return { success: true, stats: m.stats, missing: m.missing, unmatched: m.unmatched, changed: changed, ready: ready, underKpi: under };
    } catch (e) { return { success: false, error: e.toString() }; }
}
function saveHyperToTracking(aoa, source, clientEmail) {
    if (!_htkIsAdmin_(clientEmail)) return { success: false, error: 'Admins only' };
    var lock = LockService.getScriptLock();
    try {
        lock.waitLock(20000);
        var m = _htkMap_(aoa);
        if (m.missing.length) return { success: false, error: 'ไม่พบคอลัมน์: ' + m.missing.join(', ') };
        if (!m.stats.stores) return { success: false, error: 'ไม่พบข้อมูลสาขา' };
        var props = PropertiesService.getScriptProperties();
        var meta = _htkMeta_(HTK_META);
        var cur = meta && meta.active ? _htkReadSheet_(HTK_SHEET) : null;
        if (cur) { _htkWriteSheet_(HTK_PREV_SHEET, cur); props.setProperty(HTK_PREV_META, JSON.stringify(meta)); }
        _htkWriteSheet_(HTK_SHEET, m.map);
        var newMeta = { active: true, source: String(source || '').substring(0, 120), at: new Date().toISOString(), by: clientEmail, stores: m.stats.stores };
        props.setProperty(HTK_META, JSON.stringify(newMeta));
        try { CacheService.getScriptCache().remove(HTK_CACHE); } catch (e) {}
        return { success: true, meta: newMeta };
    } catch (e) {
        return { success: false, error: e.toString() };
    } finally { lock.releaseLock(); }
}
// Undo: back to the previous upload, or to the built-in copy when there is none
function undoHyperToTracking(clientEmail) {
    if (!_htkIsAdmin_(clientEmail)) return { success: false, error: 'Admins only' };
    var lock = LockService.getScriptLock();
    try {
        lock.waitLock(20000);
        var props = PropertiesService.getScriptProperties();
        var prevMeta = _htkMeta_(HTK_PREV_META), prev = prevMeta ? _htkReadSheet_(HTK_PREV_SHEET) : null;
        if (prev) {
            _htkWriteSheet_(HTK_SHEET, prev);
            props.setProperty(HTK_META, JSON.stringify(prevMeta));
            props.deleteProperty(HTK_PREV_META);
        } else {
            props.deleteProperty(HTK_META);
        }
        try { CacheService.getScriptCache().remove(HTK_CACHE); } catch (e) {}
        return { success: true, source: getHyperToTracking_().source };
    } catch (e) {
        return { success: false, error: e.toString() };
    } finally { lock.releaseLock(); }
}
