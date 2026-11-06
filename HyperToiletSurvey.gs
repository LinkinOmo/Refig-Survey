// --- Hyper Toilet Survey (toilet improvement project) ---
// One card per toilet ROOM (customer / staff, male / female / accessible ...): fixture counts with how
// many are broken, condition rating per element, problems found, accessibility checks for accessible
// rooms, and the improvement scope / priority / rough budget the surveyor proposes. Runs on
// HyperSurveyEngine.gs (CRUD, photos, list, delete) with the rooms in one Rooms_JSON cell; the summary
// columns are computed server-side by _htoExtraColumns_ (engine hook def.extraColumns).

var HYPER_TO_SHEET = "Hyper_Toilet_Survey_Database";
var HYPER_TO_FOLDER = "Hyper_Toilet_Survey_Attachments";

var HYPER_TO_LOCATIONS = ['พื้นที่ขาย (Sales Floor)', 'Town Center / Mall', 'Food Court', 'หลังร้าน / พนักงาน', 'ลานจอดรถ / ภายนอก', 'อื่นๆ'];
var HYPER_TO_TYPES = ['ชาย', 'หญิง', 'ผู้พิการ / ทุกคน (Accessible)', 'รวม (Unisex)', 'เด็ก / ห้องให้นมบุตร', 'พนักงานชาย', 'พนักงานหญิง'];
var HYPER_TO_USAGE = ['น้อย', 'ปานกลาง', 'มาก (คนใช้หนาแน่น)'];

// Fixtures counted per room — qty + broken
var HYPER_TO_FIXTURES = [
    { k: 'wcSit', l: 'โถส้วมนั่งราบ (ชักโครก)' },
    { k: 'wcSquat', l: 'โถส้วมนั่งยอง' },
    { k: 'urinal', l: 'โถปัสสาวะชาย' },
    { k: 'basin', l: 'อ่างล้างมือ' },
    { k: 'tapSensor', l: 'ก๊อกน้ำ Sensor' },
    { k: 'tapManual', l: 'ก๊อกน้ำธรรมดา' },
    { k: 'spray', l: 'สายฉีดชำระ' },
    { k: 'flushValve', l: 'Flush Valve / ปุ่มกดชักโครก' },
    { k: 'cubicle', l: 'ห้องย่อย / ฉากกั้น (บาน)' },
    { k: 'dryer', l: 'เครื่องเป่ามือ' },
    { k: 'paper', l: 'กล่องกระดาษ / ทิชชู่' },
    { k: 'soap', l: 'ที่กดสบู่' },
    { k: 'mirror', l: 'กระจก' },
    { k: 'exhaust', l: 'พัดลมระบายอากาศ' },
    { k: 'light', l: 'โคมไฟ' }
];

// Elements rated 0–5 (0 = ชำรุดหนัก, 5 = ดีมาก)
var HYPER_TO_ELEMENTS = [
    { k: 'floor', l: 'พื้น' }, { k: 'wall', l: 'ผนัง / กระเบื้อง' }, { k: 'ceiling', l: 'ฝ้าเพดาน' },
    { k: 'door', l: 'ประตู / ฉากกั้น' }, { k: 'sanitary', l: 'สุขภัณฑ์' }, { k: 'plumbing', l: 'ระบบน้ำ / ท่อ' },
    { k: 'vent', l: 'การระบายอากาศ / กลิ่น' }, { k: 'lighting', l: 'แสงสว่าง' }, { k: 'clean', l: 'ความสะอาด' }
];

var HYPER_TO_PROBLEMS = ['น้ำรั่ว / ซึม', 'ท่อตัน / ระบายช้า', 'กลิ่นเหม็น', 'แรงดันน้ำต่ำ', 'พื้นลื่น / แตกร้าว', 'กระเบื้องหลุด / แตก', 'ฝ้ารั่ว / ชำรุด',
    'ประตู / กลอนชำรุด', 'ไฟเสีย / มืด', 'พัดลมระบายอากาศเสีย', 'สุขภัณฑ์แตก / ร้าว', 'ไม่มีกระดาษ / สบู่', 'ป้ายบอกทางไม่ชัด', 'อื่นๆ'];

// Accessible-room checks (only asked for the accessible / unisex type)
var HYPER_TO_ACCESS = ['ราวจับข้างโถส้วม', 'ประตูกว้าง ≥ 90 ซม.', 'ทางลาด / ไม่มีธรณีประตู', 'ปุ่ม / สัญญาณขอความช่วยเหลือ', 'อ่างล้างมือระดับรถเข็น', 'พื้นที่หมุนรถเข็น ≥ 1.5 ม.'];

var HYPER_TO_SCOPE = ['เปลี่ยนสุขภัณฑ์', 'เปลี่ยนก๊อกเป็น Sensor', 'เปลี่ยน Flush Valve', 'ซ่อม / เปลี่ยนระบบท่อ', 'เปลี่ยนกระเบื้องพื้น', 'เปลี่ยนกระเบื้องผนัง',
    'ฝ้า / ทาสีใหม่', 'ฉากกั้น / ประตูห้องย่อย', 'ระบบระบายอากาศ', 'ไฟ LED', 'เครื่องเป่ามือ / อุปกรณ์เสริม', 'ปรับเป็นห้องผู้พิการ', 'ปรับปรุงทั้งห้อง'];
var HYPER_TO_PRIORITY = ['สูง (ทำทันที)', 'กลาง', 'ต่ำ'];

// ── v2 (30 ต.ค. 2569): scoring aligned to the MTN monthly restroom form (แบบตรวจสอบห้องน้ำ) ──
// Each room rates the MTN form's 20 items 1–5 or N/A (+ door / partitions), items scored ≤2 carry
// "what is broken / fix by" — the same 1–5 Criteria the Area Maintenance Score uses from Nov 2026.
// Rooms saved before v2 keep their 0–5 `el` ratings and are shown as "แบบเดิม 0–5" (never re-scaled).
// g = which store-level overall score the item feeds (hint only): equip / san / pipe / air / build
var HYPER_TO_ITEMS = [
    { k: 'ceiling', l: 'ฝ้า (ไม่มีรอยน้ำหยด)', g: 'build' }, { k: 'wall', l: 'ผนัง (ความสะอาด / สภาพ)', g: 'build' },
    { k: 'paint', l: 'สี', g: 'build' }, { k: 'floor', l: 'พื้น (ความสะอาด / สภาพ)', g: 'build' },
    { k: 'basin', l: 'อ่างล้างมือ', g: 'san' }, { k: 'urinal', l: 'โถปัสสาวะ', g: 'san' }, { k: 'wc', l: 'ชักโครก', g: 'san' },
    { k: 'flush', l: 'ฟลัชวาล์ว', g: 'san' }, { k: 'tissue', l: 'กล่องกระดาษทิชชู่', g: 'equip' }, { k: 'soap', l: 'กล่องสบู่', g: 'equip' },
    { k: 'grout', l: 'ยาแนว', g: 'build' }, { k: 'light', l: 'แสงสว่าง', g: 'equip' }, { k: 'ac', l: 'แอร์', g: 'air' },
    { k: 'ventFan', l: 'พัดลมระบายอากาศ', g: 'air' }, { k: 'exhaust', l: 'พัดลมดูดอากาศ', g: 'air' }, { k: 'janitor', l: 'ห้องซักล้าง', g: 'build' },
    { k: 'supply', l: 'ท่อน้ำดี', g: 'pipe' }, { k: 'drain', l: 'ท่อน้ำทิ้ง', g: 'pipe' }, { k: 'spray', l: 'สเปรย์ฉีดน้ำหอม', g: 'equip' },
    { k: 'smell', l: 'กลิ่น (ไม่เหม็น = 5)', g: 'air' }, { k: 'door', l: 'ประตู / ฉากกั้นห้องย่อย', g: 'build', extra: true }
];
var HYPER_TO_SCALE = [
    { v: 5, l: 'ดีมาก', d: 'สะอาด ใช้งานได้ปกติ ไม่มีตำหนิ' },
    { v: 4, l: 'ดี', d: 'มีตำหนิเล็กน้อย ไม่กระทบการใช้งาน' },
    { v: 3, l: 'พอใช้', d: 'เริ่มเสื่อม ต้องดูแล / ทำความสะอาดเพิ่ม' },
    { v: 2, l: 'ต้องซ่อม', d: 'ชำรุดบางส่วน ใช้งานได้ไม่เต็มที่' },
    { v: 1, l: 'ใช้งานไม่ได้', d: 'ชำรุดหนัก ต้องเปลี่ยน / ปิดใช้' }
];
// Store-level overall scores asked for in the 30 Oct meeting (Maintenance Score, Criteria 1–5)
var HYPER_TO_OVERALL = [
    { k: 'equip', l: 'อุปกรณ์ (ก๊อก กล่องทิชชู่ สบู่ เครื่องเป่ามือ ไฟ)', c: ['เสีย / ขาด เกินครึ่ง', 'เสีย / ขาด 25–50%', 'เสีย / ขาด 10–25%', 'เสีย / ขาด ไม่เกิน 10%', 'ครบ ใช้งานได้ทุกชิ้น'] },
    { k: 'san', l: 'สุขภัณฑ์ (ชักโครก โถปัสสาวะ อ่างล้างมือ ฟลัชวาล์ว)', c: ['เสีย / ปิดใช้ เกินครึ่ง', 'เสีย / ปิดใช้ 25–50%', 'เสีย 10–25%', 'เสีย ไม่เกิน 10%', 'ใช้งานได้ทุกชิ้น ไม่มีแตกร้าว'] },
    { k: 'pipe', l: 'ระบบท่อ (ท่อน้ำดี ท่อน้ำทิ้ง แรงดันน้ำ)', c: ['ต้องปิดใช้ทั้งห้อง / เปลี่ยนแนวท่อ', 'อุดตัน / รั่ว ต้องปิดใช้บางห้อง', 'รั่วซึม / ระบายช้า หลายจุด', 'รั่วซึมเล็กน้อย 1 จุด', 'ไม่มีรั่วซึม อุดตัน แรงดันดี'] },
    { k: 'air', l: 'ระบบปรับอากาศ / ระบายอากาศ (แอร์ พัดลม กลิ่น)', c: ['กลิ่นรุนแรง ระบบไม่ทำงาน', 'กลิ่นชัดเจน อุปกรณ์เสียบางตัว', 'มีกลิ่น / ร้อน ช่วงคนใช้มาก', 'อับเล็กน้อย', 'เย็นสบาย ไม่มีกลิ่น'] }
];
var HYPER_TO_HAS_ONSITE = ['มี — ติดแสดงที่ห้องน้ำ', 'มี — แต่ไม่ได้ติดแสดง', 'ไม่พบใบรับรอง'];
var HYPER_TO_QTY_UNITS = ['ห้อง', 'จุด', 'ชิ้น', 'ตร.ม.', 'ม.'];

function _htoNum_(v) { var n = parseFloat(v); return isNaN(n) || n < 0 ? 0 : n; }
function _htoInt_(v) { var n = parseInt(v, 10); return isNaN(n) || n < 0 ? 0 : n; }
function _htoTxt_(v, m) { return String(v == null ? '' : v).trim().substring(0, m || 120); }
function _htoPick_(v, list) { return list.indexOf(v) > -1 ? v : ''; }
function _htoPicks_(arr, list) { return (Array.isArray(arr) ? arr : []).filter(function(v) { return list.indexOf(v) > -1; }); }
function _htoAvg_(arr) { return arr.length ? Math.round(arr.reduce(function(a, b) { return a + b; }, 0) / arr.length * 10) / 10 : ''; }

function _htoParseRooms_(raw) {
    var arr = raw;
    if (typeof raw === 'string') { try { arr = JSON.parse(raw); } catch (e) { arr = []; } }
    if (!Array.isArray(arr)) arr = [];
    return arr.slice(0, 60).map(function(r, i) {
        var fx = {};
        HYPER_TO_FIXTURES.forEach(function(f) {
            var o = (r.fx || {})[f.k] || {};
            var q = _htoInt_(o.q);
            if (q > 0) fx[f.k] = { q: q, b: Math.min(_htoInt_(o.b), q) };
        });
        var v2 = Number(r.v) === 2;
        var room = {
            v: v2 ? 2 : 1,
            rid: _htoTxt_(r.rid, 10) || ('T' + (i + 1)), name: _htoTxt_(r.name, 80), loc: _htoPick_(r.loc, HYPER_TO_LOCATIONS), type: _htoPick_(r.type, HYPER_TO_TYPES),
            floor: _htoTxt_(r.floor, 20), m2: _htoNum_(r.m2), usage: _htoPick_(r.usage, HYPER_TO_USAGE), lux: _htoNum_(r.lux),
            fx: fx, prob: _htoPicks_(r.prob, HYPER_TO_PROBLEMS), probOther: _htoTxt_(r.probOther, 200),
            acc: _htoPicks_(r.acc, HYPER_TO_ACCESS), scope: _htoPicks_(r.scope, HYPER_TO_SCOPE), prio: _htoPick_(r.prio, HYPER_TO_PRIORITY),
            budget: _htoNum_(r.budget), nt: _htoTxt_(r.nt, 400), pk: _htoTxt_(r.pk, 60)
        };
        var fixQ = 0, fixB = 0;
        Object.keys(fx).forEach(function(k) { fixQ += fx[k].q; fixB += fx[k].b; });
        var vals;
        if (v2) {
            var it = {};
            HYPER_TO_ITEMS.forEach(function(x) {
                var o = (r.it || {})[x.k];
                if (!o) return;
                var s = o.s === 'NA' ? 'NA' : parseInt(o.s, 10);
                if (s !== 'NA' && !(s >= 1 && s <= 5)) return;
                var rec = { s: s };
                if (s !== 'NA' && s <= 2) { rec.nt = _htoTxt_(o.nt, 160); rec.due = /^\d{4}-\d{2}-\d{2}$/.test(String(o.due || '')) ? o.due : ''; }
                it[x.k] = rec;
            });
            room.it = it;
            room.cls = _htoPick_(r.cls, HYPER_PK_WORK_CLASS);
            room.qty = _htoNum_(r.qty);
            room.unit = _htoPick_(r.unit, HYPER_TO_QTY_UNITS);
            vals = Object.keys(it).map(function(k) { return it[k].s; }).filter(function(s) { return s !== 'NA'; });
        } else {
            var el = {};
            HYPER_TO_ELEMENTS.forEach(function(e) {
                var n = parseInt((r.el || {})[e.k], 10);
                if (!isNaN(n) && n >= 0 && n <= 5) el[e.k] = n;
            });
            room.el = el;
            vals = Object.keys(el).map(function(k) { return el[k]; });
        }
        room.calc = {
            score: _htoAvg_(vals),
            worst: vals.length ? Math.min.apply(null, vals) : '',
            low: vals.filter(function(s) { return s <= 2; }).length,
            fixQ: fixQ, fixB: fixB,
            // the accessible-room checklist only counts for accessible-type rooms
            accMissing: room.type === HYPER_TO_TYPES[2] ? HYPER_TO_ACCESS.length - room.acc.length : 0
        };
        return room;
    });
}

// Store-level part (v2): overall 1–5 scores + HAS certificate seen on site
function _htoParseStore_(raw) {
    var o = raw;
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { o = {}; } }
    o = o || {};
    var ov = {};
    HYPER_TO_OVERALL.forEach(function(x) { var n = parseInt((o.ov || {})[x.k], 10); if (n >= 1 && n <= 5) ov[x.k] = n; });
    return { ov: ov, has: _htoPick_(o.has, HYPER_TO_HAS_ONSITE) };
}

function _htoExtraColumns_(form) {
    if (form.roomsJson === undefined) return {};   // comment-only edits never wipe the rooms
    var rooms = _htoParseRooms_(form.roomsJson);
    var store = _htoParseStore_(form.storeJson);
    var json = JSON.stringify(rooms);
    if (json.length > 48000) throw new Error('ข้อมูลห้องน้ำมากเกินไปสำหรับ 1 รายการ กรุณาแบ่งส่ง 2 รายการ');
    var sum = function(list, f) { return list.reduce(function(a, r) { return a + f(r); }, 0); };
    var scored = function(list) { return list.filter(function(r) { return r.calc.score !== ''; }).map(function(r) { return r.calc.score; }); };
    var v1 = rooms.filter(function(r) { return r.v !== 2; }), v2 = rooms.filter(function(r) { return r.v === 2; });
    var avg2 = _htoAvg_(scored(v2));
    var W = HYPER_PK_WORK_CLASS;
    var touch = v2.filter(function(r) { return r.cls === W[1]; }), impr = v2.filter(function(r) { return r.cls === W[2]; });
    var ovVals = HYPER_TO_OVERALL.map(function(x) { return store.ov[x.k]; }).filter(function(n) { return n; });
    var tr = {};
    try { tr = getHyperToTracking_().map[String(form.branchCode || '').trim()] || {}; } catch (e) {}
    return {
        'Score Scale': v2.length ? '1-5' : (v1.length ? '0-5' : ''),
        'Rooms': rooms.length,
        'Customer Rooms': rooms.filter(function(r) { return r.loc && r.loc !== HYPER_TO_LOCATIONS[3]; }).length,
        'Avg Condition (0-5)': _htoAvg_(scored(v1)),
        'Avg Score (1-5)': avg2,
        'Survey %': avg2 === '' ? '' : Math.round(avg2 / 5 * 1000) / 10,
        'Rooms Condition ≤2': rooms.filter(function(r) { return r.calc.score !== '' && r.calc.score <= 2; }).length,
        'Items ≤2': sum(v2, function(r) { return r.calc.low; }),
        'Overall Equipment': store.ov.equip || '', 'Overall Sanitary': store.ov.san || '', 'Overall Plumbing': store.ov.pipe || '', 'Overall Air': store.ov.air || '',
        'Overall Avg': _htoAvg_(ovVals),
        'Work Class': impr.length ? W[2] : touch.length ? W[1] : v2.length ? W[0] : '',
        'Touch Up Rooms': touch.length, 'Touch Up Budget': sum(touch, function(r) { return r.budget; }),
        'Improvement Rooms': impr.length, 'Improvement Budget': sum(impr, function(r) { return r.budget; }),
        'Fixtures Total': sum(rooms, function(r) { return r.calc.fixQ; }),
        'Fixtures Broken': sum(rooms, function(r) { return r.calc.fixB; }),
        'Rooms With Problems': rooms.filter(function(r) { return r.prob.length > 0; }).length,
        'High Priority Rooms': rooms.filter(function(r) { return r.prio === HYPER_TO_PRIORITY[0]; }).length,
        'Accessible Rooms': rooms.filter(function(r) { return r.type === HYPER_TO_TYPES[2]; }).length,
        'Accessible Items Missing': sum(rooms, function(r) { return r.calc.accMissing; }),
        'Est. Budget (THB)': sum(rooms, function(r) { return r.budget; }),
        'HAS On-site': store.has,
        // snapshot of the Restroom Tracking row at submit time (HyperToiletTracking.gs)
        'Tracking Readiness': tr.ready || '', 'Tracking Total Score': tr.total === undefined ? '' : tr.total, 'Tracking Restrooms': tr.rooms === undefined ? '' : tr.rooms,
        'Rooms_JSON': json,
        'Store_JSON': JSON.stringify(store)
    };
}

function _htoEmailExtra_(counts, esc) {
    var rooms = [];
    try { rooms = JSON.parse(counts['Rooms_JSON'] || '[]'); } catch (e) {}
    var v2 = counts['Score Scale'] === '1-5';
    var score = v2 ? (counts['Avg Score (1-5)'] === '' ? '-' : counts['Avg Score (1-5)'] + '/5 (' + counts['Survey %'] + '%)') : (counts['Avg Condition (0-5)'] === '' ? '-' : counts['Avg Condition (0-5)'] + '/5');
    var h = '<p style="margin:12px 0 4px;"><b>สรุปห้องน้ำ</b> — ' + counts['Rooms'] + ' ห้อง · คะแนนเฉลี่ย ' + score +
        (v2 ? ' · ภาพรวม อุปกรณ์ ' + (counts['Overall Equipment'] || '-') + ' / สุขภัณฑ์ ' + (counts['Overall Sanitary'] || '-') + ' / ท่อ ' + (counts['Overall Plumbing'] || '-') + ' / ปรับอากาศ ' + (counts['Overall Air'] || '-') : '') +
        ' · อุปกรณ์เสีย ' + counts['Fixtures Broken'] + '/' + counts['Fixtures Total'] + ' · เร่งด่วน ' + counts['High Priority Rooms'] + ' ห้อง · งบประมาณประมาณการ ' +
        Number(counts['Est. Budget (THB)']).toLocaleString() + ' ฿</p>';
    if (v2) h += '<p style="margin:0 0 6px;font-size:12px;">ประเภทงาน: <b>' + esc(counts['Work Class'] || '-') + '</b> · Touch Up ' + counts['Touch Up Rooms'] + ' ห้อง (' + Number(counts['Touch Up Budget']).toLocaleString() + ' ฿) · Improvement ' +
        counts['Improvement Rooms'] + ' ห้อง (' + Number(counts['Improvement Budget']).toLocaleString() + ' ฿)' +
        (counts['Tracking Readiness'] ? ' · Restroom Tracking: ' + esc(counts['Tracking Readiness']) + ' / ' + counts['Tracking Total Score'] + '%' : '') + '</p>';
    var label = {};
    HYPER_TO_ITEMS.forEach(function(x) { label[x.k] = x.l; });
    h += '<table style="width:100%;border-collapse:collapse;font-size:11px;"><tr style="background:#f1f5f9;text-align:left;"><th style="padding:4px;">ห้อง</th><th style="padding:4px;">คะแนน</th><th style="padding:4px;">ปัญหา / รายการ ≤2</th><th style="padding:4px;">ขอบเขต / ประเภทงาน</th></tr>';
    rooms.forEach(function(r) {
        var low = r.v === 2 ? Object.keys(r.it || {}).filter(function(k) { return r.it[k].s !== 'NA' && r.it[k].s <= 2; }).map(function(k) { return label[k] + ' ' + r.it[k].s + (r.it[k].nt ? ' (' + r.it[k].nt + ')' : ''); }) : [];
        h += '<tr><td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + esc(r.rid + ' ' + [r.type, r.loc, r.name].filter(Boolean).join(' · ')) + '</td>' +
            '<td style="padding:4px;border-bottom:1px solid #f1f5f9;' + (r.calc.score !== '' && r.calc.score <= 2 ? 'color:#b91c1c;font-weight:bold;' : '') + '">' + (r.calc.score === '' ? '-' : r.calc.score) + (r.v === 2 ? '' : ' (0–5 เดิม)') + '</td>' +
            '<td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + esc(low.concat(r.prob).join(', ') || '-') + '</td>' +
            '<td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + esc((r.scope.join(', ') || '-') + (r.cls ? ' · ' + r.cls.split(' — ')[0] : '') + (r.prio ? ' · ' + r.prio : '')) + '</td></tr>';
    });
    return h + '</table>';
}

var HYPER_TO_DEF = {
    name: 'Hyper Toilet Survey', emoji: '🚻',
    sheet: HYPER_TO_SHEET, folder: HYPER_TO_FOLDER,
    idPrefix: 'HTO', keyPrefix: 'hto_', photoFilePrefix: 'hypertoilet', headerColor: '#0d9488',
    brokenLabel: 'จุดชำรุดเร่งด่วน',
    histType: 'To',
    categories: [], system: [], groups: [],
    grandTotal: { label: '', header: '' },
    catTemp: { a: { suffix: 'a', headerSuffix: ' a', label: '-' }, b: { suffix: 'b', headerSuffix: ' b', label: '-' }, rule: 'gap', threshold: 999 },
    extraColumns: _htoExtraColumns_,
    emailExtra: _htoEmailExtra_,
    listSkip: ['Rooms_JSON', 'Store_JSON']
};

function getHyperToConfig_() {
    return { locations: HYPER_TO_LOCATIONS, types: HYPER_TO_TYPES, usage: HYPER_TO_USAGE, fixtures: HYPER_TO_FIXTURES, elements: HYPER_TO_ELEMENTS,
             problems: HYPER_TO_PROBLEMS, access: HYPER_TO_ACCESS, scope: HYPER_TO_SCOPE, priority: HYPER_TO_PRIORITY,
             items: HYPER_TO_ITEMS, scale: HYPER_TO_SCALE, overall: HYPER_TO_OVERALL, hasOnsite: HYPER_TO_HAS_ONSITE,
             workClass: HYPER_PK_WORK_CLASS, touchUpLimit: HYPER_PK_TOUCHUP_LIMIT, qtyUnits: HYPER_TO_QTY_UNITS, kpi: HTK_KPI };
}
function processHyperToSurveyForm(form) { return hyperSurveySubmit_(HYPER_TO_DEF, form); }
function getHyperToSurveyList(includeArchive) {
    var r = hyperSurveyList_(HYPER_TO_DEF, includeArchive);
    r.toConfig = getHyperToConfig_();
    try { var t = getHyperToTracking_(); r.tracking = t.map; r.trackingSource = t.source; } catch (e) { r.tracking = {}; }
    return r;
}
function getHyperToSurveyRecordById(id) {
    var r = hyperSurveyRecordById_(HYPER_TO_DEF, id);
    if (r.success) {
        try { r.data.Rooms_JSON = JSON.parse(r.data.Rooms_JSON || '[]'); } catch (e) { r.data.Rooms_JSON = []; }
        try { r.data.Store_JSON = JSON.parse(r.data.Store_JSON || '{}'); } catch (e) { r.data.Store_JSON = {}; }
        r.toConfig = getHyperToConfig_();
        try { var t = getHyperToTracking_(); r.tracking = t.map[String(r.data['Branch Code'])] || null; r.trackingSource = t.source; } catch (e) {}
    }
    return r;
}
function updateHyperToSurveyRecord(form) { return hyperSurveyUpdate_(HYPER_TO_DEF, form); }
function deleteHyperToSurveyRecord(id, clientEmail) { return hyperSurveyDelete_(HYPER_TO_DEF, id, clientEmail); }
function addHyperToSurveyPhotos(id, unitKey, files, clientEmail) { return hyperSurveyAddPhotos_(HYPER_TO_DEF, id, unitKey, files, clientEmail); }
function deleteHyperToSurveyPhoto(id, unitKey, url, clientEmail) { return hyperSurveyDeletePhoto_(HYPER_TO_DEF, id, unitKey, url, clientEmail); }
