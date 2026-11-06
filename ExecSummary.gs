// ============================================================
// ExecSummary.gs — AI executive summary of survey results (?page=exec-summary)
// ============================================================
// Same approach as the MNC People app's AI Summary report (GeminiService.js generateAISurveySummary):
// the server gathers REAL numbers from the chosen sources, the AI only writes the narrative and lays
// them out as one email-safe, inline-styled HTML page (executive summary first, stat tiles, one coloured
// section per source). Engine = DeepSeek via _fuAiRaw_ (FollowUpEmail.gs) — the same key/model the
// follow-up emails use. The result can be edited on the page, saved (Exec_Summary_Snapshots),
// emailed to executives, or exported as PPTX (AI outline JSON + KPI slides drawn from the real numbers).
//
// Sources: progress — Hyper round progress + review status + overdue by AMM MTN hub
//          hyper    — the 8 Hyper survey modules (cached survey dashboards, SurveyDashboardData.gs)
//          fa       — Fixed Asset (Asset Check) colour rating, labour budget, survey vs VP
//          mini     — Mini Big C Refrigerator / Aircon / EDMI survey dashboards
// Access: Super Admin or Schedule Admin (same as the follow-up tools).

var ES_SNAP_SHEET = 'Exec_Summary_Snapshots';
var ES_SNAP_HEADERS = ['Timestamp', 'By', 'Sources', 'Note', 'Model', 'Chunks', 'HTML_1', 'HTML_2', 'HTML_3', 'HTML_4', 'HTML_5', 'HTML_6'];
var ES_CELL_MAX = 45000;   // Sheets caps a cell at 50,000 characters — long reports span several columns
// Sources are built from ModuleRegistry.gs, so a newly registered module appears here automatically:
// progress + every scheduled Hyper module (one 'hyper' source) + one source per standalone module with a
// summary() (key 'x_<KEY>') + Mini Big C dashboards.
function _esSources_() {
    var s = [{ key: 'progress', label: 'ความคืบหน้าการส่ง (Hyper)' },
             { key: 'hyper', label: 'ผลสำรวจ Hyper ' + HSCH_TYPES.length + ' โมดูล' }];
    HYPER_EXTRA_MODULES.forEach(function(m) { if (m.summary) s.push({ key: 'x_' + m.key, label: m.label }); });
    s.push({ key: 'mini', label: 'Mini Big C (' + MINI_MODULE_DASH.map(function(d) { return d.label.split(' (')[0]; }).join(' / ') + ')' });
    return s;
}

// A survey dashboard payload → the compact numbers the AI needs.
function _esDash_(p) {
    if (!p || !p.success) return null;
    var out = { coverage: p.coverage ? { covered: p.coverage.covered, total: p.coverage.totalEligible, pct: p.coverage.pct } : null,
                submissions: p.summary ? p.summary.totalSubmissions : 0,
                kpi: ((p.summary && p.summary.extraCards) || []).map(function(c) { return { label: c.label, value: c.value, note: c.sub || '', warn: !!c.warn }; }) };
    if (p.summary && p.summary.latestRound) out.round = p.summary.latestRound;
    var cond = null;
    Object.keys(p.conditionHistByBu || {}).forEach(function(bu) {
        var h = p.conditionHistByBu[bu]; cond = cond || { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, unrated: 0 };
        Object.keys(cond).forEach(function(k) { cond[k] += h[k] || 0; });
    });
    if (cond) out.conditionRating = cond;
    if (p.typeFieldOrder && p.groupBreakdown) {
        var tot = {};
        p.typeFieldOrder.forEach(function(f) {
            var n = p.groupBreakdown.reduce(function(a, g) { return a + (parseFloat(g[f]) || 0); }, 0);
            if (n) tot[(p.typeLabels && p.typeLabels[f]) || f.replace(/ Qty$| \[รวม\]$/, '')] = n;
        });
        if (Object.keys(tot).length) out.equipmentTotals = tot;
    }
    return out;
}

function _esProgress_() {
    var hs = getHyperScheduleData();
    if (!hs || !hs.success || !hs.exists) return { note: 'ยังไม่มีตารางนัดส่ง Hyper' };
    var labels = {}; hs.types.forEach(function(t) { labels[t.key] = t.label; });
    var perType = {}; Object.keys(hs.summary.perType || {}).forEach(function(k) { perType[labels[k] || k] = hs.summary.perType[k]; });
    var byHub = {};
    hs.rows.forEach(function(r) {
        var h = r.amm || '(ไม่ระบุ)', g = byHub[h] || (byHub[h] = { hub: h, stores: 0, complete: 0, overdue: 0 });
        g.stores++; if (r.complete) g.complete++; if (r.overdue) g.overdue++;
    });
    var hubs = Object.keys(byHub).map(function(k) { var g = byHub[k]; g.pct = g.stores ? Math.round(g.complete / g.stores * 100) : 0; return g; })
        .sort(function(a, b) { return b.overdue - a.overdue; });
    var review = {};
    try {
        var rs = getHyperSubmissionStatus(hs.meta.startDate || '');
        if (rs && rs.success) rs.stores.forEach(function(s) {
            Object.keys(s.s || {}).forEach(function(k) {
                var c = s.s[k]; if (!c) return;
                var L = labels[k] || k, o = review[L] || (review[L] = { Pending: 0, Corrected: 0, Acknowledged: 0, Rejected: 0 });
                o[c.st] = (o[c.st] || 0) + 1;
            });
        });
    } catch (e) {}
    return { round: hs.meta.round, startDate: hs.meta.startDate, deadline: hs.meta.deadline, today: hs.today,
             stores: hs.summary.total, complete: hs.summary.complete, started: hs.summary.started, notStarted: hs.summary.notStarted,
             overdue: hs.summary.overdue, critical: hs.summary.critical, submittedByModule: perType, reviewByModule: review, hubs: hubs };
}

function _esHyper_() {
    var out = {};
    HSCH_TYPES.forEach(function(t) {
        var sfn = HYPER_MODULE_SUMMARY[t.key];
        if (sfn && typeof globalThis[sfn] === 'function') {
            try { out[t.label] = globalThis[sfn](); } catch (e) { out[t.label] = { note: String(e) }; }
            return;
        }
        var fn = HYPER_MODULE_DASH[t.key];
        if (!fn || typeof globalThis[fn] !== 'function') { out[t.label] = { note: 'ยังไม่มี dashboard — ดูจำนวนที่ส่งในหัวข้อความคืบหน้า' }; return; }
        try { out[t.label] = _esDash_(globalThis[fn]()) || { note: 'โหลดข้อมูลไม่สำเร็จ' }; } catch (e) { out[t.label] = { note: String(e) }; }
    });
    return out;
}

// Latest Fixed Asset survey per store (summary columns only — never the Asset_JSON blob).
function _esFa_() {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HYPER_FA_SHEET);
    var eligible = HYPER_FA_STORES.filter(function(s) { return s[5]; }).length;
    var res = { eligibleStores: eligible, surveyed: 0, surveyColor: {}, vpColor: {}, harderThanVp: 0, softerThanVp: 0, sameAsVp: 0,
                laborCostTHB: 0, storageSqm: 0, pieces: 0, redStores: [] };
    if (!sh || sh.getLastRow() < 2) return res;
    var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(h) { return String(h).trim(); });
    var want = ['Branch Code', 'Branch Name', 'Survey Color', 'VP Color', 'Color Gap', 'Est. Labor Cost (THB)', 'Storage Area (sqm)', 'Est. Pieces'];
    var idx = want.map(function(h) { return hdr.indexOf(h); }), n = sh.getLastRow() - 1;
    if (idx[0] < 0) return res;
    var cols = idx.map(function(c) { return c < 0 ? null : sh.getRange(2, c + 1, n, 1).getValues(); });
    var latest = {};
    for (var i = 0; i < n; i++) { var code = String(cols[0][i][0] || '').trim(); if (code) latest[code] = i; }   // rows are appended → last wins
    Object.keys(latest).forEach(function(code) {
        var i = latest[code], v = function(k) { return cols[k] ? cols[k][i][0] : ''; };
        res.surveyed++;
        var sc = String(v(2) || '-'), vc = String(v(3) || '-'), gap = parseInt(v(4), 10);
        res.surveyColor[sc] = (res.surveyColor[sc] || 0) + 1;
        res.vpColor[vc] = (res.vpColor[vc] || 0) + 1;
        if (!isNaN(gap)) { if (gap > 0) res.harderThanVp++; else if (gap < 0) res.softerThanVp++; else res.sameAsVp++; }
        res.laborCostTHB += parseFloat(v(5)) || 0; res.storageSqm += parseFloat(v(6)) || 0; res.pieces += parseFloat(v(7)) || 0;
        if (sc === 'RED') res.redStores.push(code + ' ' + String(v(1) || ''));
    });
    res.laborCostTHB = Math.round(res.laborCostTHB); res.storageSqm = Math.round(res.storageSqm);
    res.redStores = res.redStores.slice(0, 20);
    return res;
}

function _esMini_(clientEmail) {
    var out = {};
    MINI_MODULE_DASH.forEach(function(d) {
        try { out[d.label] = _esDash_(globalThis[d.fn](clientEmail)) || { note: 'โหลดข้อมูลไม่สำเร็จ' }; } catch (e) { out[d.label] = { note: String(e) }; }
    });
    return out;
}

// Real numbers for the chosen sources + a deterministic headline tile list (used by the page and the PPTX).
function _esGather_(clientEmail, sources) {
    sources = sources || {};
    var data = {}, tiles = [];
    if (sources.progress) {
        var p = data.progress = _esProgress_();
        if (p.stores) {
            tiles.push({ label: 'สาขา Hyper ในแผน', value: p.stores, color: '#1e3a8a' });
            tiles.push({ label: 'ส่งครบทุกแบบ', value: p.complete + ' (' + Math.round(p.complete / p.stores * 100) + '%)', color: '#166534' });
            tiles.push({ label: 'เลยกำหนด', value: p.overdue, color: '#991b1b' });
        }
    }
    if (sources.hyper) data.hyper = _esHyper_();
    HYPER_EXTRA_MODULES.forEach(function(m) {
        if (!m.summary || !sources['x_' + m.key]) return;
        try { var r = m.summary(); data[m.label] = r.data; tiles = tiles.concat(r.tiles || []); } catch (e) { data[m.label] = { note: String(e) }; }
    });
    if (sources.mini) data.mini = _esMini_(clientEmail);
    return { data: data, tiles: tiles, generatedAt: Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm') };
}

function _esSourceLabels_(sources) {
    return _esSources_().filter(function(s) { return sources && sources[s.key]; }).map(function(s) { return s.label; }).join(', ');
}

// Email-safe output only: no scripts, frames, styles blocks or event handlers.
function _esClean_(html) {
    return String(html || '').replace(/```html/gi, '').replace(/```/g, '')
        .replace(/<\s*(script|style|iframe|object|embed)\b[\s\S]*?<\/\s*\1\s*>/gi, '')                 // whole blocks
        .replace(/<\/?\s*(script|style|iframe|object|embed|link|meta|html|head|body)\b[^>]*>/gi, '')     // any leftover tag
        .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/javascript:/gi, '').trim();
}

var ES_SYSTEM = 'คุณคือที่ปรึกษาอาวุโสด้านงานอาคารและซ่อมบำรุง (Building Management / Maintenance) ระดับผู้บริหารของ Big C Supercenter ' +
    'สรุปผลการสำรวจสาขาให้ผู้บริหารอย่างกระชับ ตรงประเด็น อิงตัวเลขจริงเท่านั้น และนำไปตัดสินใจได้ ภาษาไทยเชิงวิชาชีพ';

function _esHtmlPrompt_(g, sources, note) {
    var sec = ['สรุปภาพรวม (Executive Summary) — 3–6 bullet: ภาพรวม, ความเสี่ยงสำคัญ, สิ่งที่ต้องตัดสินใจ — ต้องอยู่บนสุด'];
    if (sources.progress) sec.push('📊 ความคืบหน้าการส่งแบบสำรวจ Hyper — ตัวเลขรอบ, % ส่งครบ, เลยกำหนด, สถานะการตรวจรับรายโมดูล และตาราง hub (AMM MTN) ที่เลยกำหนดมากที่สุด');
    if (sources.hyper) sec.push('🏬 ผลสำรวจ Hyper รายโมดูล — แต่ละโมดูล: ความครอบคลุม, KPI ที่มี warn:true เป็นความเสี่ยง (เช่น ควรเปลี่ยน, สภาพ ≤2, อุณหภูมิผิดปกติ, ใบตรวจหมดอายุ, งบประมาณ) ใช้การ์ดแยกโมดูล');
    HYPER_EXTRA_MODULES.forEach(function(m) {
        if (m.summary && sources['x_' + m.key]) sec.push('🏷️ ' + m.label + ' (ข้อมูลอยู่ใต้ชื่อ "' + m.label + '")' + (m.prompt ? ' — ' + m.prompt : ''));
    });
    if (sources.mini) sec.push('🧊 Mini Big C — ' + MINI_MODULE_DASH.map(function(d) { return d.label; }).join(' / ') + ': ความครอบคลุม, จำนวนอุปกรณ์, สภาพเครื่อง');
    sec.push('💡 ข้อเสนอแนะ & สิ่งที่ต้องทำต่อ — 3–5 ข้อ ระบุผู้รับผิดชอบ/ระยะเวลาเท่าที่ข้อมูลรองรับ');
    return 'สร้างหน้าสรุปผู้บริหาร (executive HTML summary page) ของผลสำรวจสาขา ณ ' + g.generatedAt + '\n\n' +
        'DATA (ใช้เฉพาะข้อมูลนี้ ห้ามแต่งตัวเลขหรือสร้างหัวข้อของข้อมูลที่ไม่มี):\n' + JSON.stringify(g.data) + '\n\n' +
        (note ? 'ประเด็นที่ผู้สั่งพิมพ์ต้องการเน้น: ' + note + '\n\n' : '') +
        'VISUAL STYLE (ต้องแสดงผลเหมือนกันใน Gmail และ Outlook):\n' +
        '- ใช้ style="..." แบบ inline ทุก element เท่านั้น ห้าม class, <style>, <script>, <link>, ฟอนต์ภายนอก ใช้ table layout (ห้าม grid/flex) ข้อความภาษาไทยทั้งหมด\n' +
        '- ห้าม gradient / background-image ใช้สีทึบ และกล่องที่มีสีต้องใส่ทั้ง style background และ attribute bgcolor\n' +
        '- ห้ามตัวอักษรสีขาว/สีอ่อน: ข้อความ #000000, หัวข้อ/ตัวเลขใช้สีเข้ม (#1e3a8a, #166534, #92400e, #991b1b)\n' +
        '- หัวข้อแต่ละส่วน = แถบสีอ่อน (#eff6ff, #ecfdf5, #fffbeb, #fef2f2, #f5f3ff) + เส้นซ้าย 4px สีเข้ม + emoji + หัวข้อตัวหนา\n' +
        '- ใต้ Executive Summary ทันที = แถวการ์ดตัวเลข (stat tiles) ใน <table> แถวเดียว: การ์ดขาว ขอบ 1px #e2e8f0 ขอบบน 3px สี ตัวเลขใหญ่ 28–32px สีเข้ม ป้ายเล็กสีดำ\n' +
        '- ตารางมีแถวหัวสีอ่อน + zebra (#ffffff / #f8fafc), ขอบ 1px #e2e8f0, padding 8px; badge สถานะ: แดง #991b1b บน #fee2e2, เขียว #166534 บน #dcfce7, เหลือง #92400e บน #fef3c7\n' +
        '- ความกว้างรวมไม่เกิน 900px, ไม่ใช้ box-shadow\n\n' +
        'SECTIONS (เรียงตามนี้ และแสดงเฉพาะหัวข้อเหล่านี้):\n' + sec.map(function(s, i) { return (i + 1) + '. ' + s; }).join('\n') + '\n\n' +
        'ตอบเป็น <div> เดียวที่มี inline style เท่านั้น ห้ามมี <!DOCTYPE>, <html>, <head>, <body>, <style>, <script> และห้ามใส่ ```';
}

// ── Page API ──
function getExecSummaryInit(clientEmail) {
    if (!_fuHyperCanSend_(clientEmail)) return { success: false, error: 'Admin / Schedule Admin only' };
    var latest = null, history = [];
    try {
        var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ES_SNAP_SHEET);
        if (sh && sh.getLastRow() > 1) {
            var n = Math.min(15, sh.getLastRow() - 1), start = sh.getLastRow() - n + 1;
            var vals = sh.getRange(start, 1, n, 5).getValues();
            for (var i = vals.length - 1; i >= 0; i--) history.push({ row: start + i, ts: _esTs_(vals[i][0]), by: String(vals[i][1]), sources: String(vals[i][2]) });
            if (history.length) latest = getExecSummarySnapshot(clientEmail, history[0].row);
        }
    } catch (e) {}
    return { success: true, sources: _esSources_(), latest: latest && latest.success ? latest : null, history: history,
             ai: { configured: !!_fuAiKey_(), canConfigure: _fuIsSuperAdmin_(clientEmail), model: _fuAiModel_() },
             savedCc: _fuSavedCc_(clientEmail) };
}
function _esTs_(v) { return v instanceof Date ? Utilities.formatDate(v, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm') : String(v || ''); }

function generateExecSurveySummary(clientEmail, sources, note) {
    if (!_fuHyperCanSend_(clientEmail)) return { success: false, error: 'Admin / Schedule Admin only' };
    try {
        if (!sources || !_esSources_().some(function(s) { return sources[s.key]; })) return { success: false, error: 'เลือกแหล่งข้อมูลอย่างน้อย 1 รายการ' };
        var g = _esGather_(clientEmail, sources);
        var html = _esClean_(_fuAiRaw_(ES_SYSTEM, _esHtmlPrompt_(g, sources, note), 8000));
        if (!/<\w/.test(html)) return { success: false, error: 'AI ไม่ได้ส่งหน้ารายงานกลับมา — ลองใหม่อีกครั้ง' };
        return { success: true, html: html, tiles: g.tiles, generatedAt: g.generatedAt, model: _fuAiModel_() };
    } catch (e) { return { success: false, error: e.toString() }; }
}

function saveExecSummary(clientEmail, html, sources, note) {
    if (!_fuHyperCanSend_(clientEmail)) return { success: false, error: 'Admin / Schedule Admin only' };
    html = _esClean_(html);
    if (!html) return { success: false, error: 'ไม่มีเนื้อหา' };
    var chunks = [];
    for (var i = 0; i < html.length; i += ES_CELL_MAX) chunks.push(html.substr(i, ES_CELL_MAX));
    if (chunks.length > 6) return { success: false, error: 'รายงานยาวเกินไปสำหรับการบันทึก' };
    var lock = _acquireWriteLock_();
    try {
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sh = ss.getSheetByName(ES_SNAP_SHEET) || ss.insertSheet(ES_SNAP_SHEET);
        if (sh.getLastRow() === 0) { sh.appendRow(ES_SNAP_HEADERS); sh.setFrozenRows(1); }
        var row = [new Date(), clientEmail, _esSourceLabels_(sources), String(note || ''), _fuAiModel_(), chunks.length];
        for (var c = 0; c < 6; c++) row.push(chunks[c] || '');
        sh.getRange(sh.getLastRow() + 1, 1, 1, ES_SNAP_HEADERS.length).setNumberFormat('@').setValues([row.map(String)]);
        return { success: true, row: sh.getLastRow() };
    } finally { if (lock) lock.releaseLock(); }
}

function getExecSummarySnapshot(clientEmail, row) {
    if (!_fuHyperCanSend_(clientEmail)) return { success: false, error: 'Admin / Schedule Admin only' };
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ES_SNAP_SHEET);
    row = parseInt(row, 10);
    if (!sh || !(row > 1) || row > sh.getLastRow()) return { success: false, error: 'ไม่พบรายงาน' };
    var v = sh.getRange(row, 1, 1, ES_SNAP_HEADERS.length).getValues()[0];
    return { success: true, row: row, ts: _esTs_(v[0]), by: String(v[1]), sources: String(v[2]), note: String(v[3]), model: String(v[4]), html: v.slice(6, 12).join('') };
}

// PPTX outline — AI writes the bullets (JSON), the KPI tiles come from the real numbers.
function generateExecSummaryPptx(clientEmail, sources, note) {
    if (!_fuHyperCanSend_(clientEmail)) return { success: false, error: 'Admin / Schedule Admin only' };
    try {
        var g = _esGather_(clientEmail, sources);
        var raw = _fuAiRaw_(ES_SYSTEM, 'สรุปผลสำรวจสาขาสำหรับสไลด์ผู้บริหาร จากข้อมูล: ' + JSON.stringify(g.data) + '\n' +
            (note ? 'ประเด็นที่ต้องเน้น: ' + note + '\n' : '') +
            'อิงตัวเลขจริงเท่านั้น bullet ละไม่เกิน 20 คำ ตอบเป็น JSON เท่านั้น: ' +
            '{"title":"","overall":["3-5 ข้อ"],"risks":["3-6 ข้อ"],"sections":[{"title":"ชื่อหัวข้อ","bullets":["3-5 ข้อ"]}],"recommendations":["3-5 ข้อ"]} ห้ามใส่ ```', 4000);
        var out = JSON.parse(raw.replace(/```json/gi, '').replace(/```/g, '').trim());
        return { success: true, outline: out, tiles: g.tiles, generatedAt: g.generatedAt };
    } catch (e) { return { success: false, error: e.toString() }; }
}

// to / cc = email lists; both are remembered for the sender (same ⭐ list as the follow-up CC).
function sendExecSummaryEmail(clientEmail, to, cc, subject, html) {
    if (!_fuHyperCanSend_(clientEmail)) return { success: false, error: 'Admin / Schedule Admin only' };
    var toList = _fuCleanCc_(to), ccList = _fuCleanCc_(cc).filter(function(e) { return toList.indexOf(e) === -1; });
    if (!toList.length) return { success: false, error: 'ระบุผู้รับอย่างน้อย 1 คน' };
    html = _esClean_(html);
    if (!html) return { success: false, error: 'ไม่มีเนื้อหา' };
    try {
        var r = sendAppEmail_({ to: toList.join(','), cc: ccList.length ? ccList.join(',') : undefined,
            subject: String(subject || 'สรุปผลสำรวจสาขาสำหรับผู้บริหาร'),
            htmlBody: '<div style="font-family:Tahoma,Arial,sans-serif;max-width:920px">' + html + '</div>' });
        var lock = _acquireWriteLock_();
        try {
            var ss = SpreadsheetApp.getActiveSpreadsheet();
            var sh = ss.getSheetByName(FU_LOG_SHEET) || ss.insertSheet(FU_LOG_SHEET);
            if (sh.getLastRow() === 0) sh.appendRow(FU_LOG_HEADERS);
            sh.appendRow([new Date(), clientEmail, 'Executive summary', toList.join(','), ccList.join(','), '', '', 'Sent (EXEC SUMMARY)' + (r && r.via ? ' (' + r.via + ')' : '')]);
        } finally { if (lock) lock.releaseLock(); }
        var saved = _fuRememberCc_(clientEmail, toList.concat(ccList).map(function(e) { return e.toLowerCase(); }));
        return { success: true, via: r && r.via, savedCc: saved };
    } catch (e) { return { success: false, error: e.toString() }; }
}
