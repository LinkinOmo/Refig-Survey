// --- Hyper Refrigerator Survey ---
// Big-format (Hyper / Market / Foodplace) counterpart of the Ref Survey tab. Hyper
// stores have far too many cabinets for the Ref Survey's one-card-per-unit form, so
// this survey counts cabinets per type + size instead — the same breakdown as the
// "HYP_New" sheet of Store Refrigerator Estimate Price.xlsx (Hyper Survey/Refridge Dat),
// which is what the PM price estimate is built from.
//
// HYPER_REF_CATEGORIES / HYPER_REF_SYSTEM_FIELDS (wrapped in HYPER_REF_DEF, run by
// HyperSurveyEngine.gs) are the single source of truth for
// the form (HyperRefSurveyTab.html renders from them via include()), the sheet
// headers, and the report page (HyperRefSurveyReport.html gets them from the server).

var HYPER_REF_SHEET = "Hyper_Ref_Survey_Database";
var HYPER_REF_FOLDER = "Hyper_Ref_Survey_Attachments";

// group: 'pos' = ชุดบวก (chill), 'neg' = ชุดลบ (frozen). Each size becomes one sheet
// column "<header> [<size label>]" plus an auto "<header> [รวม]" total column.
var HYPER_REF_CATEGORIES = [
    { id: 'posRemoteGD', tempRange: { min: 0, max: 4 }, tp: 'glass', products: ["เครื่องดื่ม", "นม/โยเกิร์ต", "น้ำผลไม้", "เบียร์/ไวน์", "อาหารพร้อมทาน", "อาหารสด", "อื่นๆ"], eqPrefix: 'RG', group: 'pos', color: 'blue', header: '[ชุดบวก] Remote Glass Door Multideck',
      title: 'Remote แบบ Glass Door Multideck Showcase',
      hint: 'ตู้บานกระจก <u>ไม่มีปลั๊ก</u> ต่อท่อน้ำยาไปห้องเครื่อง (Rack) — นับตามจำนวนประตูต่อตู้',
      sizes: [['2D', '2 door'], ['3D', '3 door'], ['4D', '4 door'], ['6D', '6 door']] },
    { id: 'posPluginGD', tempRange: { min: 0, max: 4 }, tp: 'glass', products: ["เครื่องดื่ม", "นม/โยเกิร์ต", "น้ำผลไม้", "เบียร์/ไวน์", "อาหารพร้อมทาน", "อาหารสด", "อื่นๆ"], eqPrefix: 'PG', group: 'pos', color: 'sky', header: '[ชุดบวก] Plug-In Glass Door Multideck',
      title: 'Plug-In แบบ Glass Door Multideck Showcase',
      hint: 'ตู้บานกระจก <u>มีปลั๊กเสียบ</u> มีคอมเพรสเซอร์ในตัวตู้',
      sizes: [['2D', '2 door'], ['3D', '3 door'], ['4D', '4 door']] },
    { id: 'posRemoteOpen', tempRange: { min: 0, max: 4 }, tp: 'open', products: ["หมู/ไก่/เนื้อสัตว์", "อาหารทะเล", "ผัก/สลัด", "ผลไม้ตัดแต่ง", "นม/โยเกิร์ต/น้ำผลไม้", "ไส้กรอก/แฮม/ชีส", "อาหารพร้อมทาน", "แซนวิช/เบเกอรี่เย็น", "อื่นๆ"], eqPrefix: 'RO', group: 'pos', color: 'orange', header: '[ชุดบวก] Remote Open Multideck',
      title: 'Remote แบบ Open Multideck Showcase (ตู้เปิด)',
      hint: 'นับตามความยาวตู้ — 1 จอ Controller = 1 ตู้',
      sizes: [['1_8M', '1.8 m.'], ['2_5M', '2.5 m.'], ['3_75M', '3.75 m.']] },
    { id: 'posDrumChill', tempRange: { min: 0, max: 4 }, tp: 'chest', products: ["เครื่องดื่ม", "อาหารทะเล", "ผลไม้", "อาหารสด", "อื่นๆ"], eqPrefix: 'DC', group: 'pos', color: 'teal', header: '[ชุดบวก] Drum Chill',
      title: 'ตู้แช่ Drum Chill (เฉพาะที่มีคอมเพรสเซอร์)',
      hint: 'Old Model ขนาด 1x1 / 2x1 ม. และรุ่นใหม่ (New) 2x1 ม.',
      sizes: [['1x1', '1 x 1 m.'], ['2x1', '2 x 1 m.'], ['New2x1', 'New 2 x 1 m.']] },
    { id: 'posRemoteSemiOpen', tempRange: { min: 0, max: 4 }, tp: 'open', products: ["นม/โยเกิร์ต", "ไส้กรอก/แฮม/ชีส", "ผัก/สลัด", "น้ำผลไม้", "อาหารพร้อมทาน", "อื่นๆ"], eqPrefix: 'RS', group: 'pos', color: 'amber', header: '[ชุดบวก] Remote Semi Open Multideck',
      title: 'Remote แบบ Semi Open Multideck Showcase',
      hint: 'ตู้ครึ่งเปิด (ด้านบนมีหลังคา/ชั้นวาง ด้านหน้าเปิด) ไม่มีปลั๊ก',
      sizes: [['1_25M', '1.25 m.'], ['1_8M', '1.8 m.'], ['2_5M', '2.5 m.']] },
    { id: 'posPluginFruit', tempRange: { min: 6, max: 8 }, tp: 'open', products: ["ผลไม้นำเข้า", "ผลไม้ตัดแต่ง", "อื่นๆ"], eqPrefix: 'PF', group: 'pos', color: 'lime', header: '[ชุดบวก] Plug-In Import Fruit',
      title: 'Plug-In แบบ Import Fruit (ตู้ผลไม้นำเข้า)',
      hint: 'ตู้โชว์ผลไม้นำเข้า แบบมีปลั๊กในตัว',
      sizes: [['1_875M', '1.875 m.'], ['2_2M', '2.2 m.'], ['2_5M', '2.5 m.']] },
    { id: 'posCake', tempRange: { min: 2, max: 6 }, tp: 'glass', products: ["เค้ก", "เบเกอรี่", "ขนมหวาน", "อื่นๆ"], eqPrefix: 'CK', group: 'pos', color: 'pink', header: '[ชุดบวก] ตู้แช่เค้ก',
      title: 'ตู้แช่เค้ก (Cake Showcase)',
      hint: '',
      sizes: [['1M', '1 m'], ['2M', '2 m']] },
    { id: 'negRemoteGD', tempRange: { min: null, max: -18 }, tp: 'glass', products: ["อาหารแช่แข็ง", "ไอศกรีม", "เนื้อสัตว์แช่แข็ง", "อาหารทะเลแช่แข็ง", "ผัก/ผลไม้แช่แข็ง", "อื่นๆ"], eqPrefix: 'FR', group: 'neg', color: 'indigo', header: '[ชุดลบ] Remote Glass Door Multideck',
      title: 'ชุดลบ Remote แบบ Glass Door Multideck Showcase',
      hint: 'ตู้แช่แข็งบานกระจก <u>ไม่มีปลั๊ก</u> ต่อท่อไปห้องเครื่อง',
      sizes: [['2D', '2 door'], ['3D', '3 door'], ['4D', '4 door']] },
    { id: 'negPluginGD', tempRange: { min: null, max: -18 }, tp: 'glass', products: ["อาหารแช่แข็ง", "ไอศกรีม", "เนื้อสัตว์แช่แข็ง", "อาหารทะเลแช่แข็ง", "ผัก/ผลไม้แช่แข็ง", "อื่นๆ"], eqPrefix: 'FP', group: 'neg', color: 'violet', header: '[ชุดลบ] Plug-In Glass Door Multideck',
      title: 'ชุดลบ Plug-In แบบ Glass Door Multideck Showcase',
      hint: 'ตู้แช่แข็งบานกระจก <u>มีปลั๊กเสียบ</u> มีคอมเพรสเซอร์ในตัว',
      sizes: [['1D', '1 door'], ['2D', '2 door'], ['3D', '3 door'], ['4D', '4 door'], ['6D', '6 door']] },
    { id: 'negLowFrozen', tempRange: { min: null, max: -18 }, tp: 'chest', products: ["อาหารแช่แข็ง", "ไอศกรีม", "เนื้อสัตว์/อาหารทะเลแช่แข็ง", "อื่นๆ"], eqPrefix: 'FL', group: 'neg', color: 'cyan', header: '[ชุดลบ] Plug-In Low Frozen',
      title: 'Plug-In แบบ Low Frozen (ตู้นอนแช่แข็ง)',
      hint: 'ตู้แช่แข็งแบบนอน/เตี้ย นับตามความยาวตู้',
      sizes: [['1_47M', '1.47 m.'], ['1_8M', '1.8 m.'], ['2_1M', '2.1 m.'], ['2_5M', '2.5 m.']] },
    { id: 'negStainless', tempRange: { min: null, max: -18 }, tp: 'glass', products: ["วัตถุดิบครัว/เตรียมอาหาร", "เนื้อสัตว์/อาหารทะเลแช่แข็ง", "น้ำแข็ง", "อื่นๆ"], eqPrefix: 'FS', group: 'neg', color: 'stone', header: '[ชุดลบ] Plug-In Stainless Steel',
      title: 'Plug-In แบบ Stainless Steel',
      hint: '📦 ส่วนใหญ่อยู่ที่ห้องสต๊อก / ครัว ไม่ใช่หน้าร้าน — อย่าลืมเข้าไปตรวจสอบ',
      sizes: [['2D', '2 door'], ['4D', '4 door']] },
    // Cold rooms (back-stock chill / frozen rooms): one card per room like a cabinet. noTotal keeps
    // them out of the cabinet totals; the old coldRoomPos/coldRoomNeg count columns are derived
    // from these (def.derived) so reports and the MNC link keep working.
    { id: 'posColdRoom', tempRange: { min: 0, max: 4 }, tp: 'room', products: ["เนื้อสัตว์", "ผัก/ผลไม้", "นม/ไข่", "เครื่องดื่ม", "อาหารพร้อมทาน/Delica", "เบเกอรี่", "อื่นๆ"], eqPrefix: 'CR', group: 'room', noTotal: true, color: 'emerald', header: '[ห้องเย็น] ชุดบวก (Chill Room)',
      title: 'ห้องเย็น ชุดบวก (Chill Room)',
      hint: 'ห้องเย็นหลังร้าน / ห้องสต๊อกที่เย็น — 1 การ์ดต่อ 1 ห้อง',
      sizes: [['R', 'ห้อง']] },
    { id: 'negColdRoom', tempRange: { min: null, max: -18 }, tp: 'room', products: ["เนื้อสัตว์แช่แข็ง", "อาหารทะเลแช่แข็ง", "ไอศกรีม", "อาหารแช่แข็งอื่นๆ", "อื่นๆ"], eqPrefix: 'FZ', group: 'room', noTotal: true, color: 'slate', header: '[ห้องเย็น] ชุดลบ (Frozen Room)',
      title: 'ห้องเย็น ชุดลบ (Frozen Room)',
      hint: 'ห้องแช่แข็งหลังร้าน — 1 การ์ดต่อ 1 ห้อง',
      sizes: [['R', 'ห้อง']] },
    // Main machines from the asset register (Main machine RHVAC.xlsx: "Refrigeration Compressor No. N",
    // "Refrigeration Condenser No. N", "เครื่องผลิตน้ำแข็ง No. N") — one card per machine, no temperature
    // block, kept out of the cabinet totals. The plant-level Multiset / CDU count fields stay as they were.
    { id: 'rackComp', eqPrefix: 'RC', group: 'rack', noTotal: true, noTemp: true, color: 'slate', header: '[ห้องเครื่อง] ชุดคอมเพรสเซอร์ (Rack / CDU)',
      title: 'ชุดคอมเพรสเซอร์ (Refrigeration Compressor — Rack Multiset / CDU)',
      hint: '1 การ์ดต่อ 1 ชุด (Rack Multiset 1 ชุด หรือ CDU 1 เครื่อง) — ยี่ห้อ / รุ่น / Serial / Capacity ดูจากป้าย Nameplate',
      sizes: [['MSP', 'Multiset ชุดบวก'], ['MSN', 'Multiset ชุดลบ'], ['CDUP', 'CDU ชุดบวก'], ['CDUN', 'CDU ชุดลบ']] },
    { id: 'rackCond', eqPrefix: 'CD', group: 'rack', noTotal: true, noTemp: true, color: 'stone', header: '[ห้องเครื่อง] Condenser',
      title: 'ชุดระบายความร้อน (Refrigeration Condenser)',
      hint: '1 การ์ดต่อ 1 ชุด Condenser (ส่วนใหญ่อยู่บนหลังคา / ลานเครื่อง)',
      sizes: [['POS', 'ชุดบวก'], ['NEG', 'ชุดลบ']] },
    { id: 'iceMaker', eqPrefix: 'IM', group: 'ice', noTotal: true, noTemp: true, color: 'cyan', header: '[เครื่องทำน้ำแข็ง] Ice Maker',
      title: 'เครื่องผลิตน้ำแข็ง (Ice Maker)',
      hint: 'ส่วนใหญ่อยู่แผนกอาหารทะเล / Fresh / ครัว — 1 การ์ดต่อ 1 เครื่อง',
      sizes: [['CUBE', 'น้ำแข็งก้อน (Cube)'], ['FLAKE', 'น้ำแข็งเกล็ด (Flake)']] }
];

// tempRange: temperature guideline (°C) for each cabinet type — min null = "not warmer than max"
// (frozen: ≤ -18). Every IR point (except ones marked noRange, e.g. the cold-air discharge of open
// cabinets, which normally runs below product temp) and the controller reading are checked against it;
// out-of-range readings are flagged on the form, on the report card and on the layout pins.
// Edit the ranges here; form + report follow.

// products: dropdown (enum) of what is stored in each cabinet — multi-select per cabinet, one entry is
// always 'อื่นๆ' (free text). Edit the lists here; the form, report and Excel export follow.

// IR / Temp Gun measuring points per cabinet — 3 points per cabinet so the surveyor sees the
// temperature DISTRIBUTION, not one spot. The set depends on the cabinet shape (cat.tp):
//   open  — open / semi-open multideck + import-fruit: air discharge, centre, edge by the air curtain
//   glass — upright glass-door / stainless door cabinets: top / middle / bottom shelf
//   chest — chest freezers & drum chill: centre and both ends
// `cmp` is the point compared with the controller display (the >3°C gap check and the stored
// "IR / วัดจริง" value): the discharge point for open cabinets (the controller sensor sits in the
// air stream), the middle shelf for glass doors, the centre for chests.
var HYPER_REF_TEMP_SETS = {
    open: { name: 'ตู้เปิด (Open)', cmp: 0, points: [
        { key: 'discharge', noRange: true, label: 'ลมเย็นออก (Cold discharge)', hint: 'วัดที่ช่องลมเย็นออกของตู้ (ด้านบน/หลังตู้) — ไม่นำมาเทียบเกณฑ์ (ลมออกเย็นกว่าสินค้าเป็นปกติ)' },
        { key: 'center', label: 'กลางตู้ (Center)', hint: 'กลางตู้ ระดับสินค้าชั้นกลาง' },
        { key: 'edge', label: 'ขอบตู้ใกล้ม่านอากาศ (Edge)', hint: 'ปลายตู้ / ขอบที่ใกล้ม่านอากาศ — จุดที่ลมเย็นหลุดง่ายที่สุด' } ] },
    glass: { name: 'ตู้บานกระจก (Glass door)', cmp: 1, points: [
        { key: 'top', label: 'ชั้นบน (Top shelf)', hint: 'ชั้นบนสุด ใกล้ลมเย็นออก' },
        { key: 'mid', label: 'ชั้นกลาง (Center)', hint: 'ชั้นกลางตู้ — จุดอ้างอิงเทียบกับ Controller' },
        { key: 'bottom', label: 'ชั้นล่าง (Bottom shelf)', hint: 'ชั้นล่างสุด ใกล้ประตู / ลมกลับ' } ] },
    room: { name: 'ห้องเย็น (Cold room)', cmp: 1, points: [
        { key: 'door', label: 'ใกล้ประตู (Door)', hint: 'ในห้องใกล้ประตู — จุดที่อุ่นที่สุดตอนเปิดปิด' },
        { key: 'center', label: 'กลางห้อง (Center)', hint: 'กลางห้อง ระดับสินค้า — จุดอ้างอิงเทียบกับ Controller' },
        { key: 'rear', label: 'ด้านในสุด / ใกล้ Evaporator (Rear)', hint: 'ด้านในสุดของห้อง หรือใกล้คอยล์เย็น' } ] },
    chest: { name: 'ตู้นอน / Drum (Chest)', cmp: 0, points: [
        { key: 'center', label: 'กลางตู้ (Center)', hint: 'กลางตู้ ใต้ผิวสินค้า — จุดอ้างอิงเทียบกับ Controller' },
        { key: 'endA', label: 'ปลายตู้ด้านหนึ่ง (End A)', hint: 'ปลายตู้ด้านใกล้คอมเพรสเซอร์ / ต้นท่อน้ำยา' },
        { key: 'endB', label: 'ปลายตู้ด้านไกล (End B)', hint: 'ปลายตู้อีกด้าน / มุมตู้ที่ไกลที่สุด' } ] }
};

// Non-cabinet fields (free-text "other" cabinets, cold rooms, Multiset racks, CDU).
// type: 'number' | 'text' | 'select' | 'temp' (°C, decimal, may be negative, blank = not measured)
var HYPER_REF_SYSTEM_FIELDS = [
    // Controller displays often read wrong, so the survey records a reading from a real
    // instrument alongside it — this says which instrument the measured temps came from.
    { key: 'tempInstrument', header: 'เครื่องมือวัดอุณหภูมิ', type: 'select', section: 'temp',
      options: ['Temp Gun (Infrared)', 'Probe Thermometer (เสียบวัด)', 'Data Logger', 'อื่นๆ', 'ไม่มีเครื่องมือวัด'] },
    { key: 'posOther', header: '[ชุดบวก] ตู้แช่อื่นๆ (รูปแบบ/จำนวน)', type: 'text', section: 'pos' },
    { key: 'negOther', header: '[ชุดลบ] ตู้แช่อื่นๆ (รูปแบบ/จำนวน)', type: 'text', section: 'neg' },
    { key: 'coldRoomPos', header: 'ห้องเย็น ชุดบวก (Chill Room)', type: 'number', section: 'room' },
    { key: 'coldRoomNeg', header: 'ห้องเย็น ชุดลบ (Frozen Room)', type: 'number', section: 'room' },
    { key: 'coldRoomPosCtrlTemp', header: 'ห้องเย็น ชุดบวก — Temp Controller (°C)', type: 'temp', section: 'roomTemp' },
    { key: 'coldRoomPosMeasTemp', header: 'ห้องเย็น ชุดบวก — Temp วัดจริง (°C)', type: 'temp', section: 'roomTemp' },
    { key: 'coldRoomNegCtrlTemp', header: 'ห้องเย็น ชุดลบ — Temp Controller (°C)', type: 'temp', section: 'roomTemp' },
    { key: 'coldRoomNegMeasTemp', header: 'ห้องเย็น ชุดลบ — Temp วัดจริง (°C)', type: 'temp', section: 'roomTemp' },
    { key: 'msPosComp', header: 'Multiset Positive — จำนวนคอมเพรสเซอร์', type: 'number', section: 'rack' },
    { key: 'msPosModel', header: 'Multiset Positive — ยี่ห้อ/รุ่นคอมเพรสเซอร์', type: 'text', section: 'rack' },
    { key: 'msPosFan', header: 'Multiset Positive — จำนวนพัดลม Condenser', type: 'number', section: 'rack' },
    { key: 'msNegComp', header: 'Multiset Negative — จำนวนคอมเพรสเซอร์', type: 'number', section: 'rack' },
    { key: 'msNegModel', header: 'Multiset Negative — ยี่ห้อ/รุ่นคอมเพรสเซอร์', type: 'text', section: 'rack' },
    { key: 'msNegFan', header: 'Multiset Negative — จำนวนพัดลม Condenser', type: 'number', section: 'rack' },
    { key: 'cduPos', header: 'CDU ชุดบวก (จำนวน)', type: 'number', section: 'rack' },
    { key: 'cduNeg', header: 'CDU ชุดลบ (จำนวน)', type: 'number', section: 'rack' },
    { key: 'refrigerant', header: 'สารทำความเย็น (Refrigerant)', type: 'select', section: 'rack',
      options: ['R22', 'R404a', 'R407F', 'R448A', 'R449a', 'R134a', 'R507', 'อื่นๆ / ไม่ทราบ'] }
];

// Big-format store list from Store Refrigerator Estimate Price.xlsx ("Store Yr HYP" +
// the PM-option sheets). [code, English name, Thai name, format, region, refrigerant]
var HYPER_REF_STORES = [
    ["110002", "Khon Kaen", "ขอนแก่น", "Hyper", "Northeast", "R22"],
    ["110012", "", "พิษณุโลก", "Hyper", "", "R22"],
    ["110171", "Phitsanulok - RH", "", "Hyper", "North", ""],
    ["111101", "Wongsawang - RH", "วงศ์สว่าง", "Hyper", "BKK and Greater", "R22"],
    ["111102", "Changwattana - RH", "แจ้งวัฒนะ", "Hyper", "BKK and Greater", "R404a"],
    ["111103", "Radburana - RH", "", "Hyper", "BKK and Greater", ""],
    ["111104", "Pattaya - RH", "พัทยา เหนือ", "Hyper", "Central", "R22"],
    ["111106", "Bang Phli - RH", "บางพลี", "Hyper", "BKK and Greater", "R22"],
    ["111107", "Nakornpathom - RH", "นครปฐม", "Hyper", "Central", "R404a"],
    ["111108", "Rangsit", "รังสิต", "Hyper", "BKK and Greater", "R404a"],
    ["111109", "Udonthani - RH", "อุดรธานี", "Hyper", "Northeast", "R404a"],
    ["111111", "Korat", "โคราช", "Hyper", "Northeast", "R22"],
    ["111112", "Suratthani - RH", "สุราษฎร์ธานี", "Hyper", "South", "R22"],
    ["111114", "Rattanatibeth", "", "Hyper", "BKK and Greater", ""],
    ["111115", "Rayong", "ระยอง", "Hyper", "Central", "R22"],
    ["111116", "Rama2 - RH", "พระราม 2", "Hyper", "BKK and Greater", "R404a"],
    ["111117", "Chiang Rai - RH", "เชียงราย", "Hyper", "North", "R404a"],
    ["111118", "Lampang", "ลำปาง", "Hyper", "North", "R22"],
    ["111119", "Lopburi", "ลพบุรี", "Hyper", "Central", "R22"],
    ["111120", "Petchaburi", "เพชรบุรี", "Hyper", "Central", "R22"],
    ["111121", "Hat Yai", "หาดใหญ่", "Hyper", "South", "R404a"],
    ["111122", "Hua Mark", "หัวหมาก", "Hyper", "BKK and Greater", "R22"],
    ["111123", "Samutprakarn", "สมุทรปราการ", "Hyper", "BKK and Greater", "R404a"],
    ["111124", "Ubonratchathani", "อุบลราชธานี", "Hyper", "Northeast", "R22"],
    ["111125", "Donmuang", "ดอนเมือง", "Hyper", "BKK and Greater", "R404a"],
    ["111126", "Fashion Island", "แฟชั่นไอส์แลนด์", "Hyper", "BKK and Greater", "R404a"],
    ["111127", "Chiang Mai - RH", "เชียงใหม่", "Hyper", "North", "R22"],
    ["111128", "Suksawat", "สุขสวัสดิ์", "Hyper", "BKK and Greater", "R22"],
    ["111129", "Phuket", "ภูเก็ต", "Hyper", "South", "R404a"],
    ["111130", "Bangna", "บางนา", "Hyper", "BKK and Greater", "R404a"],
    ["111131", "Ladphrao", "ลาดพร้าว", "Hyper", "BKK and Greater", "R22"],
    ["111132", "Daokanong", "ดาวคะนอง", "Hyper", "BKK and Greater", "R22"],
    ["111133", "Tiwanont", "ติวานนท์", "Hyper", "BKK and Greater", "R22"],
    ["111134", "Pattaya 2", "พัทยา 2 Horeca", "Hyper", "Central", "R404a"],
    ["111135", "Nakhonsawan", "นครสวรรค์", "Hyper", "Central", "R22"],
    ["111136", "Saphankwai", "สะพานควาย", "Hyper", "BKK and Greater", "R22"],
    ["111137", "Chachoengsao", "ฉะเชิงเทรา", "Hyper", "Central", "R404a"],
    ["111138", "Samrong - RH", "สำโรง", "Hyper", "BKK and Greater", "R22"],
    ["111139", "Pattani", "ปัตตานี", "Hyper", "South", "R404a"],
    ["111140", "Surin", "สุรินทร์", "Hyper", "Northeast", "R404a"],
    ["111141", "Aomyai", "อ้อมใหญ่", "Hyper", "Central", "R404a"],
    ["111142", "Petchkasem", "เพชรเกษม", "Hyper", "BKK and Greater", "R22"],
    ["111143", "Sukhapiban-3", "สุขาภิบาล 3", "Hyper", "BKK and Greater", "R22"],
    ["111144", "Ekkamai", "เอกมัย", "Hyper", "BKK and Greater", "R404a"],
    ["111145", "Sakolnakorn", "สกลนคร", "Hyper", "Northeast", "R22"],
    ["111146", "Phare", "แพร่", "Hyper", "North", "R22"],
    ["111147", "Ratchaburi", "ราชบุรี", "Hyper", "Central", "R22"],
    ["111148", "Lumlukka", "ลำลูกกา", "Hyper", "BKK and Greater", "R22"],
    ["111150", "Lumphun", "ลำพูน", "Hyper", "North", "R22"],
    ["111151", "Samui", "สมุย", "Hyper", "South", "R404a"],
    ["111152", "Chonburi", "ชลบุรี", "Hyper", "Central", "R22"],
    ["111153", "Buriram", "บุรีรัมย์", "Hyper", "Northeast", "R22"],
    ["111154", "Hangdong", "หางดง", "Hyper", "North", "R404a"],
    ["111155", "Ayutthaya", "อยุธยา", "Hyper", "Central", "R22"],
    ["111156", "Sukhothai", "สุโขทัย", "Hyper", "North", "R22"],
    ["111157", "Banpong", "บ้านโป่ง", "Hyper", "Central", "R22"],
    ["111158", "Chaiyaphoom", "ชัยภูมิ", "Hyper", "Northeast", "R22"],
    ["111159", "Petchaboon", "เพชรบูรณ์", "Hyper", "North", "R22"],
    ["111160", "Krabi", "กระบี่", "Hyper", "South", "R22"],
    ["111161", "Navanakorn", "นวนคร", "Hyper", "BKK and Greater", "R22"],
    ["111162", "Rangsit Klong 6", "รังสิต คลองหก", "Hyper", "BKK and Greater", "R404a"],
    ["111163", "Yasothon", "ยโสธร", "Hyper", "Northeast", "R22"],
    ["111164", "Sa Kaeo", "สระแก้ว", "Hyper", "Central", "R22"],
    ["111165", "Varinchamrab", "วารินชำราบ", "Hyper", "Northeast", "R22"],
    ["111166", "Mahasarakarm", "มหาสารคาม", "Hyper", "Northeast", "R22"],
    ["111167", "Sisaket", "ศรีษะเกศ", "Hyper", "Northeast", "R22"],
    ["111168", "Mahachai", "มหาชัย", "Hyper", "Central", "R22"],
    ["111169", "Amnat Charoen", "อำนาจเจริญ", "Hyper", "Northeast", "R404a"],
    ["111170", "Leamthong", "แหลมทอง", "Hyper", "Central", ""],
    ["111171", "Kamphengphet", "กำแพงเพชร", "Hyper", "North", "R22"],
    ["111172", "Rajdamri 2", "ราชดำริ", "Hyper", "BKK and Greater", "R22"],
    ["111174", "Ladphrao 2 - RH", "ลาดพร้าว 2", "Hyper", "BKK and Greater", "R22"],
    ["111175", "Chonburi CPN - RH", "ชลบุรี CPN", "Hyper", "Central", ""],
    ["111176", "Lopburi 2 - RH", "ลพบุรี 2", "Hyper", "Central", "R22"],
    ["111177", "Sukhapiban-3 2 - RH", "", "Hyper", "BKK and Greater", ""],
    ["111178", "Srinakarin - RH", "", "Hyper", "BKK and Greater", ""],
    ["111179", "Petchkasem 2 - RH", "เพชรเกษม 2", "Hyper", "BKK and Greater", "R22"],
    ["111180", "Ramintra - RH", "รามอินทรา", "Hyper", "BKK and Greater", "R22"],
    ["111181", "Chonburi 2 - RH", "ชลบุรี 2", "Hyper", "Central", "R22"],
    ["111182", "On-Nuch - RH", "อ่อนนุช", "Hyper", "BKK and Greater", "R22"],
    ["111183", "Bangyai - RH", "บางใหญ่", "Hyper", "BKK and Greater", "R22"],
    ["111184", "Chiang Mai 2", "เชียงใหม่ 2", "Hyper", "North", "R404a"],
    ["111185", "Changwattana 2 - RH", "แจ้งวัฒนะ 2", "Hyper", "BKK and Greater", "R22"],
    ["111186", "Hat Yai 2 - RH", "หาดใหญ่ 2", "Hyper", "South", "R22"],
    ["111187", "Phuket 2 - RH", "ภูเก็ต 2", "Hyper", "South", "R22"],
    ["111188", "Hangdong 2 - RH", "หางดง 2", "Hyper", "North", "R22"],
    ["111189", "Rattanatibeth 2 - RH", "รัตนาธิเบศร์ 2", "Hyper", "BKK and Greater", "R22"],
    ["111190", "Rama 4 - RH", "พระราม 4", "Hyper", "BKK and Greater", "R22"],
    ["111191", "Ratchadapisek - RH", "รัชดา", "Hyper", "BKK and Greater", "R404a"],
    ["111192", "Pattaya 3 - RH", "พัทยา 3", "Hyper", "Central", "R22"],
    ["111193", "Lumlukka 2 - RH", "ลำลูกกา 2", "Hyper", "BKK and Greater", "R404a"],
    ["111194", "Rangsit 2 - RH", "", "Hyper", "BKK and Greater", ""],
    ["111195", "Bangbon - RH", "บางบอน", "Hyper", "BKK and Greater", "R404a"],
    ["111196", "Bangpakok - RH", "บางประกอก", "Hyper", "BKK and Greater", "R404a"],
    ["111197", "Rama2_2 - RH", "พระราม 2-2", "Hyper", "BKK and Greater", "R22"],
    ["111198", "Klong 3 - RH", "คลองสาม", "Hyper", "BKK and Greater", "R22"],
    ["111199", "Issaraphap - RH", "อิสระภาพ", "Hyper", "BKK and Greater", "R22"],
    ["111200", "Suwintawong - RH", "สุวินทวงค์", "Hyper", "BKK and Greater", "R22"],
    ["111201", "Nongchok - RH", "หนองจอก", "Hyper", "BKK and Greater", "R404a"],
    ["111202", "Romklao - RH", "ร่มเกล้าฯ", "Hyper", "BKK and Greater", "R22"],
    ["111204", "Chachoengsao 2 - RH", "ฉะเชิงเทรา 2", "Hyper", "Central", "R22"],
    ["111205", "Udonthani 2 - RH", "อุดรธานี 2", "Hyper", "Northeast", "R22"],
    ["111206", "Chumphon - RH", "ชุมพร", "Hyper", "South", "R22"],
    ["111207", "Tak", "ตาก", "Hyper", "North", "R22"],
    ["111208", "Banbueng", "บ้านบึง", "Hyper", "Central", "R22"],
    ["111209", "Chantaburi", "จันทบุรี", "Hyper", "Central", "R22"],
    ["111210", "Mega Bangna", "เมกะบางนา", "Hyper", "BKK and Greater", "R22"],
    ["111211", "Loei", "เลย", "Hyper", "Northeast", "R22"],
    ["111212", "Satun", "สตูล", "Hyper", "South", "R22"],
    ["111213", "Mukdahan", "มุกดาหาร", "Hyper", "Northeast", "R22"],
    ["111214", "Nakornsawan 2", "นครสวรรค์ 2", "Hyper", "Central", "R22"],
    ["111215", "Roi ET", "ร้อยเอ็ด", "Hyper", "Northeast", "R22"],
    ["111216", "Ang-Thong", "อ่างทอง", "Hyper", "Central", "R22"],
    ["111217", "Kalasin", "กาฬสินธ์", "Hyper", "Northeast", "R22"],
    ["111218", "Samutsongkhram", "สมุทรสงคราม", "Hyper", "Central", "R22"],
    ["111219", "Suphanburi", "สุพรรณบุรี", "Hyper", "Central", "R22"],
    ["111223", "Nakhonphanom", "นครพนม", "Hyper", "Northeast", "R22"],
    ["111227", "Trang", "ตรัง", "Hyper", "South", "R22"],
    ["111228", "Kallapapruek", "กัลปพฤกษ์", "Hyper", "BKK and Greater", "R22"],
    ["111229", "Sri Mahaphot (Prachinburi)", "ศรีมหาโพธิ์", "Hyper", "Central", "R22"],
    ["111230", "Kanchanaburi", "กาญจนบุรี", "Hyper", "Central", "R22"],
    ["111231", "Nan", "น่าน", "Hyper", "North", "R22"],
    ["111232", "Kranuan", "กระนวน", "Hyper", "Northeast", "R22"],
    ["111233", "Ranong", "ระนอง", "Hyper", "South", ""],
    ["111234", "Na Thawi", "นาทวี", "Hyper", "South", ""],
    ["111235", "Phon Phisai", "โพนพิสัย", "Hyper", "Northeast", "R22"],
    ["111236", "Ban Phai", "บ้านไผ่", "Hyper", "Northeast", "R22"],
    ["111238", "Ban Dung", "บ้านดุง", "Hyper", "Northeast", "R407F"],
    ["111239", "Pathumthani", "ปทุมธานี", "Hyper", "BKK and Greater", "R407F"],
    ["111240", "Korat 2", "โคราช2", "Hyper", "Northeast", "R22"],
    ["111241", "MM Nong Khai", "MM หนองคาย", "Hyper", "Northeast", "R22"],
    ["111242", "MM Aranyaprathet - RH", "MM อรัญประเทศ", "Hyper", "Central", "R22"],
    ["111243", "Nam Yuen", "น้ำยืน อุบลราชธานี", "Hyper", "Northeast", "R407F"],
    ["111244", "Sattahip", "สัตหีบ  ชลบุรี", "Hyper", "Central", "R407F"],
    ["111245", "Suwannaphum", "สุวรรณภูมิ  ร้อยเอ็ด", "Hyper", "Northeast", ""],
    ["111247", "Wangnamyen", "วังน้ำเย็น  สระแก้ว", "Hyper", "Central", "R407F"],
    ["111248", "Tha Tako", "ท่าตะโก นครสวรรค์", "Hyper", "Central", "R407F"],
    ["111249", "Dan Khun Thot", "ด่านขุนทด โคราช", "Hyper", "Northeast", "R407F"],
    ["111250", "Kham Ta Kla", "คำตากล้า สกลนคร", "Hyper", "Northeast", "R407F"],
    ["111251", "Phang Khon", "พังโคน สกลนคร", "Hyper", "Northeast", ""],
    ["111252", "Wichien Buri", "วิเชียรบุรี เพชรบูรณ์", "Hyper", "North", "R407F"],
    ["111254", "Nong Bua", "หนองบัว  นครสวรรค์", "Hyper", "Central", "R407F"],
    ["111257", "Nakhon Si Thammarat", "นครศรีธรรมราช 2", "Hyper", "South", ""],
    ["111258", "Chiang Rai 2", "เชียงราย 2", "Hyper", "North", "R22"],
    ["111259", "Nong Ki", "หนองกี่ บุรีรัมย์", "Hyper", "Northeast", "R404a"],
    ["111260", "Lat Yao", "ลาดยาว นครสวรรค์", "Hyper", "Central", "R407F"],
    ["111262", "Khon Kaen 2 - RH", "ขอนแก่น 2 ( เมืองเก่า )", "Hyper", "Northeast", "R404a"],
    ["111263", "Sai Noi - RH", "ไทรน้อย นนทบุรี", "Hyper", "BKK and Greater", "R404a"],
    ["111265", "Pak Chong - RH", "ปากช่อง", "Hyper", "Northeast", "R404a"],
    ["111266", "Mahachai 2", "มหาชัย 2", "Hyper", "Central", "R449a"],
    ["111268", "", "ยะลา", "Hyper", "", "R404a"],
    ["111269", "Bor Win", "บ่อวิน", "Hyper", "Central", "R404a"],
    ["111270", "Narathiwat", "นราธิวาส", "Hyper", "South", "R404a"],
    ["111272", "", "สระบุรี", "Hyper", "", "R404a"],
    ["111274", "", "สุไหงโกลก", "Hyper", "", "R404a"],
    ["111276", "", "Phenix ประตูน้ำ", "Hyper", "", "R404a"],
    ["111277", "", "หัวหิน มาร์เช่", "Hyper", "", "R404a"],
    ["116004", "", "ตลาดบุญเจริญ", "Market", "", "R404a"],
    ["116005", "", "สนามบินน้ำ", "BCFS", "", "R404a"],
    ["141001", "Jumbo_Samrong", "สำโรง 2", "Hyper", "BKK and Greater", "R22"],
    ["151002", "", "พังงา", "Market", "", ""],
    ["151003", "", "สายไหม", "Foodplace", "", "R404a"],
    ["151004", "", "สุขาภิบาล 5", "Foodplace", "", "R404a"],
    ["151006", "", "สวนหลวง", "Foodplace", "", "R404a"],
    ["151007", "", "ประชาอุทิศ", "Foodplace", "", "R22"],
    ["151008", "", "เคหะ ร่มเกล้า", "Foodplace", "", "R404a"],
    ["151009", "", "หทัยราษฎร์", "Foodplace", "", "R404a"],
    ["151010", "", "หล่มสัก Market", "Market", "", "R407F"],
    ["151013", "", "กมลา", "Market", "", "R404a"],
    ["151014", "", "พิบูลมังสาหาร อุบล", "Hyper", "", "R404a"],
    ["151015", "", "ปลวกแดง ระยอง Market", "Market", "", ""],
    ["151016", "", "ท่าเรือ กาญจนบุรี", "Market", "", "R22"],
    ["151017", "", "คู้บอน", "Market", "", "R407F"],
    ["151018", "", "บ้านเพ ระยอง Market", "Market", "", ""],
    ["151019", "", "ชะอำ", "Market", "", "R407F"],
    ["151020", "", "หัวหิน", "Market", "", "R22"],
    ["151027", "", "วังสะพุง เลย", "Market", "", "R404a"],
    ["151028", "", "ตะพานหิน พิจิตร Market", "Market", "", ""],
    ["151030", "", "เชียงคาน  เลย", "Market", "", ""],
    ["151031", "", "สิชล นครศรีธรรมราช", "Market", "", ""],
    ["151033", "", "ราษีไศล ศรีสะเกษ Market", "Market", "", ""],
    ["151035", "", "สวรรค์โลค สุโขทัย Market", "Market", "", "R407F"],
    ["151036", "", "ระโนด สงขลา", "Market", "", ""],
    ["151038", "", "กุสิตนารายณ์", "Market", "", ""],
    ["151039", "", "เสลภูมิ ร้อยเอ็ด", "Market", "", ""],
    ["151040", "", "ตะกั่วป่า พังงา", "Market", "", ""],
    ["151041", "", "บางมูลนาค พิจิตร Market", "Market", "", "R407F"],
    ["151042", "", "บ้านตาขุน", "Market", "", ""],
    ["151044", "", "สีคิ้ว นครราชศรีมา Market", "Market", "", "R404a"],
    ["151046", "", "วิเศษชัยชาญ อ่างทอง", "Market", "", "R404a"],
    ["151048", "", "โนนสูง โคราช Market", "Market", "", ""],
    ["151049", "", "น้ำโสม อุดรธานี", "Market", "", ""],
    ["151050", "", "บำเหน็จณรงค์  ชัยภูมิ Market", "Depot", "", ""],
    ["151053", "", "ภูเวียง ขอนแก่น", "Market", "", ""],
    ["151054", "", "โซ่ พิสัย บึงกาฬ", "Market", "", ""],
    ["151055", "", "หนองม่วง ลพบุรี", "Market", "", "R407F"],
    ["151056", "", "ชุมพวง โคราช Market", "Market", "", ""],
    ["151057", "", "พุทธมณฑลสาย5 นครปฐม", "Market", "", "R407F"],
    ["151058", "", "ห้วยแถลง โคราช Market", "Market", "", ""],
    ["151059", "", "ประทัย", "Market", "", ""],
    ["151060", "", "พันท้ายนรสิงห์  สมุทรสาคร", "Market", "", "R407F"],
    ["151061", "", "เกาะช้าง  ตราด Market", "Market", "", ""],
    ["151062", "", "พันธุ์ทิพย์ เชียงใหม่ Market", "Market", "", "R404a"],
    ["151063", "", "วัดลาดปลาดุก  นนทบุรี", "Foodplace", "", "R404a"],
    ["151064", "", "สมเด็จ กาฬสินธุ์", "Market", "", ""],
    ["151067", "", "เกตเวย์ บางซื่อ", "Foodplace", "", "R404a"],
    ["151068", "", "สามย่าน มิตรทาวน์", "Foodplace", "", "R404a"],
    ["151069", "", "ท่าอิฐ", "Foodplace", "", "R404a"],
    ["151070", "", "หนามแดง", "Foodplace", "", "R404a"],
    ["151072", "", "พันทิพย์ งามวงศ์วาน", "Foodplace", "", "R449a"],
    ["151091", "", "สวนนงนุช", "Market", "", "R404a"],
    ["151096", "", "เอเชียทีค", "Foodplace", "", "R404a"],
    ["151097", "", "แจ๊สรามอินทรา", "Foodplace", "", "R404a"],
    ["151098", "", "ดิโอ สยาม", "Foodplace", "", "R404a"],
    ["151102", "", "วัน แบงค์คอก", "Foodplace", "", "R404a"],
    ["151103", "", "มหาทุน", "Foodplace", "", "R404a"],
    ["151104", "", "ปาร์คบางนา", "Foodplace", "", "R404a"],
    ["151109", "", "เอกชัย", "Market", "", "R404a"],
    ["152022", "", "เกาะพงัน", "Market", "", "R404a"]];

// Survey definition for HyperSurveyEngine.gs. Header strings here are what the live
// sheet already uses — changing them would orphan existing columns.
var HYPER_REF_DEF = {
    name: 'Hyper Refrigerator Survey', emoji: '🏬',
    sheet: HYPER_REF_SHEET, folder: HYPER_REF_FOLDER,
    idPrefix: 'HREF', keyPrefix: 'hyp_', photoFilePrefix: 'hyperref', headerColor: '#1d4ed8',
    brokenLabel: 'ตู้ชำรุด',
    // One card per cabinet (Equipment ID, Asset No., brand/spec, status, condition, controller
    // vs IR temp, photo) — same per-unit capture as the Ref Survey. Counts per size are
    // derived from the units; units are stored in one Units_JSON cell.
    perUnit: true,
    // every Hyper Ref card also takes the main-machine register attributes (serial, capacity,
    // price, 5-year repair cost, energy / impact / spare-part scores) — see HS_FF_RATINGS
    ff: true,
    histType: 'Ref',
    tempSets: HYPER_REF_TEMP_SETS,
    derived: [{ key: 'coldRoomPos', cat: 'posColdRoom' }, { key: 'coldRoomNeg', cat: 'negColdRoom' }],
    unitTemp: { aHeader: 'Controller °C', bHeader: 'IR / วัดจริง °C (จุดอ้างอิง)', cHeader: '', flagHeader: 'ต่าง >3°C', emailHeader: 'Ctrl / จุดวัด 1·2·3 °C',
                pointHeaders: ['จุดวัด 1 °C', 'จุดวัด 2 °C', 'จุดวัด 3 °C'], pointNameHeader: 'ชื่อจุดวัด 1 / 2 / 3' },
    // Sales-floor layout (image) the surveyor attaches, with one pin per cabinet on it
    layout: true,
    categories: HYPER_REF_CATEGORIES,
    system: HYPER_REF_SYSTEM_FIELDS,
    groups: [
        { id: 'pos', label: 'รวมตู้ชุดบวก', totalHeader: 'Total ตู้ชุดบวก' },
        { id: 'neg', label: 'รวมตู้ชุดลบ', totalHeader: 'Total ตู้ชุดลบ' }
    ],
    grandTotal: { label: 'ทั้งหมด', header: 'Total ตู้ทั้งหมด' },
    // Controller display vs a real instrument reading (controllers are often off)
    catTemp: {
        a: { suffix: 'ctrlTemp', headerSuffix: ' — Temp Controller (°C)', label: 'Controller' },
        b: { suffix: 'measTemp', headerSuffix: ' — Temp วัดจริง (°C)', label: 'วัดจริง' },
        rule: 'gap', threshold: 3
    }
};

// Client-facing entry points (names kept stable — called by HyperRefSurveyTab.html,
// HyperRefSurveyReport.html and the include scriptlet).
function getHyperRefConfig_() { return hyperSurveyConfig_(HYPER_REF_DEF); }
function getHyperRefConfig() { return { success: true, config: getHyperRefConfig_() }; }
function _hyperRefCountColumns_(form) { return _hsCountColumns_(HYPER_REF_DEF, form); }
function processHyperRefSurveyForm(form) { return hyperSurveySubmit_(HYPER_REF_DEF, form); }
function getHyperRefSurveyList(includeArchive) { return hyperSurveyList_(HYPER_REF_DEF, includeArchive); }
function getHyperRefSurveyRecordById(id) { return hyperSurveyRecordById_(HYPER_REF_DEF, id); }
function updateHyperRefSurveyRecord(form) { return hyperSurveyUpdate_(HYPER_REF_DEF, form); }
function deleteHyperRefSurveyRecord(id, clientEmail) { return hyperSurveyDelete_(HYPER_REF_DEF, id, clientEmail); }
function addHyperRefSurveyPhotos(id, unitKey, files, clientEmail) { return hyperSurveyAddPhotos_(HYPER_REF_DEF, id, unitKey, files, clientEmail); }
function deleteHyperRefSurveyPhoto(id, unitKey, url, clientEmail) { return hyperSurveyDeletePhoto_(HYPER_REF_DEF, id, unitKey, url, clientEmail); }
function getHyperRefUnitRows() { return hyperSurveyUnitRows_(HYPER_REF_DEF); }
function getHyperRefBrandOptions() { return hyperBrandOptions_(HYPER_REF_DEF, 'ref_brand', []); }
function getHyperRefUnitHistory(branchCode, equipId, assetNo) { return hyperUnitHistory_(HYPER_REF_DEF, branchCode, equipId, assetNo); }
function addHyperRefMaintenance(rec, clientEmail) { return hyperMaintAdd_(HYPER_REF_DEF, rec, clientEmail); }
function deleteHyperRefMaintenance(recordId, clientEmail) { return hyperMaintDelete_(HYPER_REF_DEF, recordId, clientEmail); }
