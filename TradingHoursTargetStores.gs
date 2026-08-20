// --- Trading Hours Conversion Survey: target-store allowlist (Phase 1 / Phase 2) ---
// Operation is converting stores from 3-shift (24hr) to 2-shift operation — Phase 1
// (107 stores, target 1 Sept 2026) list confirmed via "BCM - Shortlisted Stores for
// Store Trading Hours Project.xlsx" (meeting 19 Aug 2026). Phase 2 (173 stores) list
// not available yet — added later via upsertTradingHoursTargetStore() once provided.
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
