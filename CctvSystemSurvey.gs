// --- CCTV System Survey (ตรวจสอบระบบกล้องวงจรปิด / อุปกรณ์ LP — MTN on-site check) ---
// From the 10 Nov 2026 meeting (broken-equipment data / budget / closing-store assets) and LP's
// "เสีย / รอซ่อม 1,544 รายการ" email (11 Nov 2026): 628 of 738 broken cameras sit at "รอยืนยัน —
// ให้ MTN สรุปว่าซ่อมได้หรือไม่ได้", EAS waits on the same answer. This survey is that answer:
// MTN / contractor checks every LP-listed broken device ON SITE and splits each group into
//   ใช้งานได้แล้ว · ซ่อมได้ (OPEX, cost split equipment / labour / climbing / test) · ต้องเปลี่ยนใหม่ (CAPEX LP) · ไม่พบ / ยกเลิกใช้งาน
// and raises a NEW CMS only for what really needs repair (the old CMS data is not the working base).
//
// Cross references:
//   • LP register — built-in CSYS_LP_BUILTIN (CctvLpRegisterData.gs, from LP's xlsx) or an admin
//     re-upload stored in sheet CCTV_LP_Register (report page → "อัปโหลดไฟล์ LP").
//   • CMS Dashboard data app — spreadsheet 1N9IR8… sheet bcm_work_orders (1 row per CMS, uploaded
//     5×/day by the CMS download notebook; BU = BCM + Donjai + Hyper). Read-only here: categories
//     CCTV&SOUND + เสาสัญญาณกันขโมย. LP's "แจ้งแล้ว (261050193)" numbers are looked up there too.
// Store keys: LP + CMS use the 5-digit gold code; Hyper surveys use the 6-digit branch code →
// _csysGold_ maps via _fuStoreIndex_ (never add/strip a leading "1", see store-code memory).
// Runs on HyperSurveyEngine.gs (CRUD, photos, list, delete), items in one Items_JSON cell.

var CSYS_SHEET = 'CCTV_System_Survey_Database';
var CSYS_FOLDER = 'CCTV_System_Survey_Attachments';
var CSYS_LP_SHEET = 'CCTV_LP_Register';
var CSYS_CMS_SS_ID = '1N9IR8JvvcrKF8h1hNxlG9SDivbBcTUTeXbbak29uBbM';   // CMS Dashboard data spreadsheet
var CSYS_CMS_SHEET = 'bcm_work_orders';
var CSYS_CMS_CATS = ['CCTV&SOUND', 'เสาสัญญาณกันขโมย'];
var CSYS_CMS_CACHE = 'CSYS_CMS_V2';
var CSYS_OPEX_LIMIT = 5000;        // meeting: general repair without a new asset, ≤ 5,000 ฿ → OPEX
var CSYS_REC_DAYS_MIN = 30;        // draft standard: recording kept ≥ 30 days
// 3D walkthrough video (Google Drive file, shared anyone-with-link). Manual: Manuals App ?page=csys-manual
var CSYS_VIDEO_ID = '';

// Equipment types. lp = index in LP's category list (หมวด 1..6), -1 = not in LP's file.
var CSYS_TYPES = [
    { k: 'cam', l: 'กล้องวงจรปิด (Camera)', lp: 5, base: true },
    { k: 'dvr', l: 'เครื่องบันทึก DVR / NVR', lp: -1, base: true },
    { k: 'hdd', l: 'Hard Disk / Storage', lp: 2, base: true },
    { k: 'mon', l: 'จอ TV / Monitor', lp: 0, base: true },
    { k: 'ups', l: 'UPS', lp: 1, base: true },
    { k: 'eas', l: 'เสาสัญญาณกันขโมย (EAS)', lp: 3, base: true },
    { k: 'tag', l: 'เครื่องทำลาย TAG (Deactivator)', lp: 4, base: true },
    { k: 'net', l: 'สายสัญญาณ / Adapter / PoE Switch', lp: -1 },
    { k: 'joy', l: 'Joystick / Keyboard ควบคุม', lp: -1 },
    { k: 'oth', l: 'อื่นๆ', lp: -1 }
];
var CSYS_LP_CATS = ['mon', 'ups', 'hdd', 'eas', 'tag', 'cam'];
var CSYS_CAUSES = ['เสื่อมสภาพตามอายุ', 'ไฟกระชาก / ฟ้าผ่า', 'โดนน้ำ / ความชื้น', 'สายขาด / หลุด / Adapter เสีย', 'ถอดออกช่วง Renovate', 'ถูกทำลาย / ชน', 'ตกรุ่น / อะไหล่ไม่มี', 'ไม่ทราบสาเหตุ'];
var CSYS_PURPOSES = ['ตรวจซ่อม (สาขาเปิดดำเนินการ)', 'สาขาปิด — เก็บกู้อุปกรณ์'];
var CSYS_ROLES = ['MTN สาขา', 'AMM / ทีม MTN', 'ผู้รับเหมา (Vendor)', 'LP / Area LP', 'อื่นๆ'];
var CSYS_ONLINE = ['เชื่อมต่อทุกกล้อง', 'บางส่วน', 'ไม่เชื่อมต่อ', 'ไม่มีระบบออนไลน์'];
var CSYS_DEST = ['Warehouse ตลาดนิมิต', 'สำนักงานใหญ่ (HO)', 'โอนให้สาขาอื่น', 'ขายซาก / ทิ้ง'];
// Re-check standard (draft v1 — meeting action: "กำหนดเกณฑ์ตรวจเช็กอุปกรณ์ซ้ำ"). OK / NG / NA each.
var CSYS_CHECKS = [
    { k: 'img', l: 'ภาพทุกช่อง (Channel) ขึ้นจอ ชัด ไม่กระพริบ' },
    { k: 'rec', l: 'บันทึกภาพได้ และเปิดดูย้อนหลังได้' },
    { k: 'days', l: 'เก็บภาพย้อนหลังได้ ≥ ' + CSYS_REC_DAYS_MIN + ' วัน' },
    { k: 'time', l: 'วันที่ / เวลาบนเครื่องบันทึกถูกต้อง' },
    { k: 'hddh', l: 'HDD ไม่มีแจ้งเตือน (Health / S.M.A.R.T.)' },
    { k: 'ups', l: 'UPS สำรองไฟได้จริง (ทดสอบถอดปลั๊ก)' },
    { k: 'online', l: 'เชื่อมต่อศูนย์ควบคุม / Command Center ได้' },
    { k: 'room', l: 'ห้อง CCTV สะอาด ระบายความร้อนดี ไม่มีน้ำรั่ว' },
    { k: 'cable', l: 'สายสัญญาณ / Adapter / ปลั๊ก เรียบร้อย ไม่หลุดหลวม' },
    { k: 'eas', l: 'เสา EAS มีเสียง / ไฟเตือนเมื่อทดสอบ Tag' },
    { k: 'tag', l: 'เครื่องทำลาย TAG ทำลายสัญญาณได้' }
];
var CSYS_CHECK_VALS = ['OK', 'NG', 'NA'];

function _csNum_(v) { var n = parseFloat(v); return isNaN(n) || n < 0 ? 0 : Math.round(n * 100) / 100; }
function _csInt_(v) { var n = parseInt(v, 10); return isNaN(n) || n < 0 ? 0 : n; }
function _csIntOrBlank_(v) { if (v === '' || v == null) return ''; var n = parseInt(v, 10); return isNaN(n) || n < 0 ? '' : n; }
function _csTxt_(v, m) { return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().substring(0, m || 120); }
function _csPick_(v, list) { return list.indexOf(v) > -1 ? v : ''; }
function _csTypeKeys_() { return CSYS_TYPES.map(function(t) { return t.k; }); }
function _csTypeLabel_(k) { for (var i = 0; i < CSYS_TYPES.length; i++) if (CSYS_TYPES[i].k === k) return CSYS_TYPES[i].l; return k || '-'; }
function _csCmsNo_(v) { var m = String(v == null ? '' : v).match(/\b(2\d{8})\b/); return m ? m[1] : ''; }

// ─── Items (one card = one group of the same device type at one store) ───────────
// q: total in the group; result split qOk + qFix + qNew + qNone must equal q (enforced client-side,
// clamped here). Repair cost (for the qFix units) is split equipment / labour / climbing / test so
// quotations can be checked; replacement = unitNew × qNew unless reuse from a closing store.
function _csysParseItems_(raw) {
    var arr = raw;
    if (typeof raw === 'string') { try { arr = JSON.parse(raw); } catch (e) { arr = []; } }
    if (!Array.isArray(arr)) arr = [];
    var types = _csTypeKeys_();
    return arr.slice(0, 120).map(function(p, i) {
        var q = Math.min(Math.max(_csInt_(p.q), 1), 500);
        var it = {
            iid: _csTxt_(p.iid, 10) || ('I' + (i + 1)), type: _csPick_(p.type, types) || 'oth', loc: _csTxt_(p.loc, 160), q: q,
            sym: _csTxt_(p.sym, 200), cause: _csPick_(p.cause, CSYS_CAUSES),
            qOk: _csInt_(p.qOk), qFix: _csInt_(p.qFix), qNew: _csInt_(p.qNew), qNone: _csInt_(p.qNone),
            fix: _csTxt_(p.fix, 300), cEq: _csNum_(p.cEq), cLab: _csNum_(p.cLab), cClimb: _csNum_(p.cClimb), cTest: _csNum_(p.cTest),
            unitNew: _csNum_(p.unitNew), reuse: !!p.reuse, brand: _csTxt_(p.brand, 60), model: _csTxt_(p.model, 60),
            cmsOld: _csTxt_(p.cmsOld, 120), newCms: _csCmsNo_(p.newCms), nt: _csTxt_(p.nt, 300), pk: _csTxt_(p.pk, 60)
        };
        // clamp the split so it never exceeds the group size (fill order: ok → fix → new → none)
        var left = q;
        ['qOk', 'qFix', 'qNew', 'qNone'].forEach(function(k) { it[k] = Math.min(it[k], left); left -= it[k]; });
        if (p.lp && typeof p.lp === 'object') {
            it.lp = { st: _csTxt_(p.lp.st, 120), flt: _csTxt_(p.lp.flt, 160), sym: _csTxt_(p.lp.sym, 160), q: _csInt_(p.lp.q),
                      cms: (Array.isArray(p.lp.cms) ? p.lp.cms : []).map(_csCmsNo_).filter(Boolean).slice(0, 20) };
        }
        return it;
    });
}
function _csysRepairCost_(it) { return it.qFix ? it.cEq + it.cLab + it.cClimb + it.cTest : 0; }
function _csysNewCost_(it) { return it.qNew && !it.reuse ? it.unitNew * it.qNew : 0; }
function _csysNeedsCms_(it) { return it.qFix + it.qNew > 0; }

function _csysItemSummary_(items) {
    var sum = function(f) { return items.reduce(function(a, it) { return a + f(it); }, 0); };
    var tq = {};   // per type [qty, ok, fix, new, none]
    items.forEach(function(it) {
        var t = tq[it.type] || (tq[it.type] = [0, 0, 0, 0, 0]);
        t[0] += it.q; t[1] += it.qOk; t[2] += it.qFix; t[3] += it.qNew; t[4] += it.qNone;
    });
    var need = items.filter(_csysNeedsCms_);
    return {
        'Items': items.length,
        'Qty Checked': sum(function(it) { return it.q; }),
        'Qty OK Now': sum(function(it) { return it.qOk; }),
        'Qty Repairable': sum(function(it) { return it.qFix; }),
        'Qty Replace': sum(function(it) { return it.qNew; }),
        'Qty Not Found': sum(function(it) { return it.qNone; }),
        'Qty Unresolved': sum(function(it) { return it.q - it.qOk - it.qFix - it.qNew - it.qNone; }),
        'Reuse Qty': sum(function(it) { return it.reuse ? it.qNew : 0; }),
        'Repair OPEX (THB)': sum(_csysRepairCost_),
        'Replace CAPEX (THB)': sum(_csysNewCost_),
        'OPEX Over Limit Items': items.filter(function(it) { return _csysRepairCost_(it) > CSYS_OPEX_LIMIT; }).length,
        'CMS Needed': need.length,
        'CMS Entered': need.filter(function(it) { return it.newCms; }).length,
        'LP Items': items.filter(function(it) { return it.lp; }).length,
        'Type_Qty_JSON': JSON.stringify(tq)
    };
}

function _csysParseChecks_(raw) {
    var o = raw, out = {};
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { o = {}; } }
    CSYS_CHECKS.forEach(function(c) { var v = _csPick_(o && o[c.k], CSYS_CHECK_VALS); if (v) out[c.k] = v; });
    return out;
}
function _csysParseHarvest_(raw) {
    var o = raw, out = {};
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { o = {}; } }
    CSYS_TYPES.forEach(function(t) {
        var h = o && o[t.k];
        if (!h) return;
        var r = { ok: _csInt_(h.ok), bad: _csInt_(h.bad), old: _csInt_(h.old) };
        if (r.ok + r.bad + r.old) out[t.k] = r;
    });
    return out;
}

function _csysExtraColumns_(form) {
    if (form.itemsJson === undefined) return {};   // comment-only edits never wipe the items
    var items = _csysParseItems_(form.itemsJson);
    var json = JSON.stringify(items);
    if (json.length > 48000) throw new Error('รายการอุปกรณ์มากเกินไปสำหรับ 1 รายการ กรุณาแบ่งส่ง 2 รายการ (เช่น แยกกล้อง / EAS)');
    var checks = _csysParseChecks_(form.checksJson);
    var harvest = _csysParseHarvest_(form.harvestJson);
    var out = {
        'Gold Code': _csysGold_(form.branchCode),
        'Survey Purpose': _csPick_(form.purpose, CSYS_PURPOSES) || CSYS_PURPOSES[0],
        'Reporter Role': _csPick_(form.reporterRole, CSYS_ROLES),
        'Vendor Company': _csTxt_(form.vendorCompany, 120),
        'Recording Days': _csIntOrBlank_(form.recDays),
        'Online Command Center': _csPick_(form.online, CSYS_ONLINE),
        'Cam Analog': _csIntOrBlank_(form.camAnalog),
        'Cam IP': _csIntOrBlank_(form.camIp)
    };
    CSYS_TYPES.filter(function(t) { return t.base; }).forEach(function(t) {
        var p = 'Base ' + t.k.toUpperCase() + ' ';
        out[p + 'Total'] = _csIntOrBlank_(form['base_' + t.k + '_total']);
        out[p + 'Working'] = _csIntOrBlank_(form['base_' + t.k + '_ok']);
        out[p + 'Broken'] = _csIntOrBlank_(form['base_' + t.k + '_bad']);
    });
    out['Checks NG'] = Object.keys(checks).filter(function(k) { return checks[k] === 'NG'; }).length;
    out['Checks Done'] = Object.keys(checks).length;
    out['Checks_JSON'] = JSON.stringify(checks);
    var s = _csysItemSummary_(items);
    Object.keys(s).forEach(function(k) { out[k] = s[k]; });
    var hv = Object.keys(harvest);
    out['Harvest Working Qty'] = hv.reduce(function(a, k) { return a + harvest[k].ok; }, 0);
    out['Harvest Broken Qty'] = hv.reduce(function(a, k) { return a + harvest[k].bad + harvest[k].old; }, 0);
    out['Harvest Destination'] = _csPick_(form.harvestDest, CSYS_DEST);
    out['Removal Date'] = /^\d{4}-\d{2}-\d{2}$/.test(String(form.removalDate || '')) ? form.removalDate : '';
    out['Harvest_JSON'] = JSON.stringify(harvest);
    out['Items_JSON'] = json;
    return out;
}

function _csysEmailExtra_(counts, esc) {
    var items = [];
    try { items = JSON.parse(counts['Items_JSON'] || '[]'); } catch (e) {}
    var h = '<p style="margin:12px 0 4px;"><b>ผลตรวจอุปกรณ์</b> — ' + counts['Items'] + ' รายการ · ' + counts['Qty Checked'] + ' ชิ้น: ใช้งานได้แล้ว ' + counts['Qty OK Now'] +
        ' · ซ่อมได้ ' + counts['Qty Repairable'] + ' · ต้องเปลี่ยนใหม่ ' + counts['Qty Replace'] + ' · ไม่พบ/ยกเลิก ' + counts['Qty Not Found'] + '</p>';
    h += '<p style="margin:0 0 6px;font-size:12px;color:#475569;">ประมาณการ OPEX ซ่อม ' + Number(counts['Repair OPEX (THB)']).toLocaleString() + ' ฿ · CAPEX เปลี่ยนใหม่ ' +
        Number(counts['Replace CAPEX (THB)']).toLocaleString() + ' ฿ · ต้องเปิด CMS ' + counts['CMS Needed'] + ' รายการ</p>';
    h += '<table style="width:100%;border-collapse:collapse;font-size:11px;"><tr style="background:#f1f5f9;text-align:left;"><th style="padding:4px;">อุปกรณ์</th><th style="padding:4px;">จำนวน</th><th style="padding:4px;">ผล (ได้/ซ่อม/ใหม่/ไม่พบ)</th><th style="padding:4px;">วิธีแก้</th></tr>';
    items.forEach(function(it) {
        h += '<tr><td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + esc(it.iid + ' ' + _csTypeLabel_(it.type) + (it.loc ? ' · ' + it.loc : '')) + '</td>' +
            '<td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + it.q + '</td>' +
            '<td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + [it.qOk, it.qFix, it.qNew, it.qNone].join(' / ') + '</td>' +
            '<td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + esc(it.fix || '-') + '</td></tr>';
    });
    return h + '</table>';
}

var CCTV_SYS_DEF = {
    name: 'CCTV System Survey', emoji: '🎥',
    sheet: CSYS_SHEET, folder: CSYS_FOLDER,
    idPrefix: 'CSYS', keyPrefix: 'csys_', photoFilePrefix: 'csys', headerColor: '#0f766e',
    brokenLabel: 'ปัญหาเร่งด่วน (ระบบล่มทั้งชุด / ไม่มีภาพบันทึก)',
    histType: 'CctvSys',
    categories: [], system: [], groups: [],
    grandTotal: { label: '', header: '' },
    catTemp: { a: { suffix: 'a', headerSuffix: ' a', label: '-' }, b: { suffix: 'b', headerSuffix: ' b', label: '-' }, rule: 'gap', threshold: 999 },
    extraColumns: _csysExtraColumns_,
    emailExtra: _csysEmailExtra_,
    listSkip: ['Items_JSON', 'Checks_JSON', 'Harvest_JSON']
};

function getCctvSysConfig_() {
    return { types: CSYS_TYPES, causes: CSYS_CAUSES, purposes: CSYS_PURPOSES, roles: CSYS_ROLES, online: CSYS_ONLINE, dest: CSYS_DEST,
             checks: CSYS_CHECKS, checkVals: CSYS_CHECK_VALS, opexLimit: CSYS_OPEX_LIMIT, recDaysMin: CSYS_REC_DAYS_MIN, lpCats: CSYS_LP_CATS };
}
function processCctvSysSurveyForm(form) {
    var r = hyperSurveySubmit_(CCTV_SYS_DEF, form);
    if (r.success) _csysClearOverviewCache_();
    return r;
}
function getCctvSysSurveyList(includeArchive) {
    var r = hyperSurveyList_(CCTV_SYS_DEF, includeArchive);
    r.csConfig = getCctvSysConfig_();
    return r;
}
function getCctvSysSurveyRecordById(id) {
    var r = hyperSurveyRecordById_(CCTV_SYS_DEF, id);
    if (r.success) {
        r.data.Items_JSON = _csysParseItems_(r.data.Items_JSON || '[]');
        r.data.Checks_JSON = _csysParseChecks_(r.data.Checks_JSON || '{}');
        r.data.Harvest_JSON = _csysParseHarvest_(r.data.Harvest_JSON || '{}');
        r.csConfig = getCctvSysConfig_();
        // CMS status of every CMS number on the record (LP-cited old ones + newly raised ones)
        try {
            var nos = {};
            r.data.Items_JSON.forEach(function(it) { if (it.newCms) nos[it.newCms] = 1; ((it.lp && it.lp.cms) || []).forEach(function(n) { nos[n] = 1; }); });
            r.cmsLookup = _csysCmsLookup_(Object.keys(nos));
        } catch (e) { r.cmsLookup = {}; }
    }
    return r;
}
function updateCctvSysSurveyRecord(form) {
    var r = hyperSurveyUpdate_(CCTV_SYS_DEF, form);
    if (r.success) _csysClearOverviewCache_();
    return r;
}
function deleteCctvSysSurveyRecord(id, clientEmail) {
    var r = hyperSurveyDelete_(CCTV_SYS_DEF, id, clientEmail);
    if (r.success) _csysClearOverviewCache_();
    return r;
}
function addCctvSysSurveyPhotos(id, unitKey, files, clientEmail) { return hyperSurveyAddPhotos_(CCTV_SYS_DEF, id, unitKey, files, clientEmail); }
function deleteCctvSysSurveyPhoto(id, unitKey, url, clientEmail) { return hyperSurveyDeletePhoto_(CCTV_SYS_DEF, id, unitKey, url, clientEmail); }

// ─── After submission: record the NEW CMS number raised for each item (and fix the split) ──
// updates: [{ iid, newCms }]. Admin / edit-toggle users or the original reporter.
function updateCctvSysItemCms(id, updates, clientEmail) {
    try {
        var userEmail = clientEmail || Session.getActiveUser().getEmail();
        var _wlock = _acquireWriteLock_();
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CSYS_SHEET);
        if (!sheet) return { success: false, error: 'Sheet not found' };
        var found = _hsFindRow_(sheet, id);
        if (found.rowIndex === -1) return { success: false, error: 'Record not found' };
        var headers = found.headers, rowVals = found.data[found.rowIndex - 1].slice();
        var owner = String(rowVals[headers.indexOf('Reporter Email')] || '').trim().toLowerCase();
        if (!_hsCanEdit_(checkSurveyAdminStatus(userEmail)) && !(owner && owner === String(userEmail || '').trim().toLowerCase()))
            return { success: false, error: 'ต้องเป็น Admin / ผู้มีสิทธิ์แก้ไข หรือผู้ส่งแบบสำรวจ' };
        var iIdx = headers.indexOf('Items_JSON');
        if (iIdx === -1) return { success: false, error: 'Items_JSON column not found' };
        var items = _csysParseItems_(rowVals[iIdx] || '[]');
        var byId = {};
        (Array.isArray(updates) ? updates : []).forEach(function(u) { if (u && u.iid) byId[String(u.iid)] = u; });
        items.forEach(function(it) { var u = byId[it.iid]; if (u) it.newCms = _csCmsNo_(u.newCms); });
        var upd = _csysItemSummary_(items);
        upd['Items_JSON'] = JSON.stringify(items);
        Object.keys(upd).forEach(function(k) {
            var idx = headers.indexOf(k);
            if (idx === -1) { headers.push(k); sheet.getRange(1, headers.length).setValue(k); idx = headers.length - 1; }
            rowVals[idx] = upd[k];
        });
        while (rowVals.length < headers.length) rowVals.push('');
        sheet.getRange(found.rowIndex, 1, 1, headers.length).setValues([rowVals]);
        _csysClearOverviewCache_();
        return { success: true, cmsLookup: _csysCmsLookup_(items.map(function(it) { return it.newCms; }).filter(Boolean)) };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Store code: survey Branch Code (6-digit Hyper or gold) → gold code used by LP + CMS ──
function _csysGold_(code) {
    code = String(code || '').trim();
    if (!/^\d{6}$/.test(code)) return code;
    try {
        var db = _fuStoreIndex_().hyperDb(code);
        if (db && db.id) return String(db.id);
    } catch (e) {}
    return code;
}

// ─── LP register: admin upload (sheet) → else built-in ─────────────────────────────
// Stored as JSON split over column A (45,000 chars per cell), meta in B1.
function _csysLpRaw_() {
    try {
        var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CSYS_LP_SHEET);
        if (sh && sh.getLastRow() >= 1) {
            var parts = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(function(r) { return String(r[0] || ''); });
            var reg = JSON.parse(parts.join(''));
            if (reg && reg.stores && reg.broken) { reg.source = 'upload'; return reg; }
        }
    } catch (e) { Logger.log('CCTV LP register sheet unreadable, using built-in: ' + e); }
    var b = CSYS_LP_BUILTIN;
    return { asOf: b.asOf, file: b.file, cats: b.cats, s: b.s, stores: b.stores, broken: b.broken, source: 'builtin' };
}
// → { asOf, file, source, stores: {gold: {name, bu, c: {type: [total, ok, broken]}}}, broken: {gold: [ {type, desc, st, q, sym, cms, flt, lp} ]} }
function _csysLp_() {
    var raw = _csysLpRaw_(), S = raw.s || [];
    var cats = raw.cats || CSYS_LP_CATS;
    var stores = {}, broken = {};
    raw.stores.forEach(function(s) {
        var c = {};
        (s[3] || []).forEach(function(x) { var k = cats[x[0]]; if (k) c[k] = [x[1], x[2], x[3]]; });
        stores[String(s[0])] = { name: s[1], bu: s[2], c: c };
    });
    raw.broken.forEach(function(b) {
        var g = String(b[0]);
        (broken[g] = broken[g] || []).push({ type: cats[b[1]] || 'oth', desc: S[b[2]] || '', st: S[b[3]] || '', q: b[4] || 1,
            sym: S[b[5]] || '', cms: S[b[6]] || '', flt: S[b[7]] || '', lp: S[b[8]] || '' });
    });
    return { asOf: raw.asOf, file: raw.file, source: raw.source, stores: stores, broken: broken };
}
// Broken rows of one store grouped into survey cards: same type + symptom + LP status + LP note + CMS text.
function _csysLpCards_(rows) {
    var groups = {}, order = [];
    (rows || []).forEach(function(r) {
        var key = [r.type, r.sym, r.lp, r.flt, r.cms].join('|');
        var g = groups[key];
        if (!g) { g = groups[key] = { type: r.type, q: 0, sym: r.sym, st: r.lp, flt: r.flt, cmsText: r.cms, descs: {}, cms: [] }; order.push(key); }
        g.q += r.q;
        if (r.desc && !/^(กล้องวงจรปิด|เสาสัญญาณ|เครื่องทำลาย TAG|-)$/.test(r.desc)) g.descs[r.desc] = 1;
        var no = _csCmsNo_(r.cms); if (no && g.cms.indexOf(no) === -1) g.cms.push(no);
    });
    var typeOrder = _csTypeKeys_();
    return order.map(function(k) { var g = groups[k]; g.descs = Object.keys(g.descs).slice(0, 6); return g; })
        .sort(function(a, b) { return typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) || b.q - a.q; });
}

function getCctvLpRegisterInfo(clientEmail) {
    try {
        var lp = _csysLp_(), nStores = 0, nBroken = 0, qBroken = 0;
        Object.keys(lp.broken).forEach(function(g) { nStores++; lp.broken[g].forEach(function(r) { nBroken++; qBroken += r.q; }); });
        var flags = checkSurveyAdminStatus(clientEmail || '');
        return { success: true, asOf: lp.asOf, file: lp.file, source: lp.source, stores: Object.keys(lp.stores).length,
                 brokenStores: nStores, brokenRows: nBroken, brokenQty: qBroken, canUpload: !!(flags.isAdmin || flags.isScheduleAdmin) };
    } catch (e) { return { success: false, error: e.toString() }; }
}
// payload = the same compact shape the Python builder writes (parsed in the browser by csysParseLpWorkbook)
function saveCctvLpRegister(clientEmail, payload, fileName, asOf) {
    try {
        var flags = checkSurveyAdminStatus(clientEmail || '');
        if (!flags.isAdmin && !flags.isScheduleAdmin) return { success: false, error: 'เฉพาะ Admin เท่านั้น' };
        if (!payload || !Array.isArray(payload.stores) || !Array.isArray(payload.broken) || !Array.isArray(payload.s)) return { success: false, error: 'รูปแบบข้อมูลไม่ถูกต้อง' };
        if (payload.stores.length < 50) return { success: false, error: 'พบสาขาเพียง ' + payload.stores.length + ' สาขา — ไฟล์อาจไม่ใช่ไฟล์ LP ฉบับเต็ม' };
        var reg = { asOf: /^\d{4}-\d{2}-\d{2}$/.test(String(asOf || '')) ? asOf : Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd'),
                    file: _csTxt_(fileName, 160), cats: CSYS_LP_CATS, s: payload.s.map(function(x) { return _csTxt_(x, 300); }),
                    stores: payload.stores, broken: payload.broken, by: clientEmail, at: Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm') };
        var json = JSON.stringify(reg);
        if (json.length > 4000000) return { success: false, error: 'ไฟล์ใหญ่เกินไป' };
        var _wlock = _acquireWriteLock_();
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sh = ss.getSheetByName(CSYS_LP_SHEET) || ss.insertSheet(CSYS_LP_SHEET);
        sh.clear();
        var parts = [];
        for (var i = 0; i < json.length; i += 45000) parts.push([json.substring(i, i + 45000)]);
        sh.getRange(1, 1, parts.length, 1).setValues(parts);
        sh.getRange(1, 2).setValue('LP register JSON (CCTV System Survey) — ' + reg.file + ' · ' + reg.asOf + ' · by ' + clientEmail + ' ' + reg.at);
        _csysClearCmsCache_();
        return getCctvLpRegisterInfo(clientEmail);
    } catch (e) { return { success: false, error: e.toString() }; }
}
function useBuiltInCctvLpRegister(clientEmail) {
    try {
        var flags = checkSurveyAdminStatus(clientEmail || '');
        if (!flags.isAdmin && !flags.isScheduleAdmin) return { success: false, error: 'เฉพาะ Admin เท่านั้น' };
        var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CSYS_LP_SHEET);
        if (sh) sh.clear();
        _csysClearCmsCache_();
        return getCctvLpRegisterInfo(clientEmail);
    } catch (e) { return { success: false, error: e.toString() }; }
}

// ─── CMS Dashboard data (read-only) ──────────────────────────────────────────────
// → { asOf, rows: [[no, date, gold, store, bu, cat, status, symptom, detail, vendor, repaired, amount, comment]], error }
// Reads only the needed columns of bcm_work_orders; cached 30 min in 90 KB chunks.
var CSYS_CMS_COLS = ['cms_no', 'date', 'store_code', 'store', 'bu', 'category', 'status', 'symptom', 'symptom_detail', 'vendor', 'date_repaired', 'amount', 'comment'];
function _csysCmsData_() {
    var cache = CacheService.getScriptCache();
    try {
        var n = cache.get(CSYS_CMS_CACHE + '_n');
        if (n) {
            var keys = []; for (var i = 0; i < +n; i++) keys.push(CSYS_CMS_CACHE + '_' + i);
            var got = cache.getAll(keys), s = '';
            for (var j = 0; j < keys.length; j++) { if (got[keys[j]] == null) { s = null; break; } s += got[keys[j]]; }
            if (s) return JSON.parse(s);
        }
    } catch (e) {}
    var out = { asOf: Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm'), rows: [], error: '' };
    try {
        var sh = SpreadsheetApp.openById(CSYS_CMS_SS_ID).getSheetByName(CSYS_CMS_SHEET);
        if (!sh) throw new Error('ไม่พบชีต ' + CSYS_CMS_SHEET + ' ใน CMS Dashboard');
        var last = sh.getLastRow(), lastCol = sh.getLastColumn();
        if (last >= 2) {
            var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
            var catIdx = hdr.indexOf('category');
            if (catIdx < 0) throw new Error('bcm_work_orders ไม่มีคอลัมน์ category');
            var cats = sh.getRange(2, catIdx + 1, last - 1, 1).getValues();
            // keep CCTV / EAS category rows + any row whose number LP cites (LP tickets are often raised under other categories)
            var cited = {};
            try { var lpc = _csysLp_(); Object.keys(lpc.broken).forEach(function(g) { lpc.broken[g].forEach(function(b) { var no = _csCmsNo_(b.cms); if (no) cited[no] = 1; }); }); } catch (eC) {}
            var noIdx = hdr.indexOf('cms_no');
            var nosCol = noIdx > -1 ? sh.getRange(2, noIdx + 1, last - 1, 1).getValues() : [];
            var keep = [];
            for (var r = 0; r < cats.length; r++) {
                if (CSYS_CMS_CATS.indexOf(String(cats[r][0]).trim()) > -1 || (nosCol[r] && cited[_csCmsNo_(nosCol[r][0])])) keep.push(r);
            }
            var cols = CSYS_CMS_COLS.map(function(c) {
                var ci = hdr.indexOf(c);
                return ci < 0 ? null : sh.getRange(2, ci + 1, last - 1, 1).getValues();
            });
            var tz = 'Asia/Bangkok';
            out.rows = keep.map(function(r) {
                return cols.map(function(col, k) {
                    var v = col ? col[r][0] : '';
                    if (v instanceof Date) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
                    if (k === 0) return _csCmsNo_(v) || String(v).replace(/\.0$/, '');
                    if (k === 11) return _csNum_(v);
                    return String(v == null ? '' : v).substring(0, k === 8 || k === 12 ? 160 : 80);
                });
            });
        }
    } catch (e) { out.error = 'อ่านข้อมูล CMS Dashboard ไม่ได้: ' + e.message; }
    try {
        var str = JSON.stringify(out), parts = {};
        var size = 90000, cnt = Math.ceil(str.length / size);
        for (var p = 0; p < cnt; p++) parts[CSYS_CMS_CACHE + '_' + p] = str.substring(p * size, (p + 1) * size);
        parts[CSYS_CMS_CACHE + '_n'] = String(cnt);
        if (!out.error) cache.putAll(parts, 1800);
    } catch (e) {}
    return out;
}
function _csysCmsRowObj_(r) {
    return { no: r[0], date: r[1], gold: r[2], store: r[3], bu: r[4], cat: r[5], status: r[6], sym: r[7], det: r[8], vendor: r[9], rep: r[10], amt: r[11], cmt: r[12] };
}
function _csysCmsLookup_(nos) {
    var want = {}, out = {};
    (nos || []).forEach(function(n) { if (n) want[n] = 1; });
    if (!Object.keys(want).length) return out;
    _csysCmsData_().rows.forEach(function(r) { if (want[r[0]]) out[r[0]] = _csysCmsRowObj_(r); });
    return out;
}
function _csysIsCancelled_(st) { return /ยกเลิก/.test(String(st || '')); }
function _csysIsClosed_(st) { return /ปิดงาน/.test(String(st || '')); }

// ─── Store context for the fill form: LP list (grouped) + CMS jobs + last survey ──
function getCctvSysStoreContext(branchCode) {
    try {
        var gold = _csysGold_(branchCode);
        var lp = _csysLp_();
        var cards = _csysLpCards_(lp.broken[gold]);
        var cms = _csysCmsData_();
        var since = Utilities.formatDate(new Date(Date.now() - 365 * 86400000), 'Asia/Bangkok', 'yyyy-MM-dd');
        var jobs = cms.rows.filter(function(r) { return String(r[2]) === gold && String(r[1]) >= since; }).map(_csysCmsRowObj_)
            .sort(function(a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 80);
        var cited = {};
        cards.forEach(function(c) { c.cms.forEach(function(n) { cited[n] = 1; }); });
        var citedLookup = {};
        cms.rows.forEach(function(r) { if (cited[r[0]]) citedLookup[r[0]] = _csysCmsRowObj_(r); });
        // latest earlier survey of this store
        var prev = null, sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CSYS_SHEET);
        if (sh && sh.getLastRow() > 1) {
            var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(h) { return String(h).trim(); });
            var bi = hdr.indexOf('Branch Code'), ti = hdr.indexOf('Timestamp'), ii = hdr.indexOf('ID'), n = sh.getLastRow() - 1;
            if (bi > -1) {
                var codes = sh.getRange(2, bi + 1, n, 1).getValues();
                for (var i = n - 1; i >= 0; i--) if (String(codes[i][0]).trim() === String(branchCode).trim()) {
                    var t = sh.getRange(i + 2, ti + 1).getValue();
                    prev = { id: sh.getRange(i + 2, ii + 1).getValue(), at: t instanceof Date ? Utilities.formatDate(t, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm') : String(t) };
                    break;
                }
            }
        }
        return { success: true, gold: gold, lp: { asOf: lp.asOf, source: lp.source, store: lp.stores[gold] || null, cards: cards },
                 cms: { asOf: cms.asOf, error: cms.error, jobs: jobs, cited: citedLookup }, prev: prev };
    } catch (e) { return { success: false, error: e.toString() }; }
}

// ─── Report overview: LP × survey × CMS per store (gold code) ─────────────────────
// Overview is computed live (no cache). The CMS read IS cached (30 min) and keys on the LP-cited numbers,
// so only an LP register change clears it.
function _csysClearOverviewCache_() { try { CacheService.getScriptCache().remove('CSYS_TAGS_V1'); } catch (e) {} }   // store tags (✓ ตรวจแล้ว)
function _csysClearCmsCache_() { try { CacheService.getScriptCache().removeAll([CSYS_CMS_CACHE + '_n', 'CSYS_TAGS_V1']); } catch (e) {} }
function getCctvSysOverview(includeArchive) {
    try {
        var lp = _csysLp_(), cms = _csysCmsData_();
        var stores = {};
        var get = function(g) {
            return stores[g] || (stores[g] = { gold: g, name: '', bu: '', lpBroken: 0, lpWait: 0, lpCited: 0, citedCancelled: 0, citedClosed: 0, citedOpen: 0, citedMissing: 0,
                lpType: {}, cmsOpen: 0, cmsCancelled: 0, cmsClosed: 0, cmsLast: '', survey: null });
        };
        var byNo = {};
        cms.rows.forEach(function(r) { byNo[r[0]] = r; });
        Object.keys(lp.broken).forEach(function(g) {
            var s = get(g), st = lp.stores[g] || {};
            s.name = st.name || ''; s.bu = st.bu || '';
            lp.broken[g].forEach(function(r) {
                s.lpBroken += r.q;
                s.lpType[r.type] = (s.lpType[r.type] || 0) + r.q;
                if (/รอยืนยัน|MTN/.test(r.lp + ' ' + r.flt)) s.lpWait += r.q;
                var no = _csCmsNo_(r.cms);
                if (no) {
                    s.lpCited++;
                    var c = byNo[no];
                    if (!c) s.citedMissing++; else if (_csysIsCancelled_(c[6])) s.citedCancelled++; else if (_csysIsClosed_(c[6])) s.citedClosed++; else s.citedOpen++;
                }
            });
        });
        var since = Utilities.formatDate(new Date(Date.now() - 180 * 86400000), 'Asia/Bangkok', 'yyyy-MM-dd');
        cms.rows.forEach(function(r) {
            var g = String(r[2]);
            if (!g || String(r[1]) < since) return;
            if (!stores[g] && _csysIsClosed_(r[6])) return;   // closed jobs alone don't add a row
            var s = get(g);
            if (!s.name) { s.name = r[3]; s.bu = r[4]; }
            if (_csysIsCancelled_(r[6])) s.cmsCancelled++; else if (_csysIsClosed_(r[6])) s.cmsClosed++; else s.cmsOpen++;
            if (r[1] > s.cmsLast) s.cmsLast = r[1];
        });
        // latest survey per store
        var list = hyperSurveyList_(CCTV_SYS_DEF, includeArchive);
        (list.data || []).forEach(function(rec) {
            var g = String(rec['Gold Code'] || _csysGold_(rec['Branch Code']));
            var s = get(g);
            if (s.survey) return;   // list is newest first
            if (!s.name) { s.name = rec['Branch Name']; s.bu = rec['Store Format']; }
            s.survey = { id: rec['ID'], at: rec['Timestamp'], by: rec['Reporter Name'], purpose: rec['Survey Purpose'], q: rec['Qty Checked'], ok: rec['Qty OK Now'],
                fix: rec['Qty Repairable'], neu: rec['Qty Replace'], none: rec['Qty Not Found'], opex: rec['Repair OPEX (THB)'], capex: rec['Replace CAPEX (THB)'],
                cmsNeed: rec['CMS Needed'], cmsIn: rec['CMS Entered'], code: rec['Branch Code'] };
        });
        var rows = Object.keys(stores).map(function(g) { return stores[g]; });
        return { success: true, lpAsOf: lp.asOf, lpSource: lp.source, lpFile: lp.file, cmsAsOf: cms.asOf, cmsError: cms.error, cmsRows: cms.rows.length, rows: rows };
    } catch (e) { return { success: false, error: e.toString() }; }
}

// ─── Item-level rows (latest survey per branch) for the repair-tracking view / Excel ──
function getCctvSysItemRows(includeArchive) {
    try {
        var sheet = _archSheetFor_(CSYS_SHEET, includeArchive);
        if (!sheet || sheet.getLastRow() < 2) return { success: true, rows: [] };
        var values = sheet.getDataRange().getValues();
        var h = values[0].map(function(x) { return String(x).trim(); });
        var ix = function(n) { return h.indexOf(n); };
        var iB = ix('Branch Code'), iN = ix('Branch Name'), iF = ix('Store Format'), iG = ix('Gold Code'), iI = ix('Items_JSON'), iT = ix('Timestamp'), iD = ix('ID'), iA = ix('Attachments_JSON'), iP = ix('Survey Purpose');
        var seen = {}, rows = [], nos = {};
        for (var r = values.length - 1; r >= 1; r--) {
            var v = values[r], code = String(v[iB]).trim();
            if (!code || seen[code]) continue;
            seen[code] = 1;
            var items = _csysParseItems_(iI > -1 ? v[iI] : '[]'), att = {};
            try { att = JSON.parse(iA > -1 ? v[iA] || '{}' : '{}'); } catch (e) {}
            var ts = v[iT] instanceof Date ? Utilities.formatDate(v[iT], 'Asia/Bangkok', 'yyyy-MM-dd') : String(v[iT]).slice(0, 10);
            items.forEach(function(it) {
                if (it.newCms) nos[it.newCms] = 1;
                rows.push({ id: v[iD], code: code, gold: iG > -1 ? String(v[iG]) : '', name: v[iN], fmt: v[iF], date: ts, purpose: iP > -1 ? v[iP] : '',
                    iid: it.iid, type: it.type, loc: it.loc, sym: it.sym, cause: it.cause, q: it.q, qOk: it.qOk, qFix: it.qFix, qNew: it.qNew, qNone: it.qNone,
                    fix: it.fix, repair: _csysRepairCost_(it), cEq: it.cEq, cLab: it.cLab, cClimb: it.cClimb, cTest: it.cTest, unitNew: it.unitNew, reuse: it.reuse,
                    capex: _csysNewCost_(it), newCms: it.newCms, needCms: _csysNeedsCms_(it), lpSt: it.lp ? it.lp.st : '', lpCms: it.lp ? (it.lp.cms || []).join(' ') : '',
                    fromLp: !!it.lp, brand: it.brand, model: it.model, nt: it.nt, photos: (att[it.pk] || []).length });
            });
        }
        var look = _csysCmsLookup_(Object.keys(nos));
        rows.forEach(function(x) { var c = x.newCms && look[x.newCms]; x.newCmsStatus = c ? c.status : (x.newCms ? 'ยังไม่เข้า CMS Dashboard' : ''); });
        return { success: true, rows: rows, csConfig: getCctvSysConfig_() };
    } catch (e) { return { success: false, error: e.toString() }; }
}

// ─── Store tags for the fill form's branch search: which stores LP lists as broken, and which are done ──
// → { tags: { code: { lp: qty, wait: qty, done: 'dd/MM/yyyy' } } } keyed by gold code AND the 6-digit
// Hyper/Market code (the form's store list uses 6-digit codes for big format, gold for Mini).
// Cached 10 min; a submit clears it so "✓ ตรวจแล้ว" shows up right away.
var CSYS_TAG_CACHE = 'CSYS_TAGS_V1';
function getCctvSysStoreTags() {
    try {
        var cache = CacheService.getScriptCache(), hit = cache.get(CSYS_TAG_CACHE);
        if (hit) return JSON.parse(hit);
        var lp = _csysLp_(), tags = {}, ix = null;
        try { ix = _fuStoreIndex_(); } catch (e) {}
        var keysFor = function(gold) {
            var ks = [gold];
            if (ix) {
                var db = ix.byGold[gold], o = db ? String(db.oracle || '') : '';
                if (/^\d{6}$/.test(o) && /^1/.test(gold)) ks.push(o);
                if (ix.goldToBranch[gold]) ks.push(ix.goldToBranch[gold]);
            }
            return ks;
        };
        var nStores = 0, nQty = 0;
        Object.keys(lp.broken).forEach(function(g) {
            var q = 0, w = 0;
            lp.broken[g].forEach(function(r) { q += r.q; if (/รอยืนยัน|MTN/.test(r.lp + ' ' + r.flt)) w += r.q; });
            nStores++; nQty += q;
            keysFor(g).forEach(function(k) { tags[k] = { lp: q, wait: w }; });
        });
        var done = _modDoneBySheet_(CSYS_SHEET), nDone = 0;
        Object.keys(done).forEach(function(code) {
            var gold = _csysGold_(code), lpStore = !!lp.broken[gold];
            if (lpStore) nDone++;
            [code, gold].concat(lpStore ? keysFor(gold) : []).forEach(function(k) { (tags[k] = tags[k] || { lp: 0, wait: 0 }).done = done[code]; });
        });
        var out = { success: true, asOf: lp.asOf, lpStores: nStores, lpQty: nQty, lpDone: nDone, tags: tags };
        try { cache.put(CSYS_TAG_CACHE, JSON.stringify(out), 600); } catch (e) {}
        return out;
    } catch (e) { return { success: false, error: e.toString() }; }
}
