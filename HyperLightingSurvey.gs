// --- Hyper Lighting Survey ---
// Big-format lighting check for the SALES FLOOR and the TOWN CENTER (mall area): per zone the
// surveyor records the installed lighting (fixture type × W × count, broken count), lux readings
// pinned on the store layout, and a proposal of lights to add. The server computes installed / working
// kW, average / minimum lux vs the zone's target, and the extra monthly energy cost (OPEX) of the
// proposal from the store's tariff and each zone's lighting hours.
// Runs on HyperSurveyEngine.gs (CRUD, photos, list, delete) with the zone data in one Zones_JSON cell.

var HYPER_LI_SHEET = "Hyper_Lighting_Survey_Database";
var HYPER_LI_FOLDER = "Hyper_Lighting_Survey_Attachments";

// Defaults the form starts with (surveyor can change them per store / per zone)
var HYPER_LI_DEFAULT_TARIFF = 4.5;   // THB per kWh, incl. demand / Ft average
var HYPER_LI_DEFAULT_HOURS = 18;     // lights-on hours per day (~06:00–24:00)
var HYPER_LI_DAYS_PER_MONTH = 30;

// Zone types with their target average lux (retail practice, editable per zone on the form)
var HYPER_LI_ZONE_TYPES = [
    { id: 'entrance', area: 'sales', label: 'ทางเข้า / Entrance', lux: 500 },
    { id: 'checkout', area: 'sales', label: 'แคชเชียร์ / Checkout', lux: 500 },
    { id: 'fresh', area: 'sales', label: 'อาหารสด (Fresh / Butchery / Seafood / Bakery)', lux: 750 },
    { id: 'grocery', area: 'sales', label: 'ของแห้ง / ชั้นวาง (Grocery)', lux: 500 },
    { id: 'nonfood', area: 'sales', label: 'Non-food / เครื่องใช้ไฟฟ้า', lux: 500 },
    { id: 'fashion', area: 'sales', label: 'เสื้อผ้า / Fashion', lux: 750 },
    { id: 'aisle', area: 'sales', label: 'ทางเดินหลัก (Main aisle)', lux: 300 },
    { id: 'boh', area: 'sales', label: 'หลังร้าน / สต๊อก / ห้องเตรียม', lux: 200 },
    { id: 'mall', area: 'town', label: 'ทางเดิน Town Center / Mall', lux: 300 },
    { id: 'foodcourt', area: 'town', label: 'Food Court', lux: 300 },
    { id: 'tenant', area: 'town', label: 'หน้าร้านเช่า / Kiosk', lux: 300 },
    { id: 'toilet', area: 'town', label: 'ห้องน้ำ', lux: 200 },
    { id: 'stair', area: 'town', label: 'บันได / ทางขึ้นลง / Lift lobby', lux: 150 },
    { id: 'parking', area: 'town', label: 'ลานจอดรถ (Parking)', lux: 75 },
    { id: 'other', area: 'sales', label: 'อื่นๆ', lux: 300 }
];

// Fixture types with a typical W per fixture (incl. ballast where relevant — editable per row) and a typical
// efficacy lm/W used to size proposals (LED gives ~1.5–2× the light of fluorescent / HID per watt)
var HYPER_LI_FIXTURES = [
    { id: 'ledPanel', label: 'LED Panel 60×60', w: 40, lm: 100 },
    { id: 'ledHighBay', label: 'LED High Bay', w: 150, lm: 130 },
    { id: 'ledTube', label: 'LED Tube T8 (ต่อโคม 2 หลอด)', w: 36, lm: 110 },
    { id: 'ledLinear', label: 'LED Linear / Batten / Strip', w: 40, lm: 110 },
    { id: 'ledDownlight', label: 'LED Downlight', w: 15, lm: 90 },
    { id: 'ledSpot', label: 'LED Spot / Track', w: 20, lm: 80 },
    { id: 'ledFlood', label: 'LED Flood (ลานจอด / ภายนอก)', w: 100, lm: 110 },
    { id: 'flT8', label: 'Fluorescent T8 2×36W', w: 80, lm: 70 },
    { id: 'flT5', label: 'Fluorescent T5 2×28W', w: 62, lm: 85 },
    { id: 'cflDown', label: 'CFL Downlight 2×18W', w: 40, lm: 55 },
    { id: 'metalHalide', label: 'Metal Halide (HID)', w: 440, lm: 75 },
    { id: 'halogen', label: 'Halogen Spot', w: 50, lm: 15 },
    { id: 'other', label: 'อื่นๆ', w: 0, lm: 80 }
];

var HYPER_LI_ZONES_HEADER = 'Zones_JSON';

function _hliNum_(v) { var n = parseFloat(v); return isNaN(n) || n < 0 ? 0 : n; }
function _hliInt_(v) { var n = parseInt(v, 10); return isNaN(n) || n < 0 ? 0 : n; }
function _hliTxt_(v, max) { return String(v == null ? '' : v).trim().substring(0, max || 120); }
function _hliRound_(v, d) { var m = Math.pow(10, d || 0); return Math.round(v * m) / m; }

// Validated zones + per-zone computed figures. Accepts the form's zonesJson string.
function _hliParseZones_(raw) {
    var arr = raw;
    if (typeof raw === 'string') { try { arr = JSON.parse(raw); } catch (e) { arr = []; } }
    if (!Array.isArray(arr)) arr = [];
    var zt = {}, fx = {};
    HYPER_LI_ZONE_TYPES.forEach(function(z) { zt[z.id] = z; });
    HYPER_LI_FIXTURES.forEach(function(f) { fx[f.id] = f; });
    var rows = function(list) {
        return (Array.isArray(list) ? list : []).map(function(r) {
            var f = fx[r.ft] ? r.ft : 'other';
            return { ft: f, fo: _hliTxt_(r.fo, 60), w: _hliNum_(r.w), qty: _hliInt_(r.qty), broken: Math.min(_hliInt_(r.broken), _hliInt_(r.qty)) };
        }).filter(function(r) { return r.qty > 0; }).slice(0, 40);
    };
    return arr.slice(0, 60).map(function(z, i) {
        var type = zt[z.zt] ? z.zt : 'other';
        var lux = (Array.isArray(z.lux) ? z.lux : []).map(function(p) {
            var v = _hliNum_(p.v), x = parseFloat(p.x), y = parseFloat(p.y);
            var o = { v: _hliRound_(v, 0) };
            if (!isNaN(x) && !isNaN(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1) { o.x = _hliRound_(x, 4); o.y = _hliRound_(y, 4); }
            return o;
        }).filter(function(p) { return p.v > 0; }).slice(0, 60);
        var zone = {
            zid: _hliTxt_(z.zid, 10) || ('Z' + (i + 1)), name: _hliTxt_(z.name, 80), zt: type, area: (z.area === 'sales' || z.area === 'town') ? z.area : zt[type].area,
            m2: _hliNum_(z.m2), hours: _hliNum_(z.hours) || HYPER_LI_DEFAULT_HOURS, target: _hliNum_(z.target) || zt[type].lux,
            ctrl: _hliTxt_(z.ctrl, 40), nt: _hliTxt_(z.nt, 300), lux: lux, fixtures: rows(z.fixtures), prop: rows(z.prop), pk: _hliTxt_(z.pk, 60)
        };
        return _hliZoneCalc_(zone);
    });
}

// Installed / working W, lux stats, the rough "W needed to reach target" and the proposal's W
function _hliZoneCalc_(z) {
    var inst = 0, work = 0, propW = 0, brokenN = 0, workLm = 0;
    var eff = {};
    HYPER_LI_FIXTURES.forEach(function(f) { eff[f.id] = f.lm; });
    z.fixtures.forEach(function(r) { inst += r.w * r.qty; work += r.w * (r.qty - r.broken); workLm += r.w * (r.qty - r.broken) * (eff[r.ft] || 80); brokenN += r.broken; });
    z.prop.forEach(function(r) { propW += r.w * r.qty; });
    var vals = z.lux.map(function(p) { return p.v; });
    var avg = vals.length ? vals.reduce(function(a, b) { return a + b; }, 0) / vals.length : 0;
    z.calc = {
        instW: _hliRound_(inst, 0), workW: _hliRound_(work, 0), brokenN: brokenN, propW: _hliRound_(propW, 0),
        luxAvg: vals.length ? _hliRound_(avg, 0) : '', luxMin: vals.length ? Math.min.apply(null, vals) : '',
        uniform: vals.length && avg ? _hliRound_(Math.min.apply(null, vals) / avg, 2) : '',
        below: vals.length ? avg < z.target : false,
        // lux scales roughly with the working lumens (W × lm/W of each fixture type) — first-cut sizing only
        needLm: vals.length && avg > 0 && avg < z.target ? _hliRound_(workLm * (z.target / avg - 1), -2) : 0,
        lpd: z.m2 ? _hliRound_(inst / z.m2, 1) : ''
    };
    return z;
}

function _hliMonthCost_(watts, hours, tariff) {
    var kwh = watts / 1000 * hours * HYPER_LI_DAYS_PER_MONTH;
    return { kwh: _hliRound_(kwh, 0), thb: _hliRound_(kwh * tariff, 0) };
}

// Columns written for each submission / edit (via def.extraColumns)
function _hliExtraColumns_(form) {
    // An edit that doesn't carry the zones (e.g. only comments changed) must not wipe them
    if (form.zonesJson === undefined) return {};
    var tariff = _hliNum_(form.tariff) || HYPER_LI_DEFAULT_TARIFF;
    var zones = _hliParseZones_(form.zonesJson);
    var t = { sales: { inst: 0, work: 0, prop: 0 }, town: { inst: 0, work: 0, prop: 0 } };
    var curCost = 0, propCost = 0, propKwh = 0, below = 0, broken = 0, fixtures = 0;
    zones.forEach(function(z) {
        var g = t[z.area] || t.sales;
        g.inst += z.calc.instW; g.work += z.calc.workW; g.prop += z.calc.propW;
        curCost += _hliMonthCost_(z.calc.workW, z.hours, tariff).thb;
        var pc = _hliMonthCost_(z.calc.propW, z.hours, tariff);
        propCost += pc.thb; propKwh += pc.kwh;
        if (z.calc.below) below++;
        broken += z.calc.brokenN;
        z.fixtures.forEach(function(r) { fixtures += r.qty; });
    });
    var json = JSON.stringify(zones);
    if (json.length > 48000) throw new Error('ข้อมูลโซนมากเกินไปสำหรับ 1 รายการ กรุณาแบ่งส่งเป็น 2 รายการ (Sales Floor / Town Center)');
    return {
        'Tariff (THB/kWh)': tariff,
        'Lux Meter': _hliTxt_(form.luxMeter, 40),
        'Zones': zones.length,
        'Zones Below Target': below,
        'Fixtures Total': fixtures,
        'Fixtures Broken': broken,
        'Sales Floor Installed kW': _hliRound_(t.sales.inst / 1000, 2),
        'Town Center Installed kW': _hliRound_(t.town.inst / 1000, 2),
        'Working kW': _hliRound_((t.sales.work + t.town.work) / 1000, 2),
        'Lighting OPEX Now (THB/month)': _hliRound_(curCost, 0),
        'Proposed Added kW': _hliRound_((t.sales.prop + t.town.prop) / 1000, 2),
        'Proposed Added kWh/month': _hliRound_(propKwh, 0),
        'Proposed Added OPEX (THB/month)': _hliRound_(propCost, 0),
        'Zones_JSON': json
    };
}

function _hliEmailExtra_(counts, esc) {
    var zones = [];
    try { zones = JSON.parse(counts['Zones_JSON'] || '[]'); } catch (e) {}
    var zl = {};
    HYPER_LI_ZONE_TYPES.forEach(function(z) { zl[z.id] = z.label; });
    var h = '<p style="margin:12px 0 4px;"><b>สรุปแสงสว่าง</b> — ติดตั้ง ' + (counts['Sales Floor Installed kW'] + counts['Town Center Installed kW']) + ' kW · ค่าไฟแสงสว่างปัจจุบัน ~' +
        Number(counts['Lighting OPEX Now (THB/month)']).toLocaleString() + ' ฿/เดือน · <b>ข้อเสนอเพิ่ม ' + counts['Proposed Added kW'] + ' kW = +' +
        Number(counts['Proposed Added OPEX (THB/month)']).toLocaleString() + ' ฿/เดือน</b></p>';
    h += '<table style="width:100%;border-collapse:collapse;font-size:11px;"><tr style="background:#f1f5f9;text-align:left;"><th style="padding:4px;">โซน</th><th style="padding:4px;">Lux เฉลี่ย / เป้า</th><th style="padding:4px;">ติดตั้ง (W)</th><th style="padding:4px;">เสนอเพิ่ม (W)</th></tr>';
    zones.forEach(function(z) {
        h += '<tr><td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + esc(z.zid + ' ' + (z.name || zl[z.zt] || '')) + '</td>' +
            '<td style="padding:4px;border-bottom:1px solid #f1f5f9;' + (z.calc.below ? 'color:#b91c1c;font-weight:bold;' : '') + '">' + (z.calc.luxAvg === '' ? '-' : z.calc.luxAvg) + ' / ' + z.target + '</td>' +
            '<td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + z.calc.instW + '</td><td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + z.calc.propW + '</td></tr>';
    });
    return h + '</table>';
}

var HYPER_LI_DEF = {
    name: 'Hyper Lighting Survey', emoji: '💡',
    sheet: HYPER_LI_SHEET, folder: HYPER_LI_FOLDER,
    idPrefix: 'HLI', keyPrefix: 'hli_', photoFilePrefix: 'hyperlight', headerColor: '#ca8a04',
    brokenLabel: 'โคมไฟเสีย / ต้องซ่อม',
    histType: 'Li',
    categories: [], system: [], groups: [],
    grandTotal: { label: '', header: '' },   // no category totals — the zone figures are extra columns
    catTemp: { a: { suffix: 'a', headerSuffix: ' a', label: '-' }, b: { suffix: 'b', headerSuffix: ' b', label: '-' }, rule: 'gap', threshold: 999 },
    extraColumns: _hliExtraColumns_,
    emailExtra: _hliEmailExtra_,
    listSkip: ['Zones_JSON']
};

function getHyperLiConfig_() {
    return { zoneTypes: HYPER_LI_ZONE_TYPES, fixtures: HYPER_LI_FIXTURES, tariff: HYPER_LI_DEFAULT_TARIFF, hours: HYPER_LI_DEFAULT_HOURS, days: HYPER_LI_DAYS_PER_MONTH };
}
function processHyperLiSurveyForm(form) { return hyperSurveySubmit_(HYPER_LI_DEF, form); }
function getHyperLiSurveyList(includeArchive) { var r = hyperSurveyList_(HYPER_LI_DEF, includeArchive); r.liConfig = getHyperLiConfig_(); return r; }
function getHyperLiSurveyRecordById(id) {
    var r = hyperSurveyRecordById_(HYPER_LI_DEF, id);
    if (r.success) { try { r.data.Zones_JSON = JSON.parse(r.data.Zones_JSON || '[]'); } catch (e) { r.data.Zones_JSON = []; } r.liConfig = getHyperLiConfig_(); }
    return r;
}
function updateHyperLiSurveyRecord(form) { return hyperSurveyUpdate_(HYPER_LI_DEF, form); }
function deleteHyperLiSurveyRecord(id, clientEmail) { return hyperSurveyDelete_(HYPER_LI_DEF, id, clientEmail); }
function addHyperLiSurveyPhotos(id, unitKey, files, clientEmail) { return hyperSurveyAddPhotos_(HYPER_LI_DEF, id, unitKey, files, clientEmail); }
function deleteHyperLiSurveyPhoto(id, unitKey, url, clientEmail) { return hyperSurveyDeletePhoto_(HYPER_LI_DEF, id, unitKey, url, clientEmail); }
