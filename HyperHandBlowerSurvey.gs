// --- Hyper Hand Blower Survey (เครื่องเป่ามือ) ---
// One card per hand-dryer UNIT (<branch>-HB01 …) — the Hyper Toilet survey only counts dryers per room
// (qty + broken); this module records each unit as an asset: where it hangs (location / room type / floor),
// brand / type / power / install year / Asset No., working status + problems, condition and hygiene ratings,
// electrical safety (RCD), and the action the surveyor proposes (PM / repair / replace / install new) with a
// priority and a rough budget. A card with status "ไม่มีเครื่อง" records a point that SHOULD have a dryer.
// Runs on HyperSurveyEngine.gs (CRUD, photos, list, delete); all units sit in one HandBlower_JSON cell and the
// summary columns come from _hhbExtraColumns_ (engine hook def.extraColumns), same pattern as HyperParkingSurvey.gs.

var HYPER_HB_SHEET = "Hyper_HandBlower_Survey_Database";
var HYPER_HB_FOLDER = "Hyper_HandBlower_Survey_Attachments";

// Locations / room types copy HYPER_TO_LOCATIONS / HYPER_TO_TYPES (HyperToiletSurvey.gs) so the two surveys read
// side by side — copied, not referenced, because this file loads before HyperToiletSurvey.gs
var HYPER_HB_LOCATIONS = ['พื้นที่ขาย (Sales Floor)', 'Town Center / Mall', 'Food Court', 'หลังร้าน / พนักงาน', 'ลานจอดรถ / ภายนอก', 'อื่นๆ'];
var HYPER_HB_ROOMS = ['ชาย', 'หญิง', 'ผู้พิการ / ทุกคน (Accessible)', 'รวม (Unisex)', 'เด็ก / ห้องให้นมบุตร', 'พนักงานชาย', 'พนักงานหญิง'];
var HYPER_HB_BRANDS = ['Dyson', 'Mitsubishi (Jet Towel)', 'Panasonic', 'TOTO', 'Xlerator (Excel)', 'Mediclinics / Saniflow', 'Dolphin', 'Hafele', 'American Standard', 'ไม่มียี่ห้อ / ไม่ทราบ', 'อื่นๆ'];
// `jet: true` = high-speed type (faster, lower energy per dry) — counted separately in the summary
var HYPER_HB_TYPES = [
    { k: 'jetDown', l: 'Jet แบบสอดมือลง (Hands-in)', jet: true },
    { k: 'jetBlade', l: 'Jet แบบใบมีดลม / แนวนอน (Blade)', jet: true },
    { k: 'warm', l: 'ลมร้อนธรรมดา (Warm Air)' },
    { k: 'tap', l: 'รวมในก๊อก / กระจก (Tap / Mirror)' },
    { k: 'other', l: 'อื่นๆ' }
];
var HYPER_HB_STATUS = ['ใช้งานได้ปกติ', 'ใช้งานได้ แต่มีปัญหา', 'เสีย / ใช้งานไม่ได้', 'ไม่มีเครื่อง (ควรติดตั้ง)'];
var HYPER_HB_PROBLEMS = ['ไม่ทำงาน / ไม่มีไฟเข้า', 'Sensor ไม่ตอบสนอง / ทำงานเอง', 'ลมอ่อน', 'ไม่มีลมร้อน', 'เสียงดังผิดปกติ', 'มีกลิ่นไหม้ / ร้อนผิดปกติ',
    'ฝาครอบแตก / หลวม / หลุด', 'ถาดรองน้ำเต็ม / น้ำหยด', 'ไส้กรองตัน / สกปรก', 'น้ำกระเด็นพื้น / ผนังเสียหาย', 'สายไฟ / ปลั๊กไม่ปลอดภัย', 'ติดตั้งสูง / ต่ำเกินไป', 'อื่นๆ'];
var HYPER_HB_RCD = ['มี RCD / ELCB (กันดูด)', 'ไม่มี', 'ไม่ทราบ'];
var HYPER_HB_ACTIONS = ['ใช้งานต่อ', 'ทำความสะอาด / PM', 'ซ่อม', 'เปลี่ยนเครื่องใหม่', 'ติดตั้งเพิ่ม (จุดใหม่)', 'ถอดออก'];
var HYPER_HB_PRIORITY = ['สูง (ทำทันที)', 'กลาง', 'ต่ำ'];

function _hhbNum_(v) { var n = parseFloat(v); return isNaN(n) || n < 0 ? 0 : n; }
function _hhbInt_(v) { var n = parseInt(v, 10); return isNaN(n) || n < 0 ? 0 : n; }
function _hhbTxt_(v, m) { return String(v == null ? '' : v).trim().substring(0, m || 120); }
function _hhbPick_(v, list) { return list.indexOf(v) > -1 ? v : ''; }
function _hhbPicks_(arr, list) { return (Array.isArray(arr) ? arr : []).filter(function(v) { return list.indexOf(v) > -1; }); }
function _hhbRate_(v) { var n = parseInt(v, 10); return !isNaN(n) && n >= 0 && n <= 5 ? n : ''; }
function _hhbType_(k) { for (var i = 0; i < HYPER_HB_TYPES.length; i++) if (HYPER_HB_TYPES[i].k === k) return HYPER_HB_TYPES[i]; return null; }
function _hhbAvg_(vals) { vals = vals.filter(function(v) { return v !== ''; }); return vals.length ? Math.round(vals.reduce(function(a, b) { return a + b; }, 0) / vals.length * 10) / 10 : ''; }

function _hhbParse_(raw) {
    var o = raw;
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { o = {}; } }
    if (!o || typeof o !== 'object') o = {};
    var year = new Date().getFullYear();
    var units = (Array.isArray(o.units) ? o.units : []).slice(0, 80).map(function(u, i) {
        var status = _hhbPick_(u.status, HYPER_HB_STATUS), missing = status === HYPER_HB_STATUS[3];
        var yr = _hhbInt_(u.year);
        if (yr > 2400) yr -= 543;   // Buddhist-era year typed by mistake
        var unit = {
            uid: _hhbTxt_(u.uid, 10) || ('HB' + String(i + 1).padStart(2, '0')),
            loc: _hhbPick_(u.loc, HYPER_HB_LOCATIONS), room: _hhbPick_(u.room, HYPER_HB_ROOMS), place: _hhbTxt_(u.place, 80), floor: _hhbTxt_(u.floor, 20),
            status: status,
            // a "missing" card is only a point — it has no machine details
            brand: missing ? '' : _hhbPick_(u.brand, HYPER_HB_BRANDS), brandOther: missing ? '' : _hhbTxt_(u.brandOther, 60), model: missing ? '' : _hhbTxt_(u.model, 60),
            type: missing ? '' : (_hhbType_(u.type) ? u.type : ''), watt: missing ? 0 : _hhbInt_(u.watt), year: missing || yr < 1980 || yr > year ? '' : yr,
            asset: missing ? '' : _hhbTxt_(u.asset, 40),
            prob: missing ? [] : _hhbPicks_(u.prob, HYPER_HB_PROBLEMS), probOther: _hhbTxt_(u.probOther, 200),
            cond: missing ? '' : _hhbRate_(u.cond), clean: missing ? '' : _hhbRate_(u.clean), rcd: _hhbPick_(u.rcd, HYPER_HB_RCD),
            action: _hhbPick_(u.action, HYPER_HB_ACTIONS), prio: _hhbPick_(u.prio, HYPER_HB_PRIORITY), budget: _hhbNum_(u.budget), nt: _hhbTxt_(u.nt, 400), pk: _hhbTxt_(u.pk, 60)
        };
        unit.calc = { age: unit.year ? year - unit.year : '', jet: !!(_hhbType_(unit.type) || {}).jet };
        return unit;
    });
    return { units: units };
}

function _hhbExtraColumns_(form) {
    if (form.blowerJson === undefined) return {};   // comment-only edits never wipe the survey
    var d = _hhbParse_(form.blowerJson);
    var json = JSON.stringify(d);
    if (json.length > 48000) throw new Error('ข้อมูลมากเกินไปสำหรับ 1 รายการ กรุณาแบ่งส่ง 2 รายการ');
    var U = d.units, S = HYPER_HB_STATUS, A = HYPER_HB_ACTIONS;
    var machines = U.filter(function(u) { return u.status !== S[3]; });
    var cnt = function(f) { return U.filter(f).length; };
    return {
        'Units Surveyed': U.length,
        'Units Installed': machines.length,
        'Working': cnt(function(u) { return u.status === S[0]; }),
        'With Problem': cnt(function(u) { return u.status === S[1]; }),
        'Broken': cnt(function(u) { return u.status === S[2]; }),
        'Missing Points': cnt(function(u) { return u.status === S[3]; }),
        'Jet Type': machines.filter(function(u) { return u.calc.jet; }).length,
        'Warm Air Type': machines.filter(function(u) { return u.type === 'warm'; }).length,
        'Installed kW': Math.round(machines.reduce(function(a, u) { return a + u.watt; }, 0) / 100) / 10,
        'Avg Age (yrs)': _hhbAvg_(machines.map(function(u) { return u.calc.age; })),
        'Avg Condition (0-5)': _hhbAvg_(machines.map(function(u) { return u.cond; })),
        'Avg Hygiene (0-5)': _hhbAvg_(machines.map(function(u) { return u.clean; })),
        'No RCD': cnt(function(u) { return u.rcd === HYPER_HB_RCD[1]; }),
        'Need PM': cnt(function(u) { return u.action === A[1]; }),
        'Need Repair': cnt(function(u) { return u.action === A[2]; }),
        'Need Replace': cnt(function(u) { return u.action === A[3]; }),
        'Install New': cnt(function(u) { return u.action === A[4]; }),
        'High Priority': cnt(function(u) { return u.prio === HYPER_HB_PRIORITY[0]; }),
        'Est. Budget (THB)': U.reduce(function(a, u) { return a + u.budget; }, 0),
        'HandBlower_JSON': json
    };
}

function _hhbEmailExtra_(counts, esc) {
    var d = {};
    try { d = JSON.parse(counts['HandBlower_JSON'] || '{}'); } catch (e) {}
    var h = '<p style="margin:12px 0 4px;"><b>สรุปเครื่องเป่ามือ</b> — ติดตั้ง ' + counts['Units Installed'] + ' เครื่อง · ปกติ ' + counts['Working'] + ' · มีปัญหา ' + counts['With Problem'] +
        ' · <b style="color:#b91c1c;">เสีย ' + counts['Broken'] + '</b> · จุดที่ควรติดตั้ง ' + counts['Missing Points'] + ' · ไม่มี RCD ' + counts['No RCD'] +
        ' · เปลี่ยน ' + counts['Need Replace'] + ' · ซ่อม ' + counts['Need Repair'] + ' · งบประมาณประมาณการ ' + Number(counts['Est. Budget (THB)']).toLocaleString() + ' ฿</p>';
    var td = 'padding:4px;border-bottom:1px solid #f1f5f9;';
    h += '<table style="width:100%;border-collapse:collapse;font-size:11px;"><tr style="background:#f1f5f9;text-align:left;"><th style="padding:4px;">เครื่อง / ตำแหน่ง</th><th style="padding:4px;">ยี่ห้อ · ประเภท · สถานะ</th><th style="padding:4px;">ดำเนินการ</th></tr>';
    (d.units || []).forEach(function(u) {
        var t = _hhbType_(u.type), bad = u.status === HYPER_HB_STATUS[2] || u.rcd === HYPER_HB_RCD[1];
        h += '<tr><td style="' + td + '">' + esc(u.uid + ' · ' + (u.place || u.room || '-')) + '</td><td style="' + td + (bad ? 'color:#b91c1c;font-weight:bold;' : '') + '">' +
            esc([u.brand === 'อื่นๆ' ? u.brandOther : u.brand, t ? t.l : '', u.status].filter(Boolean).join(' · ')) + '</td><td style="' + td + '">' + esc((u.action || '-') + (u.prio ? ' · ' + u.prio : '')) + '</td></tr>';
    });
    return h + '</table>';
}

var HYPER_HB_DEF = {
    name: 'Hyper Hand Blower Survey', emoji: '🌬️',
    sheet: HYPER_HB_SHEET, folder: HYPER_HB_FOLDER,
    idPrefix: 'HHB', keyPrefix: 'hhb_', photoFilePrefix: 'hyperhandblower', headerColor: '#0891b2',
    brokenLabel: 'จุดอันตราย / ชำรุดเร่งด่วน',
    histType: 'Hb',
    categories: [], system: [], groups: [],
    grandTotal: { label: '', header: '' },
    catTemp: { a: { suffix: 'a', headerSuffix: ' a', label: '-' }, b: { suffix: 'b', headerSuffix: ' b', label: '-' }, rule: 'gap', threshold: 999 },
    extraColumns: _hhbExtraColumns_,
    emailExtra: _hhbEmailExtra_,
    listSkip: ['HandBlower_JSON']
};

function getHyperHbConfig_() {
    return { locations: HYPER_HB_LOCATIONS, rooms: HYPER_HB_ROOMS, brands: HYPER_HB_BRANDS, types: HYPER_HB_TYPES, status: HYPER_HB_STATUS, problems: HYPER_HB_PROBLEMS,
             rcd: HYPER_HB_RCD, actions: HYPER_HB_ACTIONS, priority: HYPER_HB_PRIORITY };
}
function processHyperHbSurveyForm(form) { return hyperSurveySubmit_(HYPER_HB_DEF, form); }
function getHyperHbSurveyList(includeArchive) { var r = hyperSurveyList_(HYPER_HB_DEF, includeArchive); r.hbConfig = getHyperHbConfig_(); return r; }
function getHyperHbSurveyRecordById(id) {
    var r = hyperSurveyRecordById_(HYPER_HB_DEF, id);
    if (r.success) { try { r.data.HandBlower_JSON = JSON.parse(r.data.HandBlower_JSON || '{}'); } catch (e) { r.data.HandBlower_JSON = {}; } r.hbConfig = getHyperHbConfig_(); }
    return r;
}
function updateHyperHbSurveyRecord(form) { return hyperSurveyUpdate_(HYPER_HB_DEF, form); }
function deleteHyperHbSurveyRecord(id, clientEmail) { return hyperSurveyDelete_(HYPER_HB_DEF, id, clientEmail); }
function addHyperHbSurveyPhotos(id, unitKey, files, clientEmail) { return hyperSurveyAddPhotos_(HYPER_HB_DEF, id, unitKey, files, clientEmail); }
function deleteHyperHbSurveyPhoto(id, unitKey, url, clientEmail) { return hyperSurveyDeletePhoto_(HYPER_HB_DEF, id, unitKey, url, clientEmail); }
