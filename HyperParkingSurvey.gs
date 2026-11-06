// --- Hyper Parking & Accessibility Survey (ที่จอดรถ & สิ่งอำนวยความสะดวกผู้พิการ) ---
// Requested after the HYP management chat: check every Big Format store's disabled-person facilities —
// parking (paint colour, signs), entrance / ramps / lifts / toilets — plus the communication signs and the
// security-guard (รปภ.) measures for non-disabled drivers who park in the disabled bays.
// Like the Hyper Ref cards, the car park is surveyed ONE CARD PER PARKING ZONE (ID <branch>-PZ01 …) with
// bay counts per bay type; the store totals are summed from the zones. Three blocks in one Parking_JSON cell:
//   zones  — one card per parking zone: bay counts by type, condition ratings, problems, and — when the zone
//            has disabled bays — the disabled-bay block (distance to entrance, checklist, paint/sign rating, misuse seen)
//   points — one card per accessibility point on the route (entrance, ramp, lift, accessible toilet, walkway ...)
//   mgmt   — communication signs present, guard monitoring, measures when misused, misuse frequency
//   (lot   — store totals DERIVED from the zones on the server; never typed by the surveyor)
// Runs on HyperSurveyEngine.gs (CRUD, photos, list, delete); summary columns come from _hpkExtraColumns_
// (engine hook def.extraColumns), same pattern as HyperToiletSurvey.gs.

var HYPER_PK_SHEET = "Hyper_Parking_Survey_Database";
var HYPER_PK_FOLDER = "Hyper_Parking_Survey_Attachments";

var HYPER_PK_LOT_TYPES = ['ลานจอดกลางแจ้ง', 'อาคารจอดรถ', 'ชั้นใต้ดิน', 'ดาดฟ้า', 'ใช้ร่วมกับศูนย์การค้า / เจ้าของที่'];
// Bay types counted on every zone card. `car: true` = counts toward the car-park size used for the
// disabled-bay minimum (motorcycle / delivery bays do not).
var HYPER_PK_BAY_TYPES = [
    { k: 'car', l: '🚗 รถยนต์ทั่วไป', car: true },
    { k: 'dis', l: '♿ ผู้พิการ', car: true },
    { k: 'fam', l: '🤰 หญิงตั้งครรภ์ / ผู้สูงอายุ', car: true },
    { k: 'ev', l: '⚡ EV Charger', car: true },
    { k: 'moto', l: '🏍️ มอเตอร์ไซค์' },
    { k: 'svc', l: '🚚 รถส่งของ / รับส่ง' }
];
var HYPER_PK_LOT_ELEMENTS = [
    { k: 'surface', l: 'พื้นผิวลานจอด' }, { k: 'lines', l: 'เส้นจราจร / ช่องจอด' }, { k: 'signs', l: 'ป้ายบอกทาง / ทางเข้า-ออก' },
    { k: 'light', l: 'แสงสว่าง' }, { k: 'drain', l: 'การระบายน้ำ' }, { k: 'barrier', l: 'ไม้กั้น / ระบบบัตรจอด' }, { k: 'safety', l: 'CCTV / ความปลอดภัย' }
];
var HYPER_PK_LOT_PROBLEMS = ['พื้นเป็นหลุม / บ่อ', 'น้ำขัง', 'เส้นช่องจอดจางหาย', 'ไฟดับ / มืด', 'ป้ายซีด / หาย', 'ไม้กั้น / ระบบบัตรเสีย', 'ขอบคันหิน / ตัวหยุดล้อชำรุด', 'อื่นๆ'];

var HYPER_PK_NEAR = ['ติดทางเข้าหลัก', 'ใกล้ทางเข้า (≤ 30 ม.)', 'ปานกลาง (30–60 ม.)', 'ไกลจากทางเข้า (> 60 ม.)'];
// Disabled-bay checklist — tick what the bay ALREADY has. Sizes follow the Thai ministerial regulation on
// building facilities for disabled persons (กฎกระทรวง พ.ศ. 2548): bay ≥ 2.40 × 6.00 m + ≥ 1.00 m side space,
// floor symbol ≥ 0.90 × 0.90 m, located as close to the entrance as possible.
var HYPER_PK_ZONE_CHECKS = ['สัญลักษณ์รูปผู้พิการบนพื้น (≥ 0.90×0.90 ม.)', 'พื้นช่องจอดทาสีฟ้า / สีเด่นชัด', 'ป้ายตั้งสัญลักษณ์ผู้พิการ มองเห็นชัด',
    'ป้ายข้อความ “สงวนสำหรับผู้พิการ”', 'ขนาดช่องจอด ≥ 2.40 × 6.00 ม.', 'ที่ว่างข้างรถ ≥ 1.00 ม. (ตีเส้นทแยง)', 'พื้นเรียบ ระดับเดียวกัน ไม่ลื่น',
    'ทางลาดจากที่จอดขึ้นทางเท้า (ไม่มีขั้น)', 'มีหลังคา / กันแดดกันฝน', 'แสงสว่างเพียงพอ'];
var HYPER_PK_ZONE_PROBLEMS = ['สีพื้นซีด / ลอก', 'สัญลักษณ์บนพื้นจาง', 'ป้ายตั้งหาย / ล้ม / ซีด', 'ไม่มีป้ายข้อความสื่อสาร', 'อยู่ไกลทางเข้า',
    'ไม่มีทางลาดขึ้นทางเท้า', 'มีสิ่งกีดขวาง (รถเข็น / กรวย / สินค้า)', 'รถทั่วไปจอดเป็นประจำ', 'พื้นต่างระดับ / ชำรุด',
    'สัญลักษณ์ผู้พิการปนกับที่จอดครอบครัว / สุภาพสตรี', 'อื่นๆ'];

// Accessibility points on the route from the car to the shop — each type has its own checklist
var HYPER_PK_POINT_TYPES = [
    { k: 'entrance', l: 'ทางเข้า-ออกอาคาร', checks: ['ประตูกว้าง ≥ 90 ซม.', 'ไม่มีธรณีประตู / ขั้นต่างระดับ', 'ประตูอัตโนมัติ / เปิดง่าย', 'ป้ายสัญลักษณ์ผู้พิการที่ทางเข้า', 'พื้นผิวต่างสัมผัส (ผู้พิการทางสายตา)'] },
    // 'พื้นทางลาดสภาพดี ไม่ชำรุด' added 2026-11-05 (LCD deck issue "พื้นทางลาดชำรุด") — keep it LAST:
    // records saved before it (Parking_JSON ver < 3) were never asked, the report shows it as "ไม่ได้ถาม"
    { k: 'ramp', l: 'ทางลาด', checks: ['ความชัน ≤ 1:12', 'กว้างสุทธิ ≥ 90 ซม.', 'ราวจับทั้งสองข้าง (สูง 80–90 ซม.)', 'พื้นไม่ลื่น', 'พื้นผิวต่างสัมผัสต้น-ปลายทางลาด', 'ขอบกันตก', 'พื้นทางลาดสภาพดี ไม่ชำรุด'] },
    { k: 'walk', l: 'ทางเดินจากที่จอดถึงอาคาร', checks: ['กว้าง ≥ 1.50 ม.', 'ไม่มีสิ่งกีดขวาง', 'ทางลาดที่ขอบทางเท้า', 'ทางข้าม / เส้นทางเดินชัดเจน', 'มีหลังคา'] },
    { k: 'lift', l: 'ลิฟต์', checks: ['ประตูกว้าง ≥ 90 ซม.', 'ปุ่มกดสูง 90–120 ซม.', 'อักษรเบรลล์ที่ปุ่ม', 'เสียงบอกชั้น', 'ราวจับในลิฟต์',
        'ป้ายบอกตำแหน่งลิฟต์มองเห็นชัด', 'พื้น / ผนังลิฟต์ไม่มีรอยขูด', 'มีบันทึก / สติกเกอร์ตรวจ PM ตามรอบ'] },
    { k: 'toilet', l: 'ห้องน้ำผู้พิการ', checks: ['มีห้องน้ำผู้พิการใช้งานได้', 'ราวจับข้างโถส้วม', 'ประตูกว้าง ≥ 90 ซม. / ประตูเลื่อน', 'ปุ่ม / สัญญาณขอความช่วยเหลือ', 'ไม่ถูกใช้เป็นที่เก็บของ',
        'ป้ายสัญลักษณ์หน้าห้อง'] },
    { k: 'sign', l: 'ป้ายนำทาง', checks: ['ป้ายนำทางไปที่จอดผู้พิการ', 'ป้ายนำทางไปห้องน้ำ / ลิฟต์ผู้พิการ', 'มองเห็นชัด ไม่ซีด', 'จำนวนป้ายเพียงพอ', 'ไม่มีป้ายชำรุด', 'ไม่มีสิ่งกีดขวางบังป้าย'] },
    { k: 'service', l: 'จุดบริการ / เคาน์เตอร์', checks: ['เคาน์เตอร์ต่ำ (≤ 80 ซม.)', 'มีรถเข็นบริการ (Wheelchair)', 'ปุ่ม / เบอร์โทรขอความช่วยเหลือ'] },
    { k: 'other', l: 'อื่นๆ', checks: [] }
];

var HYPER_PK_SCOPE = ['ทาสีพื้นใหม่ (สีฟ้า)', 'ทาสัญลักษณ์ผู้พิการบนพื้น', 'ติดตั้ง / เปลี่ยนป้ายตั้ง', 'ติดป้ายข้อความสื่อสาร', 'ย้ายช่องจอดให้ใกล้ทางเข้า',
    'เพิ่มจำนวนช่องจอด', 'ทำทางลาด / ปรับระดับ', 'ติดตั้งราวจับ', 'ติดตั้งพื้นผิวต่างสัมผัส', 'ติดตั้งหลังคา', 'เพิ่มแสงสว่าง', 'ติดตั้งป้ายนำทาง', 'ปรับปรุงประตู / ทางเข้า',
    'ซ่อมพื้นลานจอด / ระบายน้ำ', 'ตีเส้นช่องจอดใหม่',
    // added 2026-10-30 after the LCD accessibility review (meeting notes in LCD/)
    'Touch up สีเดิม (ช่างสาขา)', 'ขูดลอก ทำใหม่ตามมาตรฐาน', 'ปรับความชันทางลาด / ทำทางลาดใหม่', 'สร้างชานพักทางลาด', 'ซ่อมพื้นผิวทางลาด',
    'ติดตั้งเสากั้น (ทางที่ไม่ใช่ทางผู้พิการ)', 'ติดป้ายนำทางไปทางเข้าหลัก', 'ซ่อมรอยขูด พื้น / ผนังลิฟต์', 'แจ้ง Supplier ตรวจลิฟต์', 'อื่นๆ'];
var HYPER_PK_PRIORITY = ['สูง (ทำทันที)', 'กลาง', 'ต่ำ'];
// Work class per card — drives the Ready / Touch Up / Improvement grouping and the Pool Bid list.
// Touch Up = in-house store technician, keeps the existing design, on-site purchase limit HYPER_PK_TOUCHUP_LIMIT.
var HYPER_PK_WORK_CLASS = ['Ready — พร้อมใช้ ไม่ต้องทำ', 'Touch Up — ช่างสาขาทำเอง', 'Improvement — ผู้รับเหมา / ทำใหม่ (Pool Bid)'];
var HYPER_PK_TOUCHUP_LIMIT = 50000;
var HYPER_PK_QTY_UNITS = ['ตร.ม.', 'ม.', 'จุด', 'ชิ้น', 'คัน'];

// Ramp measurement (point type 'ramp'). Slope from rise ÷ run, or from an angle-app reading.
// Law (กฎกระทรวง 2548): ≤ 1:12, width ≥ 90 cm, handrails both sides, landing ≥ 1.50 m every ≤ 6 m of run.
// Rise bands = the civil team's standard-drawing price tiers (30 cm / 50 cm / 1 m kerb heights).
var HYPER_PK_RAMP_USE = ['ทางเข้าหลักลูกค้า', 'ทางเข้ารอง', 'ทางรับสินค้า / คู่ค้า (ไม่ใช่ทางผู้พิการ)', 'ทางหนีไฟ / อื่นๆ'];
var HYPER_PK_RAIL = ['ทั้ง 2 ข้าง', 'ข้างเดียว', 'ไม่มีราวจับ'];
var HYPER_PK_RAIL_MAT = ['สแตนเลส', 'เหล็กทาสี', 'อื่นๆ'];
var HYPER_PK_LANDING = ['มีชานพัก', 'ไม่มีชานพัก', 'ไม่ต้องมี (ยาว < 6 ม.)'];
var HYPER_PK_RISE_BANDS = [{ max: 30, l: '≤ 30 ซม.' }, { max: 50, l: '31–50 ซม.' }, { max: 100, l: '51–100 ซม.' }, { max: 1e9, l: '> 1 ม.' }];
// 1:X bands (X = run ÷ rise) — the 1:6 / 1:9 / 1:12 steps used in the meeting
var HYPER_PK_SLOPE_BANDS = [{ min: 12, l: '≤ 1:12 ผ่าน' }, { min: 9, l: '1:9 – 1:12' }, { min: 6, l: '1:6 – 1:9' }, { min: 0, l: 'ชันกว่า 1:6' }];

// Same rule as hpkRampCalc() in HyperParkingSurveyTab.html
function hyperPkRampCalc_(m) {
    var rise = _hpkNum_(m.rise), run = _hpkNum_(m.run), deg = _hpkNum_(m.deg), w = _hpkNum_(m.w), x = 0;
    if (rise > 0 && run > 0) { x = run * 100 / rise; deg = Math.atan(rise / (run * 100)) * 180 / Math.PI; }
    else if (deg > 0 && deg < 90) x = 1 / Math.tan(deg * Math.PI / 180);
    var band = '', rb = '';
    if (x > 0) for (var i = 0; i < HYPER_PK_SLOPE_BANDS.length; i++) if (x >= HYPER_PK_SLOPE_BANDS[i].min) { band = HYPER_PK_SLOPE_BANDS[i].l; break; }
    if (rise > 0) for (var j = 0; j < HYPER_PK_RISE_BANDS.length; j++) if (rise <= HYPER_PK_RISE_BANDS[j].max) { rb = HYPER_PK_RISE_BANDS[j].l; break; }
    var needLanding = run >= 6;
    var fails = [];
    // goods / supplier ramps are not on the accessible route — measured, but never counted as failing
    if (m.use === HYPER_PK_RAMP_USE[2]) return { ratio: x > 0 ? Math.round(x * 10) / 10 : '', deg: deg > 0 ? Math.round(deg * 10) / 10 : '', band: band, riseBand: rb, needLanding: false, fails: fails };
    if (x > 0 && x < 12) fails.push('ชันเกิน 1:12');
    if (w > 0 && w < 90) fails.push('กว้าง < 90 ซม.');
    if (m.rail && m.rail !== HYPER_PK_RAIL[0]) fails.push('ราวจับไม่ครบ 2 ข้าง');
    if (needLanding && m.landing !== HYPER_PK_LANDING[0]) fails.push('ยาว ≥ 6 ม. ไม่มีชานพัก');
    return { ratio: x > 0 ? Math.round(x * 10) / 10 : '', deg: deg > 0 ? Math.round(deg * 10) / 10 : '', band: band, riseBand: rb, needLanding: needLanding, fails: fails };
}
// Store-level work class: Improvement if any card is Improvement, Touch Up if any is Touch Up, else Ready
function hyperPkStoreClass_(items) {
    var cls = items.map(function(x) { return x.cls; });
    if (cls.indexOf(HYPER_PK_WORK_CLASS[2]) > -1) return 'Improvement';
    if (cls.indexOf(HYPER_PK_WORK_CLASS[1]) > -1) return 'Touch Up';
    return cls.length && cls.every(function(c) { return c === HYPER_PK_WORK_CLASS[0]; }) ? 'Ready' : '';
}

// ── Ready / Improve / Urgent per facility — the 6 areas of the LCD accessibility deck (2026-10-29) ──
// Urgent = the facility is missing / unusable; Improve = has it but ≥1 issue; Ready = no issue;
// N/A = not applicable to this store (leased-in-mall uses the mall's, elevator only for ≥2-floor stores);
// '' = not surveyed. Signage is never Urgent (deck note). Derived from Parking_JSON only, so it works
// for records saved before this existed (computed again at list time by _hpkListRow_).
var HYPER_PK_FAC = [
    { k: 'park', l: 'ที่จอดรถผู้พิการ', col: 'Status Parking' }, { k: 'ramp', l: 'ทางลาด', col: 'Status Ramp' },
    { k: 'toilet', l: 'ห้องน้ำผู้พิการ', col: 'Status Restroom' }, { k: 'lift', l: 'ลิฟต์', col: 'Status Elevator' },
    { k: 'wc', l: 'รถเข็นผู้พิการ', col: 'Status Wheelchair' }, { k: 'sign', l: 'ป้ายสัญลักษณ์', col: 'Status Signage' }
];
var HYPER_PK_STATUS_COL = 'Accessibility Status';
var HYPER_PK_JSON_VER = 3;   // ver ≥ 3 = the ramp "surface not damaged" item was on the form

function hyperPkFacilityStatus_(d, ver) {
    var W = HYPER_PK_WORK_CLASS, B = HYPER_PK_BLDG, LF = HYPER_PK_LIFT;
    var bldg = d.prof.bldg, leased = bldg === B[2];
    var low = function(v) { return v !== '' && v != null && v <= 2; };
    var work = function(o) { return o.cls === W[1] || o.cls === W[2] || low(o.cond); };
    var pts = function(k) { return d.points.filter(function(p) { return p.type === k; }); };
    var lacks = function(p, k, i) { return p.chk.indexOf(_hpkPointType_(k).checks[i]) < 0; };
    var s = {};
    var dz = d.zones.filter(function(z) { return z.dis; });

    // 1) parking — only the disabled-bay zones
    if (leased) s.park = 'N/A';
    else if (!d.zones.length) s.park = '';
    else if (!d.lot.bays.dis) s.park = 'Urgent';
    else s.park = d.lot.required > d.lot.bays.dis || dz.some(function(z) {
        return z.cls === W[1] || z.cls === W[2] || z.dis.prob.length || low(z.dis.paint) || low(z.dis.sign);
    }) ? 'Improve' : 'Ready';

    // 2) ramp — customer ramps only (goods / supplier ramps are off the accessible route)
    var ramps = pts('ramp').filter(function(p) { return !p.m || p.m.use !== HYPER_PK_RAMP_USE[2]; });
    if (leased) s.ramp = 'N/A';
    else if (!ramps.length) s.ramp = '';
    else s.ramp = ramps.some(function(p) {
        var rc = (p.calc || {}).ramp;
        return work(p) || (rc && rc.fails.length) || lacks(p, 'ramp', 3) || (!(p.m && p.m.rail) && lacks(p, 'ramp', 2)) || (ver >= HYPER_PK_JSON_VER && lacks(p, 'ramp', 6));
    }) ? 'Improve' : 'Ready';

    // 3) accessible restroom
    var wcs = pts('toilet');
    if (leased) s.toilet = 'N/A';
    else if (!wcs.length) s.toilet = '';
    else if (!wcs.some(function(p) { return !lacks(p, 'toilet', 0); })) s.toilet = 'Urgent';
    else s.toilet = wcs.some(function(p) { return work(p) || p.calc.missing > 0; }) ? 'Improve' : 'Ready';

    // 4) elevator — multi-storey stores only; no lift (escalator instead) or broken = Urgent
    var lift = d.prof.lift;
    if (leased || lift === LF[4] || (bldg && bldg !== B[0]) || lift === LF[3]) s.lift = bldg || lift ? 'N/A' : '';
    else if (lift === LF[1] || lift === LF[2]) s.lift = 'Urgent';
    else if (lift === LF[0]) s.lift = pts('lift').some(function(p) { return work(p) || lacks(p, 'lift', 5) || lacks(p, 'lift', 6) || lacks(p, 'lift', 7); }) ? 'Improve' : 'Ready';
    else s.lift = '';

    // 5) wheelchair — all stores
    var m = d.mgmt, v2 = !!bldg;   // wheelchair checklist / storage came with the @531 form
    if (m.wcStore === HYPER_PK_WC_STORE[5]) s.wc = 'N/A';
    else if (!m.wheelchairs) s.wc = v2 || m.wcStore ? 'Urgent' : '';
    else if (!m.wcOk) s.wc = 'Urgent';
    else s.wc = m.wcBroken > 0 || m.wcShort > 0 || m.wcStore === HYPER_PK_WC_STORE[4] || (v2 && m.wcChk.length < HYPER_PK_WC_CHECKS.length) ? 'Improve' : 'Ready';

    // 6) signage — sign cards + the sign rating of the disabled bays + the lift / restroom sign items
    var signs = pts('sign');
    var bad = signs.some(function(p) { return work(p) || p.calc.missing > 0; }) || dz.some(function(z) { return low(z.dis.sign); }) ||
        pts('lift').some(function(p) { return lacks(p, 'lift', 5); }) || wcs.some(function(p) { return lacks(p, 'toilet', 5); });
    s.sign = bad ? 'Improve' : (signs.length || dz.length ? 'Ready' : '');

    var vals = HYPER_PK_FAC.map(function(f) { return s[f.k]; });
    s.all = vals.indexOf('Urgent') > -1 ? 'Urgent' : vals.indexOf('Improve') > -1 ? 'Improve' : vals.indexOf('Ready') > -1 ? 'Ready' : '';
    return s;
}
function _hpkStatusCols_(s) {
    var o = {};
    HYPER_PK_FAC.forEach(function(f) { o[f.col] = s[f.k]; });
    o[HYPER_PK_STATUS_COL] = s.all;
    return o;
}
// list-time hook (HyperSurveyEngine): statuses always computed from the JSON, so old rows get them too
function _hpkListRow_(row, raw) {
    var o = {};
    try { o = JSON.parse(raw || '{}'); } catch (e) {}
    var zs = o.zones || [];
    if (zs.length && !(zs[0].bays && typeof zs[0].bays === 'object')) return;   // first-version (@513) shape — no status
    Object.assign(row, _hpkStatusCols_(hyperPkFacilityStatus_(_hpkParse_(o), o.ver || 0)));
}

// Store profile — matches the LCD deck's 3 store groups and the lift / wheelchair findings
var HYPER_PK_BLDG = ['สาขา ≥ 2 ชั้น', 'สาขาชั้นเดียว', 'สาขาในพื้นที่เช่า (ใช้ของศูนย์การค้า)'];
var HYPER_PK_LIFT = ['มีลิฟต์โดยสาร ใช้งานได้', 'มีลิฟต์ แต่ชำรุด / ปิดใช้งาน', 'ไม่มีลิฟต์ — ใช้ทางเลื่อน (Autowalk) แทน', 'ชั้นเดียว ไม่ต้องมีลิฟต์', 'ใช้ลิฟต์ของศูนย์การค้า'];
var HYPER_PK_WC_STORE = ['จุดบริการลูกค้า / Information', 'ทางเข้าหลัก', 'ห้องพยาบาล', 'ห้อง / ป้อม รปภ.', 'ไม่มีจุดจัดเก็บชัดเจน', 'ใช้รถเข็นของศูนย์การค้า'];
var HYPER_PK_WC_CHECKS = ['ป้ายแจ้งจุดให้บริการรถเข็น', 'ลูกค้าขอใช้ได้ทันที (ไม่ต้องรอ)', 'จัดเก็บเป็นระเบียบ', 'ล้อ / เบรก / เบาะ ใช้งานได้ทุกคัน'];

// Communication + guard (รปภ.) follow-up
var HYPER_PK_SIGNS = ['ป้ายขอความร่วมมือ “เว้นที่จอดให้ผู้พิการ”', 'ป้ายแจ้งมาตรการ / บทลงโทษ', 'ป้ายนำทางจากทางเข้าลานจอด', 'สติกเกอร์ / ป้ายที่ทางเข้าอาคาร', 'ประกาศเสียงตามสาย'];
var HYPER_PK_GUARD = ['มี รปภ. ประจำจุด', 'รปภ. ตรวจตราเป็นรอบ', 'ไม่มี รปภ. ดูแลจุดนี้'];
var HYPER_PK_MEASURES = ['รปภ. ขอความร่วมมือให้ย้ายรถ', 'วางกรวย / ที่กั้น (เปิดให้เมื่อผู้พิการมา)', 'เสียบใบเตือนที่กระจกรถ', 'ประกาศเสียงตามสาย',
    'บันทึกทะเบียนรถ / สมุดบันทึก', 'รายงานผู้จัดการสาขา', 'บริการช่วยเหลือ (รถเข็น / พนักงานพาไป)'];
var HYPER_PK_MISUSE_FREQ = ['ไม่เคยพบ', 'นานๆ ครั้ง', 'ทุกสัปดาห์', 'ทุกวัน'];

// Minimum disabled bays for a car park of `total` bays (กฎกระทรวง พ.ศ. 2548): 10–50 → 1, 51–100 → 2,
// then +1 per extra 100 bays (a remainder over 50 counts as a full 100).
function hyperPkRequiredBays_(total) {
    total = parseInt(total, 10) || 0;
    if (total < 10) return 0;
    if (total <= 50) return 1;
    if (total <= 100) return 2;
    var extra = total - 100;
    return 2 + Math.floor(extra / 100) + (extra % 100 > 50 ? 1 : 0);
}

function _hpkNum_(v) { var n = parseFloat(v); return isNaN(n) || n < 0 ? 0 : n; }
function _hpkInt_(v) { var n = parseInt(v, 10); return isNaN(n) || n < 0 ? 0 : n; }
function _hpkTxt_(v, m) { return String(v == null ? '' : v).trim().substring(0, m || 120); }
function _hpkPick_(v, list) { return list.indexOf(v) > -1 ? v : ''; }
function _hpkPicks_(arr, list) { return (Array.isArray(arr) ? arr : []).filter(function(v) { return list.indexOf(v) > -1; }); }
function _hpkRate_(v) { var n = parseInt(v, 10); return !isNaN(n) && n >= 0 && n <= 5 ? n : ''; }
function _hpkAvg_(vals) { vals = vals.filter(function(v) { return v !== ''; }); return vals.length ? Math.round(vals.reduce(function(a, b) { return a + b; }, 0) / vals.length * 10) / 10 : ''; }
function _hpkPointType_(k) { for (var i = 0; i < HYPER_PK_POINT_TYPES.length; i++) if (HYPER_PK_POINT_TYPES[i].k === k) return HYPER_PK_POINT_TYPES[i]; return null; }
function _hpkCarBays_(bays) { return HYPER_PK_BAY_TYPES.reduce(function(a, t) { return a + (t.car ? (bays[t.k] || 0) : 0); }, 0); }

function _hpkParse_(raw) {
    var o = raw;
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { o = {}; } }
    if (!o || typeof o !== 'object') o = {};
    var m = o.mgmt || {};
    var zones = (Array.isArray(o.zones) ? o.zones : []).slice(0, 40).map(function(z, i) {
        var bays = {};
        HYPER_PK_BAY_TYPES.forEach(function(t) { bays[t.k] = _hpkInt_((z.bays || {})[t.k]); });
        var el = {};
        HYPER_PK_LOT_ELEMENTS.forEach(function(e) { var n = _hpkRate_((z.el || {})[e.k]); if (n !== '') el[e.k] = n; });
        var zone = {
            zid: _hpkTxt_(z.zid, 10) || ('PZ' + String(i + 1).padStart(2, '0')), name: _hpkTxt_(z.name, 80), type: _hpkPick_(z.type, HYPER_PK_LOT_TYPES), floor: _hpkTxt_(z.floor, 20),
            bays: bays, el: el, prob: _hpkPicks_(z.prob, HYPER_PK_LOT_PROBLEMS), probOther: _hpkTxt_(z.probOther, 200),
            dis: null,
            scope: _hpkPicks_(z.scope, HYPER_PK_SCOPE), prio: _hpkPick_(z.prio, HYPER_PK_PRIORITY), budget: _hpkNum_(z.budget), nt: _hpkTxt_(z.nt, 400), pk: _hpkTxt_(z.pk, 60)
        };
        _hpkWork_(zone, z);
        // the disabled-bay block only exists when the zone has disabled bays
        if (bays.dis > 0) {
            var d = z.dis || {};
            zone.dis = {
                near: _hpkPick_(d.near, HYPER_PK_NEAR), dist: _hpkNum_(d.dist), chk: _hpkPicks_(d.chk, HYPER_PK_ZONE_CHECKS),
                paint: _hpkRate_(d.paint), sign: _hpkRate_(d.sign), misuse: Math.min(_hpkInt_(d.misuse), bays.dis),
                prob: _hpkPicks_(d.prob, HYPER_PK_ZONE_PROBLEMS), probOther: _hpkTxt_(d.probOther, 200)
            };
        }
        var elVals = Object.keys(el).map(function(k) { return el[k]; });
        zone.calc = {
            cars: _hpkCarBays_(bays),
            total: HYPER_PK_BAY_TYPES.reduce(function(a, t) { return a + bays[t.k]; }, 0),
            score: _hpkAvg_(elVals),
            missing: zone.dis ? HYPER_PK_ZONE_CHECKS.length - zone.dis.chk.length : 0
        };
        return zone;
    });
    var points = (Array.isArray(o.points) ? o.points : []).slice(0, 60).map(function(p, i) {
        var t = _hpkPointType_(p.type);
        var checks = t ? t.checks : [];
        var pt = {
            xid: _hpkTxt_(p.xid, 10) || ('A' + (i + 1)), type: t ? t.k : '', loc: _hpkTxt_(p.loc, 80), floor: _hpkTxt_(p.floor, 20),
            chk: _hpkPicks_(p.chk, checks), cond: _hpkRate_(p.cond), prob: _hpkTxt_(p.prob, 300),
            scope: _hpkPicks_(p.scope, HYPER_PK_SCOPE), prio: _hpkPick_(p.prio, HYPER_PK_PRIORITY), budget: _hpkNum_(p.budget), nt: _hpkTxt_(p.nt, 400), pk: _hpkTxt_(p.pk, 60)
        };
        _hpkWork_(pt, p);
        pt.calc = { missing: checks.length - pt.chk.length };
        if (pt.type === 'ramp') {
            var rm = p.m || {};
            pt.m = { rise: _hpkNum_(rm.rise), run: _hpkNum_(rm.run), deg: _hpkNum_(rm.deg), w: _hpkNum_(rm.w), use: _hpkPick_(rm.use, HYPER_PK_RAMP_USE),
                     rail: _hpkPick_(rm.rail, HYPER_PK_RAIL), railMat: _hpkPick_(rm.railMat, HYPER_PK_RAIL_MAT), landing: _hpkPick_(rm.landing, HYPER_PK_LANDING) };
            pt.calc.ramp = hyperPkRampCalc_(pt.m);
        }
        return pt;
    });
    var wcTotal = _hpkInt_(m.wheelchairs), wcOk = Math.min(_hpkInt_(m.wcOk), wcTotal);
    var mgmt = {
        signs: _hpkPicks_(m.signs, HYPER_PK_SIGNS), guard: _hpkPick_(m.guard, HYPER_PK_GUARD), measures: _hpkPicks_(m.measures, HYPER_PK_MEASURES),
        freq: _hpkPick_(m.freq, HYPER_PK_MISUSE_FREQ), wheelchairs: wcTotal, nt: _hpkTxt_(m.nt, 400),
        wcOk: wcOk, wcNeed: _hpkInt_(m.wcNeed), wcStore: _hpkPick_(m.wcStore, HYPER_PK_WC_STORE), wcChk: _hpkPicks_(m.wcChk, HYPER_PK_WC_CHECKS)
    };
    mgmt.wcBroken = wcTotal - wcOk;
    mgmt.wcShort = Math.max(mgmt.wcNeed - wcOk, 0);
    var pf = o.prof || {};
    var prof = { bldg: _hpkPick_(pf.bldg, HYPER_PK_BLDG), floors: _hpkInt_(pf.floors), lift: _hpkPick_(pf.lift, HYPER_PK_LIFT), liftNt: _hpkTxt_(pf.liftNt, 300), entry: _hpkTxt_(pf.entry, 200) };
    // store totals — summed from the zone cards
    var lot = { bays: {}, cars: 0, total: 0, types: [], score: '' };
    HYPER_PK_BAY_TYPES.forEach(function(t) { lot.bays[t.k] = zones.reduce(function(a, z) { return a + z.bays[t.k]; }, 0); });
    lot.cars = _hpkCarBays_(lot.bays);
    lot.total = zones.reduce(function(a, z) { return a + z.calc.total; }, 0);
    zones.forEach(function(z) { if (z.type && lot.types.indexOf(z.type) < 0) lot.types.push(z.type); });
    var allEl = [];
    zones.forEach(function(z) { Object.keys(z.el).forEach(function(k) { allEl.push(z.el[k]); }); });
    lot.score = _hpkAvg_(allEl);
    lot.required = hyperPkRequiredBays_(lot.cars);
    return { prof: prof, lot: lot, zones: zones, points: points, mgmt: mgmt };
}
// work class + quantity, shared by zone and point cards
function _hpkWork_(dst, src) {
    dst.cls = _hpkPick_(src.cls, HYPER_PK_WORK_CLASS);
    dst.qty = _hpkNum_(src.qty);
    dst.unit = _hpkPick_(src.unit, HYPER_PK_QTY_UNITS);
}

function _hpkExtraColumns_(form) {
    if (form.parkJson === undefined) return {};   // comment-only edits never wipe the survey
    var d = _hpkParse_(form.parkJson);
    d.ver = HYPER_PK_JSON_VER;
    var json = JSON.stringify(d);
    if (json.length > 48000) throw new Error('ข้อมูลมากเกินไปสำหรับ 1 รายการ กรุณาลดจำนวนการ์ด หรือแบ่งส่ง 2 รายการ');
    var sum = function(arr, f) { return arr.reduce(function(a, x) { return a + f(x); }, 0); };
    var disZones = d.zones.filter(function(z) { return z.dis; });
    var items = d.zones.concat(d.points);
    var touch = items.filter(function(x) { return x.cls === HYPER_PK_WORK_CLASS[1]; });
    var impr = items.filter(function(x) { return x.cls === HYPER_PK_WORK_CLASS[2]; });
    var ramps = d.points.filter(function(p) { return p.calc.ramp; });
    var steep = ramps.filter(function(p) { return p.m.use !== HYPER_PK_RAMP_USE[2]; })   // goods ramps are off the accessible route
        .map(function(p) { return p.calc.ramp.ratio; }).filter(function(x) { return x !== ''; });
    var L = d.lot, st = hyperPkFacilityStatus_(d, HYPER_PK_JSON_VER);
    return {
        'Parking Zones': d.zones.length,
        'Total Parking Bays': L.cars,
        'General Car Bays': L.bays.car,
        'Family Bays': L.bays.fam,
        'EV Bays': L.bays.ev,
        'Motorcycle Bays': L.bays.moto,
        'Service Bays': L.bays.svc,
        'Lot Condition (0-5)': L.score,
        'Zones Condition ≤2': d.zones.filter(function(z) { return z.calc.score !== '' && z.calc.score <= 2; }).length,
        'Disabled Bays': L.bays.dis,
        'Disabled Bays Required': L.required,
        'Disabled Bays Short': Math.max(L.required - L.bays.dis, 0),
        'Disabled Zones': disZones.length,
        'Zone Items Missing': sum(d.zones, function(z) { return z.calc.missing; }),
        'Avg Paint (0-5)': _hpkAvg_(disZones.map(function(z) { return z.dis.paint; })),
        'Avg Sign (0-5)': _hpkAvg_(disZones.map(function(z) { return z.dis.sign; })),
        'Misuse Cars Seen': sum(disZones, function(z) { return z.dis.misuse; }),
        'Misuse Frequency': d.mgmt.freq,
        'Guard Monitoring': d.mgmt.guard,
        'Signs Present': d.mgmt.signs.length,
        'Measures': d.mgmt.measures.join(', '),
        'Access Points': d.points.length,
        'Access Items Missing': sum(d.points, function(p) { return p.calc.missing; }),
        'Points Condition ≤2': d.points.filter(function(p) { return p.cond !== '' && p.cond <= 2; }).length,
        'High Priority Items': items.filter(function(x) { return x.prio === HYPER_PK_PRIORITY[0]; }).length,
        'Est. Budget (THB)': sum(items, function(x) { return x.budget; }),
        // added 2026-10-30 (LCD accessibility review) — appended, the engine creates the header on first save
        'Work Class': hyperPkStoreClass_(items),
        'Touch Up Items': touch.length,
        'Touch Up Budget (THB)': sum(touch, function(x) { return x.budget; }),
        'Improvement Items': impr.length,
        'Improvement Budget (THB)': sum(impr, function(x) { return x.budget; }),
        'Building Type': d.prof.bldg,
        'Lift Status': d.prof.lift,
        'Ramps': ramps.length,
        'Ramps Fail': ramps.filter(function(p) { return p.calc.ramp.fails.length; }).length,
        'Steepest Ramp (1:X)': steep.length ? Math.min.apply(null, steep) : '',
        'Wheelchairs': d.mgmt.wheelchairs,
        'Wheelchairs OK': d.mgmt.wcOk,
        'Wheelchairs Short': d.mgmt.wcShort,
        'Wheelchair Storage': d.mgmt.wcStore,
        // added 2026-11-05 — LCD deck's 6 facilities (Ready / Improve / Urgent / N/A)
        'Status Parking': st.park, 'Status Ramp': st.ramp, 'Status Restroom': st.toilet,
        'Status Elevator': st.lift, 'Status Wheelchair': st.wc, 'Status Signage': st.sign,
        'Accessibility Status': st.all,
        'Parking_JSON': json
    };
}

function _hpkEmailExtra_(counts, esc) {
    var d = {};
    try { d = JSON.parse(counts['Parking_JSON'] || '{}'); } catch (e) {}
    var short = counts['Disabled Bays Short'] > 0;
    var h = '<p style="margin:12px 0 4px;"><b>สรุปที่จอดรถ &amp; ผู้พิการ</b> — ' + counts['Parking Zones'] + ' โซน · ช่องรถยนต์รวม ' + counts['Total Parking Bays'] + ' · มอเตอร์ไซค์ ' + counts['Motorcycle Bays'] +
        ' · ช่องผู้พิการ <b style="' + (short ? 'color:#b91c1c;' : '') + '">' + counts['Disabled Bays'] + ' / ขั้นต่ำ ' + counts['Disabled Bays Required'] + '</b> · พบรถทั่วไปจอด ' + counts['Misuse Cars Seen'] +
        ' คัน · รปภ.: ' + esc(counts['Guard Monitoring'] || '-') + ' · เร่งด่วน ' + counts['High Priority Items'] + ' จุด · งบประมาณประมาณการ ' + Number(counts['Est. Budget (THB)']).toLocaleString() + ' ฿</p>' +
        '<p style="margin:0 0 4px;">ประเภทงานสาขา: <b>' + esc(counts['Work Class'] || '-') + '</b> · Touch Up ' + counts['Touch Up Items'] + ' จุด (' + Number(counts['Touch Up Budget (THB)']).toLocaleString() + ' ฿)' +
        ' · Improvement ' + counts['Improvement Items'] + ' จุด (' + Number(counts['Improvement Budget (THB)']).toLocaleString() + ' ฿) · ทางลาดไม่ผ่าน ' + counts['Ramps Fail'] + '/' + counts['Ramps'] +
        ' · รถเข็นใช้ได้ ' + counts['Wheelchairs OK'] + '/' + counts['Wheelchairs'] + (counts['Wheelchairs Short'] ? ' <b style="color:#b91c1c;">ขาด ' + counts['Wheelchairs Short'] + ' คัน</b>' : '') +
        ' · ลิฟต์: ' + esc(counts['Lift Status'] || '-') + '</p>';
    var td = 'padding:4px;border-bottom:1px solid #f1f5f9;';
    var row = function(a, b, c, bad) {
        return '<tr><td style="' + td + '">' + esc(a) + '</td><td style="' + td + (bad ? 'color:#b91c1c;font-weight:bold;' : '') + '">' + esc(b) + '</td><td style="' + td + '">' + esc(c) + '</td></tr>';
    };
    h += '<table style="width:100%;border-collapse:collapse;font-size:11px;"><tr style="background:#f1f5f9;text-align:left;"><th style="padding:4px;">โซน / จุด</th><th style="padding:4px;">ช่องจอด · สภาพ · ขาด</th><th style="padding:4px;">ขอบเขตปรับปรุง / ความเร่งด่วน</th></tr>';
    (d.zones || []).forEach(function(z) {
        var c = z.calc || {};
        var bays = HYPER_PK_BAY_TYPES.filter(function(t) { return z.bays[t.k]; }).map(function(t) { return t.l.replace(/^\S+\s/, '') + ' ' + z.bays[t.k]; }).join(', ');
        h += row(z.zid + ' ' + (z.name || '') + (z.type ? ' · ' + z.type : ''),
            (bays || '-') + ' · สภาพ ' + (c.score === '' ? '-' : c.score) + (z.dis ? ' · ♿ ขาด ' + c.missing + ' · สี ' + (z.dis.paint === '' ? '-' : z.dis.paint) + ' · ป้าย ' + (z.dis.sign === '' ? '-' : z.dis.sign) : ''),
            (z.scope.join(', ') || '-') + (z.prio ? ' · ' + z.prio : '') + (z.cls ? ' · ' + z.cls.split(' — ')[0] : ''), c.missing > 0 || (c.score !== '' && c.score <= 2));
    });
    (d.points || []).forEach(function(p) {
        var t = _hpkPointType_(p.type), rc = (p.calc || {}).ramp;
        var ramp = rc ? ' · 1:' + (rc.ratio || '-') + (rc.fails.length ? ' (' + rc.fails.join(', ') + ')' : '') : '';
        h += row(p.xid + ' ' + (t ? t.l : '') + ' · ' + (p.loc || ''), 'ขาด ' + p.calc.missing + ' รายการ · สภาพ ' + (p.cond === '' ? '-' : p.cond) + ramp,
            (p.scope.join(', ') || '-') + (p.prio ? ' · ' + p.prio : '') + (p.cls ? ' · ' + p.cls.split(' — ')[0] : ''), p.calc.missing > 0 || (p.cond !== '' && p.cond <= 2) || (rc && rc.fails.length > 0));
    });
    return h + '</table>';
}

var HYPER_PK_DEF = {
    name: 'Hyper Parking & Accessibility Survey', emoji: '♿',
    sheet: HYPER_PK_SHEET, folder: HYPER_PK_FOLDER,
    idPrefix: 'HPK', keyPrefix: 'hpk_', photoFilePrefix: 'hyperparking', headerColor: '#2563eb',
    brokenLabel: 'จุดชำรุดเร่งด่วน',
    histType: 'Pk',
    categories: [], system: [], groups: [],
    grandTotal: { label: '', header: '' },
    catTemp: { a: { suffix: 'a', headerSuffix: ' a', label: '-' }, b: { suffix: 'b', headerSuffix: ' b', label: '-' }, rule: 'gap', threshold: 999 },
    extraColumns: _hpkExtraColumns_,
    emailExtra: _hpkEmailExtra_,
    listSkip: ['Parking_JSON'],
    listRow: { col: 'Parking_JSON', fn: _hpkListRow_ }
};

function getHyperPkConfig_() {
    return { lotTypes: HYPER_PK_LOT_TYPES, bayTypes: HYPER_PK_BAY_TYPES, lotElements: HYPER_PK_LOT_ELEMENTS, lotProblems: HYPER_PK_LOT_PROBLEMS, near: HYPER_PK_NEAR,
             zoneChecks: HYPER_PK_ZONE_CHECKS, zoneProblems: HYPER_PK_ZONE_PROBLEMS, pointTypes: HYPER_PK_POINT_TYPES, scope: HYPER_PK_SCOPE,
             priority: HYPER_PK_PRIORITY, signs: HYPER_PK_SIGNS, guard: HYPER_PK_GUARD, measures: HYPER_PK_MEASURES, freq: HYPER_PK_MISUSE_FREQ,
             workClass: HYPER_PK_WORK_CLASS, touchUpLimit: HYPER_PK_TOUCHUP_LIMIT, qtyUnits: HYPER_PK_QTY_UNITS,
             rampUse: HYPER_PK_RAMP_USE, rail: HYPER_PK_RAIL, railMat: HYPER_PK_RAIL_MAT, landing: HYPER_PK_LANDING, riseBands: HYPER_PK_RISE_BANDS, slopeBands: HYPER_PK_SLOPE_BANDS,
             bldg: HYPER_PK_BLDG, lift: HYPER_PK_LIFT, wcStore: HYPER_PK_WC_STORE, wcChecks: HYPER_PK_WC_CHECKS,
             fac: HYPER_PK_FAC, statusCol: HYPER_PK_STATUS_COL, jsonVer: HYPER_PK_JSON_VER };
}
function processHyperPkSurveyForm(form) { return hyperSurveySubmit_(HYPER_PK_DEF, form); }
function getHyperPkSurveyList(includeArchive) { var r = hyperSurveyList_(HYPER_PK_DEF, includeArchive); r.pkConfig = getHyperPkConfig_(); return r; }
function getHyperPkSurveyRecordById(id) {
    var r = hyperSurveyRecordById_(HYPER_PK_DEF, id);
    if (r.success) { try { r.data.Parking_JSON = JSON.parse(r.data.Parking_JSON || '{}'); } catch (e) { r.data.Parking_JSON = {}; } r.pkConfig = getHyperPkConfig_(); }
    return r;
}
function updateHyperPkSurveyRecord(form) { return hyperSurveyUpdate_(HYPER_PK_DEF, form); }
function deleteHyperPkSurveyRecord(id, clientEmail) { return hyperSurveyDelete_(HYPER_PK_DEF, id, clientEmail); }
function addHyperPkSurveyPhotos(id, unitKey, files, clientEmail) { return hyperSurveyAddPhotos_(HYPER_PK_DEF, id, unitKey, files, clientEmail); }
function deleteHyperPkSurveyPhoto(id, unitKey, url, clientEmail) { return hyperSurveyDeletePhoto_(HYPER_PK_DEF, id, unitKey, url, clientEmail); }
