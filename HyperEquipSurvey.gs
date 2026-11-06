// --- Hyper Building-Equipment Survey ---
// Third big-format survey on HyperSurveyEngine.gs (after Hyper Ref / Hyper Aircon): lifts,
// escalators, travelators, power, fire & water systems and other plant — one card per unit with
// Equipment ID + QR, brand, year/age, condition, maintenance contractor, inspection-certificate
// expiry and a few type-specific spec fields. History, PM/CM log, QR labels and the MNC link work
// the same way as the other two surveys. Store list is shared (HYPER_REF_STORES).
//
// Edit the categories here — form, sheet headers, report, email and Excel all follow.
//   specs: type-specific fields [{ k, l, t }] stored per unit in `sx` (t 'n' number / 'x' text)
//   cert:  'req' = inspection-certificate expiry required (lifts / escalators / travelators),
//          true = optional, absent = no certificate field

var HYPER_EQ_SHEET = "Hyper_Equipment_Survey_Database";
var HYPER_EQ_FOLDER = "Hyper_Equipment_Survey_Attachments";

var HYPER_EQ_CATEGORIES = [
    // ── Vertical transport ──
    { id: 'passLift', eqPrefix: 'LP', group: 'vt', color: 'blue', noTemp: true, cert: 'req', header: '[ขนส่งแนวดิ่ง] ลิฟต์โดยสาร',
      title: 'ลิฟต์โดยสาร (Passenger Lift)', hint: 'ดูข้อมูลที่ป้ายในตัวลิฟต์ / ห้องเครื่อง — ใบตรวจสอบประจำปีมักติดในตัวลิฟต์',
      sizes: [['T', 'Traction (ใช้สลิง)'], ['H', 'Hydraulic'], ['MRL', 'MRL (ไม่มีห้องเครื่อง)']],
      specs: [{ k: 'kg', l: 'น้ำหนักบรรทุก (kg)', t: 'n' }, { k: 'pax', l: 'จำนวนคน', t: 'n' }, { k: 'stops', l: 'จำนวนชั้นที่จอด', t: 'n' }, { k: 'spd', l: 'ความเร็ว (m/s)', t: 'n' }] },
    { id: 'freightLift', eqPrefix: 'LF', group: 'vt', color: 'indigo', noTemp: true, cert: 'req', header: '[ขนส่งแนวดิ่ง] ลิฟต์ขนของ',
      title: 'ลิฟต์ขนของ (Freight / Goods Lift)', hint: 'ลิฟต์ขนสินค้า / รถเข็น หลังร้าน',
      sizes: [['T', 'Traction (ใช้สลิง)'], ['H', 'Hydraulic']],
      specs: [{ k: 'kg', l: 'น้ำหนักบรรทุก (kg)', t: 'n' }, { k: 'stops', l: 'จำนวนชั้นที่จอด', t: 'n' }] },
    { id: 'escalator', eqPrefix: 'ES', group: 'vt', color: 'violet', noTemp: true, cert: 'req', header: '[ขนส่งแนวดิ่ง] บันไดเลื่อน',
      title: 'บันไดเลื่อน (Escalator)', hint: '1 การ์ดต่อ 1 ตัว (ขาขึ้น / ขาลง นับแยก) — ความกว้างวัดที่ขั้นบันได',
      sizes: [['600', 'กว้าง 600 mm'], ['800', 'กว้าง 800 mm'], ['1000', 'กว้าง 1000 mm']],
      specs: [{ k: 'dir', l: 'ทิศทาง (ขึ้น / ลง)', t: 'x' }, { k: 'rise', l: 'ความสูงที่ยก (m)', t: 'n' }] },
    { id: 'travelator', eqPrefix: 'TV', group: 'vt', color: 'sky', noTemp: true, cert: 'req', header: '[ขนส่งแนวดิ่ง] ทางเลื่อน',
      title: 'ทางเลื่อน / Ramp (Travelator)', hint: 'ทางเลื่อนลาดเอียงสำหรับรถเข็น — นับแยกขาขึ้น / ขาลง',
      sizes: [['800', 'กว้าง 800 mm'], ['1000', 'กว้าง 1000 mm'], ['1200', 'กว้าง 1200 mm']],
      specs: [{ k: 'dir', l: 'ทิศทาง (ขึ้น / ลง)', t: 'x' }, { k: 'len', l: 'ความยาว (m)', t: 'n' }, { k: 'deg', l: 'ความชัน (องศา)', t: 'n' }] },
    { id: 'dumbwaiter', eqPrefix: 'DW', group: 'vt', color: 'teal', noTemp: true, cert: true, header: '[ขนส่งแนวดิ่ง] ลิฟต์ส่งของเล็ก',
      title: 'ลิฟต์ส่งของเล็ก (Dumbwaiter)', hint: 'เช่น ลิฟต์ส่งอาหารครัว / Food Court',
      sizes: [['U', 'ตัว']], specs: [{ k: 'kg', l: 'น้ำหนักบรรทุก (kg)', t: 'n' }] },
    // ── Power ──
    { id: 'transformer', eqPrefix: 'TF', group: 'power', color: 'amber', noTemp: true, cert: true, header: '[ไฟฟ้า] หม้อแปลง',
      title: 'หม้อแปลงไฟฟ้า (Transformer)', hint: 'ดูขนาด kVA ที่ป้าย Nameplate',
      sizes: [['Oil', 'Oil type'], ['Dry', 'Dry type']], specs: [{ k: 'kva', l: 'ขนาด (kVA)', t: 'n' }] },
    { id: 'generator', eqPrefix: 'GN', group: 'power', color: 'orange', noTemp: true, cert: true, header: '[ไฟฟ้า] เครื่องกำเนิดไฟฟ้า',
      title: 'เครื่องกำเนิดไฟฟ้า (Generator)', hint: 'ดูขนาด kVA และชั่วโมงทำงานที่หน้าจอควบคุม',
      sizes: [['D', 'Diesel']], specs: [{ k: 'kva', l: 'ขนาด (kVA)', t: 'n' }, { k: 'tank', l: 'ถังน้ำมัน (ลิตร)', t: 'n' }, { k: 'hrs', l: 'ชั่วโมงทำงาน', t: 'n' }] },
    { id: 'mdb', eqPrefix: 'MD', group: 'power', color: 'stone', noTemp: true, header: '[ไฟฟ้า] ตู้ MDB / ตู้เมน',
      title: 'ตู้ MDB / ตู้ไฟฟ้าหลัก', hint: 'ตู้เมนจ่ายไฟหลัก และตู้ย่อยหลัก (SDB)',
      sizes: [['MDB', 'MDB'], ['SDB', 'SDB / DB หลัก']], specs: [{ k: 'amp', l: 'เมนเบรกเกอร์ (A)', t: 'n' }] },
    { id: 'ups', eqPrefix: 'UP', group: 'power', color: 'lime', noTemp: true, header: '[ไฟฟ้า] UPS',
      title: 'UPS', hint: '', sizes: [['U', 'เครื่อง']], specs: [{ k: 'kva', l: 'ขนาด (kVA)', t: 'n' }] },
    { id: 'capBank', eqPrefix: 'CB', group: 'power', color: 'cyan', noTemp: true, header: '[ไฟฟ้า] Capacitor Bank',
      title: 'Capacitor Bank', hint: 'ตู้ปรับปรุงค่า Power Factor', sizes: [['U', 'ชุด']], specs: [{ k: 'kvar', l: 'ขนาด (kVAR)', t: 'n' }] },
    { id: 'solarInv', eqPrefix: 'SI', group: 'power', color: 'pink', noTemp: true, header: '[ไฟฟ้า] Solar Inverter',
      title: 'Solar Inverter', hint: 'อินเวอร์เตอร์ระบบโซลาร์รูฟท็อป', sizes: [['U', 'เครื่อง']], specs: [{ k: 'kw', l: 'ขนาด (kW)', t: 'n' }] },
    // ── Fire & life safety ──
    { id: 'firePump', eqPrefix: 'FI', group: 'fire', color: 'stone', noTemp: true, cert: true, header: '[ดับเพลิง] Fire Pump',
      title: 'เครื่องสูบน้ำดับเพลิง (Fire Pump)', hint: 'ดูขนาด GPM / HP ที่ป้าย — ทดสอบเดินเครื่องตามรอบ',
      sizes: [['E', 'Electric'], ['D', 'Diesel']], specs: [{ k: 'gpm', l: 'อัตราสูบ (GPM)', t: 'n' }, { k: 'hp', l: 'กำลัง (HP)', t: 'n' }] },
    { id: 'jockeyPump', eqPrefix: 'JK', group: 'fire', color: 'amber', noTemp: true, header: '[ดับเพลิง] Jockey Pump',
      title: 'Jockey Pump', hint: 'ปั๊มรักษาแรงดันระบบดับเพลิง', sizes: [['U', 'ตัว']], specs: [{ k: 'hp', l: 'กำลัง (HP)', t: 'n' }] },
    { id: 'fireAlarm', eqPrefix: 'FA', group: 'fire', color: 'pink', noTemp: true, cert: true, header: '[ดับเพลิง] ตู้แจ้งเหตุเพลิงไหม้',
      title: 'ตู้ควบคุมระบบแจ้งเหตุเพลิงไหม้ (Fire Alarm Panel)', hint: '', sizes: [['U', 'ตู้']], specs: [{ k: 'zone', l: 'จำนวน Zone / Loop', t: 'n' }] },
    // ── Water ──
    { id: 'waterPump', eqPrefix: 'WP', group: 'water', color: 'blue', noTemp: true, header: '[น้ำ] ปั๊มน้ำประปา',
      title: 'ปั๊มน้ำประปา / Booster Pump', hint: '', sizes: [['B', 'Booster set'], ['S', 'ปั๊มเดี่ยว']], specs: [{ k: 'hp', l: 'กำลัง (HP)', t: 'n' }] },
    { id: 'waterTank', eqPrefix: 'WT', group: 'water', color: 'sky', noTemp: true, header: '[น้ำ] ถังเก็บน้ำ',
      title: 'ถังเก็บน้ำ (Water Tank)', hint: '', sizes: [['G', 'บนดิน / บนหลังคา'], ['U', 'ใต้ดิน']], specs: [{ k: 'm3', l: 'ความจุ (ลบ.ม.)', t: 'n' }] },
    { id: 'wwtp', eqPrefix: 'WW', group: 'water', color: 'teal', noTemp: true, header: '[น้ำ] ระบบบำบัดน้ำเสีย',
      title: 'ระบบบำบัดน้ำเสีย / ปั๊มน้ำเสีย', hint: '', sizes: [['S', 'ระบบบำบัด'], ['P', 'ปั๊มน้ำเสีย / Sump pump']], specs: [{ k: 'cap', l: 'ขนาด (ลบ.ม./วัน หรือ HP)', t: 'x' }] },
    // ── Others ──
    { id: 'airCompressor', eqPrefix: 'AQ', group: 'other', color: 'violet', noTemp: true, cert: true, header: '[อื่นๆ] เครื่องอัดอากาศ',
      title: 'เครื่องอัดอากาศ (Air Compressor)', hint: 'ถังลมแรงดันต้องมีใบตรวจ', sizes: [['U', 'เครื่อง']], specs: [{ k: 'hp', l: 'กำลัง (HP)', t: 'n' }] },
    { id: 'autoDoor', eqPrefix: 'AD', group: 'other', color: 'lime', noTemp: true, header: '[อื่นๆ] ประตูอัตโนมัติ',
      title: 'ประตูอัตโนมัติ (Automatic Door)', hint: '', sizes: [['SL', 'บานเลื่อน'], ['SW', 'บานสวิง / หมุน']], specs: [] },
    { id: 'dockLeveller', eqPrefix: 'DL', group: 'other', color: 'orange', noTemp: true, header: '[อื่นๆ] Dock Leveller',
      title: 'Dock Leveller / ลานรับสินค้า', hint: '', sizes: [['U', 'ชุด']], specs: [{ k: 'ton', l: 'รับน้ำหนัก (ตัน)', t: 'n' }] },
    { id: 'compactor', eqPrefix: 'CC', group: 'other', color: 'stone', noTemp: true, header: '[อื่นๆ] เครื่องอัดขยะ',
      title: 'เครื่องอัดขยะ / กล่องกระดาษ (Compactor / Baler)', hint: '', sizes: [['U', 'เครื่อง']], specs: [] },
    { id: 'cctv', eqPrefix: 'CV', group: 'other', color: 'cyan', noTemp: true, header: '[อื่นๆ] CCTV NVR',
      title: 'เครื่องบันทึกกล้องวงจรปิด (NVR / DVR)', hint: '', sizes: [['U', 'เครื่อง']], specs: [{ k: 'ch', l: 'จำนวนช่องกล้อง', t: 'n' }] }
];

var HYPER_EQ_SYSTEM_FIELDS = [
    { key: 'otherEquip', header: 'อุปกรณ์อื่นๆ (รูปแบบ/จำนวน)', type: 'text', section: 'other' }
];

// Brands common for these systems (the brand list also grows from what surveyors type)
var HYPER_EQ_EXTRA_BRANDS = ['Mitsubishi Electric', 'Schindler', 'KONE', 'Otis', 'Hitachi', 'TK Elevator (Thyssenkrupp)', 'Fujitec', 'Toshiba', 'Hyundai Elevator',
    'Cummins', 'Caterpillar', 'Perkins', 'Mitsubishi Heavy', 'ABB', 'Schneider Electric', 'Siemens', 'Tirathai', 'Grundfos', 'Ebara', 'Wilo', 'Patterson', 'Kirloskar',
    'Edwards', 'Notifier', 'Simplex', 'Atlas Copco', 'Hitachi Air Compressor', 'Dorma', 'Geze', 'Huawei', 'SMA', 'Hikvision', 'Dahua'];

var HYPER_EQ_DEF = {
    name: 'Hyper Equipment Survey', emoji: '🛗',
    sheet: HYPER_EQ_SHEET, folder: HYPER_EQ_FOLDER,
    idPrefix: 'HEQ', keyPrefix: 'heq_', photoFilePrefix: 'hyperequip', headerColor: '#4338ca',
    brokenLabel: 'อุปกรณ์ชำรุด',
    perUnit: true,
    histType: 'Eq',
    unitTemp: { aHeader: '-', bHeader: '-', cHeader: '', flagHeader: '-', emailHeader: 'ใบตรวจหมดอายุ', noTemp: true },
    categories: HYPER_EQ_CATEGORIES,
    system: HYPER_EQ_SYSTEM_FIELDS,
    groups: [
        { id: 'vt', label: 'ลิฟต์ / บันไดเลื่อน', totalHeader: 'Total ขนส่งแนวดิ่ง' },
        { id: 'power', label: 'ระบบไฟฟ้า', totalHeader: 'Total ระบบไฟฟ้า' },
        { id: 'fire', label: 'ระบบดับเพลิง', totalHeader: 'Total ระบบดับเพลิง' },
        { id: 'water', label: 'ระบบน้ำ', totalHeader: 'Total ระบบน้ำ' },
        { id: 'other', label: 'อื่นๆ', totalHeader: 'Total อื่นๆ' }
    ],
    grandTotal: { label: 'ทั้งหมด', header: 'Total อุปกรณ์ทั้งหมด' },
    // no temperature pair on these cards (every category is noTemp); kept for the engine
    catTemp: { a: { suffix: 'a', headerSuffix: ' a', label: '-' }, b: { suffix: 'b', headerSuffix: ' b', label: '-' }, rule: 'gap', threshold: 999 }
};

function getHyperEqConfig_() { return hyperSurveyConfig_(HYPER_EQ_DEF); }
function processHyperEqSurveyForm(form) { return hyperSurveySubmit_(HYPER_EQ_DEF, form); }
function getHyperEqSurveyList(includeArchive) { return hyperSurveyList_(HYPER_EQ_DEF, includeArchive); }
function getHyperEqSurveyRecordById(id) { return hyperSurveyRecordById_(HYPER_EQ_DEF, id); }
function updateHyperEqSurveyRecord(form) { return hyperSurveyUpdate_(HYPER_EQ_DEF, form); }
function deleteHyperEqSurveyRecord(id, clientEmail) { return hyperSurveyDelete_(HYPER_EQ_DEF, id, clientEmail); }
function addHyperEqSurveyPhotos(id, unitKey, files, clientEmail) { return hyperSurveyAddPhotos_(HYPER_EQ_DEF, id, unitKey, files, clientEmail); }
function deleteHyperEqSurveyPhoto(id, unitKey, url, clientEmail) { return hyperSurveyDeletePhoto_(HYPER_EQ_DEF, id, unitKey, url, clientEmail); }
function getHyperEqUnitRows() { return hyperSurveyUnitRows_(HYPER_EQ_DEF); }
function getHyperEqBrandOptions() { return hyperBrandOptions_(HYPER_EQ_DEF, '', HYPER_EQ_EXTRA_BRANDS); }
function getHyperEqUnitHistory(branchCode, equipId, assetNo) { return hyperUnitHistory_(HYPER_EQ_DEF, branchCode, equipId, assetNo); }
function addHyperEqMaintenance(rec, clientEmail) { return hyperMaintAdd_(HYPER_EQ_DEF, rec, clientEmail); }
function deleteHyperEqMaintenance(recordId, clientEmail) { return hyperMaintDelete_(HYPER_EQ_DEF, recordId, clientEmail); }
