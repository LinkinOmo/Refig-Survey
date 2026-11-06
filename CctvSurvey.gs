// --- CCTV Survey (กล้องวงจรปิด — branch requests + LP screening) ---
// From the LP / Area CCTV review meeting (Oct 2026): branches list every extra camera point they want,
// with the reason and a photo of the spot + angle, then LP / Area screen each point down to the
// "must have" ones that reduce shrink. One card per requested POINT (zone, qty, existing coverage,
// risk, people-counting, must/nice), plus store-level baseline (cameras online / analog / broken,
// shrink % current / Act 2026 / Estimate). Runs on HyperSurveyEngine.gs (CRUD, photos, list, delete)
// with the points in one Points_JSON cell; summary columns are computed by _cctvExtraColumns_.
// Screening decisions are written back into Points_JSON by screenCctvSurvey().
// Covers ALL formats (Hyper + Mini / Market ...), not only big format — the store list is merged client-side.

var CCTV_SHEET = "CCTV_Survey_Database";
var CCTV_FOLDER = "CCTV_Survey_Attachments";
var CCTV_COST_PER_POINT = 33000;   // average budget per camera point incl. system + installation (meeting figure)

// focus: the 4 main risk groups LP named in the meeting (receiving/PR, backroom/stockroom, SBA/HBA, cashier/exit)
var CCTV_ZONES = [
    { k: 'pr',      l: 'จุดรับสินค้า Receiving / PR', focus: true },
    { k: 'back',    l: 'Backroom / ทางเดินหลังร้าน', focus: true },
    { k: 'stock',   l: 'Stockroom / GR', focus: true },
    { k: 'hba',     l: 'SBA (ตาเขียว) / HBA', focus: true },
    { k: 'cash',    l: 'Cashier / ช่องทางออก', focus: true },
    { k: 'door',    l: 'ประตูทางเข้า-ออก (นับคน)' },
    { k: 'dry',     l: 'Dry Food' },
    { k: 'fresh',   l: 'Fresh Food' },
    { k: 'nonfood', l: 'Non-Food / เครื่องใช้ไฟฟ้า' },
    { k: 'high',    l: 'สุรา / บุหรี่ / สินค้ามูลค่าสูง' },
    { k: 'sales',   l: 'พื้นที่ขายอื่นๆ (Sales Floor)' },
    { k: 'service', l: 'Service / เคาน์เตอร์บริการ' },
    { k: 'cashoff', l: 'ห้องเงิน / Cash Office' },
    { k: 'loading', l: 'Loading B2B' },
    { k: 'park',    l: 'ลานจอดรถ (Parking)' },
    { k: 'base',    l: 'ชั้นใต้ดิน (Basement)' },
    { k: 'food',    l: 'Food Court' },
    { k: 'gold',    l: 'ร้านทอง' },
    { k: 'wc',      l: 'ทางเข้าห้องน้ำ (ไม่ใช่ภายใน)' },
    { k: 'other',   l: 'อื่นๆ' }
];
var CCTV_REQ_TYPES = ['เพิ่มจุดใหม่ (New)', 'ย้าย / ปรับมุมกล้องเดิม', 'ทดแทนกล้องเสีย (Replace)'];
var CCTV_COVERAGE = ['ไม่มีกล้องเลย', 'มีแต่มุมไม่เห็นจุดเสี่ยง / ไม่ครอบคลุม', 'มีกล้องแต่เสีย / ภาพไม่ชัด', 'ครอบคลุมแล้ว (ขอเสริม)'];
var CCTV_RISKS = ['สินค้าสูญหาย / Shrink', 'ทุจริตภายใน (พนักงาน / Vendor)', 'ตรวจสอบการรับสินค้า', 'ความปลอดภัยลูกค้า', 'ความปลอดภัยพนักงาน', 'เงินสด / ทรัพย์สิน', 'นับจำนวนลูกค้า (Traffic)'];
var CCTV_DEPTS = ['Dry Food', 'HBA / SBA', 'Fresh Food', 'Non-Food', 'เครื่องใช้ไฟฟ้า / IT', 'สุรา / บุหรี่', 'นมผง / Baby', 'Service / ไม่ระบุแผนก', 'อื่นๆ'];
var CCTV_CAM_TYPES = ['Fixed (มุมคงที่)', 'PTZ (หมุนได้)', 'Fisheye 360°', 'People Counting (นับคน)', 'ให้ LP แนะนำ'];
var CCTV_NEED = ['Must have', 'Nice to have'];
var CCTV_DECISIONS = ['อนุมัติ', 'อนุมัติบางส่วน (ลดจำนวน)', 'ตัดออก', 'รอข้อมูลเพิ่ม'];

function _ccNum_(v) { var n = parseFloat(v); return isNaN(n) || n < 0 ? 0 : n; }
function _ccNumOrBlank_(v) { if (v === '' || v == null) return ''; var n = parseFloat(v); return isNaN(n) ? '' : n; }
function _ccInt_(v) { var n = parseInt(v, 10); return isNaN(n) || n < 0 ? 0 : n; }
function _ccTxt_(v, m) { return String(v == null ? '' : v).trim().substring(0, m || 120); }
function _ccPick_(v, list) { return list.indexOf(v) > -1 ? v : ''; }
function _ccPicks_(arr, list) { return (Array.isArray(arr) ? arr : []).filter(function(v) { return list.indexOf(v) > -1; }); }
function _ccZoneKeys_() { return CCTV_ZONES.map(function(z) { return z.k; }); }
function _ccFocusKeys_() { return CCTV_ZONES.filter(function(z) { return z.focus; }).map(function(z) { return z.k; }); }

// keepScr: screening results are only ever trusted from the stored sheet value, never from a submission
function _cctvParsePoints_(raw, keepScr) {
    var arr = raw;
    if (typeof raw === 'string') { try { arr = JSON.parse(raw); } catch (e) { arr = []; } }
    if (!Array.isArray(arr)) arr = [];
    var zoneKeys = _ccZoneKeys_();
    return arr.slice(0, 80).map(function(p, i) {
        var qty = Math.min(_ccInt_(p.qty), 50);
        var pt = {
            pid: _ccTxt_(p.pid, 10) || ('C' + (i + 1)), zone: _ccPick_(p.zone, zoneKeys), zoneOther: _ccTxt_(p.zoneOther, 80),
            name: _ccTxt_(p.name, 120), floor: _ccTxt_(p.floor, 20), req: _ccPick_(p.req, CCTV_REQ_TYPES), qty: qty,
            cov: _ccPick_(p.cov, CCTV_COVERAGE), exist: _ccInt_(p.exist), risk: _ccPicks_(p.risk, CCTV_RISKS), dept: _ccPick_(p.dept, CCTV_DEPTS),
            inc: _ccInt_(p.inc), cam: _ccPick_(p.cam, CCTV_CAM_TYPES), count: !!p.count, need: _ccPick_(p.need, CCTV_NEED),
            reason: _ccTxt_(p.reason, 500), nt: _ccTxt_(p.nt, 300), pk: _ccTxt_(p.pk, 60)
        };
        if (keepScr && p.scr && p.scr.dec) {
            var dec = _ccPick_(p.scr.dec, CCTV_DECISIONS);
            if (dec) pt.scr = { dec: dec, aq: Math.min(_ccInt_(p.scr.aq), qty), note: _ccTxt_(p.scr.note, 300), by: _ccTxt_(p.scr.by, 80), at: _ccTxt_(p.scr.at, 30) };
        }
        return pt;
    });
}

// Approved qty of one point: 'อนุมัติ' = full qty, 'บางส่วน' = aq, ตัด / รอ / not screened = 0
function _cctvApprovedQty_(p) {
    if (!p.scr) return 0;
    if (p.scr.dec === CCTV_DECISIONS[0]) return p.qty;
    if (p.scr.dec === CCTV_DECISIONS[1]) return p.scr.aq;
    return 0;
}

// Summary columns derived from the points (shared by submit and screening)
function _cctvPointSummary_(points) {
    var focus = _ccFocusKeys_();
    var sum = function(f) { return points.reduce(function(a, p) { return a + f(p); }, 0); };
    var reqQty = sum(function(p) { return p.qty; });
    var mustQty = sum(function(p) { return p.need === CCTV_NEED[0] ? p.qty : 0; });
    var screened = points.filter(function(p) { return p.scr && p.scr.dec && p.scr.dec !== CCTV_DECISIONS[3]; }).length;
    var apprQty = sum(_cctvApprovedQty_);
    // compact per-zone [requested, must-have, approved] so the report can aggregate by zone without Points_JSON
    var zq = {};
    points.forEach(function(p) {
        var z = p.zone || 'other';
        zq[z] = zq[z] || [0, 0, 0];
        zq[z][0] += p.qty; if (p.need === CCTV_NEED[0]) zq[z][1] += p.qty; zq[z][2] += _cctvApprovedQty_(p);
    });
    return {
        'Points': points.length,
        'Requested Qty': reqQty,
        'New Qty': sum(function(p) { return p.req === CCTV_REQ_TYPES[0] ? p.qty : 0; }),
        'Relocate Qty': sum(function(p) { return p.req === CCTV_REQ_TYPES[1] ? p.qty : 0; }),
        'Replace Qty': sum(function(p) { return p.req === CCTV_REQ_TYPES[2] ? p.qty : 0; }),
        'Must-have Qty': mustQty,
        'Focus-zone Qty': sum(function(p) { return focus.indexOf(p.zone) > -1 ? p.qty : 0; }),
        'People Counting Qty': sum(function(p) { return p.count ? p.qty : 0; }),
        'No-coverage Points': points.filter(function(p) { return p.cov === CCTV_COVERAGE[0]; }).length,
        'Est. Budget (THB)': reqQty * CCTV_COST_PER_POINT,
        'Must-have Budget (THB)': mustQty * CCTV_COST_PER_POINT,
        'Screening Status': !points.length ? '' : screened === 0 ? 'รอคัดกรอง' : screened < points.length ? 'คัดกรองบางส่วน' : 'คัดกรองแล้ว',
        'Approved Qty': apprQty,
        'Approved Budget (THB)': apprQty * CCTV_COST_PER_POINT,
        'Zone_Qty_JSON': JSON.stringify(zq)
    };
}

function _cctvExtraColumns_(form) {
    if (form.pointsJson === undefined) return {};   // comment-only edits never wipe the points
    var points = _cctvParsePoints_(form.pointsJson, false);
    var json = JSON.stringify(points);
    if (json.length > 48000) throw new Error('ข้อมูลจุดกล้องมากเกินไปสำหรับ 1 รายการ กรุณาแบ่งส่ง 2 รายการ');
    var out = {
        'Cam Online': _ccInt_(form.camOnline),
        'Cam Analog / Offline': _ccInt_(form.camAnalog),
        'Cam Broken': _ccInt_(form.camBroken),
        'Doors Total': _ccInt_(form.doorsTotal),
        'Doors With People Counter': _ccInt_(form.doorsCounting),
        'Shrink Current %': _ccNumOrBlank_(form.shrinkCurPct),
        'Shrink Act 2026 %': _ccNumOrBlank_(form.shrinkActPct),
        'Shrink Act 2026 (THB)': _ccNumOrBlank_(form.shrinkActVal),
        'Shrink Estimate %': _ccNumOrBlank_(form.shrinkEstPct),
        'Shrink Estimate (THB)': _ccNumOrBlank_(form.shrinkEstVal),
        'Risk Depts': _ccPicks_(String(form.riskDepts || '').split('|'), CCTV_DEPTS).join(', ')
    };
    var s = _cctvPointSummary_(points);
    Object.keys(s).forEach(function(k) { out[k] = s[k]; });
    out['Screened By'] = '';
    out['Screening Note'] = '';
    out['Points_JSON'] = json;
    return out;
}

function _cctvEmailExtra_(counts, esc) {
    var pts = [];
    try { pts = JSON.parse(counts['Points_JSON'] || '[]'); } catch (e) {}
    var zl = {};
    CCTV_ZONES.forEach(function(z) { zl[z.k] = z.l; });
    var h = '<p style="margin:12px 0 4px;"><b>สรุปคำขอกล้อง</b> — ' + counts['Points'] + ' จุด · ขอ ' + counts['Requested Qty'] + ' ตัว (Must have ' + counts['Must-have Qty'] +
        ' ตัว) · งบประมาณประมาณการ ' + Number(counts['Est. Budget (THB)']).toLocaleString() + ' ฿ (' + CCTV_COST_PER_POINT.toLocaleString() + ' ฿/จุด)</p>';
    h += '<p style="margin:0 0 6px;font-size:12px;color:#475569;">กล้องปัจจุบัน: Online ' + counts['Cam Online'] + ' · Analog/Offline ' + counts['Cam Analog / Offline'] + ' · เสีย ' + counts['Cam Broken'] +
        ' · Shrink ปัจจุบัน ' + (counts['Shrink Current %'] === '' ? '-' : counts['Shrink Current %'] + '%') + '</p>';
    h += '<table style="width:100%;border-collapse:collapse;font-size:11px;"><tr style="background:#f1f5f9;text-align:left;"><th style="padding:4px;">จุด</th><th style="padding:4px;">จำนวน</th><th style="padding:4px;">กล้องเดิม</th><th style="padding:4px;">เหตุผล</th></tr>';
    pts.forEach(function(p) {
        h += '<tr><td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + esc(p.pid + ' ' + [zl[p.zone] || '-', p.name].filter(Boolean).join(' · ')) + '</td>' +
            '<td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + p.qty + (p.need === CCTV_NEED[0] ? ' <b style="color:#b91c1c;">Must</b>' : '') + '</td>' +
            '<td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + esc(p.cov || '-') + '</td>' +
            '<td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + esc(p.reason || '-') + '</td></tr>';
    });
    return h + '</table>';
}

var CCTV_DEF = {
    name: 'CCTV Survey', emoji: '📹',
    sheet: CCTV_SHEET, folder: CCTV_FOLDER,
    idPrefix: 'CCTV', keyPrefix: 'cctv_', photoFilePrefix: 'cctv', headerColor: '#1e3a8a',
    brokenLabel: 'กล้องเสียที่ต้องซ่อมทันที',
    histType: 'Cctv',
    categories: [], system: [], groups: [],
    grandTotal: { label: '', header: '' },
    catTemp: { a: { suffix: 'a', headerSuffix: ' a', label: '-' }, b: { suffix: 'b', headerSuffix: ' b', label: '-' }, rule: 'gap', threshold: 999 },
    extraColumns: _cctvExtraColumns_,
    emailExtra: _cctvEmailExtra_,
    listSkip: ['Points_JSON']
};

function getCctvConfig_() {
    return { zones: CCTV_ZONES, reqTypes: CCTV_REQ_TYPES, coverage: CCTV_COVERAGE, risks: CCTV_RISKS, depts: CCTV_DEPTS,
             camTypes: CCTV_CAM_TYPES, need: CCTV_NEED, decisions: CCTV_DECISIONS, costPerPoint: CCTV_COST_PER_POINT };
}
function processCctvSurveyForm(form) { return hyperSurveySubmit_(CCTV_DEF, form); }
function getCctvSurveyList(includeArchive) {
    var r = hyperSurveyList_(CCTV_DEF, includeArchive);
    r.ccConfig = getCctvConfig_();
    return r;
}
function getCctvSurveyRecordById(id) {
    var r = hyperSurveyRecordById_(CCTV_DEF, id);
    if (r.success) { r.data.Points_JSON = _cctvParsePoints_(r.data.Points_JSON || '[]', true); r.ccConfig = getCctvConfig_(); }
    return r;
}
function updateCctvSurveyRecord(form) { return hyperSurveyUpdate_(CCTV_DEF, form); }
function deleteCctvSurveyRecord(id, clientEmail) { return hyperSurveyDelete_(CCTV_DEF, id, clientEmail); }
function addCctvSurveyPhotos(id, unitKey, files, clientEmail) { return hyperSurveyAddPhotos_(CCTV_DEF, id, unitKey, files, clientEmail); }
function deleteCctvSurveyPhoto(id, unitKey, url, clientEmail) { return hyperSurveyDeletePhoto_(CCTV_DEF, id, unitKey, url, clientEmail); }

// ─── LP / Area screening — per point: decision + approved qty + note ─────────────
// decisions: [{ pid, dec, aq, note }]; a point missing from the list keeps its previous decision.
// Same permission as editing a survey (Admin / Schedule admin / SMF / Ops edit toggle).
function screenCctvSurvey(id, decisions, note, clientEmail) {
    try {
        var userEmail = clientEmail || Session.getActiveUser().getEmail();
        if (!_hsCanEdit_(checkSurveyAdminStatus(userEmail))) return { success: false, error: 'ต้องเป็น Admin / ผู้มีสิทธิ์แก้ไขแบบสำรวจ จึงจะคัดกรองได้' };
        var _wlock = _acquireWriteLock_();
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CCTV_SHEET);
        if (!sheet) return { success: false, error: 'Sheet not found' };
        var found = _hsFindRow_(sheet, id);
        if (found.rowIndex === -1) return { success: false, error: 'Record not found' };
        var headers = found.headers;
        var rowVals = found.data[found.rowIndex - 1].slice();
        var pIdx = headers.indexOf('Points_JSON');
        if (pIdx === -1) return { success: false, error: 'Points_JSON column not found' };
        var points = _cctvParsePoints_(rowVals[pIdx] || '[]', true);
        var byPid = {};
        (Array.isArray(decisions) ? decisions : []).forEach(function(d) { if (d && d.pid) byPid[String(d.pid)] = d; });
        var at = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
        points.forEach(function(p) {
            var d = byPid[p.pid];
            if (!d) return;
            var dec = _ccPick_(d.dec, CCTV_DECISIONS);
            if (!dec) { delete p.scr; return; }
            var aq = dec === CCTV_DECISIONS[0] ? p.qty : dec === CCTV_DECISIONS[1] ? Math.min(_ccInt_(d.aq), p.qty) : 0;
            p.scr = { dec: dec, aq: aq, note: _ccTxt_(d.note, 300), by: _ccTxt_(userEmail, 80), at: at };
        });
        var updates = _cctvPointSummary_(points);
        updates['Points_JSON'] = JSON.stringify(points);
        updates['Screened By'] = userEmail + ' · ' + at;
        updates['Screening Note'] = _ccTxt_(note, 1000);
        Object.keys(updates).forEach(function(k) {
            var idx = headers.indexOf(k);
            if (idx === -1) {
                headers.push(k);
                sheet.getRange(1, headers.length).setValue(k);
                idx = headers.length - 1;
            }
            rowVals[idx] = updates[k];
        });
        while (rowVals.length < headers.length) rowVals.push('');
        sheet.getRange(found.rowIndex, 1, 1, headers.length).setValues([rowVals]);
        return { success: true, summary: updates };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}
