// --- Store Closing Checklist (เช็คลิสต์ปิดสาขา — สำรวจทรัพย์สิน & ติดตามงานปิดสาขา) ---
// From the PPT Property LINE group (Oct 2026) + "2027 Store Closure.xlsx" (14 stores, Solar Rooftop / EV status by MTN 27/10/26):
// MTN walks every closing store with VP OPT (29/10–6/11/26), decides per asset group whether it is transferred to another
// store, moved to the FWH, sold as scrap, handed over with the site (OSX / TWC / tenant) or returned to its owner, and
// tracks the closing tasks (Solar PPA, EV, refrigerant, utilities, contracts, landlord handover, FAD write-off) up to the
// PPT approval (24/11/26) and the clear-out (≤ 2 weeks after closing). Costs roll up per store for the closure deck.
// Runs on HyperSurveyEngine.gs (same per-card JSON pattern as the Fixed Asset survey); one record per store, latest wins.

var STORE_CLOSE_SHEET = "Store_Closing_Checklist_Database";
var STORE_CLOSE_FOLDER = "Store_Closing_Checklist_Attachments";
var STORE_CLOSE_APPROVAL = '2026-11-24';   // PPT Approval for every closing store
var STORE_CLOSE_CLEAR_DAYS = 14;           // assets must be cleared within week 2 after the closing date

// Closure plan 2027 — [0 gold, 1 oracle, 2 format, 3 name, 4 Thai, 5 GO date, 6 ownership, 7 solar phase, 8 solar investor, 9 EV,
//                      10 handover (site condition), 11 after-close plan, 12 MTN survey date, 13 MTN surveyor]
// 10: Toh 26/10 "ทุบทุกสาขา ยกเว้น ชะอำ + บุญเจริญ"; Rattanathibeth 2 returns as vacant land. 11: Prakrom 26/10. 12–13: Dean 28/10.
var STORE_CLOSE_PLAN = [
    ['15019', '151019', 'BMK',   'Chaam',                'ชะอำ',               '2013-03-15', 'Land Leasehold', '',  '',          'Plan Install', 'ไม่ทุบ — ส่งมอบตามสภาพ', 'Market: หาพื้นที่ทำ Mini Big C', '29–30/10/26', 'C7'],
    ['15035', '151041', 'BMK',   'Bangmunnak',           'บางมูลนาก',           '2014-09-05', 'Land Leasehold', '',  '',          'Plan Install', 'ทุบ / รื้อถอน',           'Market: หาพื้นที่ทำ Mini Big C', '29–30/10/26', 'พี่แบงค์ Area MTN'],
    ['15018', '151018', 'BMK',   'Banpae (Rayong)',      'บ้านเพ ระยอง',        '2012-12-21', 'Land Leasehold', '',  '',          'Plan Install', 'ทุบ / รื้อถอน',           'Market: หาพื้นที่ทำ Mini Big C', '29–30/10/26', 'คุณโอ Area MTN'],
    ['11132', '111132', 'Hyper', 'Daokanong',            'ดาวคะนอง',           '2002-09-05', 'Land Leasehold', '',  '',          'Plan Install', 'ทุบ / รื้อถอน',           '',                                '3/11/26',     'C7'],
    ['15050', '151057', 'BMK',   'Phutthamonthon Sai 5', 'พุทธมณฑลสาย 5',      '2015-12-12', 'Land Leasehold', '',  '',          'Yes',          'ทุบ / รื้อถอน',           'Market: หาพื้นที่ทำ Mini Big C', '5/11/26',     'พี่เอ / รุจน์ Area MTN'],
    ['11180', '111180', 'Hyper', 'Ramintra Extra',       'รามอินทรา',          '1999-05-21', 'Land Leasehold', '',  '',          'Yes',          'ทุบ / รื้อถอน',           'มี FWH — เร่งวางแผนเคลียร์ของ', '',            ''],
    ['11189', '111189', 'Hyper', 'Rattanatibeth 2',      'รัตนาธิเบศร์ 2',      '2000-02-02', 'Land Leasehold', '',  '',          'Yes',          'ทุบ — คืนเป็นที่ดินเปล่า',  '',                                '2/11/26',     'พี่เอ / รุจน์ Area MTN'],
    ['15017', '151017', 'BMK',   'Khubon',               'คู้บอน',              '2012-09-28', 'Land Leasehold', '7', 'SP Group',  'Yes',          'ทุบ / รื้อถอน',           'Sublease ให้ J Villa',            '29–30/10/26', 'พี่เผือก Area MTN'],
    ['17004', '151109', 'BMK',   'Boonchareun',          'ตลาดบุญเจริญ',       '',           'Land Leasehold', '',  '',          'Plan Install', 'ไม่ทุบ — ส่งมอบตามสภาพ', 'หาผู้เช่า take Sales Floor',     '29–30/10/26', 'พี่เอ Area MTN'],
    ['11157', '111157', 'Hyper', 'Banpong',              'บ้านโป่ง',            '2008-05-08', 'Land Leasehold', '6', 'BJC Power', 'Plan Install', 'ทุบ / รื้อถอน',           'OSX + TWC',                       '',            ''],
    ['11202', '111202', 'Hyper', 'Romklao',              'ร่มเกล้า',            '2009-03-28', 'Land Leasehold', '7', 'SP Group',  'Yes',          'ทุบ / รื้อถอน',           'OSX + TWC',                       '',            ''],
    ['14001', '141001', 'Hyper', 'Samrong 2 Jumbo',      'สำโรง 2 (จัมโบ้)',    '2002-07-18', 'Land Leasehold', '',  '',          'Yes',          'ทุบ / รื้อถอน',           'OSX + TWC',                       '',            ''],
    ['11131', '111131', 'Hyper', 'Ladphrao 1',           'ลาดพร้าว 1',          '2002-06-27', 'Pure Lease',     '',  '',          'Yes',          'ทุบ / รื้อถอน',           'เร่ง Landlord เรื่อง Renovation', '',            ''],
    ['11152', '111152', 'Hyper', 'Chonburi 1',           'ชลบุรี 1',            '2007-10-09', 'Land Leasehold', '4', 'BJC Power', 'Yes',          'ไม่ทุบ (ถ้าปิด)',         'เจรจาลดค่าเช่า — ยังไม่ปิดตอนนี้', '',            '']
];

var STORE_CLOSE_HANDOVER = ['ทุบ / รื้อถอน', 'ทุบ — คืนเป็นที่ดินเปล่า', 'ไม่ทุบ — ส่งมอบตามสภาพ', 'ไม่ทุบ (ถ้าปิด)', 'คืนสภาพตามสัญญา (Reinstatement)', 'ส่งต่อผู้เช่า / ผู้ซื้อรายใหม่', 'ยังไม่สรุป'];
var STORE_CLOSE_GROUPS = ['ระบบปรับอากาศ (Chiller / AHU / Split / VRF)', 'ตู้แช่ / ห้องเย็น / Rack (Remote / Plug-in)', 'ระบบไฟฟ้า (หม้อแปลง / MDB / Generator / UPS)',
    'ระบบดับเพลิง / Fire Alarm', 'ลิฟต์ / บันไดเลื่อน / Travelator', 'ระบบสุขาภิบาล / ปั๊มน้ำ / บำบัดน้ำเสีย', 'โคมไฟ / ป้ายไฟ / ป้ายร้าน (Signage)',
    'Fixture / Gondola / ชั้นวาง', 'Checkout / Cashier Counter', 'อุปกรณ์ครัว / Fresh Food / Bakery', 'CCTV / Security / MIS', 'Solar Rooftop', 'EV Charger',
    'รถเข็น / ตะกร้า / อุปกรณ์หน้าร้าน', 'อุปกรณ์ / เครื่องมือ MTN', 'อื่นๆ'];
var STORE_CLOSE_COND = ['A ดี — ใช้ต่อได้ทันที', 'B ใช้ได้ — ต้องซ่อม / ปรับปรุงก่อน', 'C เสีย / ล้าสมัย — ไม่คุ้มใช้ต่อ'];
// Disposition = what happens to the asset group; `move` = needs the moving contractor, `scrap` = brings scrap income
var STORE_CLOSE_DISPO = [
    { k: 'transfer', en: 'Transfer', l: 'โอนย้ายไปสาขาอื่น',                       move: true,  scrap: false, needTarget: true },
    { k: 'fwh', en: 'FWH',      l: 'ย้ายเก็บ FWH (คลังเก็บอุปกรณ์)',             move: true,  scrap: false, needTarget: true },
    { k: 'scrap', en: 'Scrap',    l: 'ขาย / ประมูลซาก',                          move: false, scrap: true,  needTarget: false },
    { k: 'handover', en: 'Handover', l: 'ส่งมอบพร้อมพื้นที่ (Landlord / TWC / OSX / ผู้เช่า)', move: false, scrap: false, needTarget: false },
    { k: 'return', en: 'Return',   l: 'คืนเจ้าของ (Supplier / Investor / ผู้ให้เช่า)', move: false, scrap: false, needTarget: false },
    { k: 'writeoff', en: 'Write-off', l: 'ทิ้ง / Write-off',                        move: false, scrap: false, needTarget: false },
    { k: 'pending', en: 'Pending',  l: 'รอตัดสินใจ',                              move: false, scrap: false, needTarget: false }
];
var STORE_CLOSE_OWNER = ['Big C (มี Asset No.)', 'Big C (ไม่พบ Asset No.)', 'Supplier', 'Investor (Solar / EV)', 'ผู้ให้เช่า (Landlord)'];
var STORE_CLOSE_STATUS = ['ยังไม่เริ่ม', 'กำลังดำเนินการ', 'เสร็จแล้ว', 'ไม่เกี่ยวข้อง'];
// Closing tasks by phase. `due`: 'approval' = PPT approval date, 'close' = closing day, number = days after closing.
var STORE_CLOSE_TASKS = [
    { p: 'สำรวจ & ตัดสินใจ (ก่อน PPT Approval)', due: 'approval', items: [
        ['T01', 'เดินสำรวจร่วม VP OPT / Area MTN / Setup / FAD — ตัดสินใจทรัพย์สินที่นำไปใช้ต่อ และสาขาปลายทาง'],
        ['T02', 'ตรวจนับทรัพย์สินเทียบทะเบียน FAD (Asset No.) — ระบุของที่ไม่มีในทะเบียน'],
        ['T03', 'ประเมินค่าขนย้าย (MTN / Setup) · ค่ารื้อถอน / ทุบ · มูลค่าซาก'],
        ['T04', 'Solar Rooftop: แจ้ง Investor — ประเมินค่ายกเลิก PPA หรือค่าย้ายระบบ (ฝ่ายกฎหมาย)'],
        ['T05', 'EV Charger: แจ้งผู้ให้บริการ — ประเมินค่าเสียหายการยกเลิก'],
        ['T06', 'ตรวจเงื่อนไขส่งมอบพื้นที่กับ Landlord (ทุบ / คืนสภาพ / ส่งตามสภาพ) และค่าเช่าช่วงรื้อถอน'],
        ['T07', 'ทรัพย์สินที่ต้อง Write-off เกินอำนาจอนุมัติ → นำเข้า PPT (ชนเลขกับ FAD Fixed Asset)']] },
    { p: 'ก่อนปิดสาขา', due: 'close', items: [
        ['T08', 'แจ้งยกเลิกสัญญา PM / บริการ (ลิฟต์ แอร์ ดับเพลิง กำจัดแมลง ทำความสะอาด รปภ.) ให้มีผลหลังส่งมอบพื้นที่'],
        ['T09', 'วางแผนขนย้ายกับ Setup / ผู้รับเหมาขนย้าย (จัดซื้อ GCP) และพื้นที่รับของที่สาขาปลายทาง / FWH'],
        ['T10', 'ติดป้ายแยก Gondola Slim (รับน้ำหนัก ≤ 60 กก.) กับ Gondola ปกติ ก่อนรื้อ'],
        ['T11', 'ประสาน OPT เรื่อง Clearance Stock และวันหยุดขาย']] },
    { p: 'วันปิดสาขา', due: 'close', items: [
        ['T12', 'จดเลขมิเตอร์ไฟฟ้า / ประปา / แก๊ส พร้อมถ่ายรูป'],
        ['T13', 'ปิดตู้แช่ / ห้องเย็น — เก็บน้ำยา (Refrigerant Recovery) ก่อนรื้อ ห้ามปล่อยทิ้ง'],
        ['T14', 'ปิด LPG / ถอดถังแก๊ส — เคลียร์สารเคมี แบตเตอรี่ หลอดไฟ (ขยะอันตราย)'],
        ['T15', 'คงระบบดับเพลิง / Fire Alarm / CCTV / รปภ. ไว้จนส่งมอบพื้นที่']] },
    { p: 'หลังปิด (ภายใน 2 สัปดาห์)', due: STORE_CLOSE_CLEAR_DAYS, items: [
        ['T16', 'ขนย้ายทรัพย์สินออกครบตามแผน (โอนสาขา / FWH)'],
        ['T17', 'รื้อถอน / ขายซาก / ปรับสภาพตามเงื่อนไข Landlord'],
        ['T18', 'แจ้งยกเลิก / โอนมิเตอร์ไฟฟ้า (กฟน. / กฟภ.) และประปา'],
        ['T19', 'ส่งมอบพื้นที่ + กุญแจ + เอกสาร + ภาพถ่ายสภาพสุดท้าย'],
        ['T20', 'จดทะเบียนยกเลิกสัญญาเช่าที่กรมที่ดิน (Property — ใช้ Minutes BOD / BR)'],
        ['T21', 'ปรับปรุงทะเบียนทรัพย์สินกับ FAD (โอนย้าย / ตัดจำหน่าย) ครบทุกรายการ']] }
];

function _sclNum_(v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) || n < 0 ? 0 : n; }
function _sclInt_(v) { return Math.round(_sclNum_(v)); }
function _sclTxt_(v, m) { return String(v == null ? '' : v).trim().substring(0, m || 120); }
function _sclPick_(v, list) { return list.indexOf(v) > -1 ? v : ''; }
function _sclDate_(v) { v = _sclTxt_(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }
function _sclDispo_(k) { for (var i = 0; i < STORE_CLOSE_DISPO.length; i++) if (STORE_CLOSE_DISPO[i].k === k) return STORE_CLOSE_DISPO[i]; return null; }
function storeClosePlan_(code) {
    code = String(code || '').trim();
    if (!code) return null;
    for (var i = 0; i < STORE_CLOSE_PLAN.length; i++) if (STORE_CLOSE_PLAN[i][0] === code || STORE_CLOSE_PLAN[i][1] === code) return STORE_CLOSE_PLAN[i];
    return null;
}
function _sclAddDays_(iso, n) { var d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy-MM-dd'); }
function _sclTaskDue_(due, closeDate) {
    if (due === 'approval') return STORE_CLOSE_APPROVAL;
    if (!closeDate) return '';
    return due === 'close' ? closeDate : _sclAddDays_(closeDate, due);
}

function _sclParse_(raw) {
    var o = raw;
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { o = {}; } }
    if (!o || typeof o !== 'object') o = {};
    var pl = o.plan || {};
    var plan = { closeDate: _sclDate_(pl.closeDate), handover: _sclPick_(pl.handover, STORE_CLOSE_HANDOVER), after: _sclTxt_(pl.after, 150),
                 vpOpt: _sclTxt_(pl.vpOpt, 80), team: _sclTxt_(pl.team, 200), solar: _sclTxt_(pl.solar, 150), ev: _sclTxt_(pl.ev, 150) };
    var dispoKeys = STORE_CLOSE_DISPO.map(function(d) { return d.k; });
    var assets = (Array.isArray(o.assets) ? o.assets : []).slice(0, 80).map(function(a, i) {
        return { aid: _sclTxt_(a.aid, 10) || ('CA' + String(i + 1).padStart(2, '0')), grp: _sclPick_(a.grp, STORE_CLOSE_GROUPS), item: _sclTxt_(a.item, 120),
                 qty: _sclInt_(a.qty), cond: _sclPick_(a.cond, STORE_CLOSE_COND), age: _sclInt_(a.age), owner: _sclPick_(a.owner, STORE_CLOSE_OWNER),
                 assetNo: _sclTxt_(a.assetNo, 120), dispo: _sclPick_(a.dispo, dispoKeys) || 'pending', target: _sclTxt_(a.target, 80),
                 move: _sclNum_(a.move), scrap: _sclNum_(a.scrap), nt: _sclTxt_(a.nt, 400), pk: _sclTxt_(a.pk, 60) };
    });
    var tIn = o.tasks || {}, tasks = {};
    STORE_CLOSE_TASKS.forEach(function(ph) {
        ph.items.forEach(function(it) {
            var t = tIn[it[0]] || {};
            tasks[it[0]] = { s: _sclPick_(t.s, STORE_CLOSE_STATUS) || STORE_CLOSE_STATUS[0], who: _sclTxt_(t.who, 60), due: _sclDate_(t.due) || _sclTaskDue_(ph.due, plan.closeDate), nt: _sclTxt_(t.nt, 200) };
        });
    });
    var c = o.cost || {};
    var cost = { demolish: _sclNum_(c.demolish), solar: _sclNum_(c.solar), ev: _sclNum_(c.ev), other: _sclNum_(c.other), nt: _sclTxt_(c.nt, 300) };
    return { plan: plan, assets: assets, tasks: tasks, cost: cost, totals: storeCloseTotals_(assets, tasks, cost) };
}

// Shared by the server columns; the form mirrors it in sclTotals()
function storeCloseTotals_(assets, tasks, cost) {
    var t = { groups: 0, qty: 0, byDispo: {}, move: 0, scrap: 0, pending: 0, targets: [] };
    STORE_CLOSE_DISPO.forEach(function(d) { t.byDispo[d.k] = 0; });
    var grpSeen = {};
    assets.forEach(function(a) {
        if (a.grp && !grpSeen[a.grp]) { grpSeen[a.grp] = 1; t.groups++; }
        t.qty += a.qty; t.byDispo[a.dispo] += a.qty; t.move += a.move; t.scrap += a.scrap;
        if (a.dispo === 'pending') t.pending++;
        if ((a.dispo === 'transfer' || a.dispo === 'fwh') && a.target && t.targets.indexOf(a.target) < 0) t.targets.push(a.target);
    });
    var today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
    t.tasksTotal = 0; t.tasksDone = 0; t.tasksOverdue = 0;
    Object.keys(tasks).forEach(function(k) {
        var x = tasks[k];
        if (x.s === STORE_CLOSE_STATUS[3]) return;   // not applicable
        t.tasksTotal++;
        if (x.s === STORE_CLOSE_STATUS[2]) t.tasksDone++;
        else if (x.due && x.due < today) t.tasksOverdue++;
    });
    t.progress = t.tasksTotal ? Math.round(t.tasksDone / t.tasksTotal * 100) : 0;
    t.costOut = t.move + cost.demolish + cost.solar + cost.ev + cost.other;
    t.net = t.costOut - t.scrap;
    return t;
}

function _sclExtraColumns_(form) {
    if (form.closeJson === undefined) return {};   // comment-only edits never wipe the checklist
    var d = _sclParse_(form.closeJson);
    var json = JSON.stringify(d);
    if (json.length > 48000) throw new Error('ข้อมูลมากเกินไปสำหรับ 1 รายการ กรุณาลดจำนวนการ์ดทรัพย์สิน');
    var t = d.totals, p = storeClosePlan_(form.branchCode) || [];
    var out = {
        'In Closure Plan': p.length ? 'Yes' : '',
        'Close Date': d.plan.closeDate,
        'Handover Condition': d.plan.handover,
        'After-Close Plan': d.plan.after,
        'VP OPT': d.plan.vpOpt,
        'Asset Groups': t.groups,
        'Asset Qty': t.qty
    };
    STORE_CLOSE_DISPO.forEach(function(x) { out['Qty ' + x.en] = t.byDispo[x.k]; });
    out['Pending Decisions'] = t.pending;
    out['Transfer / FWH Targets'] = t.targets.join(', ');
    out['Moving Cost (THB)'] = t.move;
    out['Demolition Cost (THB)'] = d.cost.demolish;
    out['Solar Cost (THB)'] = d.cost.solar;
    out['EV Cost (THB)'] = d.cost.ev;
    out['Other Cost (THB)'] = d.cost.other;
    out['Scrap Value (THB)'] = t.scrap;
    out['Net Cost (THB)'] = t.net;
    out['Tasks Done'] = t.tasksDone;
    out['Tasks Total'] = t.tasksTotal;
    out['Progress %'] = t.progress;
    out['Overdue Tasks'] = t.tasksOverdue;
    out['Close_JSON'] = json;
    return out;
}

function _sclEmailExtra_(counts, esc) {
    var f = function(n) { return Number(n || 0).toLocaleString(); };
    return '<p style="margin:12px 0 4px;"><b>ปิดสาขา</b> ' + esc(counts['Close Date'] || 'ยังไม่กำหนดวัน') + ' · ' + esc(counts['Handover Condition'] || '-') + ' · ' + esc(counts['After-Close Plan'] || '') + '</p>' +
        '<p style="margin:4px 0;">ทรัพย์สิน ' + f(counts['Asset Groups']) + ' กลุ่ม / ' + f(counts['Asset Qty']) + ' ชิ้น · รอตัดสินใจ ' + f(counts['Pending Decisions']) + ' รายการ · ปลายทาง: ' + esc(counts['Transfer / FWH Targets'] || '-') + '</p>' +
        '<p style="margin:4px 0;">ค่าขนย้าย ' + f(counts['Moving Cost (THB)']) + ' · รื้อถอน ' + f(counts['Demolition Cost (THB)']) + ' · Solar ' + f(counts['Solar Cost (THB)']) + ' · EV ' + f(counts['EV Cost (THB)']) +
        ' · มูลค่าซาก −' + f(counts['Scrap Value (THB)']) + ' → <b>สุทธิ ' + f(counts['Net Cost (THB)']) + ' ฿</b></p>' +
        '<p style="margin:4px 0;">งานปิดสาขา เสร็จ ' + counts['Tasks Done'] + '/' + counts['Tasks Total'] + ' (' + counts['Progress %'] + '%)' + (counts['Overdue Tasks'] ? ' · <b style="color:#b91c1c;">เลยกำหนด ' + counts['Overdue Tasks'] + ' งาน</b>' : '') + '</p>';
}

var STORE_CLOSE_DEF = {
    name: 'Store Closing Checklist', emoji: '🏁',
    sheet: STORE_CLOSE_SHEET, folder: STORE_CLOSE_FOLDER,
    idPrefix: 'HSC', keyPrefix: 'hsc_', photoFilePrefix: 'storeclose', headerColor: '#be123c',
    brokenLabel: 'ประเด็นเร่งด่วน / ความเสี่ยง',
    histType: 'Sc',
    categories: [], system: [], groups: [],
    grandTotal: { label: '', header: '' },
    catTemp: { a: { suffix: 'a', headerSuffix: ' a', label: '-' }, b: { suffix: 'b', headerSuffix: ' b', label: '-' }, rule: 'gap', threshold: 999 },
    extraColumns: _sclExtraColumns_,
    emailExtra: _sclEmailExtra_,
    listSkip: ['Close_JSON']
};

function getStoreCloseConfig_() {
    return { plan: STORE_CLOSE_PLAN, handover: STORE_CLOSE_HANDOVER, groups: STORE_CLOSE_GROUPS, cond: STORE_CLOSE_COND, dispo: STORE_CLOSE_DISPO,
             owner: STORE_CLOSE_OWNER, status: STORE_CLOSE_STATUS, tasks: STORE_CLOSE_TASKS, approval: STORE_CLOSE_APPROVAL, clearDays: STORE_CLOSE_CLEAR_DAYS };
}
function processStoreCloseForm(form) { return hyperSurveySubmit_(STORE_CLOSE_DEF, form); }
function getStoreCloseList(includeArchive) { var r = hyperSurveyList_(STORE_CLOSE_DEF, includeArchive); r.scConfig = getStoreCloseConfig_(); return r; }
function getStoreCloseRecordById(id) {
    var r = hyperSurveyRecordById_(STORE_CLOSE_DEF, id);
    if (r.success) { try { r.data.Close_JSON = JSON.parse(r.data.Close_JSON || '{}'); } catch (e) { r.data.Close_JSON = {}; } r.scConfig = getStoreCloseConfig_(); }
    return r;
}
function updateStoreCloseRecord(form) { return hyperSurveyUpdate_(STORE_CLOSE_DEF, form); }
function deleteStoreCloseRecord(id, clientEmail) { return hyperSurveyDelete_(STORE_CLOSE_DEF, id, clientEmail); }
function addStoreClosePhotos(id, unitKey, files, clientEmail) { return hyperSurveyAddPhotos_(STORE_CLOSE_DEF, id, unitKey, files, clientEmail); }
function deleteStoreClosePhoto(id, unitKey, url, clientEmail) { return hyperSurveyDeletePhoto_(STORE_CLOSE_DEF, id, unitKey, url, clientEmail); }
