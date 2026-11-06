// --- Hyper Fresh Food Equipment Survey ---
// Sixth big-format survey on HyperSurveyEngine.gs: bakery / hot-food (Delica) / meat & seafood
// equipment of the Fresh Food departments — one card per machine with Equipment ID + QR, brand,
// installation year, condition, maintenance contractor and the register attributes C7 fills from the
// FF inspection list (FF Inspection_R3.xlsx, "FF Attribute" folder): serial no., capacity, new price,
// 5-year repair cost, branch-impact and spare-part-risk scores → replacement score with the list's
// weights (repair ratio 40% · age 25% · branch impact 20% · spare-part risk 15%; scheme 'food' in
// HS_FF_SCHEMES). History, PM/CM log, QR labels and the equipment page work like the other surveys.
// Store list is shared (HYPER_REF_STORES).
//
// Edit the categories here — form, sheet headers, report, email and Excel all follow. Header strings
// become live sheet columns: renaming one orphans its data.

var HYPER_FO_SHEET = "Hyper_FreshFood_Survey_Database";
var HYPER_FO_FOLDER = "Hyper_FreshFood_Survey_Attachments";

var HYPER_FO_CATEGORIES = [
    // ── Bakery ──
    { id: 'rackOven', eqPrefix: 'RV', group: 'bake', color: 'orange', noTemp: true, header: '[เบเกอรี่] เตาอบหมุน (Rack Oven)',
      title: 'เตาอบหมุน (Rack Oven)', hint: 'ดูยี่ห้อ / รุ่น / Serial / ปีที่ผลิต ที่ป้าย Nameplate ด้านข้างหรือด้านหลังเตา', sizes: [['U', 'เครื่อง']] },
    { id: 'deckOven', eqPrefix: 'DO', group: 'bake', color: 'amber', noTemp: true, header: '[เบเกอรี่] เตาอบชั้น (Deck Oven)',
      title: 'เตาอบชั้น (Deck Oven)', hint: '', sizes: [['U', 'เครื่อง']] },
    { id: 'convOven', eqPrefix: 'CO', group: 'bake', color: 'pink', noTemp: true, header: '[เบเกอรี่] เตาอบพัดลม (Convection Oven)',
      title: 'เตาอบพัดลม (Convection Oven)', hint: '', sizes: [['U', 'เครื่อง']] },
    { id: 'proofer', eqPrefix: 'PR', group: 'bake', color: 'sky', noTemp: true, header: '[เบเกอรี่] ตู้หมัก / เตาอบไอน้ำ (Proofer)',
      title: 'ตู้หมักแป้ง / เตาอบไอน้ำ (Proofer Machine)', hint: '', sizes: [['U', 'เครื่อง']] },
    { id: 'donutFryer', eqPrefix: 'DF', group: 'bake', color: 'lime', noTemp: true, header: '[เบเกอรี่] เตาทอดโดนัท (Donut Fryer)',
      title: 'เตาทอดโดนัท (Donut Fryer)', hint: '', sizes: [['U', 'เครื่อง']] },
    { id: 'cakeWarmer', eqPrefix: 'HW', group: 'bake', color: 'stone', noTemp: true, header: '[เบเกอรี่] เตาอุ่นเค้ก (Hot Two Plate)',
      title: 'เตาอุ่นเค้ก (Hot Two Plate)', hint: '', sizes: [['U', 'เครื่อง']] },
    { id: 'doughSheeter', eqPrefix: 'SH', group: 'bake', color: 'teal', noTemp: true, header: '[เบเกอรี่] เครื่องรีดแป้ง (Dough Sheeter)',
      title: 'เครื่องรีดแป้ง (Dough Sheeter)', hint: '', sizes: [['U', 'เครื่อง']] },
    { id: 'breadMoulder', eqPrefix: 'BM', group: 'bake', color: 'cyan', noTemp: true, header: '[เบเกอรี่] เครื่องม้วนแป้ง (Bread Moulder)',
      title: 'เครื่องม้วนแป้ง (Bread Moulder)', hint: '', sizes: [['U', 'เครื่อง']] },
    { id: 'hydDivider', eqPrefix: 'HD', group: 'bake', color: 'indigo', noTemp: true, header: '[เบเกอรี่] เครื่องแบ่งแป้ง (Hydraulic Divider)',
      title: 'เครื่องแบ่งแป้ง (Hydraulic Divider)', hint: '', sizes: [['U', 'เครื่อง']] },
    { id: 'bunDivider', eqPrefix: 'BD', group: 'bake', color: 'violet', noTemp: true, header: '[เบเกอรี่] เครื่องปั้นแป้ง (Bun Divider)',
      title: 'เครื่องปั้นแป้ง (Bun Divider / Rounder)', hint: '', sizes: [['U', 'เครื่อง']] },
    { id: 'breadSlicer', eqPrefix: 'BS', group: 'bake', color: 'blue', noTemp: true, header: '[เบเกอรี่] เครื่องสไลด์ขนมปัง (Bread Slicer)',
      title: 'เครื่องสไลด์ขนมปัง (Bread Slicer)', hint: '', sizes: [['U', 'เครื่อง']] },
    { id: 'planetaryMixer', eqPrefix: 'PM', group: 'bake', color: 'emerald', noTemp: true, header: '[เบเกอรี่] เครื่องตีแป้ง 5LT (Planetary Mixer)',
      title: 'เครื่องตีแป้ง 5 ลิตร (Planetary Mixer)', hint: '', sizes: [['5L', '5 ลิตร']] },
    { id: 'spiralMixer', eqPrefix: 'SM', group: 'bake', color: 'slate', noTemp: true, header: '[เบเกอรี่] เครื่องตีแป้ง (Spiral Mixer)',
      title: 'เครื่องตีแป้ง (Spiral Mixer)', hint: 'เลือกขนาดตามความจุโถ (ดูที่ป้าย / ข้างโถ)',
      sizes: [['20L', '20 ลิตร'], ['60L', '60 ลิตร'], ['80L', '80 ลิตร'], ['120L', '120 ลิตร']] },
    // ── Hot food / Delica ──
    { id: 'combiOven', eqPrefix: 'CM', group: 'hot', color: 'orange', noTemp: true, header: '[อาหารร้อน] เตาย่างปลา (Combi Oven)',
      title: 'เตาย่างปลา / Combi Oven', hint: '', sizes: [['U', 'เครื่อง']] },
    { id: 'fryer', eqPrefix: 'FY', group: 'hot', color: 'amber', noTemp: true, header: '[อาหารร้อน] เตาทอด (Fryer)',
      title: 'เตาทอด (Fryer)', hint: 'แยกตามแผนกที่ใช้งาน — Delica / อาหารทะเล',
      sizes: [['DEL', 'Delica'], ['SEA', 'อาหารทะเล (Seafood)']] },
    { id: 'roaster', eqPrefix: 'RT', group: 'hot', color: 'pink', noTemp: true, header: '[อาหารร้อน] เตาย่างไก่ (Roaster Oven)',
      title: 'เตาย่างไก่ (Roaster Oven)', hint: '', sizes: [['U', 'เครื่อง']] },
    { id: 'curryWarmer', eqPrefix: 'WM', group: 'hot', color: 'stone', noTemp: true, header: '[อาหารร้อน] เตาอุ่นแกง (Warmer Machine)',
      title: 'เตาอุ่นแกง / อุ่นอาหาร (Warmer Machine)', hint: '', sizes: [['U', 'เครื่อง']] },
    // ── Meat & seafood ──
    { id: 'boneSaw', eqPrefix: 'BW', group: 'meat', color: 'indigo', noTemp: true, header: '[เนื้อสัตว์] เครื่องเลื่อยกระดูก (Bone Saw)',
      title: 'เครื่องเลื่อยกระดูก (Bone Saw)', hint: '', sizes: [['U', 'เครื่อง']] },
    { id: 'meatChopper', eqPrefix: 'MC', group: 'meat', color: 'violet', noTemp: true, header: '[เนื้อสัตว์] เครื่องบดหมู (Meat Chopper / Mincer)',
      title: 'เครื่องบดเนื้อ / บดหมู (Meat Chopper / Mincer)', hint: '', sizes: [['U', 'เครื่อง']] },
    { id: 'vacuumPacker', eqPrefix: 'VP', group: 'meat', color: 'cyan', noTemp: true, header: '[เนื้อสัตว์] เครื่องแพ็คสูญญากาศ (Vacuum Packer)',
      title: 'เครื่องแพ็คสูญญากาศ (Vacuum Packer)', hint: '', sizes: [['U', 'เครื่อง']] },
    // ── Other ──
    { id: 'waterCooler', eqPrefix: 'WC', group: 'other', color: 'sky', noTemp: true, header: '[อื่นๆ] เครื่องทำน้ำเย็น (Water Cooler)',
      title: 'เครื่องทำน้ำเย็น (Water Cooler)', hint: '', sizes: [['U', 'เครื่อง']] }
];

var HYPER_FO_SYSTEM_FIELDS = [
    { key: 'otherFood', header: 'อุปกรณ์ Fresh Food อื่นๆ (รูปแบบ/จำนวน)', type: 'text', section: 'other' }
];

// Brands common for fresh-food equipment (the brand list also grows from what surveyors type)
var HYPER_FO_EXTRA_BRANDS = ['Rational', 'Unox', 'Sinmag', 'Salva', 'Bongard', 'Mono', 'Winkler', 'Kolb', 'Revent', 'Electrolux', 'Frymaster',
    'Henny Penny', 'Pitco', 'Hobart', 'Berkel', 'Bizerba', 'Rondo', 'Rheon', 'Esmach', 'IGF', 'Daub', 'Sammic', 'Henkelman', 'Turbofan',
    'Anvil', 'Fimar', 'Kenwood', 'KitchenAid', 'Hoshizaki', 'Thermo King'];

var HYPER_FO_DEF = {
    name: 'Hyper Fresh Food Equipment Survey', emoji: '🍞',
    sheet: HYPER_FO_SHEET, folder: HYPER_FO_FOLDER,
    idPrefix: 'HFO', keyPrefix: 'hfo_', photoFilePrefix: 'hyperfreshfood', headerColor: '#b45309',
    brokenLabel: 'อุปกรณ์ชำรุด',
    perUnit: true,
    ff: 'food',
    histType: 'Fo',
    unitTemp: { aHeader: '-', bHeader: '-', cHeader: '', flagHeader: '-', emailHeader: 'ใบตรวจหมดอายุ', noTemp: true },
    categories: HYPER_FO_CATEGORIES,
    system: HYPER_FO_SYSTEM_FIELDS,
    groups: [
        { id: 'bake', label: 'เบเกอรี่', totalHeader: 'Total เบเกอรี่' },
        { id: 'hot', label: 'อาหารร้อน / Delica', totalHeader: 'Total อาหารร้อน' },
        { id: 'meat', label: 'เนื้อสัตว์ / อาหารทะเล', totalHeader: 'Total เนื้อสัตว์' },
        { id: 'other', label: 'อื่นๆ', totalHeader: 'Total อื่นๆ' }
    ],
    grandTotal: { label: 'ทั้งหมด', header: 'Total อุปกรณ์ Fresh Food ทั้งหมด' },
    // no temperature pair on these cards (every category is noTemp); kept for the engine
    catTemp: { a: { suffix: 'a', headerSuffix: ' a', label: '-' }, b: { suffix: 'b', headerSuffix: ' b', label: '-' }, rule: 'gap', threshold: 999 }
};

function getHyperFoConfig_() { return hyperSurveyConfig_(HYPER_FO_DEF); }
function processHyperFoSurveyForm(form) { return hyperSurveySubmit_(HYPER_FO_DEF, form); }
function getHyperFoSurveyList(includeArchive) { return hyperSurveyList_(HYPER_FO_DEF, includeArchive); }
function getHyperFoSurveyRecordById(id) { return hyperSurveyRecordById_(HYPER_FO_DEF, id); }
function updateHyperFoSurveyRecord(form) { return hyperSurveyUpdate_(HYPER_FO_DEF, form); }
function deleteHyperFoSurveyRecord(id, clientEmail) { return hyperSurveyDelete_(HYPER_FO_DEF, id, clientEmail); }
function addHyperFoSurveyPhotos(id, unitKey, files, clientEmail) { return hyperSurveyAddPhotos_(HYPER_FO_DEF, id, unitKey, files, clientEmail); }
function deleteHyperFoSurveyPhoto(id, unitKey, url, clientEmail) { return hyperSurveyDeletePhoto_(HYPER_FO_DEF, id, unitKey, url, clientEmail); }
function getHyperFoUnitRows() { return hyperSurveyUnitRows_(HYPER_FO_DEF); }
function getHyperFoBrandOptions() { return hyperBrandOptions_(HYPER_FO_DEF, '', HYPER_FO_EXTRA_BRANDS); }
function getHyperFoUnitHistory(branchCode, equipId, assetNo) { return hyperUnitHistory_(HYPER_FO_DEF, branchCode, equipId, assetNo); }
function addHyperFoMaintenance(rec, clientEmail) { return hyperMaintAdd_(HYPER_FO_DEF, rec, clientEmail); }
function deleteHyperFoMaintenance(recordId, clientEmail) { return hyperMaintDelete_(HYPER_FO_DEF, recordId, clientEmail); }

// Register rows for one store — the tab offers to pre-fill cards from them ("📥 จากทะเบียน") and the report
// shows them next to what C7 entered. Source: the register an admin uploaded on ?page=fo-register
// (HyperFoRegisterAdmin.gs) when active, else the built-in HyperFreshFoodRegister.gs (build_fo_register.py).
// rows: [[catId, sizeKey, qty, installYear, newPriceTHB, repair5yTHB, remark], ...] (qty 0 = register says none)
function getHyperFoRegister(branchCode) {
    var code = String(branchCode || '').trim();
    var act = _hfoRegActive_();
    return { success: true, code: code, source: act.source || '', rows: act.reg[code] || [] };
}
