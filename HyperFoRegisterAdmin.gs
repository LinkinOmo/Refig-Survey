// ─── Hyper Fresh Food register — admin upload ────────────────────────────────
// The register that pre-fills Fresh Food cards ("📥 เติมการ์ดจากทะเบียน") used to be baked into
// HyperFreshFoodRegister.gs by build_fo_register.py, so every update needed a code push. Admins can now
// upload the "FF Inspection" Excel on ?page=fo-register: the page reads the 'main machine' sheet in the
// browser and sends the FF-equipment rows here; we map them to Fresh Food categories (same rules as
// build_fo_register.py), show a preview, and on confirm write them to the Hyper_FO_Register sheet.
// getHyperFoRegister() reads the uploaded register when one is active, else falls back to the built-in
// HYPER_FO_REGISTER. The upload being replaced is kept in Hyper_FO_Register_Prev for one-step undo.
//
// Raw row from the client: [storeCode, serviceTypeName, assetName, quantity, installYear, newPrice, repair5y, remark]
// Stored row / register row:  [catId, sizeKey, qty, installYear, newPriceTHB, repair5yTHB, remark]

var HFO_REG_SHEET = 'Hyper_FO_Register';
var HFO_REG_PREV_SHEET = 'Hyper_FO_Register_Prev';
var HFO_REG_META = 'HYPER_FO_REGISTER_META_V1';
var HFO_REG_PREV_META = 'HYPER_FO_REGISTER_PREV_META_V1';
var HFO_REG_CACHE = 'HFO_REG_MAP_V1';
var HFO_REG_HEADERS = ['Store Code', 'Category', 'Size', 'Qty', 'Install Year', 'New Price (THB)', 'Repair 5y (THB)', 'Remark'];

// (service type name or null, keyword in asset name or null) -> [category id, size key]
// Keep in sync with MAP in build_fo_register.py and the categories in HYPER_FO_DEF.
var HFO_REG_MAP = [
    ['RACK OVEN', null, 'rackOven', 'U'],
    ['Deck Oven', null, 'deckOven', 'U'],
    ['Convention Oven', null, 'convOven', 'U'],
    ['ProoFer Machine', null, 'proofer', 'U'],
    ['Donut Fryer', null, 'donutFryer', 'U'],
    ['Hot Two Plate', null, 'cakeWarmer', 'U'],
    ['Dough Sheeter', null, 'doughSheeter', 'U'],
    ['Bread moulder', null, 'breadMoulder', 'U'],
    ['Hydraulic Divider', null, 'hydDivider', 'U'],
    ['Bun Divider', null, 'bunDivider', 'U'],
    ['Bread Slicer', null, 'breadSlicer', 'U'],
    ['Planetary Mixer', null, 'planetaryMixer', '5L'],
    ['Spiral Mixer 20L', null, 'spiralMixer', '20L'],
    ['Spiral Mixer 60L', null, 'spiralMixer', '60L'],
    ['Spiral Mixer 80L', null, 'spiralMixer', '80L'],
    ['Spiral Mixer 120L', null, 'spiralMixer', '120L'],
    ['Combi Oven', null, 'combiOven', 'U'],
    ['Fryer', 'Delica', 'fryer', 'DEL'],
    ['Fryer', 'Seafood', 'fryer', 'SEA'],
    ['Warmer Machine', 'ไก่', 'roaster', 'U'],
    ['Warmer Machine', 'แกง', 'curryWarmer', 'U'],
    ['Water Cooler', null, 'waterCooler', 'U'],
    ['Meat Chopper', null, 'meatChopper', 'U'],
    [null, 'เลื่อยกระดูก', 'boneSaw', 'U'],
    [null, 'สูญญากาศ', 'vacuumPacker', 'U']
];

function _hfoRegIsAdmin_(email) {
    if (!email) return false;
    try {
        var c = checkAdminStatus(email);
        return !!(c && (c.isAdmin || c.isSysAdmin));
    } catch (e) { return false; }
}

function _hfoRegMapRow_(svc, asset) {
    svc = String(svc || '').trim();
    asset = String(asset || '');
    for (var i = 0; i < HFO_REG_MAP.length; i++) {
        var m = HFO_REG_MAP[i];
        if (m[0] !== null && m[0].toLowerCase() !== svc.toLowerCase()) continue;
        if (m[0] === null && svc) continue;
        if (m[1] && asset.indexOf(m[1]) === -1) continue;
        return [m[2], m[3]];
    }
    return null;
}

function _hfoRegNum_(v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'string' && !/^\s*[\d,.]+\s*$/.test(v)) return '';
    var n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) || n < 0 ? '' : Math.round(n);
}

// Wrong codes in the FF inspection file itself, checked against its Thai store names (keep in sync with CODE_FIX in
// build_fo_register.py): 11255 holds both บ่อวิน (correct) and อรัญประเทศ (FAD 11232) rows; 11113 พิษณุโลก's FAD
// branch code is not in the Hyper store list. [code, Thai-name fragment ('' = any), 6-digit code]
var HFO_REG_CODE_FIX = [['11255', 'อรัญ', '111242'], ['11113', '', '110012']];
// Uploads committed before this rule (they used '1' + code) are ignored in favour of the built-in register.
var HFO_REG_CODE_RULE = 2;

// Source store code -> 6-digit Hyper code. Never '1' + gold code: the two drift apart from ~11220
// (gold 11230 Ban Phai = 111236, while 111230 is Kanchanaburi). Gold codes go through the FAD register.
function _hfoRegCode_(c0, name, hyper, gold) {
    for (var i = 0; i < HFO_REG_CODE_FIX.length; i++) {
        var f = HFO_REG_CODE_FIX[i];
        if (c0 === f[0] && String(name || '').indexOf(f[1]) > -1) return f[2];
    }
    if (hyper[c0]) return c0;
    if (gold.hasOwnProperty(c0)) return hyper[gold[c0]] ? gold[c0] : null;
    return hyper['1' + c0] ? '1' + c0 : null;   // only for codes that are not a gold code at all
}

// Raw client rows -> { reg: {code: [rows]}, stats, unmatched, unmapped }. Pure — no sheet access.
// Row: [store code, service type, asset name, qty, year, new price, repair 5y, remark, store name (optional)]
function _hfoRegBuild_(raw) {
    var hyper = {}, gold = {};
    HYPER_REF_STORES.forEach(function(s) { hyper[String(s[0])] = s; });
    HYPER_FA_STORES.forEach(function(s) { if (s[1]) gold[s[0]] = s[1]; });
    var thisYear = new Date().getFullYear();
    var reg = {}, unmatched = {}, unmapped = {}, skipped = 0;
    (raw || []).forEach(function(r) {
        if (!r || r[0] === null || r[0] === undefined || r[0] === '') { skipped++; return; }
        var c0 = String(r[0]).trim().replace(/\.0+$/, '');
        var code = _hfoRegCode_(c0, r[8], hyper, gold);
        if (!code) { unmatched[c0] = (unmatched[c0] || 0) + 1; return; }
        var m = _hfoRegMapRow_(r[1], r[2]);
        if (!m) {
            var k = String(r[1] || '(ว่าง)') + ' | ' + String(r[2] || '');
            unmapped[k] = (unmapped[k] || 0) + 1;
            return;
        }
        var q = Number(r[3]);
        var qty = (typeof r[3] === 'number' || /^\s*\d+\s*$/.test(String(r[3] || ''))) && isFinite(q) && q >= 0 && q === Math.floor(q) ? q : 0;   // 'ไม่มี' / blank = none
        var y = Number(r[4]);
        var yr = isFinite(y) && y === Math.floor(y) && y >= 1970 && y <= thisYear + 1 ? y : '';
        var remark = String(r[7] || '').trim().slice(0, 80);
        (reg[code] = reg[code] || []).push([m[0], m[1], qty, yr, _hfoRegNum_(r[5]), _hfoRegNum_(r[6]), remark]);
    });
    return { reg: reg, stats: _hfoRegStats_(reg), unmatched: unmatched, unmapped: unmapped, skipped: skipped };
}

function _hfoRegStats_(reg) {
    var stores = Object.keys(reg || {});
    var rows = 0, units = 0;
    stores.forEach(function(c) { reg[c].forEach(function(x) { rows++; units += Number(x[2]) || 0; }); });
    return { stores: stores.length, rows: rows, units: units };
}

function _hfoRegGetMeta_(key) {
    try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(key) || 'null'); } catch (e) { return null; }
}

function _hfoRegReadSheet_(name) {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return null;
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, HFO_REG_HEADERS.length).getValues();
    var reg = {};
    vals.forEach(function(v) {
        var code = String(v[0]).trim();
        if (!code) return;
        (reg[code] = reg[code] || []).push([String(v[1]), String(v[2]), Number(v[3]) || 0, v[4] === '' ? '' : Number(v[4]), v[5] === '' ? '' : Number(v[5]), v[6] === '' ? '' : Number(v[6]), String(v[7] || '')]);
    });
    return reg;
}

function _hfoRegWriteSheet_(name, reg) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.clearContents();
    var out = [HFO_REG_HEADERS];
    Object.keys(reg).sort().forEach(function(code) { reg[code].forEach(function(x) { out.push([code].concat(x)); }); });
    sh.getRange(1, 1, out.length, HFO_REG_HEADERS.length).setValues(out);
    sh.setFrozenRows(1);
}

// Active register: { reg, source, uploaded: bool }. Uploaded one is cached (chunked) for 6 h.
function _hfoRegActive_() {
    var meta = _hfoRegGetMeta_(HFO_REG_META);
    if (meta && meta.active && (meta.codeRule || 0) >= HFO_REG_CODE_RULE) {
        var cache = CacheService.getScriptCache();
        try {
            var n = parseInt(cache.get(HFO_REG_CACHE + '_n'), 10);
            if (n > 0) {
                var keys = [];
                for (var i = 0; i < n; i++) keys.push(HFO_REG_CACHE + '_' + i);
                var got = cache.getAll(keys);
                var json = keys.map(function(k) { return got[k]; });
                if (json.every(function(x) { return typeof x === 'string'; })) return { reg: JSON.parse(json.join('')), source: meta.source, uploaded: true };
            }
        } catch (e) {}
        var reg = _hfoRegReadSheet_(HFO_REG_SHEET);
        if (reg) {
            try {
                var s = JSON.stringify(reg), store = {}, c = 0;
                for (var p = 0; p < s.length; p += 90000) store[HFO_REG_CACHE + '_' + c++] = s.substring(p, p + 90000);
                store[HFO_REG_CACHE + '_n'] = String(c);
                cache.putAll(store, 21600);
            } catch (e2) {}
            return { reg: reg, source: meta.source, uploaded: true };
        }
    }
    return {
        reg: typeof HYPER_FO_REGISTER !== 'undefined' ? HYPER_FO_REGISTER : {},
        source: typeof HYPER_FO_REGISTER_SOURCE !== 'undefined' ? HYPER_FO_REGISTER_SOURCE : '',
        uploaded: false
    };
}

function _hfoRegClearCache_() {
    try { CacheService.getScriptCache().remove(HFO_REG_CACHE + '_n'); } catch (e) {}
}

function _hfoRegStoreSummary_(reg) {
    var names = {};
    HYPER_REF_STORES.forEach(function(s) { names[String(s[0])] = s[2] || s[1]; });
    return Object.keys(reg).sort().map(function(code) {
        var units = 0, types = {};
        reg[code].forEach(function(x) { units += Number(x[2]) || 0; if (Number(x[2]) > 0) types[x[0]] = 1; });
        return [code, names[code] || '', units, Object.keys(types).length, reg[code].length];
    });
}

// ── Page API ─────────────────────────────────────────────────────────────────
function getHyperFoRegisterAdminInfo(clientEmail) {
    if (!_hfoRegIsAdmin_(clientEmail)) return { success: false, error: 'Admins only' };
    try {
        var act = _hfoRegActive_();
        var builtIn = typeof HYPER_FO_REGISTER !== 'undefined' ? HYPER_FO_REGISTER : {};
        var prev = _hfoRegGetMeta_(HFO_REG_PREV_META);
        return {
            success: true,
            uploaded: act.uploaded,
            source: act.source,
            meta: _hfoRegGetMeta_(HFO_REG_META),
            stats: _hfoRegStats_(act.reg),
            builtIn: { source: typeof HYPER_FO_REGISTER_SOURCE !== 'undefined' ? HYPER_FO_REGISTER_SOURCE : '', stats: _hfoRegStats_(builtIn) },
            prev: prev,
            stores: _hfoRegStoreSummary_(act.reg)
        };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// Dry run: what the upload would produce, plus a per-store comparison against the active register.
function previewHyperFoRegisterUpload(clientEmail, raw) {
    if (!_hfoRegIsAdmin_(clientEmail)) return { success: false, error: 'Admins only' };
    try {
        var b = _hfoRegBuild_(raw);
        var cur = _hfoRegActive_().reg;
        var curSum = {};
        _hfoRegStoreSummary_(cur).forEach(function(r) { curSum[r[0]] = r[2]; });
        var stores = _hfoRegStoreSummary_(b.reg).map(function(r) { return r.concat([curSum[r[0]] !== undefined ? curSum[r[0]] : null]); });
        var removed = Object.keys(curSum).filter(function(c) { return !b.reg[c]; });
        return { success: true, stats: b.stats, unmatched: b.unmatched, unmapped: b.unmapped, skipped: b.skipped, stores: stores, removed: removed, current: _hfoRegStats_(cur) };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function commitHyperFoRegisterUpload(clientEmail, raw, fileName) {
    if (!_hfoRegIsAdmin_(clientEmail)) return { success: false, error: 'Admins only' };
    return _hfoRegCommit_(raw, fileName, clientEmail);
}

function _hfoRegCommit_(raw, fileName, clientEmail) {
    try {
        var b = _hfoRegBuild_(raw);
        if (!b.stats.stores) return { success: false, error: 'ไม่พบข้อมูลที่ใช้ได้ในไฟล์ (0 สาขา) — ไม่ได้บันทึก' };
        _acquireWriteLock_();
        var props = PropertiesService.getScriptProperties();
        var meta = _hfoRegGetMeta_(HFO_REG_META);
        // keep the upload being replaced for undo
        if (meta && meta.active) {
            var cur = _hfoRegReadSheet_(HFO_REG_SHEET);
            if (cur) { _hfoRegWriteSheet_(HFO_REG_PREV_SHEET, cur); props.setProperty(HFO_REG_PREV_META, JSON.stringify(meta)); }
        }
        _hfoRegWriteSheet_(HFO_REG_SHEET, b.reg);
        var tz = Session.getScriptTimeZone() || 'Asia/Bangkok';
        var now = new Date();
        var newMeta = {
            active: true,
            source: String(fileName || 'Upload').replace(/\.xlsx?$/i, '').trim() + ' (' + Utilities.formatDate(now, tz, 'yyyy-MM-dd') + ')',
            fileName: String(fileName || ''),
            updatedAt: Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm'),
            updatedBy: clientEmail,
            stats: b.stats,
            codeRule: HFO_REG_CODE_RULE
        };
        props.setProperty(HFO_REG_META, JSON.stringify(newMeta));
        _hfoRegClearCache_();
        try { logUserActivity(clientEmail, 'FO_REGISTER_UPLOAD', newMeta.source + ' — ' + b.stats.stores + ' stores, ' + b.stats.units + ' units'); } catch (le) {}
        return { success: true, meta: newMeta };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// Undo: swap the active upload with the previous one.
function restorePrevHyperFoRegister(clientEmail) {
    if (!_hfoRegIsAdmin_(clientEmail)) return { success: false, error: 'Admins only' };
    try {
        _acquireWriteLock_();
        var props = PropertiesService.getScriptProperties();
        var prevMeta = _hfoRegGetMeta_(HFO_REG_PREV_META);
        var prev = _hfoRegReadSheet_(HFO_REG_PREV_SHEET);
        if (!prevMeta || !prev) return { success: false, error: 'ไม่มีไฟล์ก่อนหน้าให้ย้อนกลับ' };
        var meta = _hfoRegGetMeta_(HFO_REG_META);
        var cur = meta && meta.active ? _hfoRegReadSheet_(HFO_REG_SHEET) : null;
        _hfoRegWriteSheet_(HFO_REG_SHEET, prev);
        prevMeta.active = true;
        props.setProperty(HFO_REG_META, JSON.stringify(prevMeta));
        if (cur) { _hfoRegWriteSheet_(HFO_REG_PREV_SHEET, cur); props.setProperty(HFO_REG_PREV_META, JSON.stringify(meta)); }
        else { props.deleteProperty(HFO_REG_PREV_META); }
        _hfoRegClearCache_();
        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// Stop using the uploaded register and fall back to the built-in one (sheet kept, can be re-activated by undo).
function useBuiltInHyperFoRegister(clientEmail) {
    if (!_hfoRegIsAdmin_(clientEmail)) return { success: false, error: 'Admins only' };
    try {
        _acquireWriteLock_();
        var props = PropertiesService.getScriptProperties();
        var meta = _hfoRegGetMeta_(HFO_REG_META);
        if (!meta || !meta.active) return { success: true };
        var cur = _hfoRegReadSheet_(HFO_REG_SHEET);
        if (cur) { _hfoRegWriteSheet_(HFO_REG_PREV_SHEET, cur); props.setProperty(HFO_REG_PREV_META, JSON.stringify(meta)); }
        meta.active = false;
        props.setProperty(HFO_REG_META, JSON.stringify(meta));
        _hfoRegClearCache_();
        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// Full active register as rows, for the page's "download current" button.
function exportHyperFoRegister(clientEmail) {
    if (!_hfoRegIsAdmin_(clientEmail)) return { success: false, error: 'Admins only' };
    var act = _hfoRegActive_();
    var out = [];
    Object.keys(act.reg).sort().forEach(function(code) { act.reg[code].forEach(function(x) { out.push([code].concat(x)); }); });
    return { success: true, headers: HFO_REG_HEADERS, rows: out, source: act.source };
}
