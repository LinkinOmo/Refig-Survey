// --- Hyper Fire Prevention Survey (ป้องกันอัคคีภัย) ---
// Raised after the Oct–Nov 2026 fires (Phang Nga 27/10: old above-ceiling wiring with taped joints and no
// conduit shorted into a housekeeping store packed with tissue paper; Ban Bueng; Rama 4 above-ceiling short).
// Method agreed with LP: ค้นหาความเสี่ยง → ลดความเสี่ยงด้วยการจัดพื้นที่ → ตรวจซ้ำ (find → reduce → re-check).
//
// The store is walked area by area: one CARD per physical spot (each MDB room, DB panel, stock room, tenant …)
// grouped by the zones in HYPER_FI_ZONES, every checklist item answered ok / risk / n/a. A risk carries severity,
// the reducing action taken, status, due date and before / after photos (photo keys hfi_<cid>_b / hfi_<cid>_a).
// Store-wide fire-protection facts (alarm, sprinkler coverage, extinguishers, drill …) sit in `prot`.
// Re-check: the form loads the store's latest survey (getHyperFiLatestForStore) and the surveyor updates each
// open risk; earlier "before" photo URLs travel with the card (prevB) so the evidence is not lost.
// Runs on HyperSurveyEngine.gs; all data sits in one Fire_JSON cell + summary columns (_hfiExtraColumns_).
// The checklist lives ONLY in HYPER_FI_ZONES / HYPER_FI_PROT — form, report, email and summary all read it.

var HYPER_FI_SHEET = "Hyper_Fire_Survey_Database";
var HYPER_FI_FOLDER = "Hyper_Fire_Survey_Attachments";

// crit: true = a risk here is high severity by default (fire can start / spread fast). tape: card offers the
// red-black "keep clear" floor tape tick. multi: the zone usually has several spots → "+ add" button.
var HYPER_FI_ZONES = [
    { k: 'mdb', l: 'ห้อง MDB / หม้อแปลง / Generator', icon: '⚡', tape: true, items: [
        { k: 'clear', l: 'หน้าตู้ / ทางเข้าห้องโล่ง ไม่มีสิ่งของวางกีดขวาง (≥ 1 ม.)', crit: true },
        { k: 'store', l: 'ไม่ใช้ห้องไฟฟ้าเป็นที่เก็บของ / กล่อง / สารเคมี', crit: true },
        { k: 'heat', l: 'ไม่มีกลิ่นไหม้ / รอยไหม้ / เสียงอาร์ค / ความร้อนผิดปกติที่ตู้และจุดต่อ', crit: true },
        { k: 'door', l: 'ประตูห้องปิด-ล็อกได้ มีป้ายเตือนอันตราย / ห้ามเข้า' },
        { k: 'clean', l: 'ภายในห้องและตู้สะอาด ไม่มีฝุ่น หยากไย่ สัตว์ / น้ำรั่วซึม' },
        { k: 'label', l: 'เบรกเกอร์มีป้ายระบุวงจรครบ อ่านออก' },
        { k: 'scan', l: 'มีผล Thermoscan ล่าสุด ≤ 1 ปี และแก้จุดร้อนแล้ว' },
        { k: 'gen', l: 'Generator / ถังน้ำมัน: ไม่มีน้ำมันรั่ว ไม่มีวัสดุติดไฟใกล้ ทดสอบเดินเครื่องตามรอบ' },
        { k: 'ext', l: 'มีถังดับเพลิง CO₂ / Clean Agent หน้าห้อง พร้อมใช้' }
    ] },
    { k: 'db', l: 'ตู้ไฟย่อย (DB / LP) พื้นที่ขาย · หลังร้าน · Town Center', icon: '🔌', tape: true, multi: true, items: [
        { k: 'clear', l: 'หน้าตู้โล่ง ไม่มีสินค้า / พาเลท / ชั้นวางกีดขวาง (≥ 1 ม.)', crit: true },
        { k: 'cover', l: 'ฝาตู้ปิดสนิท ล็อกได้ ไม่มีสายไฟโผล่ / รูเปิด', crit: true },
        { k: 'heat', l: 'ไม่มีกลิ่นไหม้ / รอยไหม้ / ความร้อนผิดปกติ', crit: true },
        { k: 'wire', l: 'สายเข้า-ออกตู้ร้อยท่อ / มีบุชชิ่ง ไม่ต่อพ่วงนอกตู้' },
        { k: 'label', l: 'มีป้ายระบุวงจร / ตู้นี้จ่ายไฟพื้นที่ใด' },
        { k: 'clean', l: 'ภายในตู้ไม่มีฝุ่นหนา / ความชื้น / แมลง' }
    ] },
    { k: 'ceil', l: 'เหนือฝ้า / รางเดินสายไฟ (เปิดช่อง Service ตรวจ)', icon: '🧵', multi: true, items: [
        { k: 'conduit', l: 'สายไฟร้อยท่อ / วางในรางเรียบร้อย ไม่พาดบนโครง C-Line', crit: true },
        { k: 'joint', l: 'จุดต่อสายอยู่ใน Box ไฟ / ใช้ Wire Nut (ไม่ใช่พันเทปอย่างเดียว)', crit: true },
        { k: 'old', l: 'ไม่พบสายเก่า ฉนวนกรอบ แตก ไหม้ / หนูกัด', crit: true },
        { k: 'debris', l: 'ไม่มีสินค้า / กล่อง / เศษวัสดุ / ขยะ เก็บบนฝ้า', crit: true },
        { k: 'leak', l: 'ไม่มีน้ำรั่วจากท่อ / หลังคา หยดใกล้สายไฟ' },
        { k: 'access', l: 'มีช่อง Service เปิดตรวจได้ในจุดที่มีสายไฟผ่าน' },
        { k: 'fixture', l: 'โคมไฟ / Ballast / Driver ไม่ร้อนจัด ไม่มีกลิ่นไหม้' }
    ] },
    { k: 'stock', l: 'ห้องสต็อก / คลังหลังร้าน / ห้องเก็บของ (รวมจุดใกล้ Fan Coil)', icon: '📦', tape: true, multi: true, items: [
        { k: 'gap', l: 'สินค้าไวไฟ (กระดาษ กล่อง พลาสติก) ไม่วางชิดตู้ไฟ / Fan Coil / โคมไฟ / Heater', crit: true },
        { k: 'height', l: 'เว้นระยะจากฝ้า / หัวสปริงเกอร์ ≥ 50 ซม. ไม่วางสูงจนติดฝ้า', crit: true },
        { k: 'plug', l: 'ไม่มีปลั๊กพ่วงต่อหลายทอด / อุปกรณ์ไฟฟ้าเสียบทิ้งไว้ / หม้อหุงข้าว', crit: true },
        { k: 'fcu', l: 'Fan Coil ในห้อง: มอเตอร์ไม่ร้อน ถาดน้ำทิ้งไม่ล้น ไม่มีของวางทับ / อุดช่องลม' },
        { k: 'aisle', l: 'ทางเดิน / ทางออกในห้องโล่ง ไม่มีสินค้าล้นกีดขวาง' },
        { k: 'wall', l: 'ผนัง / ฝ้าห้องไม่ใช่วัสดุติดไฟง่าย (ไม้ / ผ้าใบ) หรือมีการป้องกัน' },
        { k: 'ext', l: 'มีถังดับเพลิงหน้าห้อง / ในห้อง เข้าถึงได้' }
    ] },
    { k: 'hk', l: 'ห้องแม่บ้าน / สารเคมี / กระดาษชำระ', icon: '🧻', tape: true, multi: true, items: [
        { k: 'tissue', l: 'ปริมาณกระดาษชำระ / กระดาษ ไม่เกินจำเป็น จัดเก็บเป็นระเบียบ', crit: true },
        { k: 'chem', l: 'สารเคมี / น้ำยาไวไฟแยกเก็บ ปิดฝา มีป้าย ไม่วางรวมกับกระดาษ', crit: true },
        { k: 'charge', l: 'เครื่องขัดพื้น / แบตเตอรี่ชาร์จบนพื้นที่ไม่ติดไฟ ไม่ชาร์จทิ้งไว้ข้ามคืน' },
        { k: 'wire', l: 'ไม่มีสายไฟ / ปลั๊กชำรุด หรือสายไฟเหนือฝ้าผ่านห้องโดยไม่ร้อยท่อ', crit: true },
        { k: 'rag', l: 'ผ้าเปื้อนน้ำมัน / ผ้าชุบน้ำยา ทิ้งในถังฝาปิด' }
    ] },
    { k: 'cold', l: 'ห้องเย็น / ห้องแช่แข็ง / ห้องเครื่อง Rack & คอยล์ร้อน', icon: '❄️', tape: true, multi: true, items: [
        { k: 'heater', l: 'สาย Heater ประตู / ท่อน้ำทิ้ง ไม่ชำรุด ไม่ร้อนผิดปกติ', crit: true },
        { k: 'panel', l: 'ตู้คอนโทรล / ตู้ไฟ Rack ปิดฝา ไม่มีของวางกีดขวาง ไม่มีรอยไหม้', crit: true },
        { k: 'foam', l: 'ผนังฉนวน (PU / EPS) ไม่ฉีกขาด สายไฟผ่านผนังร้อยท่อ / อุดช่อง', crit: true },
        { k: 'box', l: 'ไม่มีกล่องกระดาษ / พาเลท / พลาสติกห่อสินค้า กองชิดคอยล์ร้อน / ตู้คอนโทรล' },
        { k: 'fan', l: 'พัดลม Evaporator / Condenser ไม่มีเสียงดัง กลิ่นไหม้' },
        { k: 'oil', l: 'ห้องเครื่อง Rack: ไม่มีน้ำมันคอมเพรสเซอร์รั่ว / คราบน้ำมันสะสม' },
        { k: 'clean', l: 'คอยล์ร้อน / ห้องเครื่องสะอาด ไม่มีฝุ่นหนา / เศษใบไม้' }
    ] },
    { k: 'fresh', l: 'อาหารสด / ครัว (เบเกอรี่ ไก่ย่าง ของทอด Deli Hot Food)', icon: '🍗', multi: true, items: [
        { k: 'fryer', l: 'เตาทอด / เตาอบ / ตู้อบไก่ ทำความสะอาดคราบน้ำมันประจำวัน', crit: true },
        { k: 'hood', l: 'Hood / ท่อดูดควัน / ฟิลเตอร์ไขมัน ล้างตามรอบ (มีบันทึก)', crit: true },
        { k: 'gas', l: 'แก๊ส: ถัง / สาย / หัวปรับ ไม่รั่ว มีวาล์วตัด ถังตั้งในที่โปร่ง', crit: true },
        { k: 'plug', l: 'ปลั๊ก / สายไฟเครื่องครัวไม่เปียก ไม่ชำรุด ไม่ต่อพ่วง', crit: true },
        { k: 'off', l: 'ปิดเตา / อุปกรณ์ความร้อนทุกตัวหลังเลิกงาน (มีผู้รับผิดชอบเช็กปิด)' },
        { k: 'ktype', l: 'มีถังดับเพลิงชนิด K / ผ้าห่มกันไฟ ใกล้เตาทอด' },
        { k: 'pack', l: 'บรรจุภัณฑ์ / กล่องกระดาษไม่วางใกล้เตา / Heater' }
    ] },
    { k: 'fc', l: 'Food Court / ร้านอาหารในศูนย์', icon: '🍜', multi: true, items: [
        { k: 'gas', l: 'แก๊ส LPG ของร้าน: ถังไม่เกินที่อนุญาต สายไม่หมดอายุ มีวาล์วตัด / Gas Leak Detector', crit: true },
        { k: 'hood', l: 'Hood / ท่อดูดควันรวม ล้างคราบไขมันตามรอบ (มีบันทึก)', crit: true },
        { k: 'stove', l: 'เตา / หม้อทอด ไม่มีคราบน้ำมันสะสม ไม่ตั้งชิดผนังไม้ / ป้าย', crit: true },
        { k: 'plug', l: 'ไม่มีปลั๊กพ่วงต่อหลายทอด / สายไฟเปลือย บริเวณร้าน' },
        { k: 'close', l: 'ร้านปิดแก๊ส / ไฟอุปกรณ์หลังปิดศูนย์ (มีการตรวจปิดร้าน)' },
        { k: 'ext', l: 'ถังดับเพลิง / ชนิด K ประจำโซน พร้อมใช้ พนักงานร้านใช้เป็น' }
    ] },
    { k: 'tc', l: 'Town Center / Plaza พื้นที่ส่วนกลาง (ทางเดิน ลิฟต์ บันไดเลื่อน)', icon: '🏬', multi: true, items: [
        { k: 'exit', l: 'ทางหนีไฟ / บันไดหนีไฟ โล่ง ประตูหนีไฟไม่ล็อก ไม่ค้ำเปิด', crit: true },
        { k: 'sign', l: 'ป้ายทางออก / ไฟฉุกเฉินติดสว่าง ทดสอบแล้ว', crit: true },
        { k: 'temp', l: 'ไม่มีไฟชั่วคราว / ปลั๊กพ่วงของบูธ Event / Promotion ที่ไม่ได้มาตรฐาน', crit: true },
        { k: 'esc', l: 'ห้องเครื่อง / หลุมบันไดเลื่อนสะอาด ไม่มีคราบน้ำมัน ฝุ่น เศษขยะ' },
        { k: 'deco', l: 'ของตกแต่ง / ป้าย / ผ้า ไม่บังหัวสปริงเกอร์ Smoke Detector หรือโคมไฟ' },
        { k: 'cab', l: 'ตู้ดับเพลิง (FHC) / ถังดับเพลิงในทางเดิน เข้าถึงได้ ไม่ถูกบัง' }
    ] },
    { k: 'tl', l: 'ร้านค้าเช่าขนาดใหญ่ (Anchor · โรงภาพยนตร์ · Power Buy · ร้านอาหารใหญ่)', icon: '🏪', multi: true, items: [
        { k: 'db', l: 'ตู้ไฟของร้านปิดฝา หน้าตู้โล่ง ไม่ใช้เป็นที่เก็บของ', crit: true },
        { k: 'plug', l: 'ไม่มีปลั๊กพ่วงหลายทอด / สายไฟต่อเอง / เดินสายไม่ร้อยท่อ', crit: true },
        { k: 'ceiling', l: 'ไม่เก็บสต็อก / กล่องบนฝ้า หลังป้าย หรือชิดโคมไฟ', crit: true },
        { k: 'stock', l: 'ห้องสต็อกของร้าน: เว้นระยะจากฝ้า / ไฟ ไม่ล้นทางเดิน' },
        { k: 'sign', l: 'ป้ายไฟ / โคมไฟร้าน / Lightbox ไม่ร้อนผิดปกติ มีเบรกเกอร์แยก' },
        { k: 'off', l: 'ปิดอุปกรณ์ไฟฟ้าที่ไม่จำเป็นหลังปิดร้าน (มีผู้รับผิดชอบ)' },
        { k: 'ext', l: 'มีถังดับเพลิงในร้าน ไม่หมดอายุ พนักงานใช้เป็น · มีผังอพยพ' }
    ] },
    { k: 'tcl', l: 'ร้านค้าเช่าขนาดเล็ก (CL · Kiosk · Booth · ร้านมือถือ)', icon: '🛍️', multi: true, items: [
        { k: 'plug', l: 'ไม่มีปลั๊กพ่วงต่อหลายทอด / ปลั๊กรางคุณภาพต่ำ / สายไฟลอดใต้พื้น-พรม', crit: true },
        { k: 'charge', l: 'ร้านมือถือ / Power Bank / แบตเตอรี่: ไม่ชาร์จทิ้งไว้ข้ามคืน ไม่วางทับกัน', crit: true },
        { k: 'heat', l: 'ไม่มีอุปกรณ์ความร้อน (กาต้มน้ำ เตาไฟฟ้า ไดร์) ใช้โดยไม่ได้รับอนุญาต', crit: true },
        { k: 'stock', l: 'ไม่เก็บสินค้า / กล่องใต้เคาน์เตอร์ชิดสายไฟ หรือบนฝ้า' },
        { k: 'sign', l: 'ป้ายไฟ / โคมไฟร้านไม่ร้อนจัด ติดตั้งมั่นคง' },
        { k: 'off', l: 'ปิดไฟ / ถอดปลั๊กเมื่อปิดร้าน' }
    ] },
    { k: 'dock', l: 'ลานรับสินค้า · ชาร์จรถ Forklift / Reach Truck · ห้องขยะ · เครื่องอัดกล่อง', icon: '🚚', tape: true, items: [
        { k: 'charge', l: 'จุดชาร์จแบตรถยก: อากาศถ่ายเท ไม่มีกล่อง / พาเลทกองชิด มีป้ายห้ามสูบบุหรี่', crit: true },
        { k: 'pallet', l: 'พาเลทไม้ / กล่องเปล่า / ฟิล์มยืด ไม่กองสูง ไม่ชิดผนังอาคาร / ตู้ไฟ', crit: true },
        { k: 'waste', l: 'ห้องขยะ / เครื่องอัดกล่องสะอาด ขยะไม่ล้น ไม่มีการเผาขยะ', crit: true },
        { k: 'smoke', l: 'มีจุดสูบบุหรี่ที่กำหนด ห่างวัสดุติดไฟ ไม่พบก้นบุหรี่ในพื้นที่' },
        { k: 'dock', l: 'Dock Leveller / ประตูม้วน: ตู้ควบคุมไม่ชำรุด ไม่มีน้ำมันรั่ว' }
    ] },
    { k: 'roof', l: 'หลังคา · Solar Rooftop · ห้อง AHU · Chiller Plant', icon: '☀️', items: [
        { k: 'solar', l: 'Solar: DC Combiner / Inverter ไม่มีรอยไหม้ สาย DC ไม่ห้อย ไม่ชำรุด ขั้วต่อ MC4 แน่น', crit: true },
        { k: 'ahu', l: 'ห้อง AHU / ห้องเครื่อง ไม่ใช้เก็บของ มอเตอร์ / ตู้ไฟไม่ร้อนผิดปกติ', crit: true },
        { k: 'debris', l: 'หลังคา / รางน้ำ ไม่มีขยะ ใบไม้ กล่อง สะสม' },
        { k: 'chiller', l: 'Chiller / Cooling Tower: ตู้ไฟปิดฝา ไม่มีน้ำมัน / สารทำความเย็นรั่ว' },
        { k: 'access', l: 'ทางขึ้นหลังคาปิดล็อก มีป้ายเตือน และเข้าถึงได้เมื่อฉุกเฉิน' }
    ] },
    { k: 'out', l: 'ภายนอกอาคาร · ป้าย Pylon · ลานจอดรถ · ถังแก๊ส LPG · EV Charger', icon: '🅿️', items: [
        { k: 'pylon', l: 'ป้าย Pylon / ป้ายไฟหน้าอาคาร: ตู้ไฟ / Driver ไม่ชำรุด ไม่มีรอยไหม้', crit: true },
        { k: 'lpg', l: 'ถังแก๊ส LPG / Manifold: มีรั้วกั้น ป้ายห้ามสูบบุหรี่ ห่างท่อระบายน้ำ / ประตู', crit: true },
        { k: 'ev', l: 'EV Charger: ตู้ไฟ / หัวชาร์จไม่ชำรุด มีเบรกเกอร์กันดูด ไม่มีของกองชิด' },
        { k: 'grass', l: 'ไม่มีหญ้าแห้ง / ขยะกองใกล้อาคาร หม้อแปลง หรือถังแก๊ส' },
        { k: 'access', l: 'ทางเข้ารถดับเพลิง / หัวรับน้ำดับเพลิง (Siamese) ไม่ถูกกีดขวาง' }
    ] }
];

// Store-wide fire protection (one per survey). t: 'sel' (choose from o) | 'num' | 'date'. bad: answers that are a risk.
var HYPER_FI_PROT = [
    { k: 'alarm', l: 'ตู้ควบคุมแจ้งเหตุเพลิงไหม้ (FCP)', t: 'sel', o: ['ปกติ ไม่มี Trouble / Fault', 'มี Trouble / Fault ค้าง', 'ปิดบางโซน (Disable)', 'ไม่มีระบบ'], bad: [1, 2, 3] },
    { k: 'sprSales', l: 'สปริงเกอร์ — พื้นที่ขาย Big C', t: 'sel', o: ['ครอบคลุมทั้งหมด', 'บางส่วน', 'ไม่มี'], bad: [1, 2] },
    { k: 'sprPlaza', l: 'สปริงเกอร์ — Plaza / Town Center', t: 'sel', o: ['ครอบคลุมทั้งหมด', 'บางส่วน', 'ไม่มี', 'ไม่มี Plaza'], bad: [1, 2] },
    { k: 'sprStock', l: 'สปริงเกอร์ — คลังสินค้า / หลังร้าน', t: 'sel', o: ['ครอบคลุมทั้งหมด', 'บางส่วน', 'ไม่มี'], bad: [1, 2] },
    { k: 'pump', l: 'ปั๊มน้ำดับเพลิง / ถังน้ำสำรอง', t: 'sel', o: ['พร้อมใช้ (Auto)', 'อยู่ในโหมด Manual / Off', 'ชำรุด', 'ไม่มี'], bad: [1, 2] },
    { k: 'extTotal', l: 'ถังดับเพลิงทั้งสาขา (ถัง)', t: 'num' },
    { k: 'extBad', l: 'ถังดับเพลิงหมดอายุ / แรงดันต่ำ / หาไม่พบ (ถัง)', t: 'num', badIfPositive: true },
    { k: 'fhc', l: 'ตู้สายฉีดน้ำดับเพลิง (FHC)', t: 'sel', o: ['พร้อมใช้ทุกตู้', 'บางตู้ชำรุด / ถูกบัง', 'ไม่มี'], bad: [1] },
    { k: 'emLight', l: 'ไฟฉุกเฉิน / ป้ายทางออก (ทดสอบเดือนล่าสุด)', t: 'sel', o: ['ทำงานครบ', 'เสียบางจุด', 'ไม่ได้ทดสอบ'], bad: [1, 2] },
    { k: 'exits', l: 'ทางหนีไฟ / ประตูหนีไฟทั้งอาคาร', t: 'sel', o: ['โล่ง ใช้งานได้', 'มีสิ่งกีดขวาง / ล็อกบางจุด'], bad: [1] },
    { k: 'drill', l: 'ซ้อมอพยพหนีไฟครั้งล่าสุด', t: 'date' },
    { k: 'team', l: 'ทีมดับเพลิงขั้นต้น (คนที่ผ่านการอบรม / กะ)', t: 'num' },
    { k: 'plan', l: 'ผังอพยพ / จุดรวมพล ติดประกาศและเป็นปัจจุบัน', t: 'sel', o: ['มี เป็นปัจจุบัน', 'มี แต่ไม่เป็นปัจจุบัน', 'ไม่มี'], bad: [1, 2] },
    { k: 'tenantRule', l: 'ร้านค้าเช่าได้รับแจ้ง / ลงนามกฎความปลอดภัยไฟฟ้า-อัคคีภัย', t: 'sel', o: ['ครบทุกร้าน', 'บางร้าน', 'ยังไม่ได้แจ้ง'], bad: [1, 2] }
];

var HYPER_FI_RESULTS = ['ok', 'risk', 'na'];
var HYPER_FI_SEVERITY = ['สูง (อาจเกิดเพลิงไหม้ / ลุกลามเร็ว)', 'กลาง', 'ต่ำ'];
var HYPER_FI_ACTIONS = ['ย้าย / จัดเก็บสิ่งของออกแล้ว', 'ตีเทปแดง-ดำ กำหนดพื้นที่ห้ามวาง', 'ปิดฝา / ซ่อมเล็กน้อยแล้ว', 'ตัดไฟ / หยุดใช้ชั่วคราว',
    'แจ้ง MTN / ผู้รับเหมาซ่อม', 'แจ้งร้านค้าเช่าแก้ไข', 'ต้องของบประมาณ / แจ้ง HO', 'อื่นๆ'];
var HYPER_FI_STATUS = ['แก้ไขแล้ว', 'ลดความเสี่ยงชั่วคราว', 'รอดำเนินการ'];
// Store rating: worst open risk decides. Re-check interval (days) suggested per colour.
var HYPER_FI_COLORS = [
    { k: 'GRE', l: 'ปลอดภัย', hex: '#16a34a', recheck: 30 },
    { k: 'YEL', l: 'เฝ้าระวัง', hex: '#ca8a04', recheck: 30 },
    { k: 'ORG', l: 'ต้องแก้ไข', hex: '#ea580c', recheck: 14 },
    { k: 'RED', l: 'เสี่ยงสูง แก้ทันที', hex: '#dc2626', recheck: 7 }
];

function _hfiTxt_(v, m) { return String(v == null ? '' : v).trim().substring(0, m || 120); }
function _hfiInt_(v) { var n = parseInt(v, 10); return isNaN(n) || n < 0 ? 0 : n; }
function _hfiPick_(v, list) { return list.indexOf(v) > -1 ? v : ''; }
function _hfiDate_(v) { v = String(v || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }
function _hfiZone_(k) { for (var i = 0; i < HYPER_FI_ZONES.length; i++) if (HYPER_FI_ZONES[i].k === k) return HYPER_FI_ZONES[i]; return null; }
function _hfiUrls_(a) { return (Array.isArray(a) ? a : []).filter(function(u) { return /^https:\/\//.test(String(u)); }).slice(0, 6).map(String); }

function _hfiParse_(raw) {
    var o = raw;
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { o = {}; } }
    if (!o || typeof o !== 'object') o = {};
    var cards = (Array.isArray(o.cards) ? o.cards : []).slice(0, 120).map(function(c, i) {
        var z = _hfiZone_(c.z);
        if (!z) return null;
        var items = {};
        if (!c.none) z.items.forEach(function(it) {
            var a = (c.items || {})[it.k] || {};
            var r = _hfiPick_(a.r, HYPER_FI_RESULTS);
            items[it.k] = r === 'risk'
                ? { r: r, sev: _hfiPick_(a.sev, HYPER_FI_SEVERITY) || (it.crit ? HYPER_FI_SEVERITY[0] : HYPER_FI_SEVERITY[1]), act: _hfiPick_(a.act, HYPER_FI_ACTIONS),
                    st: _hfiPick_(a.st, HYPER_FI_STATUS), due: _hfiDate_(a.due), nt: _hfiTxt_(a.nt, 300), was: _hfiPick_(a.was, HYPER_FI_STATUS) }
                : { r: r };
        });
        return { cid: _hfiTxt_(c.cid, 12) || ('C' + String(i + 1).padStart(2, '0')), z: z.k, place: _hfiTxt_(c.place, 80), floor: _hfiTxt_(c.floor, 20),
                 none: !!c.none, tape: !!(z.tape && c.tape), nt: _hfiTxt_(c.nt, 300), items: items, prevB: _hfiUrls_(c.prevB), prevId: _hfiTxt_(c.prevId, 40) };
    }).filter(Boolean);
    var prot = {};
    HYPER_FI_PROT.forEach(function(p) {
        var v = (o.prot || {})[p.k];
        prot[p.k] = p.t === 'sel' ? _hfiPick_(v, p.o) : p.t === 'num' ? (v === '' || v == null ? '' : _hfiInt_(v)) : _hfiDate_(v);
    });
    return { cards: cards, prot: prot, recheck: _hfiDate_(o.recheck), prevId: _hfiTxt_(o.prevId, 40) };
}

// Every risk with where it is — the basis for counts, the rating, the email and the open-risk register.
function _hfiRisks_(d) {
    var out = [];
    d.cards.forEach(function(c) {
        var z = _hfiZone_(c.z);
        z.items.forEach(function(it) {
            var a = c.items[it.k];
            if (a && a.r === 'risk') out.push({ zone: z.l, z: z.k, place: c.place, cid: c.cid, item: it.l, k: it.k, sev: a.sev, act: a.act, st: a.st, due: a.due, nt: a.nt, open: a.st !== HYPER_FI_STATUS[0] });
        });
    });
    return out;
}
function _hfiProtBad_(d) {
    return HYPER_FI_PROT.filter(function(p) {
        var v = d.prot[p.k];
        if (p.badIfPositive) return v > 0;
        return p.bad && v !== '' && p.bad.indexOf(p.o.indexOf(v)) > -1;
    });
}
// RED = an open high risk or a dead alarm / fire pump · ORG = an open medium risk or a protection gap ·
// YEL = only open low risks or temporary fixes · GRE = nothing open.
function _hfiRating_(d, risks) {
    var open = risks.filter(function(r) { return r.open; }), S = HYPER_FI_SEVERITY;
    var pb = _hfiProtBad_(d).map(function(p) { return p.k; });
    var protRed = pb.indexOf('alarm') > -1 || pb.indexOf('pump') > -1 || pb.indexOf('exits') > -1;
    if (open.some(function(r) { return r.sev === S[0] && r.st !== HYPER_FI_STATUS[1]; }) || protRed) return 'RED';
    if (open.some(function(r) { return r.sev === S[1] && r.st !== HYPER_FI_STATUS[1]; }) || pb.length) return 'ORG';
    if (open.length) return 'YEL';
    return 'GRE';
}
function _hfiColor_(k) { for (var i = 0; i < HYPER_FI_COLORS.length; i++) if (HYPER_FI_COLORS[i].k === k) return HYPER_FI_COLORS[i]; return HYPER_FI_COLORS[0]; }

function _hfiExtraColumns_(form) {
    if (form.fireJson === undefined) return {};   // comment-only edits never wipe the survey
    var d = _hfiParse_(form.fireJson);
    var json = JSON.stringify(d);
    if (json.length > 48000) throw new Error('ข้อมูลมากเกินไปสำหรับ 1 รายการ กรุณาลดจำนวนการ์ด หรือแบ่งส่ง 2 รายการ');
    var risks = _hfiRisks_(d), S = HYPER_FI_SEVERITY, ST = HYPER_FI_STATUS, A = HYPER_FI_ACTIONS;
    var open = risks.filter(function(r) { return r.open; });
    var checked = 0;
    d.cards.forEach(function(c) { Object.keys(c.items).forEach(function(k) { if (c.items[k].r) checked++; }); });
    var color = _hfiRating_(d, risks), col = _hfiColor_(color);
    var zones = {};
    open.forEach(function(r) { zones[r.zone] = (zones[r.zone] || 0) + 1; });
    var sevOrder = function(s) { return S.indexOf(s); };
    var openList = open.slice().sort(function(a, b) { return sevOrder(a.sev) - sevOrder(b.sev) || String(a.due).localeCompare(String(b.due)); }).slice(0, 60)
        .map(function(r) { return [r.zone, r.place, r.item, r.sev.split(' ')[0], r.st, r.due, r.act]; });
    var recheck = d.recheck || Utilities.formatDate(new Date(Date.now() + col.recheck * 864e5), 'Asia/Bangkok', 'yyyy-MM-dd');
    var pb = _hfiProtBad_(d);
    return {
        // set server-side only (processHyperFiSurveyVendor) — a staff submission can never claim a vendor
        'Submitted Via': form.vendorCompany ? 'Vendor Portal' : 'Staff',
        'Vendor Company': form.vendorCompany || '',
        'Fire Rating': color,
        'Areas': d.cards.filter(function(c) { return !c.none; }).length,
        'Items Checked': checked,
        'Risks Found': risks.length,
        'High Risks': risks.filter(function(r) { return r.sev === S[0]; }).length,
        'Open Risks': open.length,
        'Open High': open.filter(function(r) { return r.sev === S[0]; }).length,
        'Fixed': risks.filter(function(r) { return r.st === ST[0]; }).length,
        'Temporary Fix': risks.filter(function(r) { return r.st === ST[1]; }).length,
        'Need HO Budget': open.filter(function(r) { return r.act === A[6]; }).length,
        'Tenant Actions': open.filter(function(r) { return r.act === A[5]; }).length,
        'Tape Zones': d.cards.filter(function(c) { return c.tape; }).length,
        'Ceiling Wiring Risks': risks.filter(function(r) { return r.z === 'ceil' && (r.k === 'conduit' || r.k === 'joint' || r.k === 'old'); }).length,
        'Protection Gaps': pb.map(function(p) { return p.l; }).join(', '),
        'Sprinkler Sales': d.prot.sprSales, 'Sprinkler Plaza': d.prot.sprPlaza,
        'Alarm Panel': d.prot.alarm,
        'Extinguishers': d.prot.extTotal, 'Extinguishers Bad': d.prot.extBad,
        'Last Fire Drill': d.prot.drill,
        'Zones With Open Risk': Object.keys(zones).map(function(z) { return z.split(' /')[0].split(' (')[0] + ' ' + zones[z]; }).join(', '),
        'Next Re-check': recheck,
        'Re-check Of': d.prevId,
        'Open Risks_JSON': JSON.stringify(openList),
        'Fire_JSON': json
    };
}

function _hfiEmailExtra_(counts, esc) {
    var col = _hfiColor_(counts['Fire Rating']);
    var open = [];
    try { open = JSON.parse(counts['Open Risks_JSON'] || '[]'); } catch (e) {}
    var h = '<p style="margin:12px 0 4px;"><b>ผลประเมินความเสี่ยงอัคคีภัย</b> — <span style="background:' + col.hex + ';color:#fff;padding:2px 8px;border-radius:4px;font-weight:bold;">' + col.k + ' ' + col.l + '</span>' +
        ' · ตรวจ ' + counts['Areas'] + ' พื้นที่ / ' + counts['Items Checked'] + ' รายการ · พบความเสี่ยง ' + counts['Risks Found'] + ' (สูง ' + counts['High Risks'] + ')' +
        ' · แก้ไขแล้ว ' + counts['Fixed'] + ' · <b style="color:#b91c1c;">ค้าง ' + counts['Open Risks'] + ' (สูง ' + counts['Open High'] + ')</b> · นัดตรวจซ้ำ ' + esc(counts['Next Re-check']) + '</p>' +
        (counts['Protection Gaps'] ? '<p style="margin:4px 0;color:#b91c1c;"><b>ระบบป้องกันที่ต้องแก้:</b> ' + esc(counts['Protection Gaps']) + '</p>' : '');
    if (!open.length) return h + '<p style="margin:4px 0;color:#166534;">✅ ไม่มีความเสี่ยงค้าง</p>';
    var td = 'padding:4px;border-bottom:1px solid #f1f5f9;';
    h += '<table style="width:100%;border-collapse:collapse;font-size:11px;"><tr style="background:#fef2f2;text-align:left;"><th style="padding:4px;">พื้นที่</th><th style="padding:4px;">ความเสี่ยง</th><th style="padding:4px;">ระดับ · สถานะ · กำหนด</th></tr>';
    open.forEach(function(r) {
        h += '<tr><td style="' + td + '">' + esc(r[0].split(' (')[0] + (r[1] ? ' · ' + r[1] : '')) + '</td><td style="' + td + '">' + esc(r[2]) + (r[6] ? '<br><span style="color:#64748b;">→ ' + esc(r[6]) + '</span>' : '') + '</td>' +
            '<td style="' + td + (r[3] === 'สูง' ? 'color:#b91c1c;font-weight:bold;' : '') + '">' + esc(r[3] + ' · ' + (r[4] || '-') + (r[5] ? ' · ' + r[5] : '')) + '</td></tr>';
    });
    return h + '</table>';
}

var HYPER_FI_DEF = {
    name: 'Hyper Fire Prevention Survey', emoji: '🧯',
    sheet: HYPER_FI_SHEET, folder: HYPER_FI_FOLDER,
    idPrefix: 'HFI', keyPrefix: 'hfi_', photoFilePrefix: 'hyperfire', headerColor: '#dc2626',
    brokenLabel: 'จุดเสี่ยงสูงที่ต้องแก้ทันที',
    histType: 'Fi',
    categories: [], system: [], groups: [],
    grandTotal: { label: '', header: '' },
    catTemp: { a: { suffix: 'a', headerSuffix: ' a', label: '-' }, b: { suffix: 'b', headerSuffix: ' b', label: '-' }, rule: 'gap', threshold: 999 },
    extraColumns: _hfiExtraColumns_,
    emailExtra: _hfiEmailExtra_,
    listSkip: ['Fire_JSON']
};

function getHyperFiConfig_() {
    return { zones: HYPER_FI_ZONES, prot: HYPER_FI_PROT, severity: HYPER_FI_SEVERITY, actions: HYPER_FI_ACTIONS, status: HYPER_FI_STATUS, colors: HYPER_FI_COLORS };
}
function processHyperFiSurveyForm(form) { if (form) delete form.vendorCompany; return hyperSurveySubmit_(HYPER_FI_DEF, form); }

// ── Vendor Portal access (?page=vendor-fire&t=<pass>) ────────────────────────────────────────────
// The Vendor Portal (KPI/CMS/GAS Vender Portal, vendorIssueFirePass) writes a random, 12-hour pass into
// this spreadsheet's Vendor_Fire_Passes tab — it already writes to this workbook — listing the store codes
// the vendor serves (stores with any CMS job of theirs). No shared secret: the pass row IS the proof.
// Vendor submissions go through the normal engine, so they count in the schedule, start as review
// "Pending", and are tagged 'Submitted Via' = Vendor Portal + 'Vendor Company'.
var VENDOR_FIRE_PASS_SHEET = 'Vendor_Fire_Passes';
var VENDOR_FIRE_PASS_HEADERS = ['Token', 'Created At', 'Expires At', 'Supplier Code', 'Supplier Name', 'Email', 'Phone', 'Store Codes', 'Status', 'Last Used'];

function _vfpGet_(token) {
    token = String(token || '').trim();
    if (!/^[A-Za-z0-9]{24,80}$/.test(token)) return null;
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(VENDOR_FIRE_PASS_SHEET);
    if (!sh || sh.getLastRow() < 2) return null;
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, VENDOR_FIRE_PASS_HEADERS.length).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
        var r = vals[i];
        if (String(r[0]) !== token) continue;
        var exp = r[2] instanceof Date ? r[2] : new Date(r[2]);
        if (String(r[8] || 'active').toLowerCase() !== 'active' || isNaN(exp) || exp < new Date()) return null;
        var codes = [];
        try { codes = JSON.parse(r[7] || '[]'); } catch (e) {}
        return { row: i + 2, code: String(r[3]), name: String(r[4]), email: String(r[5]), phone: String(r[6]), codes: codes.map(String), exp: exp };
    }
    return null;
}
// The pass lists CMS store codes (gold); the Hyper list uses 6-digit branch codes → map, never add/strip "1".
function _vfpHyperStores_(pass) {
    var want = {}, ix = _fuStoreIndex_();
    pass.codes.forEach(function(c) {
        c = String(c).trim(); want[c] = 1;
        var db = ix.byGold[c]; if (db && /^\d{6}$/.test(String(db.oracle || ''))) want[String(db.oracle)] = 1;
        if (ix.goldToBranch[c]) want[ix.goldToBranch[c]] = 1;
    });
    return HYPER_REF_STORES.filter(function(s) { return want[String(s[0]).trim()]; });
}
function _vfpTouch_(pass) {
    try { SpreadsheetApp.getActiveSpreadsheet().getSheetByName(VENDOR_FIRE_PASS_SHEET).getRange(pass.row, 10).setValue(new Date()); } catch (e) {}
}

function getVendorFirePass(token) {
    try {
        var pass = _vfpGet_(token);
        if (!pass) return { success: false, error: 'ลิงก์หมดอายุหรือไม่ถูกต้อง — กรุณาเปิดใหม่จาก Vendor Portal' };
        var stores = _vfpHyperStores_(pass), ix = _fuStoreIndex_(), info = {};
        stores.forEach(function(s) { var db = ix.hyperDb(s[0]); if (db) info[s[0]] = { ammMtn: db.ammMtn || '', dmName: db.dmName || '', cmName: db.cmName || '' }; });
        return { success: true, vendor: { code: pass.code, name: pass.name, email: pass.email, phone: pass.phone }, stores: stores, storeDb: info,
                 expires: Utilities.formatDate(pass.exp, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm') };
    } catch (e) { return { success: false, error: e.toString() }; }
}
function _vfpCheckStore_(token, code) {
    var pass = _vfpGet_(token);
    if (!pass) return { error: 'ลิงก์หมดอายุ — กรุณาเปิดใหม่จาก Vendor Portal' };
    code = String(code || '').trim();
    if (!_vfpHyperStores_(pass).some(function(s) { return String(s[0]).trim() === code; })) return { error: 'สาขานี้ไม่อยู่ในความรับผิดชอบของผู้รับเหมา' };
    return { pass: pass };
}
function processHyperFiSurveyVendor(token, form) {
    var chk = _vfpCheckStore_(token, form && form.branchCode);
    if (chk.error) return { success: false, error: chk.error };
    form.vendorCompany = chk.pass.name || chk.pass.code;
    form.reporterEmail = chk.pass.email || '';
    _vfpTouch_(chk.pass);
    return hyperSurveySubmit_(HYPER_FI_DEF, form);
}
function getHyperFiLatestForStoreVendor(token, code) {
    var chk = _vfpCheckStore_(token, code);
    if (chk.error) return { success: false, error: chk.error };
    return getHyperFiLatestForStore(code);
}
function getHyperFiSurveyList(includeArchive) { var r = hyperSurveyList_(HYPER_FI_DEF, includeArchive); r.fiConfig = getHyperFiConfig_(); return r; }
function getHyperFiSurveyRecordById(id) {
    var r = hyperSurveyRecordById_(HYPER_FI_DEF, id);
    if (r.success) { try { r.data.Fire_JSON = JSON.parse(r.data.Fire_JSON || '{}'); } catch (e) { r.data.Fire_JSON = {}; } r.fiConfig = getHyperFiConfig_(); }
    return r;
}
function updateHyperFiSurveyRecord(form) { return hyperSurveyUpdate_(HYPER_FI_DEF, form); }
function deleteHyperFiSurveyRecord(id, clientEmail) { return hyperSurveyDelete_(HYPER_FI_DEF, id, clientEmail); }
function addHyperFiSurveyPhotos(id, unitKey, files, clientEmail) { return hyperSurveyAddPhotos_(HYPER_FI_DEF, id, unitKey, files, clientEmail); }
function deleteHyperFiSurveyPhoto(id, unitKey, url, clientEmail) { return hyperSurveyDeletePhoto_(HYPER_FI_DEF, id, unitKey, url, clientEmail); }

// Re-check: the store's latest survey, with each card's earlier "before" photos resolved to URLs so they carry over.
function getHyperFiLatestForStore(branchCode) {
    try {
        var code = String(branchCode || '').trim();
        var list = hyperSurveyList_(HYPER_FI_DEF, false);
        var rows = ((list && list.data) || []).filter(function(r) { return String(r['Branch Code']).trim() === code; });
        if (!rows.length) return { success: true, found: false };
        rows.sort(function(a, b) { return new Date(b['Timestamp']) - new Date(a['Timestamp']); });
        var rec = getHyperFiSurveyRecordById(rows[0]['ID']);
        if (!rec.success) return rec;
        var att = rec.data['Attachments_JSON'] || {};
        if (typeof att === 'string') { try { att = JSON.parse(att); } catch (e) { att = {}; } }
        var d = rec.data.Fire_JSON || {};
        (d.cards || []).forEach(function(c) {
            c.prevB = _hfiUrls_((c.prevB || []).concat(att[HYPER_FI_DEF.keyPrefix + c.cid + '_b'] || []).concat(att[HYPER_FI_DEF.keyPrefix + c.cid + '_a'] || []));
        });
        return { success: true, found: true, id: rec.data['ID'], ts: rec.data['Timestamp'], rating: rec.data['Fire Rating'], name: rec.data['Branch Name'] || '', fire: d };
    } catch (e) { return { success: false, error: e.toString() }; }
}

// For the AI executive summary (ModuleRegistry.gs HYPER_MODULE_SUMMARY): latest survey per store.
function _hfiExecSummary_() {
    var list = hyperSurveyList_(HYPER_FI_DEF, false), seen = {}, latest = [];
    ((list && list.data) || []).slice().sort(function(a, b) { return new Date(b['Timestamp']) - new Date(a['Timestamp']); }).forEach(function(r) {
        var c = String(r['Branch Code']).trim(); if (!c || seen[c]) return; seen[c] = 1; latest.push(r);
    });
    var rating = { RED: 0, ORG: 0, YEL: 0, GRE: 0 }, zones = {}, red = [], sum = function(k) { return latest.reduce(function(a, r) { return a + (parseInt(r[k], 10) || 0); }, 0); };
    var today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd'), overdue = 0, spr = {};
    latest.forEach(function(r) {
        rating[r['Fire Rating']] = (rating[r['Fire Rating']] || 0) + 1;
        if (r['Fire Rating'] === 'RED') red.push(r['Branch Code'] + ' ' + r['Branch Name'] + ' (ค้างสูง ' + (r['Open High'] || 0) + ')');
        String(r['Zones With Open Risk'] || '').split(', ').filter(Boolean).forEach(function(z) { var m = z.match(/^(.*) (\d+)$/); if (m) zones[m[1]] = (zones[m[1]] || 0) + parseInt(m[2], 10); });
        if (r['Next Re-check'] && String(r['Next Re-check']).slice(0, 10) < today && parseInt(r['Open Risks'], 10) > 0) overdue++;
        var s = r['Sprinkler Sales'] || '-'; spr[s] = (spr[s] || 0) + 1;
    });
    return { storesSurveyed: latest.length, storesTotal: HYPER_REF_STORES.length, rating: rating, openRisks: sum('Open Risks'), openHigh: sum('Open High'),
             fixed: sum('Fixed'), needHoBudget: sum('Need HO Budget'), tenantActions: sum('Tenant Actions'), ceilingWiringRisks: sum('Ceiling Wiring Risks'),
             extinguishersBad: sum('Extinguishers Bad'), recheckOverdue: overdue, sprinklerSalesFloor: spr, openRisksByZone: zones, redStores: red.slice(0, 20) };
}
