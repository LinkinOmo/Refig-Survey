// --- Hyper Aircon Survey ---
// Big-format (Hyper / Market / Foodplace) counterpart of the Aircon Survey tab. Same
// approach as the Hyper Ref Survey: equipment is counted per type + size (a Hyper
// store's HVAC is a Chiller plant + AHUs plus many DX units, far too many for the
// one-card-per-unit Aircon form). Runs on HyperSurveyEngine.gs; the store list is
// shared with the Hyper Ref Survey (HYPER_REF_STORES in HyperRefSurvey.gs).
//
// No Hyper aircon inventory sheet exists yet (unlike the fridge price Excel), so the
// type/size breakdown below is the standard Big Format HVAC split — edit it here and
// the form, sheet headers, email and report all follow.

var HYPER_AC_SHEET = "Hyper_Aircon_Survey_Database";
var HYPER_AC_FOLDER = "Hyper_Aircon_Survey_Attachments";

// group: 'chw' = chilled-water units (fed by the Chiller), 'dx' = self-contained DX
// units, 'vent' = ventilation (no supply/return temperature pair).
var HYPER_AC_CATEGORIES = [
    // Chiller plant equipment: one card per machine (ID, age, history) like every other unit. noTotal keeps
    // them out of the AHU/FCU / DX totals; the plant count columns (chillerQty, coolingTowerQty, chwPumpQty,
    // cdwPumpQty) are derived from these (def.derived). No supply/return pair (noTemp).
    { id: 'chiller', ff: true, eqPrefix: 'CH', group: 'plant', noTotal: true, noTemp: true, color: 'blue', header: '[Plant] Chiller',
      title: 'Chiller — 1 การ์ดต่อ 1 เครื่อง',
      hint: 'ดูขนาด TR / ยี่ห้อ / รุ่น / ปีที่ผลิต / สารทำความเย็น จาก Nameplate แล้วใส่ในช่อง รุ่น / ขนาดจริง',
      sizes: [['WC', 'Water-cooled'], ['AC', 'Air-cooled']] },
    { id: 'coolingTower', eqPrefix: 'CT', group: 'plant', noTotal: true, noTemp: true, color: 'cyan', header: '[Plant] Cooling Tower',
      title: 'Cooling Tower', hint: '1 การ์ดต่อ 1 ตัว', sizes: [['T', 'ตัว']] },
    { id: 'chwPump', eqPrefix: 'CP', group: 'plant', noTotal: true, noTemp: true, color: 'sky', header: '[Plant] ปั๊มน้ำเย็น CHWP',
      title: 'ปั๊มน้ำเย็น (CHWP)', hint: '1 การ์ดต่อ 1 ตัว', sizes: [['P', 'ตัว']] },
    { id: 'cdwPump', eqPrefix: 'DP', group: 'plant', noTotal: true, noTemp: true, color: 'teal', header: '[Plant] ปั๊มน้ำระบายความร้อน CDWP',
      title: 'ปั๊มน้ำระบายความร้อน (CDWP)', hint: '1 การ์ดต่อ 1 ตัว', sizes: [['P', 'ตัว']] },
    { id: 'ahu', eqPrefix: 'AH', group: 'chw', color: 'blue', header: '[น้ำเย็น] AHU',
      title: 'AHU (Air Handling Unit) — พื้นที่ขาย',
      hint: 'ตู้ส่งลมเย็นขนาดใหญ่ ต่อท่อน้ำเย็นจาก Chiller จ่ายลมผ่าน Duct — ดูขนาดที่ Nameplate (TR หรือ CFM: 400 CFM ≈ 1 TR)',
      sizes: [['S', '≤ 20 TR'], ['M', '21–40 TR'], ['L', '41–60 TR'], ['XL', '> 60 TR'], ['NA', 'ไม่ทราบขนาด']] },
    { id: 'fcu', eqPrefix: 'FC', group: 'chw', color: 'sky', header: '[น้ำเย็น] FCU',
      title: 'FCU (Fan Coil Unit) — คอยล์น้ำเย็น',
      hint: 'เครื่องเป่าลมเย็นขนาดเล็ก ต่อท่อน้ำเย็นจาก Chiller (<u>ไม่มีคอยล์ร้อน</u>ข้างนอก) — มักอยู่ในสำนักงาน / ห้องประชุม / Food Court',
      sizes: [['Hang', 'แขวน / ตั้งพื้น'], ['Concealed', 'ซ่อนในฝ้า (Concealed)'], ['Cassette', 'Cassette']] },
    { id: 'wall', eqPrefix: 'WA', group: 'dx', color: 'teal', header: '[DX] แอร์ติดผนัง',
      title: 'แอร์ติดผนัง (Wall Type)',
      hint: 'แอร์แยกส่วน มีคอยล์ร้อน (Condensing Unit) ติดตั้งภายนอก — ดู BTU ที่ป้ายข้างเครื่อง',
      sizes: [['9_13K', '9,000–13,000 BTU'], ['18_25K', '18,000–25,000 BTU'], ['30K', '≥ 30,000 BTU']] },
    { id: 'ceiling', eqPrefix: 'CE', group: 'dx', color: 'cyan', header: '[DX] แอร์แขวนใต้ฝ้า',
      title: 'แอร์แขวนใต้ฝ้า (Ceiling Suspended)',
      hint: '',
      sizes: [['24K', '≤ 25,000 BTU'], ['36K', '30,000–40,000 BTU'], ['48K', '≥ 48,000 BTU']] },
    { id: 'cassette', eqPrefix: 'CA', group: 'dx', color: 'indigo', header: '[DX] แอร์ Cassette',
      title: 'แอร์ Cassette (ฝังฝ้า 4 ทิศทาง)',
      hint: '',
      sizes: [['24K', '≤ 25,000 BTU'], ['36K', '30,000–40,000 BTU'], ['48K', '≥ 48,000 BTU']] },
    { id: 'floor', eqPrefix: 'FT', group: 'dx', color: 'violet', header: '[DX] แอร์ตู้ตั้งพื้น',
      title: 'แอร์ตู้ตั้งพื้น (Floor Standing)',
      hint: '',
      sizes: [['36_48K', '36,000–48,000 BTU'], ['60K', '60,000 BTU'], ['60Kplus', '> 60,000 BTU']] },
    { id: 'package', eqPrefix: 'PK', group: 'dx', color: 'orange', header: '[DX] Package / Rooftop',
      title: 'Package Unit / Rooftop',
      hint: 'เครื่องปรับอากาศแบบรวมชุด (คอมเพรสเซอร์ + คอยล์เย็นในตู้เดียว) ส่วนใหญ่ตั้งบนหลังคา จ่ายลมผ่าน Duct',
      sizes: [['5_10TR', '5–10 TR'], ['11_20TR', '11–20 TR'], ['20TRplus', '> 20 TR']] },
    { id: 'vrf', eqPrefix: 'VR', group: 'dx', color: 'lime', header: '[DX] VRF/VRV Indoor',
      title: 'VRF / VRV — คอยล์เย็น (Indoor)',
      hint: 'นับเฉพาะคอยล์เย็นภายใน — จำนวนคอยล์ร้อน (Outdoor) กรอกด้านล่างของข้อนี้',
      sizes: [['Wall', 'ติดผนัง'], ['Cassette', 'Cassette'], ['Duct', 'ซ่อนในฝ้า (Duct)']] },
    { id: 'exhaust', eqPrefix: 'EX', group: 'vent', color: 'amber', header: '[ระบายอากาศ] พัดลม', noTemp: true,
      title: 'พัดลมระบายอากาศ (Exhaust / Fresh Air Fan)',
      hint: '',
      sizes: [['Wall', 'ติดผนัง'], ['Roof', 'หลังคา (Roof Fan)'], ['Duct', 'ใน Duct (Inline)']] },
    { id: 'airCurtain', eqPrefix: 'AK', group: 'vent', color: 'pink', header: '[ระบายอากาศ] ม่านอากาศ', noTemp: true,
      title: 'ม่านอากาศ (Air Curtain)',
      hint: 'ติดเหนือประตูทางเข้า-ออก / ประตูห้องเย็น',
      sizes: [['0_9M', '≤ 0.9 m'], ['1_2M', '1.2 m'], ['1_5M', '1.5 m'], ['1_8M', '≥ 1.8 m']] }
];

// type: 'number' | 'text' | 'select' | 'temp' (°C, blank = not measured)
var HYPER_AC_SYSTEM_FIELDS = [
    { key: 'tempInstrument', header: 'เครื่องมือวัดอุณหภูมิ', type: 'select', section: 'temp',
      options: ['Temp Gun (Infrared)', 'Probe Thermometer (เสียบวัด)', 'Data Logger', 'อื่นๆ', 'ไม่มีเครื่องมือวัด'] },
    // Chiller plant
    { key: 'chillerType', header: 'Chiller — ประเภท', type: 'select', section: 'plant',
      options: ['Water-cooled Chiller', 'Air-cooled Chiller', 'ไม่มี Chiller (ใช้แอร์ DX ทั้งหมด)'] },
    { key: 'chillerQty', header: 'Chiller — จำนวน (เครื่อง)', type: 'number', section: 'plant' },
    { key: 'chillerTon', header: 'Chiller — ขนาดแต่ละเครื่อง (TR)', type: 'text', section: 'plant' },
    { key: 'chillerBrand', header: 'Chiller — ยี่ห้อ / รุ่น', type: 'text', section: 'plant' },
    { key: 'chillerYear', header: 'Chiller — ปีที่ติดตั้ง', type: 'text', section: 'plant' },
    { key: 'chillerRefrigerant', header: 'Chiller — สารทำความเย็น', type: 'select', section: 'plant',
      options: ['R22', 'R134a', 'R123', 'R410A', 'R513A', 'R1234ze', 'อื่นๆ / ไม่ทราบ'] },
    { key: 'coolingTowerQty', header: 'Cooling Tower — จำนวน', type: 'number', section: 'plant' },
    { key: 'chwPumpQty', header: 'ปั๊มน้ำเย็น (CHWP) — จำนวน', type: 'number', section: 'plant' },
    { key: 'cdwPumpQty', header: 'ปั๊มน้ำระบายความร้อน (CDWP) — จำนวน', type: 'number', section: 'plant' },
    { key: 'bms', header: 'ระบบ BMS', type: 'select', section: 'plant',
      options: ['มี BMS ใช้งานได้', 'มี BMS แต่ใช้งานไม่ได้', 'ไม่มี BMS'] },
    // Chilled water temps — Chiller/BMS display vs instrument (same "display can be off" check as Hyper Ref)
    { key: 'chwsCtrlTemp', header: 'น้ำเย็นจ่าย CHWS — ค่าที่ Chiller/BMS แสดง (°C)', type: 'temp', section: 'plantTemp' },
    { key: 'chwsMeasTemp', header: 'น้ำเย็นจ่าย CHWS — วัดจริง (°C)', type: 'temp', section: 'plantTemp' },
    { key: 'chwrCtrlTemp', header: 'น้ำเย็นกลับ CHWR — ค่าที่ Chiller/BMS แสดง (°C)', type: 'temp', section: 'plantTemp' },
    { key: 'chwrMeasTemp', header: 'น้ำเย็นกลับ CHWR — วัดจริง (°C)', type: 'temp', section: 'plantTemp' },
    // DX extras
    { key: 'vrfOutdoorQty', header: 'VRF/VRV — จำนวนคอยล์ร้อน (Outdoor)', type: 'number', section: 'dx' },
    { key: 'dxRefrigerant', header: 'แอร์ DX — สารทำความเย็นหลัก', type: 'select', section: 'dx',
      options: ['R22', 'R32', 'R410A', 'ผสมหลายชนิด', 'อื่นๆ / ไม่ทราบ'] },
    { key: 'dxOther', header: 'แอร์อื่นๆ (รูปแบบ/จำนวน)', type: 'text', section: 'dx' },
    // Sales-floor comfort — measured by instrument at ~1.5 m height
    { key: 'thermostatSet', header: 'พื้นที่ขาย — ค่าที่ตั้ง Thermostat/BMS (°C)', type: 'temp', section: 'area' },
    { key: 'salesFrontTemp', header: 'พื้นที่ขาย ด้านหน้า/ทางเข้า — วัดจริง (°C)', type: 'temp', section: 'area' },
    { key: 'salesMidTemp', header: 'พื้นที่ขาย กลางร้าน — วัดจริง (°C)', type: 'temp', section: 'area' },
    { key: 'salesBackTemp', header: 'พื้นที่ขาย ด้านใน/โซนสด — วัดจริง (°C)', type: 'temp', section: 'area' },
    { key: 'foodCourtTemp', header: 'Food Court — วัดจริง (°C)', type: 'temp', section: 'area' },
    { key: 'hotSpot', header: 'จุดที่ร้อน / ลูกค้าร้องเรียน', type: 'text', section: 'area' }
];

// Sales-floor reading above this is flagged as a hot zone (form + report).
var HYPER_AC_HOT_AREA_C = 27;

var HYPER_AC_DEF = {
    name: 'Hyper Aircon Survey', emoji: '❄️',
    sheet: HYPER_AC_SHEET, folder: HYPER_AC_FOLDER,
    idPrefix: 'HAC', keyPrefix: 'hac_', photoFilePrefix: 'hyperac', headerColor: '#0e7490',
    brokenLabel: 'แอร์ชำรุด / ไม่เย็น',
    // One card per unit (Equipment ID, Asset No., brand/spec, status, condition, controller +
    // supply/return air, photo) — same per-unit capture as the Aircon Survey. Stored like the
    // Hyper Ref Survey: counts derived from the units, units in one Units_JSON cell.
    perUnit: true,
    histType: 'Ac',
    derived: [{ key: 'chillerQty', cat: 'chiller' }, { key: 'coolingTowerQty', cat: 'coolingTower' },
              { key: 'chwPumpQty', cat: 'chwPump' }, { key: 'cdwPumpQty', cat: 'cdwPump' }],
    unitTemp: { aHeader: 'Supply ลมจ่าย °C', bHeader: 'Return ลมกลับ °C', cHeader: 'Controller/Setpoint °C',
                flagHeader: 'ΔT ต่ำ (<6°C)', emailHeader: 'Supply / Return °C' },
    categories: HYPER_AC_CATEGORIES,
    system: HYPER_AC_SYSTEM_FIELDS,
    groups: [
        { id: 'chw', label: 'AHU/FCU (น้ำเย็น)', totalHeader: 'Total AHU/FCU' },
        { id: 'dx', label: 'แอร์ DX', totalHeader: 'Total แอร์ DX' },
        { id: 'vent', label: 'พัดลม/ม่านอากาศ', totalHeader: 'Total ระบายอากาศ' }
    ],
    grandTotal: { label: 'ทั้งหมด', header: 'Total เครื่องทั้งหมด' },
    // Supply vs return air at the grilles — a small ΔT means the unit isn't cooling
    // (low refrigerant, dirty coil, not enough chilled water...).
    catTemp: {
        a: { suffix: 'supplyTemp', headerSuffix: ' — Temp ลมจ่าย Supply (°C)', label: 'ลมจ่าย' },
        b: { suffix: 'returnTemp', headerSuffix: ' — Temp ลมกลับ Return (°C)', label: 'ลมกลับ' },
        rule: 'deltaT', threshold: 6
    }
};

function getHyperAcConfig_() {
    var cfg = hyperSurveyConfig_(HYPER_AC_DEF);
    cfg.hotAreaC = HYPER_AC_HOT_AREA_C;
    return cfg;
}
function processHyperAcSurveyForm(form) { return hyperSurveySubmit_(HYPER_AC_DEF, form); }
function getHyperAcSurveyList(includeArchive) {
    var res = hyperSurveyList_(HYPER_AC_DEF, includeArchive);
    if (res.config) res.config.hotAreaC = HYPER_AC_HOT_AREA_C;
    return res;
}
function getHyperAcSurveyRecordById(id) {
    var res = hyperSurveyRecordById_(HYPER_AC_DEF, id);
    if (res.config) res.config.hotAreaC = HYPER_AC_HOT_AREA_C;
    return res;
}
function updateHyperAcSurveyRecord(form) { return hyperSurveyUpdate_(HYPER_AC_DEF, form); }
function deleteHyperAcSurveyRecord(id, clientEmail) { return hyperSurveyDelete_(HYPER_AC_DEF, id, clientEmail); }
function addHyperAcSurveyPhotos(id, unitKey, files, clientEmail) { return hyperSurveyAddPhotos_(HYPER_AC_DEF, id, unitKey, files, clientEmail); }
function deleteHyperAcSurveyPhoto(id, unitKey, url, clientEmail) { return hyperSurveyDeletePhoto_(HYPER_AC_DEF, id, unitKey, url, clientEmail); }
function getHyperAcUnitRows() { return hyperSurveyUnitRows_(HYPER_AC_DEF); }
// Chiller/AHU/VRF makers common in big-format plant, on top of the Mini Big C aircon brand list
var HYPER_AC_EXTRA_BRANDS = ['Trane', 'McQuay', 'Mitsubishi Electric', 'Mitsubishi Heavy', 'Hitachi', 'LG', 'Samsung', 'Midea', 'Gree'];
function getHyperAcBrandOptions() { return hyperBrandOptions_(HYPER_AC_DEF, 'aircon_brand', HYPER_AC_EXTRA_BRANDS); }
function getHyperAcUnitHistory(branchCode, equipId, assetNo) { return hyperUnitHistory_(HYPER_AC_DEF, branchCode, equipId, assetNo); }
function addHyperAcMaintenance(rec, clientEmail) { return hyperMaintAdd_(HYPER_AC_DEF, rec, clientEmail); }
function deleteHyperAcMaintenance(recordId, clientEmail) { return hyperMaintDelete_(HYPER_AC_DEF, recordId, clientEmail); }
