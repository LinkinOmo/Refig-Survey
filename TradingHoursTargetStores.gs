// --- Trading Hours Conversion Survey: target-store allowlist (Phase 1 / Phase 2) ---
// Operation is converting stores from 3-shift (24hr) to 2-shift operation — Phase 1
// (107 stores, target 1 Sept 2026) list confirmed via "BCM - Shortlisted Stores for
// Store Trading Hours Project.xlsx" (meeting 19 Aug 2026). Phase 2 (133 stores, start
// date TBD) seeded via setupTradingHoursPhase2Stores() from BCM's 30 Sep 2026 email.
// Same shape as LayoutTargetStores.gs's allowlist, but phase/target-date instead of
// ASIS/To-Be reference docs.

var TRADING_HOURS_TARGET_STORES_SHEET = "Trading_Hours_Target_Stores";

// One-time admin seeder — run once from the Apps Script editor. Re-running replaces
// the whole sheet, so any Phase 2 rows added via upsertTradingHoursTargetStore() in
// the meantime would be lost; only re-run intentionally.
function setupTradingHoursTargetStores() {
    var PHASE1_STORES = [
        ['21019', 'MBCหมู่บ้านทิพย์พิมาน'],
        ['21057', 'MBCวัชรพล'],
        ['21068', 'MBCเคหะรามอินทรา'],
        ['21149', 'MBCตลาดคุณตาพลอย'],
        ['21210', 'MBCศรีประจันต์'],
        ['21212', 'MBCหนองม่วง'],
        ['21270', 'MBCศาลาลำดวน'],
        ['21290', 'MBCสินสาคร'],
        ['21314', 'MBCเอื้ออาทรบางขุนเทียน'],
        ['21417', 'MBCหัวกุญแจบ้านบึง'],
        ['21418', 'MBCคาลเท็กซ์ฟ้าฮ่าม'],
        ['21447', 'MBCสัตหีบพลาซ่า'],
        ['21453', 'MBC โรงพยาบาล ลำพูน'],
        ['21468', 'MBCราชภัฎสุราษฏร์ธานี'],
        ['21485', 'MBCมาบยางพร'],
        ['21496', 'MBCไร่กล้วย ศรีราชา'],
        ['21509', 'MBCหน้าค่ายวิภาวดีรังสิต'],
        ['21514', 'MBCเคหะมาบตาพุด'],
        ['21487', 'MBCบ้านคลอง'],
        ['21524', 'MBCหมู่บ้านการการุณรังษี'],
        ['21561', 'MBCเอกชัย 46'],
        ['21597', 'MBCบางพระ'],
        ['21599', 'MBCโนนม่วง'],
        ['21600', 'MBCเทียนทะเล 20'],
        ['21604', 'MBCเอื้ออาทร บางโฉลง'],
        ['21623', 'MBCตลาดไนท์ พิมาย'],
        ['21635', 'MBCเทศบาลตำบลเวียงสระ'],
        ['21644', 'MBCตลาดลอนดอน บางโทรัด'],
        ['21652', 'MBCถนนปลายบาง'],
        ['21650', 'MBCเขาไม้แก้ว'],
        ['21671', 'MBCน้ำพองนอก'],
        ['21681', 'MBCถนนราชมนตรี สาย1'],
        ['21708', 'MBCเอสโซ่ แสมดำ พระราม2'],
        ['21745', 'MBCปาดังเบซาร์, สงขลา'],
        ['21739', 'MBCเอสโซ่ บางบัวทอง, นนทบุรี'],
        ['21816', 'MBCคอนสวรรค์ , ชัยภูมิ'],
        ['21817', 'MBCตลาดเจ้าหลาว,จันทบุรี'],
        ['21858', 'MBCถนนสามัคคี, นนทบุรี'],
        ['21866', 'MBC สอยดาว,จันทบุรี'],
        ['21889', 'MBCกันทรวิชัย, มหาสารคาม'],
        ['21923', 'MBCบ้านลภาวัน10, นนทบุรี'],
        ['21907', 'MBCแยกช่อระกา, ชัยภูมิ'],
        ['21834', 'MBCสนามชัยเขต, ฉะเชิงเทรา (New)'],
        ['21976', 'MBCสวี, ชุมพร'],
        ['21967', 'MBCซอยจตุโชติ11, กรุงเทพฯ'],
        ['21993', 'MBCสาขาถนนสามชัย (หาดใหญ่ ), สงขลา'],
        ['22034', 'MBCตลาดมรกต2, ชุมพร'],
        ['22057', 'MBCอำเภอท่าม่วง, กาญจนบุรี'],
        ['22025', 'MBC ตลาดรถไฟปราณบุรี,ประจวบคีรีขันธ์'],
        ['22066', 'MBC ชุมชนพยูน-บ้านฉาง,ระยอง'],
        ['22067', 'MBC บางคูลัด, นนทบุรี'],
        ['22070', 'MBC ตาพระยา, สระแก้ว'],
        ['22076', 'MBC อ่างศิลาสามมุก, ชลบุรี'],
        ['22119', 'MBCหนอง ซ้ำซาก, ชลบุรี'],
        ['22106', 'MBC หมู่บ้านรติรมย์พารค์, นนทบุรี'],
        ['22147', 'MBC สุขาภิบาล 5 ซอย 32, กรุงเทพมหานคร'],
        ['22164', 'MBC บ่อไร่, ตราด'],
        ['22145', 'MBC วงแหวนบางขุนเทียน, กรุงเทพฯ'],
        ['22180', 'MBC โกลเด้นเพลส บางใหญ่, นนทบุรี'],
        ['22187', 'MBC สาขาบ้านสะพลี, ชุมพร'],
        ['22146', 'MBC ห้วยท่าช้าง, เพชรบุรี'],
        ['22190', 'MBC มาบยางพร บึงประดิษฐ์,ระยอง'],
        ['22204', 'MBC เลียบคลองภาษีเจริญฝั่งเหนือ, กรุงเทพมหานคร'],
        ['22213', 'MBC สุขุมวิท-ระยอง38,ระยอง'],
        ['22220', 'MBC อำเภอกระบุรี,ระนอง'],
        ['22239', 'MBC บ้านนายาว, ฉะเชิงเทรา'],
        ['22254', 'MBC ซอยที่ดินบางบัวทอง, นนทบุรี'],
        ['22257', 'MBC ชุมชนวัดเฉลิมพระเกียรติ, นนทบุรี'],
        ['22258', 'MBC บางเลน-รัตนาธิเบศร์, นนทบุรี'],
        ['22261', 'MBC ตลาดทรัพย์พูลมา, สระบุรี'],
        ['22270', 'MBC ตลาดวังจันทร์, ระยอง'],
        ['22162', 'MBC หนองคอก ท่าตะเกียบ, ฉะเชิงเทรา'],
        ['22271', 'MBC สมชายพัฒณา, นนทบุรี'],
        ['22278', 'MBC ลาดปลาเค้า 44, กรุงเทพฯ'],
        ['22287', 'MBC ชุมชนในไร่, ระยอง'],
        ['22320', 'MBC เรณูนคร, นครพนม'],
        ['22323', 'MBC ตลาดนัดบุญศรี(ชากกอไผ่), ระยอง'],
        ['22335', 'MBC ตลาดเฮงทวี แก่งหางแมว, จันทบุรี'],
        ['22391', 'MBC โขดหิน-เขาไผ่, ระยอง'],
        ['22402', 'MBC บ้านนาสาร, สุราษฎร์ธานี'],
        ['22414', 'MBC หนองพังพวย, ชลบุรี'],
        ['22431', 'MBC บ้านไผ่แจ้งสนิท, ขอนแก่น'],
        ['22479', 'MBC ตลาดวังตาล, ลำพูน'],
        ['22489', 'MBC ละหานทราย, บุรีรัมย์'],
        ['22507', 'MBC เชียงคำ, พะเยา'],
        ['22537', 'บิ๊กซีมินิ เดว่าสิริโสธร, ฉะเชิงเทรา'],
        ['22542', 'บิ๊กซีมินิ ศรีธาตุ, ขอนแก่น'],
        ['22553', 'บิ๊กซีมินิ รามอินทรา67, กรุงเทพมหานคร'],
        ['22558', 'บิ๊กซีมินิ ภูทับเบิก, เพชรบูรณ์'],
        ['22565', 'บิ๊กซีมินิ ลับแล, อุตรดิตถ์'],
        ['22569', 'บิ๊กซีมินิ ไทรม้า, นนทบุรี'],
        ['22579', 'บิ๊กซีมินิ โรงพยาบาลน่าน, น่าน'],
        ['22610', 'บิ๊กซีมินิ หนองหลอด , ชัยภูมิ'],
        ['22635', 'บิ๊กซีมินิ บ้านฉลุง , สตูล'],
        ['22680', 'บิ๊กซีมินิ ลำปางบัสสเตชั่น , ลำปาง'],
        ['22701', 'บิ๊กซีมินิ สามกอ, พระนครศรีอยุธยา'],
        ['22704', 'บิ๊กซีมินิ ภูเวียง2,ขอนแก่น'],
        ['22730', 'บิ๊กซีมินิ แม่น้ำคู้ซอย2,ระยอง'],
        ['22745', 'บิ๊กซีมินิ ชะอำบีช,เพชรบุรี'],
        ['22747', 'บิ๊กซีมินิ แจ้งวัฒนะ6, กรุงเทพมหานคร'],
        ['22752', 'บิ๊กซีมินิ เดินเพลินวิลเลจ,อุดรธานี'],
        ['22756', 'บิ๊กซีมินิ ตลาดบ้านกอก,ขอนแก่น'],
        ['22757', 'บิ๊กซีมินิ วันบัดเจท วงแหวนตะวันตก,เชียงราย'],
        ['22761', 'บิ๊กซีมินิ ชุมชนหนองไผ่,ขอนแก่น'],
        ['22770', 'บิ๊กซีมินิ สาขาถนนเจริญประดิษฐ์ซอย8,ปัตตานี'],
        ['22783', 'บิ๊กซีมินิ สาขาบ้านปาลัส,ปัตตานี'],
        ['22810', 'บิ๊กซีมินิ ถนนหัวดอน,ประจวบคีรีขันธ์']
    ];

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(TRADING_HOURS_TARGET_STORES_SHEET);
    if (sheet) { ss.deleteSheet(sheet); }
    sheet = ss.insertSheet(TRADING_HOURS_TARGET_STORES_SHEET);
    var headers = ["Store Code", "Store Name", "Phase", "Target Date"];
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    var hdrRng = sheet.getRange(1, 1, 1, headers.length);
    hdrRng.setBackground('#7c3aed');
    hdrRng.setFontColor('#ffffff');
    hdrRng.setFontWeight('bold');

    var rows = PHASE1_STORES.map(function(s) {
        return [s[0], s[1], "Phase 1", "2026-09-01"];
    });
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

    _invalidateTradingHoursTargetStoresCache();
    return { success: true, storeCount: rows.length };
}

// Phase 2 seeder — 133 stores from BCM email "แจ้งเตรียมความพร้อมปรับเปลี่ยนเวลาเปิด-ปิดสาขา
// จาก 24 Hrs. เป็น Non 24 Hrs. จำนวน 133 สาขา" (30 Sep 2026, attachment "BCM - Review of
// Shortlisted Stores for Operating Hours Change Phase 2_133 Stores"). All MBC, To-be hours
// 05.00-23.59. BCM has not set a start date yet, so Target Date is left blank (fill later
// via the report's จัดการสาขาเป้าหมาย modal). Unlike setupTradingHoursTargetStores(), this
// only replaces Phase 2 rows — Phase 1 rows are kept — so it is safe to re-run.
function setupTradingHoursPhase2Stores() {
    var PHASE2_STORES = [
        ['21027', 'MBCนิมิตรใหม่'],
        ['21030', 'MBCซอยหนองใหญ่ (มั่งมี ซิตี้)'],
        ['21035', 'MBCหลวงแพ่ง5'],
        ['21037', 'MBCหลวงแพ่ง1'],
        ['21067', 'MBCตลาดนำไทย'],
        ['21087', 'MBCบางกระดี่'],
        ['21126', 'MBCซอยเพชรบ้านสวน'],
        ['21150', 'MBCวัดไทรม้า'],
        ['21158', 'MBCตลาดลานทราย'],
        ['21160', 'MBCวัดบัวโรย'],
        ['21223', 'MBCสน.โคกคราม'],
        ['21257', 'MBCตำบลลำโพ'],
        ['21269', 'MBCซอยจตุรมิตร'],
        ['21275', 'MBCBCP  วิภาวดี กม.17'],
        ['21278', 'MBCBCP  จรัญสนิทวงศ์ 95/2'],
        ['21289', 'MBCเอื้ออาทรสมุทรปราการ'],
        ['21303', 'MBCเพชรเกษม 77'],
        ['21312', 'MBCวัดโพธิ์ทอง'],
        ['21317', 'MBCคูขวาง 6'],
        ['21401', 'MBC BCP  ศรีนครินทร์ - สมิติเวช'],
        ['21458', 'MBCศิริพลาซ่า'],
        ['21522', 'MBCตลาดโรงสี นาป่า'],
        ['21547', 'MBCโคกกรวด'],
        ['21651', 'MBCหมู่บ้านเมืองประชา'],
        ['21688', 'MBCตลาดหนองปรือ'],
        ['21697', 'MBCอมตะ เฟส6 บ้านเก่า'],
        ['21874', 'MBCตลาดบ้านพริก, นครนายก'],
        ['21826', 'MBC หมู่บ้านสรัญธร, กรุงเทพฯ  (New)'],
        ['21909', 'MBCหมู่บ้านศิริวรรณ-บางบัวทอง, นนทบุรี'],
        ['21921', 'MBCนาวัง(ตะเคียนเตี้ย), ชลบุรี'],
        ['22010', 'MBC วังตะไคร้-นางรอง,นครนายก'],
        ['22036', 'MBCบ้านโภชน์, เพชรบูรณ์'],
        ['22045', 'MBCเดอะ มิราเคิล พลัส เพชรเกษม 63, กรุงเทพมหานคร'],
        ['22021', 'MBCบางหัวเสือ, สมุทรปราการ'],
        ['22182', 'MBC หมู่บ้านสัมมากร ชัยพฤกษ์-วงแหวน, นนทบุรี'],
        ['22199', 'MBC วัดแหลมฟ้าผ่า, สมุทรปราการ'],
        ['22235', 'MBC สุขสวัสดิ์ 74, สมุทรปราการ'],
        ['22236', 'MBC ภูมิใจนิเวศน์ 3, สมุทรปราการ'],
        ['22264', 'MBC ตลาดนัดแม่เล้ง(บางคล้า), ฉะเชิงเทรา'],
        ['22267', 'MBC หมู่บ้านประดับดาว,นนทบุรี'],
        ['22284', 'MBC ไทรน้อย-ต้นเชือก, นนทบุรี'],
        ['22341', 'MBC บางบอน5, กรุงเทพฯ'],
        ['22350', 'MBC หนองน้ำเย็น, ระยอง'],
        ['22442', 'MBC ถนนบ้านกล้วย ไทรน้อย, นนทบุรี'],
        ['22568', 'บิ๊กซีมินิ ถนนเจ้าฟ้าสวนหลวง, ภูเก็ต'],
        ['22575', 'บิ๊กซีมินิ แก้วอินทร์มาร์เก็ต, นนทบุรี'],
        ['22578', 'บิ๊กซีมินิ งามวงศ์วาน25, นนทบุรี'],
        ['22604', 'บิ๊กซีมินิ บางโปรง, สมุทรปราการ'],
        ['22611', 'บิ๊กซีมินิ มหาวงษ์, สมุทรปราการ'],
        ['22634', 'บิ๊กซีมินิ บ้านแสงดาว, น่าน'],
        ['22649', 'บิ๊กซีมินิ ภูมิใจนิเวศน์ 10 , สมุทรปราการ'],
        ['22662', 'บิ๊กซีมินิ พัฒนาชนบท 4, กรุงเทพมหานคร'],
        ['22666', 'บิ๊กซีมินิ ซอยมัยลาภ 2, กรุงเทพมหานคร'],
        ['22691', 'บิ๊กซีมินิ หนองขอน ทับใต้ , ประจวบคีรีขันธ์'],
        ['22715', 'บิ๊กซีมินิ เคหะดอนเมือง, กรุงเทพมหานคร'],
        ['22719', 'บิ๊กซีมินิ ทีซีซีฝั่งตรงข้ามมหาวิทยาลัยเกษตรศาสตร์, กรุงเทพมหานคร'],
        ['22748', 'บิ๊กซีมินิ ตลาดนัดเกาะแก้ว,ภูเก็ต'],
        ['21016', 'MBCดอนหวาย'],
        ['21080', 'MBCหมู่บ้านมณีแก้ว'],
        ['21116', 'MBCตลาดศิริพนม'],
        ['21130', 'MBCศรีมหาโพธิ์'],
        ['21163', 'MBCนาพร้าว'],
        ['21183', 'MBCถนนปราจีนตคาม'],
        ['21204', 'MBCเทียนทะเล 28'],
        ['21211', 'MBCเสาไห้'],
        ['21307', 'MBCวัดพระญาติ'],
        ['21501', 'MBCแปลงยาว'],
        ['21497', 'MBCตลาดท่าทองใหม่'],
        ['21503', 'MBCถนน โพธิ์ทอง'],
        ['21550', 'MBCตลาดชัชวาล คลอง 7'],
        ['21573', 'MBCตลาดรถไฟ อยุธยา'],
        ['21603', 'MBCซอยมหาชัย'],
        ['21615', 'MBCตลาดหน้าศูนย์พัฒนา'],
        ['21628', 'MBCพิมานธานี'],
        ['21639', 'MBCสุขสวัสดิ์ 78'],
        ['21668', 'MBCมาบยางพร-วังตาผิน'],
        ['21679', 'MBCกิ่งแก้ว หนามแดง'],
        ['21699', 'MBCหาดราไวย์'],
        ['21838', 'MBC โรงไฟฟ้าพระนครใต้, สมุทปราการ   (New)'],
        ['21867', 'MBCสุขสวัสดิ์70 , สมุทรปราการ'],
        ['21884', 'MBCตลาดจิรกานต์, นนทบุรี'],
        ['21897', 'MBCทุ่งคา, ชลบุรี'],
        ['21917', 'MBCประชาอุทิศ-คู่สร้าง, สมุทรปราการ'],
        ['21934', 'MBCชุมชนวัดสะแก, อยุธยา'],
        ['21956', 'MBCผดุงพันธ์ ซอย13, กรุงเทพมหานคร'],
        ['21957', 'MBCตลาดกวางทอง, สระบุรี'],
        ['21977', 'MBCบ้านชุมทอง, บุรีรัมย์'],
        ['22049', 'MBCสังคม, หนองคาย'],
        ['22016', 'MBC อ่างเก็บน้ำบางพระ, ชลบุรี'],
        ['22063', 'MBCชลบุรีสเตเดี่ยม, ชลบุรี'],
        ['22075', 'MBC พฤกษา วิลเลจ 12, ปทุมธานี'],
        ['22090', 'MBCตลาดมารวย, นครปฐม'],
        ['22174', 'MBC อำเภอหนองจิก, ปัตตานี'],
        ['22198', 'MBCวิเศษสุขนคร เฟส2, สมุทรสาคร'],
        ['22083', 'MBC โรงพยาบาลกุมภวาปี, อุดรธานี'],
        ['22241', 'MBC  บางบอน3, กรุงเทพฯ'],
        ['22253', 'MBC หมู่บ้านเมืองยิ้ม สาย 7, นครปฐม'],
        ['22274', 'MBC คลองดื่อ-เขาใหญ่, นครราชสีมา'],
        ['22290', 'MBC วัดกลางบางปะกง, ฉะเชิงเทรา'],
        ['22321', 'MBC ถนนคนเดินเซาะกราว, บุรีรัมย์'],
        ['22345', 'MBC สันตินคร(บางนา ตราด), สมุทรปราการ'],
        ['22361', 'MBC แม่สะเรียง, แม่ฮ่องสอน'],
        ['22382', 'MBC ถนนนเรศวร, ลพบุรี'],
        ['22393', 'MBC ตาบา,นราธิวาส'],
        ['22405', 'MBC ป่าพะยอม, พัทลุง'],
        ['22478', 'MBC แลนด์มาร์ค, นครพนม'],
        ['22482', 'MBC หน้าหมู่บ้านแสนสราญ, เชียงใหม่'],
        ['22510', 'MBC แม่ทะ,ลำปาง'],
        ['22526', 'บิ๊กซีมินิ หมู่บ้านมังกรทอง, สิงห์บุรี'],
        ['22557', 'บิ๊กซีมินิ นายาวเขาค้อ, เพชรบูรณ์'],
        ['22563', 'บิ๊กซีมินิ คลองน้ำไหล, กำแพงเพชร'],
        ['22577', 'บิ๊กซีมินิ กาญจนาภิเษกซอย4, กรุงเทพมหานคร'],
        ['22599', 'บิ๊กซีมินิ ตลาดบิ๊กมาร์เก็ต, ชลบุรี'],
        ['22618', 'บิ๊กซีมินิ ถนนบางบ่อ คลองด่าน, สมุทรปราการ'],
        ['22639', 'บิ๊กซีมินิ ไลโอ สุขสวัสดิ์- ประชาอุทิศ 90, สมุทรปราการ'],
        ['22641', 'บิ๊กซีมินิ อำเภอพรหมคีรี , นครศรีธรรมราช'],
        ['22656', 'บิ๊กซีมินิ ถนนเทอดไท , กรุงเทพมหานคร'],
        ['22670', 'บิ๊กซีมินิ วังกะพี้, อุตรดิตถ์'],
        ['22675', 'บิ๊กซีมินิ ตลาดบ้านฝาง , ขอนแก่น'],
        ['22685', 'บิ๊กซีมินิ พระราม 9 ซอย 55 , กรุงเทพมหานคร'],
        ['22711', 'บิ๊กซีมินิ ประชาอุทิศ76 ,กรุงเทพมหานคร'],
        ['22753', 'บิ๊กซีมินิ ศุภาลัยนาเมือง,อุบลราชธานี'],
        ['22760', 'บิ๊กซีมินิ ทศกัณฑ์-บางแวก, กรุงเทพมหานคร'],
        ['21096', 'MBCตลาดสี่ขวา'],
        ['21140', 'MBC BCP  บรมฯ กม.15'],
        ['21143', 'MBCเคหะสระบุรี'],
        ['21225', 'MBCตลาดวัดม่วง'],
        ['21949', 'MBCตลาดเทศบาล ดงแคนใหญ่, ยโสธร'],
        ['22272', 'MBC มวกเหล็ก - เขาใหญ่, สระบุรี'],
        ['22266', 'MBC หัวตะพาน, อำนาจเจริญ'],
        ['22368', 'MBC เขื่อนป่าสักชลสิทธิ์, ลพบุรี'],
        ['22453', 'MBC พญาเม็งราย, เชียงราย'],
        ['22494', 'MBC แม่ใจ, พะเยา']
    ];

    var _wlock = _acquireWriteLock_();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(TRADING_HOURS_TARGET_STORES_SHEET);
    if (!sheet) return { success: false, error: "Target store sheet not found — run setupTradingHoursTargetStores() first" };

    var lastRow = sheet.getLastRow();
    var kept = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 4).getValues().filter(function(r) {
        return String(r[0]).trim() && r[2] !== 'Phase 2';
    }) : [];
    var rows = kept.concat(PHASE2_STORES.map(function(s) {
        return [s[0], s[1], "Phase 2", ""];
    }));

    if (lastRow >= 2) sheet.getRange(2, 1, lastRow - 1, 4).clearContent();
    sheet.getRange(2, 1, rows.length, 4).setNumberFormat('@').setValues(rows);

    _invalidateTradingHoursTargetStoresCache();
    return { success: true, phase2Count: PHASE2_STORES.length, keptCount: kept.length, totalCount: rows.length };
}

function _invalidateTradingHoursTargetStoresCache() {
    try { CacheService.getScriptCache().remove('TRADING_HOURS_TARGET_STORES_V1'); } catch (e) {}
}

// ─── Read (cached 10 min) — used by both the fill form and the report dashboard ──────
function getTradingHoursTargetStores() {
    try {
        try {
            var cached = CacheService.getScriptCache().get('TRADING_HOURS_TARGET_STORES_V1');
            if (cached) return { success: true, data: JSON.parse(cached) };
        } catch (e) {}

        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRADING_HOURS_TARGET_STORES_SHEET);
        if (!sheet || sheet.getLastRow() < 2) return { success: true, data: [] };

        var lastRow = sheet.getLastRow();
        var values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
        var data = values.map(function(row) {
            return { code: String(row[0]).trim(), name: row[1] || "", phase: row[2] || "", targetDate: row[3] || "" };
        }).filter(function(r) { return r.code; });

        try { CacheService.getScriptCache().put('TRADING_HOURS_TARGET_STORES_V1', JSON.stringify(data), 600); } catch (e) {}
        return { success: true, data: data };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Admin add / edit one store (Phase 2 stores added here once that list arrives) ───
function upsertTradingHoursTargetStore(code, name, phase, targetDate, clientEmail) {
    try {
        var _wlock = _acquireWriteLock_();
        var adminCheck = checkSurveyAdminStatus(clientEmail);
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin) {
            return { success: false, error: "Administrator privileges required." };
        }
        code = String(code || '').trim();
        if (!/^\d{4,6}$/.test(code)) return { success: false, error: "รหัสสาขาไม่ถูกต้อง (Invalid store code)" };
        if (phase !== 'Phase 1' && phase !== 'Phase 2') return { success: false, error: "Invalid phase" };

        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName(TRADING_HOURS_TARGET_STORES_SHEET);
        if (!sheet) {
            sheet = ss.insertSheet(TRADING_HOURS_TARGET_STORES_SHEET);
            sheet.appendRow(["Store Code", "Store Name", "Phase", "Target Date"]);
            sheet.setFrozenRows(1);
            var hdrRng = sheet.getRange(1, 1, 1, 4);
            hdrRng.setBackground('#7c3aed');
            hdrRng.setFontColor('#ffffff');
            hdrRng.setFontWeight('bold');
        }

        var lastRow = sheet.getLastRow();
        var rowIndex = -1;
        if (lastRow >= 2) {
            var codes = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
            for (var i = 0; i < codes.length; i++) {
                if (String(codes[i][0]).trim() === code) { rowIndex = i + 2; break; }
            }
        }
        var rowVals = [code, name || "", phase, targetDate || ""];
        if (rowIndex === -1) {
            sheet.appendRow(rowVals);
        } else {
            sheet.getRange(rowIndex, 1, 1, 4).setValues([rowVals]);
        }

        _invalidateTradingHoursTargetStoresCache();
        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Coverage grouped by AM (AMM MTN) — SMF/Admin oversight panel ────────────────
// Joins the target-store allowlist to the store master's "AMM MTN" column (same
// field ref/aircon/layout survey forms already resolve client-side via `match.ammMtn`
// — see getStoreDBDataV2() in TripPlan01.gs) and to the latest submission status per
// store from getTradingHoursSurveyListSlim(), so SMF/Admin can see which AM owns
// which not-yet-ready stores without cross-referencing three sheets by hand.
function getTradingHoursCoverageByAM() {
    try {
        var targetsRes = getTradingHoursTargetStores();
        if (!targetsRes.success) return { success: false, error: targetsRes.error };
        var targets = targetsRes.data;

        var storeMaster = getStoreDBDataV2();
        var ammByCode = {};
        storeMaster.forEach(function(s) { if (s.id) ammByCode[s.id] = s.ammMtn || ''; });

        var surveyRes = getTradingHoursSurveyListSlim();
        var statusByCode = {};
        if (surveyRes.success) {
            // getTradingHoursSurveyListSlim() returns newest-first — keep only the first
            // (latest) Pre-Conversion submission seen per store code. Post-Conversion
            // verification entries use a different Overall Status vocabulary ("ตรวจสอบผ่าน
            // (Verified OK)"/"พบปัญหา (Issue Found)") and must NOT be read as pre-conversion
            // readiness here, or a post-conversion visit would wrongly flip a ready store
            // back to "not-ready" on this panel. Legacy rows with no Survey Stage on file
            // are always Pre-Conversion.
            surveyRes.data.forEach(function(r) {
                var code = String(r['Branch Code'] || '').trim();
                if (!code || statusByCode[code]) return;
                var stage = r['Survey Stage'] || 'Pre-Conversion';
                if (stage !== 'Pre-Conversion') return;
                statusByCode[code] = (r['Overall Status'] === 'พร้อม (Ready)') ? 'ready' : 'not-ready';
            });
        }

        var byAM = {};
        targets.forEach(function(t) {
            var amm = ammByCode[t.code] || 'ไม่ระบุ AM (Unassigned)';
            if (!byAM[amm]) byAM[amm] = { amm: amm, stores: [] };
            byAM[amm].stores.push({
                code: t.code,
                name: t.name,
                phase: t.phase,
                targetDate: t.targetDate,
                status: statusByCode[t.code] || 'not-surveyed'
            });
        });

        var result = Object.keys(byAM).map(function(k) {
            var g = byAM[k];
            var stores = g.stores.sort(function(a, b) { return a.code.localeCompare(b.code); });
            var ready = stores.filter(function(s) { return s.status === 'ready'; }).length;
            var notReady = stores.filter(function(s) { return s.status === 'not-ready'; }).length;
            var notSurveyed = stores.filter(function(s) { return s.status === 'not-surveyed'; }).length;
            var total = stores.length;
            return {
                amm: g.amm, total: total, ready: ready, notReady: notReady, notSurveyed: notSurveyed,
                pct: total ? Math.round((ready / total) * 100) : 0, stores: stores
            };
        });
        // Worst coverage first — most not-ready/not-surveyed stores at the top.
        result.sort(function(a, b) { return (b.notReady + b.notSurveyed) - (a.notReady + a.notSurveyed); });

        return { success: true, data: result };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// Removes a store from the target list entirely (Admin). Only un-restricts that code
// from the Trading Hours Survey branch search — existing survey submissions for it
// are left untouched.
function removeTradingHoursTargetStore(code, clientEmail) {
    try {
        var _wlock = _acquireWriteLock_();
        var adminCheck = checkSurveyAdminStatus(clientEmail);
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin) {
            return { success: false, error: "Administrator privileges required." };
        }
        code = String(code || '').trim();
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRADING_HOURS_TARGET_STORES_SHEET);
        if (!sheet) return { success: false, error: "Sheet not found" };
        var lastRow = sheet.getLastRow();
        if (lastRow < 2) return { success: false, error: "Store not found" };
        var codes = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (var i = 0; i < codes.length; i++) {
            if (String(codes[i][0]).trim() === code) {
                sheet.deleteRow(i + 2);
                _invalidateTradingHoursTargetStoresCache();
                return { success: true };
            }
        }
        return { success: false, error: "Store not found" };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}
