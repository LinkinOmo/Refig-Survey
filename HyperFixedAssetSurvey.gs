// --- Hyper Fixed Asset Pre-Count Survey (สำรวจพื้นที่เก็บ Fixed Asset & จัดระดับสีสาขา) ---
// From the FAD/PPT "การตรวจนับทรัพย์สิน HYPER Store" project (kick-off @ Suwintawong 16/10/26, email 20/10/26):
// task 1 = survey every store's fixed-asset storage areas, rank difficulty and state the labour needed.
// The VPs first ranked stores by feel (PDF: 9 วิกฤต / 30 ยาก / 82 ปานกลาง / 68 จัดการได้), which under-rated stores
// like Suanluang. This survey replaces the feel with 6 criteria (0–3 points each, total 0–18): K1–K5 measured on site,
// K6 = store profile from HO data (Store Size Khun Wiroj.xlsx: size class, age, levels) →
// colour RED / ORG / YEL / GRE → labour package (10L×5D / 5L×5D / 3L×3D / none) → budget.
// One card per STORAGE AREA (<branch>-FA01 …) with estimated piece counts per asset class from the concept deck
// (A in use, B seasonal, C non-used × .1 own store / .2 other store / .3 unknown or supplier). Store totals, scores and
// colour are computed HERE, never trusted from the client. Thresholds below are DRAFT v1 — calibrate them on the
// pilot stores (Suanluang / Samutprakarn / Nam Daeng 27/10/26) before the VP Ops review.
// Runs on HyperSurveyEngine.gs; store master = HYPER_FA_STORES (HyperFixedAssetStores.gs, from the asset register).

var HYPER_FA_SHEET = "Hyper_FixedAsset_Survey_Database";
var HYPER_FA_FOLDER = "Hyper_FixedAsset_Survey_Attachments";
var HYPER_FA_SQM_PER_BAY = 12.5;   // one parking bay used as storage ≈ 2.5 × 5 m

var HYPER_FA_AREA_TYPES = ['ห้องเก็บ Fixture / Fixture Warehouse', 'หลังร้าน / Back Store', 'ลานจอดรถ (ล้อมผ้าใบ / กั้นโซน)', 'ลานภายนอก / หลังอาคาร',
    'ดาดฟ้า', 'ชั้นลอย / Mezzanine', 'ห้องเครื่อง / ห้องงานระบบ', 'ตู้คอนเทนเนอร์', 'สำนักงาน / ห้องเก็บเอกสาร', 'อื่นๆ'];
// Asset classes = the "All Store Assets" tree from FAD (email 28/10/26): A in use / B seasonal / C non-used, each split
// .1 own store / .2 from another store / .3 origin unknown or supplier. v1 had A, B1, B2, C1, C2 + a separate supplier
// class — _hfaMigrateCnt_() maps those saved counts onto the new keys.
var HYPER_FA_CLASSES = [
    { k: 'A1', l: 'A.1 ใช้งานประจำ — ของสาขา', other: false },
    { k: 'A2', l: 'A.2 ใช้งานประจำ — จากสาขาอื่น', other: true },
    { k: 'A3', l: 'A.3 ใช้งานประจำ — ไม่ทราบที่มา / Supplier', other: true },
    { k: 'B1', l: 'B.1 ใช้ตามฤดูกาล — ของสาขา', other: false },
    { k: 'B2', l: 'B.2 ใช้ตามฤดูกาล — จากสาขาอื่น', other: true },
    { k: 'B3', l: 'B.3 ใช้ตามฤดูกาล — ไม่ทราบที่มา / Supplier', other: true },
    { k: 'C1', l: 'C.1 ไม่ใช้งาน — ของสาขา', other: false },
    { k: 'C2', l: 'C.2 ไม่ใช้งาน — จากสาขาอื่น', other: true },
    { k: 'C3', l: 'C.3 ไม่ใช้งาน — ไม่ทราบที่มา / Supplier', other: true }
];
function _hfaMigrateCnt_(cnt) {
    cnt = cnt || {};
    if (cnt.A1 !== undefined || (cnt.A === undefined && cnt.S === undefined)) return cnt;
    var o = {};
    Object.keys(cnt).forEach(function(k) { o[k] = cnt[k]; });
    o.A1 = cnt.A; o.C3 = (parseInt(cnt.C3, 10) || 0) + (parseInt(cnt.S, 10) || 0);   // v1 supplier items sat in storage → C.3
    delete o.A; delete o.S;
    return o;
}
// IT / technology assets are counted by MIS — a separate table (by type) that is reported but not scored
var HYPER_FA_MIS_TYPES = ['คอมพิวเตอร์ / โน้ตบุ๊ก', 'จอภาพ / ทีวี / Digital Signage', 'เครื่องชั่ง', 'POS / เครื่องพิมพ์ / ลิ้นชักเงิน', 'Handheld / เครื่องสแกนบาร์โค้ด',
    'อุปกรณ์เครือข่าย / Server / UPS', 'อุปกรณ์เทคโนโลยีอื่นๆ'];
var HYPER_FA_FILL = ['< 25%', '25–50%', '50–75%', '> 75% (เต็มพื้นที่)'];
var HYPER_FA_HEIGHT = ['ไม่เกิน 1 ม.', '1–2 ม.', 'สูงกว่า 2 ม.'];
var HYPER_FA_ACCESS = ['เข้าถึงได้ทันที', 'ต้องย้ายของบางส่วนก่อน', 'ซ้อนทับ / เข้าถึงยาก'];
// Share of pieces carrying a readable barcode tag — value = the midpoint used for the weighted store %
var HYPER_FA_TAG = [
    { l: '≥ 80% มี Tag อ่านได้', v: 90 }, { l: '50–79%', v: 65 }, { l: '20–49%', v: 35 }, { l: '< 20% / แทบไม่มี Tag', v: 10 }
];
var HYPER_FA_EQUIP = ['แฮนด์ลิฟท์ / Hand pallet', 'รถโฟล์คลิฟท์', 'บันได / นั่งร้าน', 'รถบรรทุกขนย้ายออก', 'อุปกรณ์ตัด / รื้อถอน'];
var HYPER_FA_HEAVY_EQUIP = ['รถโฟล์คลิฟท์', 'บันได / นั่งร้าน', 'รถบรรทุกขนย้ายออก', 'อุปกรณ์ตัด / รื้อถอน'];
var HYPER_FA_HAZARD = ['กีดขวางทางหนีไฟ / ตู้ดับเพลิง', 'กองสูงเสี่ยงล้ม', 'สนิม / ผุ / แตกหัก มีของมีคม', 'น้ำขัง / หลังคารั่ว', 'ฝุ่น / สกปรกมาก',
    'สัตว์รบกวน (หนู / นก / แมลง)', 'แสงสว่างไม่พอ', 'มีสารเคมี / ถังน้ำยา / แบตเตอรี่'];
var HYPER_FA_FLOOR_TAG = HYPER_FA_TAG;

// ── Rating criteria (DRAFT v1) ──────────────────────────────────────────────────────────────────────────────
// Each criterion scores 0–3 = how many of its `cuts` the store value reaches (value ≥ cut).
var HYPER_FA_CRITERIA = [
    { k: 'K1', l: 'พื้นที่จัดเก็บรวม', unit: 'ตร.ม.', cuts: [30, 150, 400],
      hint: 'รวมทุกพื้นที่เก็บ (ช่องจอดรถที่ใช้เก็บของ 1 ช่อง = 12.5 ตร.ม.)' },
    { k: 'K2', l: 'ปริมาณทรัพย์สินที่ต้องคัดแยก', unit: 'ชิ้น', cuts: [50, 300, 1000],
      hint: 'จำนวนชิ้นในพื้นที่เก็บทั้งหมด (ทุกกลุ่ม A / B / C)' },
    { k: 'K3', l: 'ความหลากหลายของที่มาของทรัพย์สิน', unit: 'ที่', cuts: [1, 2, 3],
      hint: 'จำนวนแหล่งที่มาอื่นของชิ้นกลุ่ม .2 / .3 — แต่ละสาขาต้นทาง / แต่ละ Supplier / ไม่ทราบที่มา นับเป็น 1 ที่' },
    { k: 'K4', l: 'ทรัพย์สินที่ไม่มี Tag / อ่านไม่ได้', unit: '%', cuts: [20, 50, 80],
      hint: '% ของชิ้นที่ไม่มี Barcode Tag หรือ Tag อ่านไม่ได้ (ต้องบันทึกเข้าระบบเอง)' },
    { k: 'K5', l: 'ความยากในการเข้าถึง', unit: 'ปัจจัย', cuts: [1, 2, 3],
      hint: 'นับปัจจัย: ≥ 4 พื้นที่เก็บ · ของหนัก/ชิ้นใหญ่ ≥ 20 ชิ้น · ต้องใช้โฟล์คลิฟท์/นั่งร้าน/รถบรรทุก · กองสูง > 2 ม. หรือซ้อนทับเข้าถึงยาก' },
    { k: 'K6', l: 'ความยากในการเคลื่อนย้าย', unit: 'ปัจจัย', cuts: [1, 2, 3], auto: true,
      hint: 'อัตโนมัติจากข้อมูลสาขาของ HO (Store Size): ขนาด Standard (≥ 8K ตร.ม.) · อายุสาขา ≥ 20 ปี (สะสมจากการ Renovate) · ≥ 2 ชั้น หรือ ≥ 2 อาคาร' }
];
var HYPER_FA_PROFILE_AGE = 20;   // years since GO date
// Colour bands on the 0–18 total (the 0–15 draft bands 4/8/12 rescaled for K6); labour packages + rates from the 27/10/26 meeting (≈ 500 ฿ per man-day)
var HYPER_FA_COLORS = [
    { k: 'GRE', l: 'เขียว', th: 'จัดการได้เอง', min: 0,  people: 0,  days: 0, cost: 0,     hex: '#16a34a' },
    { k: 'YEL', l: 'เหลือง', th: 'ปานกลาง',     min: 5,  people: 3,  days: 3, cost: 4500,  hex: '#eab308' },
    { k: 'ORG', l: 'ส้ม',    th: 'ยาก',         min: 10, people: 5,  days: 5, cost: 12500, hex: '#ea580c' },
    { k: 'RED', l: 'แดง',    th: 'วิกฤต',        min: 14, people: 10, days: 5, cost: 25000, hex: '#dc2626' }
];
// Any one of these alone makes the store RED regardless of the total
var HYPER_FA_RED_OVERRIDE = { sqm: 1000, pieces: 3000 };

function _hfaNum_(v) { var n = parseFloat(v); return isNaN(n) || n < 0 ? 0 : n; }
function _hfaInt_(v) { var n = parseInt(v, 10); return isNaN(n) || n < 0 ? 0 : n; }
function _hfaTxt_(v, m) { return String(v == null ? '' : v).trim().substring(0, m || 120); }
function _hfaPick_(v, list) { return list.indexOf(v) > -1 ? v : ''; }
function _hfaPicks_(arr, list) { return (Array.isArray(arr) ? arr : []).filter(function(v) { return list.indexOf(v) > -1; }); }
function _hfaTagLabels_() { return HYPER_FA_TAG.map(function(t) { return t.l; }); }
function _hfaTagVal_(l) { for (var i = 0; i < HYPER_FA_TAG.length; i++) if (HYPER_FA_TAG[i].l === l) return HYPER_FA_TAG[i].v; return null; }
function _hfaColor_(k) { for (var i = 0; i < HYPER_FA_COLORS.length; i++) if (HYPER_FA_COLORS[i].k === k) return HYPER_FA_COLORS[i]; return null; }
function _hfaColorIdx_(k) { for (var i = 0; i < HYPER_FA_COLORS.length; i++) if (HYPER_FA_COLORS[i].k === k) return i; return -1; }

// VP's own estimate of HO people needed (register column "ความต้องการคนจาก สำนักงานใหญ่ไปช่วยนับ") → colour,
// using the bands of the VP summary slide: 8–10 วิกฤต, 4–7 ยาก, 1–3 ปานกลาง, 0 จัดการได้
function hyperFaVpColor_(need) {
    if (need === '' || need == null || isNaN(parseInt(need, 10))) return '';
    need = parseInt(need, 10);
    return need >= 8 ? 'RED' : need >= 4 ? 'ORG' : need >= 1 ? 'YEL' : 'GRE';
}
function hyperFaStore_(code) {
    code = String(code || '').trim();
    if (!code) return null;   // some register rows have an empty branch-new code — never match ''
    for (var i = 0; i < HYPER_FA_STORES.length; i++) if (HYPER_FA_STORES[i][0] === code || HYPER_FA_STORES[i][1] === code) return HYPER_FA_STORES[i];
    // current store-DB code of a store the register still lists under an old code (col 19, e.g. 17007 → 15076)
    for (var j = 0; j < HYPER_FA_STORES.length; j++) if (String(HYPER_FA_STORES[j][19] || '').split(' ').indexOf(code) > -1) return HYPER_FA_STORES[j];
    return null;
}

// K6 store-profile factors from the HYPER_FA_STORES size columns (14 size class, 15 GO date, 16 levels, 17 buildings).
// `asOf` is passed in so the form and the server agree on the store age.
function hyperFaProfile_(st, asOf) {
    var f = [], miss = [];
    if (!st) return { factors: f, missing: ['ไม่พบสาขาในข้อมูล'], age: '' };
    if (!st[14]) miss.push('ขนาดสาขา'); else if (/^Standard/i.test(st[14])) f.push('ขนาด ' + st[14]);
    var age = '';
    if (st[15]) {
        var go = new Date(st[15] + 'T00:00:00'), now = asOf ? new Date(asOf) : new Date();
        age = Math.floor((now - go) / (365.25 * 864e5));
        if (age >= HYPER_FA_PROFILE_AGE) f.push('อายุ ' + age + ' ปี');
    } else miss.push('วันเปิดสาขา');
    if ((parseInt(st[16], 10) || 0) >= 2 || (parseInt(st[17], 10) || 0) >= 2) f.push(st[16] + ' ชั้น' + ((parseInt(st[17], 10) || 0) >= 2 ? ' / ' + st[17] + ' อาคาร' : ''));
    else if (st[16] === '') miss.push('จำนวนชั้น');
    return { factors: f, missing: miss, age: age };
}

// Scores the store from its measured values. Shared by the server columns; the form mirrors it in hfaScore().
function hyperFaScore_(m) {
    var vals = { K1: m.sqm, K2: m.pieces, K3: m.sources, K4: m.noTagPct, K5: m.factors, K6: m.profile || 0 };
    var scores = {}, total = 0;
    HYPER_FA_CRITERIA.forEach(function(c) {
        var v = vals[c.k] || 0, s = 0;
        c.cuts.forEach(function(cut) { if (v >= cut) s++; });
        scores[c.k] = s; total += s;
    });
    var color = 'GRE';
    HYPER_FA_COLORS.forEach(function(b) { if (total >= b.min) color = b.k; });
    var override = m.sqm >= HYPER_FA_RED_OVERRIDE.sqm || m.pieces >= HYPER_FA_RED_OVERRIDE.pieces;
    if (override) color = 'RED';
    return { vals: vals, scores: scores, total: total, color: color, override: override };
}

function _hfaParse_(raw, branchCode) {
    var o = raw;
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { o = {}; } }
    if (!o || typeof o !== 'object') o = {};
    var tagLabels = _hfaTagLabels_();
    var areas = (Array.isArray(o.areas) ? o.areas : []).slice(0, 40).map(function(a, i) {
        var cnt = {};
        var rc = _hfaMigrateCnt_(a.cnt);
        HYPER_FA_CLASSES.forEach(function(c) { cnt[c.k] = _hfaInt_(rc[c.k]); });
        var area = {
            aid: _hfaTxt_(a.aid, 10) || ('FA' + String(i + 1).padStart(2, '0')), name: _hfaTxt_(a.name, 80), type: _hfaPick_(a.type, HYPER_FA_AREA_TYPES), floor: _hfaTxt_(a.floor, 20),
            sqm: _hfaNum_(a.sqm), bays: _hfaInt_(a.bays), fill: _hfaPick_(a.fill, HYPER_FA_FILL), height: _hfaPick_(a.height, HYPER_FA_HEIGHT), access: _hfaPick_(a.access, HYPER_FA_ACCESS),
            cnt: cnt, heavy: _hfaInt_(a.heavy), reuse: _hfaInt_(a.reuse), tag: _hfaPick_(a.tag, tagLabels),
            equip: _hfaPicks_(a.equip, HYPER_FA_EQUIP), hazard: _hfaPicks_(a.hazard, HYPER_FA_HAZARD), nt: _hfaTxt_(a.nt, 400), pk: _hfaTxt_(a.pk, 60)
        };
        var pieces = HYPER_FA_CLASSES.reduce(function(s, c) { return s + cnt[c.k]; }, 0);
        area.calc = {
            sqm: Math.round((area.sqm + area.bays * HYPER_FA_SQM_PER_BAY) * 10) / 10,
            pieces: pieces,
            other: HYPER_FA_CLASSES.reduce(function(s, c) { return s + (c.other ? cnt[c.k] : 0); }, 0)
        };
        return area;
    });
    var f = o.floor || {}, sp = o.sup || {}, pr = o.propose || {};
    var floor = { tag: _hfaPick_(f.tag, tagLabels), a2: _hfaInt_(f.a2), staff: _hfaInt_(f.staff), nt: _hfaTxt_(f.nt, 400) };
    var sup = { names: _hfaTxt_(sp.names, 300), notified: sp.notified === 'Yes' ? 'Yes' : sp.notified === 'No' ? 'No' : '' };
    var pipe = { items: _hfaInt_((o.pipe || {}).items), nt: _hfaTxt_((o.pipe || {}).nt, 300) };
    var propose = { color: _hfaColor_(pr.color) ? pr.color : '', reason: _hfaTxt_(pr.reason, 400) };
    var src = { n: _hfaInt_((o.src || {}).n), names: _hfaTxt_((o.src || {}).names, 300) };
    var mis = HYPER_FA_MIS_TYPES.map(function(t, i) {
        var m = (Array.isArray(o.mis) ? o.mis[i] : null) || {};
        return { t: t, a: _hfaInt_(m.a), b: _hfaInt_(m.b), c: _hfaInt_(m.c), oth: _hfaInt_(m.oth), notag: _hfaInt_(m.notag), loc: _hfaTxt_(m.loc, 80) };
    });

    // store totals → measured criteria values
    var sum = function(f2) { return areas.reduce(function(s, a) { return s + f2(a); }, 0); };
    var t = { sqm: Math.round(sum(function(a) { return a.calc.sqm; }) * 10) / 10, pieces: sum(function(a) { return a.calc.pieces; }), other: sum(function(a) { return a.calc.other; }),
              heavy: sum(function(a) { return a.heavy; }), reuse: sum(function(a) { return a.reuse; }), cnt: {} };
    HYPER_FA_CLASSES.forEach(function(c) { t.cnt[c.k] = sum(function(a) { return a.cnt[c.k]; }); });
    // tag readability weighted by pieces (areas with no tag answer are left out of the average)
    var tagW = 0, tagSum = 0;
    areas.forEach(function(a) { var v = _hfaTagVal_(a.tag); if (v !== null && a.calc.pieces) { tagW += a.calc.pieces; tagSum += v * a.calc.pieces; } });
    t.tagPct = tagW ? Math.round(tagSum / tagW) : (t.pieces ? 0 : 100);
    t.otherPct = t.pieces ? Math.round(t.other / t.pieces * 100) : 0;
    // K3 = number of distinct other origins the surveyor lists; .2/.3 pieces with no count still mean at least one
    t.sources = Math.max(src.n, t.other ? 1 : 0);
    t.mis = { items: 0, notUsed: 0, other: 0, noTag: 0 };
    mis.forEach(function(m) { t.mis.items += m.a + m.b + m.c; t.mis.notUsed += m.c; t.mis.other += m.oth; t.mis.noTag += m.notag; });
    var factors = [];
    if (areas.length >= 4) factors.push('พื้นที่เก็บ ' + areas.length + ' จุด');
    if (t.heavy >= 20) factors.push('ของหนัก/ชิ้นใหญ่ ' + t.heavy + ' ชิ้น');
    if (areas.some(function(a) { return a.equip.some(function(e) { return HYPER_FA_HEAVY_EQUIP.indexOf(e) > -1; }); })) factors.push('ต้องใช้เครื่องมือหนัก');
    if (areas.some(function(a) { return a.height === HYPER_FA_HEIGHT[2] || a.access === HYPER_FA_ACCESS[2]; })) factors.push('กองสูง / ซ้อนทับ');
    t.factors = factors;
    var prof = hyperFaProfile_(hyperFaStore_(branchCode));
    t.profile = prof.factors;
    var sc = hyperFaScore_({ sqm: t.sqm, pieces: t.pieces, sources: t.sources, noTagPct: 100 - t.tagPct, factors: factors.length, profile: prof.factors.length });
    return { areas: areas, floor: floor, sup: sup, pipe: pipe, propose: propose, src: src, mis: mis, totals: t, profile: prof, score: sc };
}

function _hfaExtraColumns_(form) {
    if (form.assetJson === undefined) return {};   // comment-only edits never wipe the survey
    var d = _hfaParse_(form.assetJson, form.branchCode);
    var json = JSON.stringify(d);
    if (json.length > 48000) throw new Error('ข้อมูลมากเกินไปสำหรับ 1 รายการ กรุณาลดจำนวนการ์ด หรือแบ่งส่ง 2 รายการ');
    var t = d.totals, sc = d.score, col = _hfaColor_(sc.color);
    var st = hyperFaStore_(form.branchCode) || [];
    var vpNeed = st.length ? st[8] : '', vpColor = hyperFaVpColor_(vpNeed);
    var gap = vpColor ? _hfaColorIdx_(sc.color) - _hfaColorIdx_(vpColor) : '';
    var out = {
        'VP': st[5] || '',
        'FA Areas': d.areas.length,
        'Storage Area (sqm)': t.sqm,
        'Est. Pieces': t.pieces
    };
    HYPER_FA_CLASSES.forEach(function(c) { out['Pieces ' + c.k] = t.cnt[c.k]; });
    out['Other-Origin %'] = t.otherPct;
    out['Origin Sources'] = t.sources;
    out['Origin Source Names'] = d.src.names;
    out['Tagged %'] = t.tagPct;
    out['Heavy Items'] = t.heavy;
    out['Reusable Items'] = t.reuse;
    out['Handling Factors'] = t.factors.join(', ');
    out['Store Size Class'] = st[14] || '';
    out['Store Age (yrs)'] = d.profile.age;
    out['Levels / Buildings'] = st.length && st[16] !== '' ? st[16] + ' / ' + st[17] : '';
    out['Profile Factors'] = t.profile.join(', ');
    HYPER_FA_CRITERIA.forEach(function(c) { out[c.k + ' Score'] = sc.scores[c.k]; });
    out['Score (0-18)'] = sc.total;
    out['Survey Color'] = sc.color;
    out['Red Override'] = sc.override ? 'Yes' : '';
    out['VP Need (people)'] = vpNeed;
    out['VP Color'] = vpColor;
    out['Color Gap'] = gap;               // + = survey rates the store harder than the VP did
    out['Proposed Color'] = d.propose.color;
    out['Labor (people x days)'] = col.people ? col.people + ' x ' + col.days : '-';
    out['Est. Labor Cost (THB)'] = col.cost;
    out['Floor Tagged'] = d.floor.tag;
    out['Floor A2 Suspected'] = d.floor.a2;
    out['Store Staff Available'] = d.floor.staff;
    out['Unknown/Supplier Items (.3)'] = t.cnt.A3 + t.cnt.B3 + t.cnt.C3;
    out['Supplier Notified'] = d.sup.notified;
    out['Pipeline Items'] = d.pipe.items;
    out['Hazard Areas'] = d.areas.filter(function(a) { return a.hazard.length; }).length;
    out['MIS Items'] = t.mis.items;
    out['MIS Not Used'] = t.mis.notUsed;
    out['MIS Other-Origin'] = t.mis.other;
    out['MIS No Tag'] = t.mis.noTag;
    out['Asset_JSON'] = json;
    return out;
}

function _hfaEmailExtra_(counts, esc) {
    var d = {};
    try { d = JSON.parse(counts['Asset_JSON'] || '{}'); } catch (e) {}
    var col = _hfaColor_(counts['Survey Color']) || HYPER_FA_COLORS[0], vp = _hfaColor_(counts['VP Color']);
    var h = '<p style="margin:12px 0 4px;"><b>ผลจัดระดับสี</b> — <span style="background:' + col.hex + ';color:#fff;padding:2px 8px;border-radius:4px;font-weight:bold;">' + col.k + ' ' + col.l + '</span>' +
        ' คะแนน ' + counts['Score (0-18)'] + '/18 · แรงงาน ' + esc(counts['Labor (people x days)']) + ' · ประมาณการ ' + Number(counts['Est. Labor Cost (THB)']).toLocaleString() + ' ฿' +
        (vp ? ' · VP ประเมิน ' + vp.k + ' (' + counts['VP Need (people)'] + ' คน)' : '') + '</p>' +
        '<p style="margin:4px 0;">' + counts['FA Areas'] + ' พื้นที่เก็บ · ' + counts['Storage Area (sqm)'] + ' ตร.ม. · ' + counts['Est. Pieces'] + ' ชิ้น · แหล่งที่มาอื่น ' + counts['Origin Sources'] + ' ที่ (' + counts['Other-Origin %'] + '% ของชิ้น) · มี Tag ' + counts['Tagged %'] + '%' +
        (counts['MIS Items'] ? ' · MIS ' + counts['MIS Items'] + ' ชิ้น' : '') + '</p>';
    var td = 'padding:4px;border-bottom:1px solid #f1f5f9;';
    h += '<table style="width:100%;border-collapse:collapse;font-size:11px;"><tr style="background:#f1f5f9;text-align:left;"><th style="padding:4px;">เกณฑ์</th><th style="padding:4px;">ค่าที่วัดได้</th><th style="padding:4px;">คะแนน</th></tr>';
    var sc = d.score || { vals: {}, scores: {} };
    HYPER_FA_CRITERIA.forEach(function(c) {
        h += '<tr><td style="' + td + '">' + c.k + ' ' + esc(c.l) + '</td><td style="' + td + '">' + esc(sc.vals[c.k]) + ' ' + esc(c.unit) + '</td><td style="' + td + 'font-weight:bold;">' + esc(sc.scores[c.k]) + ' / 3</td></tr>';
    });
    return h + '</table>';
}

var HYPER_FA_DEF = {
    name: 'Hyper Fixed Asset Pre-Count Survey', emoji: '🏷️',
    sheet: HYPER_FA_SHEET, folder: HYPER_FA_FOLDER,
    idPrefix: 'HFA', keyPrefix: 'hfa_', photoFilePrefix: 'hyperfixedasset', headerColor: '#7c3aed',
    brokenLabel: 'จุดอันตรายต้องแก้ทันที',
    histType: 'Fa',
    categories: [], system: [], groups: [],
    grandTotal: { label: '', header: '' },
    catTemp: { a: { suffix: 'a', headerSuffix: ' a', label: '-' }, b: { suffix: 'b', headerSuffix: ' b', label: '-' }, rule: 'gap', threshold: 999 },
    extraColumns: _hfaExtraColumns_,
    emailExtra: _hfaEmailExtra_,
    listSkip: ['Asset_JSON']
};

function getHyperFaConfig_() {
    return { areaTypes: HYPER_FA_AREA_TYPES, classes: HYPER_FA_CLASSES, misTypes: HYPER_FA_MIS_TYPES, fill: HYPER_FA_FILL, height: HYPER_FA_HEIGHT, access: HYPER_FA_ACCESS, tag: HYPER_FA_TAG,
             equip: HYPER_FA_EQUIP, heavyEquip: HYPER_FA_HEAVY_EQUIP, hazard: HYPER_FA_HAZARD, criteria: HYPER_FA_CRITERIA, colors: HYPER_FA_COLORS,
             redOverride: HYPER_FA_RED_OVERRIDE, sqmPerBay: HYPER_FA_SQM_PER_BAY, profileAge: HYPER_FA_PROFILE_AGE };
}
function processHyperFaSurveyForm(form) {
    var st = hyperFaStore_(form.branchCode);
    if (!st) return { success: false, error: 'ไม่พบรหัสสาขาในทะเบียนทรัพย์สิน: ' + form.branchCode };
    return hyperSurveySubmit_(HYPER_FA_DEF, form);
}
// Records keep the Branch Name typed at submit time; before @537 28 stores carried another store's Thai name,
// so names shown in the report always come from the (corrected) store master.
function _hfaFixName_(rec) {
    var st = rec ? hyperFaStore_(rec['Branch Code']) : null;
    if (st && (st[3] || st[2])) rec['Branch Name'] = st[3] || st[2];
}
function getHyperFaSurveyList(includeArchive) {
    var r = hyperSurveyList_(HYPER_FA_DEF, includeArchive);
    r.faConfig = getHyperFaConfig_();
    r.stores = HYPER_FA_STORES;
    (r.data || []).forEach(_hfaFixName_);
    return r;
}

// Moves a record filed under the wrong store (picked by the wrong Thai name) to the right code, and
// recomputes everything that depends on the store (VP, VP colour/gap, K6 profile, score, colour).
// The areas/counts the store entered are kept as-is. Admin / schedule admin only.
function hyperFaMoveRecord(id, newCode, clientEmail) {
    try {
        var _wlock = _acquireWriteLock_();
        var userEmail = clientEmail || Session.getActiveUser().getEmail();
        var adminCheck = checkSurveyAdminStatus(userEmail);
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin) return { success: false, error: 'Administrator privileges required.' };
        var st = hyperFaStore_(newCode);
        if (!st) return { success: false, error: 'ไม่พบรหัสสาขาในทะเบียนทรัพย์สิน: ' + newCode };
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HYPER_FA_SHEET);
        if (!sheet) return { success: false, error: 'Sheet not found' };
        var found = _hsFindRow_(sheet, id);
        if (found.rowIndex === -1) return { success: false, error: 'Record not found' };
        var headers = found.headers, row = found.data[found.rowIndex - 1].slice();
        var col = function(h) { return headers.indexOf(h); };
        var oldCode = String(row[col('Branch Code')] || '').trim();
        var updates = _hfaExtraColumns_({ assetJson: row[col('Asset_JSON')] || '{}', branchCode: st[0] });
        updates['Branch Code'] = st[0];
        updates['Branch Name'] = st[3] || st[2];
        updates['Store Format'] = st[4] || '';
        updates['Region'] = st[7] || '';
        updates['DM Area'] = st[6] || '';
        var log = (oldCode === st[0] ? oldCode + ' ตรวจแล้ว ถูกต้อง' : oldCode + ' → ' + st[0]) + ' by ' + userEmail + ' ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
        var prev = col('Branch Moved') > -1 ? String(row[col('Branch Moved')] || '') : '';
        updates['Branch Moved'] = prev ? prev + ' | ' + log : log;
        Object.keys(updates).forEach(function(k) {
            var idx = col(k);
            if (idx === -1) { headers.push(k); sheet.getRange(1, headers.length).setValue(k); idx = headers.length - 1; }
            row[idx] = updates[k];
        });
        while (row.length < headers.length) row.push('');
        sheet.getRange(found.rowIndex, 1, 1, headers.length).setValues([row]);
        _hsEquipCacheClear_();
        return { success: true, from: oldCode, to: st[0] };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}
function getHyperFaSurveyRecordById(id) {
    var r = hyperSurveyRecordById_(HYPER_FA_DEF, id);
    if (r.success) {
        _hfaFixName_(r.data);
        try { r.data.Asset_JSON = JSON.parse(r.data.Asset_JSON || '{}'); } catch (e) { r.data.Asset_JSON = {}; }
        var d = r.data.Asset_JSON;   // v1 records: show their counts under the new class keys
        (d.areas || []).forEach(function(a) { a.cnt = _hfaMigrateCnt_(a.cnt); });
        if (d.totals) d.totals.cnt = _hfaMigrateCnt_(d.totals.cnt);
        r.faConfig = getHyperFaConfig_();
    }
    return r;
}
function updateHyperFaSurveyRecord(form) { return hyperSurveyUpdate_(HYPER_FA_DEF, form); }
function deleteHyperFaSurveyRecord(id, clientEmail) { return hyperSurveyDelete_(HYPER_FA_DEF, id, clientEmail); }
function addHyperFaSurveyPhotos(id, unitKey, files, clientEmail) { return hyperSurveyAddPhotos_(HYPER_FA_DEF, id, unitKey, files, clientEmail); }
function deleteHyperFaSurveyPhoto(id, unitKey, url, clientEmail) { return hyperSurveyDeletePhoto_(HYPER_FA_DEF, id, unitKey, url, clientEmail); }
