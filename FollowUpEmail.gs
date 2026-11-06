// ─── AMM MTN follow-up email (Super Admin) ───────────────────────────────────────────────────────
// ?page=followup-email — a Super Admin previews, per AMM MTN, the outstanding report items of the stores
// in that AMM's responsibility, then sends each AMM one email listing only their stores. Nothing is
// sent automatically.
//
// Responsibility = the master store DB's "AMM MTN (23)" column (getStoreDBDataV2), matched by the gold
// code for Mini Big C / Fixed Asset and by the Oracle (6-digit) code for Hyper — never by adding or
// stripping a leading "1" (see hyperStoreDbMap_ in HyperSurveyEngine.gs).
// AMM email = Employee_Database row whose Employee ID = the store DB's "ID AMM (22)", else the same
// normalised name; a Super Admin can set/override it on the page (Script Property FU_EMAIL_OVERRIDE_PROP).
//
// Outstanding items:
//   Hyper surveys — Hyper schedule stores past (or within FU_DUE_DAYS of) their date with survey types
//                   still missing in the round, plus any latest submission a reviewer Rejected.
//   Fixed Asset   — register stores with a VP that have no Fixed Asset survey yet.
//   Mini Big C    — Upload Schedule (Aircon + Ref round) stores not Uploaded, past or within FU_DUE_DAYS.

var FU_EMAIL_OVERRIDE_PROP = 'FOLLOWUP_AMM_EMAIL_V1';
var FU_LOG_SHEET = 'FollowUp_Email_Log';
var FU_LOG_HEADERS = ['Timestamp', 'Sent By', 'AMM MTN', 'To', 'CC', 'Stores', 'Items', 'Result'];
var FU_DUE_DAYS = 3;
var FU_GROUPS = [
    { key: 'Hyper', label: 'แบบสำรวจ Hyper',            page: 'hyper-schedule' },
    { key: 'FA',    label: 'สำรวจพื้นที่เก็บ Fixed Asset', page: 'hyper_fa_survey_report' },
    { key: 'MBC',   label: 'Mini Big C (แอร์ + ตู้แช่)',   page: 'upload-schedule' }
];

function _fuIsSuperAdmin_(email) {
    if (!email) return false;
    try { var c = checkAdminStatus(email); return !!(c && c.isAdmin); } catch (e) { return false; }
}

// "AMM นายอรรถพล  เหล่าสุวงศ์" → "อรรถพลเหล่าสุวงศ์"
function _fuNormName_(s) {
    return String(s || '').replace(/^\s*AMM\s*/i, '').replace(/^(นางสาว|นาง|นาย|น\.ส\.|Mr\.?|Mrs\.?|Ms\.?|Miss)\s*/i, '')
        .replace(/\s+/g, '').toLowerCase();
}
function _fuDisplayName_(s) { return String(s || '').replace(/^\s*AMM\s*/i, '').trim(); }

// "A00123" / "123.0" / 123 → "123" — same rule as the MNC app's _normEmpId_ (Store Search).
function _fuNormId_(v) {
    var s = String(v == null ? '' : v).trim().replace(/\.0+$/, '');
    return s.replace(/\D/g, '').replace(/^0+/, '') || s;
}

// The MNC People app's Employee_Database holds every staff member (this app's only has people who
// registered here), so AMM MTNs missing locally are found there — the same list Store Search reads.
var FU_MNC_EMP_SS_ID = '1rPjyDWstFkYLomBnvtNoW8VF0oLjQq2spxXdF2cmg3w';
function _fuMncEmployees_() {
    var cache = CacheService.getScriptCache(), key = 'FU_MNC_EMP_V2';   // V2: + nameByMail
    try { var hit = _cacheGetChunked_(key); if (hit) return hit; } catch (e) {}
    var out = { byId: {}, byName: {}, nameByMail: {} };
    try {
        var sh = SpreadsheetApp.openById(FU_MNC_EMP_SS_ID).getSheetByName('Employee_Database');
        if (!sh || sh.getLastRow() < 2) return out;
        var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(h) { return String(h).trim().toLowerCase(); });
        var iId = hdr.indexOf('employee id'), iName = hdr.indexOf('full name'), iMail = hdr.indexOf('email');
        if (iMail < 0) return out;
        var n = sh.getLastRow() - 1, col = function(i) { return i < 0 ? null : sh.getRange(2, i + 1, n, 1).getValues(); };
        var ids = col(iId), names = col(iName), mails = col(iMail);
        for (var r = 0; r < n; r++) {
            var mail = String(mails[r][0] || '').trim();
            if (!/@/.test(mail)) continue;
            if (ids && ids[r][0] !== '') out.byId[_fuNormId_(ids[r][0])] = mail;
            if (names && names[r][0]) { out.byName[_fuNormName_(names[r][0])] = mail; out.nameByMail[mail.toLowerCase()] = String(names[r][0]).trim(); }
        }
        _cachePutChunked_(key, out, 1800);
    } catch (e) { Logger.log('_fuMncEmployees_: ' + e); }
    return out;
}

function _fuEmployees_() {
    var byId = {}, byName = {}, nameByMail = {};
    try {
        var sh = findEmployeeSheet();
        var data = sh.getDataRange().getValues();
        var hdr = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
        var iId = hdr.indexOf('employee id'), iName = hdr.indexOf('full name'), iMail = hdr.indexOf('email');
        if (iMail < 0) return { byId: byId, byName: byName, nameByMail: nameByMail };
        for (var i = 1; i < data.length; i++) {
            var mail = String(data[i][iMail] || '').trim();
            if (!/@/.test(mail)) continue;
            if (iId > -1 && data[i][iId] !== '') { byId[String(data[i][iId]).trim().replace(/\.0+$/, '')] = mail; byId[_fuNormId_(data[i][iId])] = mail; }
            if (iName > -1 && data[i][iName]) { byName[_fuNormName_(data[i][iName])] = mail; nameByMail[mail.toLowerCase()] = String(data[i][iName]).trim(); }
        }
    } catch (e) { Logger.log('_fuEmployees_: ' + e); }
    return { byId: byId, byName: byName, nameByMail: nameByMail };
}

function _fuOverrides_() {
    try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(FU_EMAIL_OVERRIDE_PROP) || '{}') || {}; } catch (e) { return {}; }
}

function _fuTodayStr_(offsetDays) {
    return Utilities.formatDate(new Date(Date.now() + (offsetDays || 0) * 864e5), 'Asia/Bangkok', 'yyyy-MM-dd');
}

// Builds { ammKey: { key, amm, ammId, stores: { code: { code, name, fmt, sgm, items: [] } } } }
// only = 'Hyper' → just the Hyper groups (the Hyper Upload Schedule page's follow-up), skipping FA / Mini Big C.
// modules = optional list of Hyper survey keys (Ref, Ac, Eq, Fo, Li, To, Pk, Hb) to limit the Hyper items to
// (null/undefined = all; an empty list = none).
// Store DB lookups shared by both collectors. hyperDb(6-digit) → store DB row; never adds/strips a "1".
function _fuStoreIndex_() {
    var list = getStoreDBDataV2() || [];
    var byGold = {}, byOracle = {};
    list.forEach(function(x) {
        if (x.id) byGold[String(x.id)] = x;
        var o = String(x.oracle || '');
        if (/^\d{6}$/.test(o) && (!byOracle[o] || String(x.id).charAt(0) === '1')) byOracle[o] = x;   // Hyper/BMK row beats a Pure sharing the code
    });
    // 6-digit Hyper code → gold code, for stores whose Oracle code is blank/different in the store DB
    // (e.g. 111103 Rat Burana = gold 11103): Fixed Asset store list (col 1 → col 0) + Fresh Food code fixes.
    // Same fallback hyperStoreDbMap_ uses — without it these stores had no SGM email and no AMM.
    var branchToGold = {}, goldToBranch = {};
    if (typeof HYPER_FA_STORES !== 'undefined') HYPER_FA_STORES.forEach(function(s) {
        if (s[1] && s[0]) { branchToGold[String(s[1])] = String(s[0]); goldToBranch[String(s[0])] = String(s[1]); }
    });
    if (typeof HFO_REG_CODE_FIX !== 'undefined') HFO_REG_CODE_FIX.forEach(function(f) { if (f[2] && !branchToGold[f[2]]) branchToGold[f[2]] = f[0]; });
    return { byGold: byGold, byOracle: byOracle, goldToBranch: goldToBranch,
             hyperDb: function(code) { code = String(code); return byOracle[code] || byGold[branchToGold[code]] || byGold[code]; } };
}

// Accumulator in the { ammKey: { stores: { code: { items } } } } shape the targets/email builders read.
function _fuBucket_() {
    var amms = {};
    return { amms: amms, add: function(db, code, name, fmt, grp, label, detail, overdue) {
        var amm = db && db.ammMtn ? String(db.ammMtn).trim() : '';
        var key = amm ? _fuNormName_(amm) : '_none';
        var a = amms[key] || (amms[key] = { key: key, amm: amm ? _fuDisplayName_(amm) : '(ไม่มี AMM MTN ในฐานข้อมูลสาขา)', ammId: db ? db.ammId || '' : '', stores: {} });
        if (!a.ammId && db && db.ammId) a.ammId = db.ammId;
        var st = a.stores[code] || (a.stores[code] = { code: code, name: name || (db ? String(db.station || '').replace(code, '').trim() : ''), fmt: fmt || (db ? db.bu : '') || '',
            sgm: db ? String(db.sgmEmail || '').trim() : '', ammKey: key, items: [] });
        st.items.push({ grp: grp, label: label, detail: detail || '', overdue: !!overdue });
    } };
}

function _fuCollect_(only, modules) {
    var modOk = function(k) { return !modules || modules.indexOf(k) > -1; };   // null/undefined = all, [] = none
    var ix = _fuStoreIndex_(), byGold = ix.byGold, byOracle = ix.byOracle, hyperDb = ix.hyperDb;
    var amms = {}, notes = [];
    var today = _fuTodayStr_(0), soon = _fuTodayStr_(FU_DUE_DAYS);
    var add = function(db, code, name, fmt, grp, label, detail, overdue) {
        var amm = db && db.ammMtn ? String(db.ammMtn).trim() : '';
        var key = amm ? _fuNormName_(amm) : '_none';
        var a = amms[key] || (amms[key] = { key: key, amm: amm ? _fuDisplayName_(amm) : '(ไม่มี AMM MTN ในฐานข้อมูลสาขา)', ammId: db ? db.ammId || '' : '', stores: {} });
        if (!a.ammId && db && db.ammId) a.ammId = db.ammId;
        var st = a.stores[code] || (a.stores[code] = { code: code, name: name || (db ? String(db.station || '').replace(code, '').trim() : ''), fmt: fmt || (db ? db.bu : '') || '',
            sgm: db ? String(db.sgmEmail || '').trim() : '', ammKey: key, items: [] });
        st.items.push({ grp: grp, label: label, detail: detail || '', overdue: !!overdue });
    };

    // Hyper surveys — schedule (missing types) + reviewer Rejected
    try {
        var hs = getHyperScheduleData();
        if (hs && hs.success && hs.exists) {
            var labels = {};
            hs.types.forEach(function(t) { labels[t.key] = t.label; });
            hs.rows.forEach(function(r) {
                if (r.complete || !r.date || r.date > soon) return;
                var miss = hs.types.filter(function(t) { return !r.st[t.key] && modOk(t.key); }).map(function(t) { return t.label; });
                if (!miss.length) return;
                var due = r.date < today;
                add(hyperDb(r.code), r.code, r.name, r.format, 'Hyper', due ? 'เลยกำหนดส่ง' : 'ใกล้ถึงกำหนดส่ง',
                    'กำหนด ' + r.date + (hs.meta.round ? ' (รอบ ' + hs.meta.round + ')' : '') + ' — ยังไม่ส่ง: ' + miss.join(', '), due);
            });
        } else notes.push('ยังไม่มีตารางนัดส่ง Hyper — ข้ามรายการค้างส่ง Hyper (แสดงเฉพาะที่ถูกตีกลับ)');
    } catch (e) { notes.push('Hyper schedule: ' + e); }
    try {
        var rs = getHyperSubmissionStatus('');
        if (rs && rs.success) {
            var kl = {};
            rs.kinds.forEach(function(k) { kl[k.key] = k.label; });
            rs.stores.forEach(function(s) {
                Object.keys(s.s || {}).forEach(function(k) {
                    var c = s.s[k];
                    if (c && c.st === 'Rejected' && modOk(k)) add(hyperDb(s.code), s.code, s.nameTh || s.name, s.format, 'Hyper', 'ถูกตีกลับ — แก้ไขแล้วส่งใหม่',
                        kl[k] + ' ส่งเมื่อ ' + (c.ts || '-') + (c.note ? ' · หมายเหตุผู้ตรวจ: ' + c.note : ''), true);
                });
            });
        }
    } catch (e) { notes.push('Hyper review status: ' + e); }
    if (only === 'Hyper') return { amms: amms, notes: notes };

    // Fixed Asset — register stores with a VP and no survey yet
    try {
        var done = {};
        var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HYPER_FA_SHEET);
        if (sh && sh.getLastRow() > 1) {
            var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(h) { return String(h).trim(); });
            var ci = hdr.indexOf('Branch Code');
            if (ci > -1) sh.getRange(2, ci + 1, sh.getLastRow() - 1, 1).getValues().forEach(function(v) { done[String(v[0]).trim()] = 1; });
        }
        HYPER_FA_STORES.forEach(function(s) {
            if (!s[5] || done[s[0]]) return;
            var alias = String(s[19] || '').split(' ')[0];
            add(byGold[s[0]] || (alias && byGold[alias]) || byOracle[s[1]], s[0], s[3] || s[2], s[4], 'FA', 'ยังไม่ส่งแบบสำรวจ', 'VP ' + s[5] + (alias ? ' · รหัสปัจจุบัน ' + alias : ''), true);
        });
    } catch (e) { notes.push('Fixed Asset: ' + e); }

    // Mini Big C — Upload Schedule (Aircon + Ref round): not uploaded, past or due soon
    try {
        var us = _getScheduleSheet(false);
        if (us && us.getLastRow() > 1) {
            var meta = _readMeta();
            us.getDataRange().getValues().slice(1).forEach(function(r) {
                var code = String(r[0] || '').trim(), date = _cellDateStr(r[4]);
                if (!code || r[6] === 'Uploaded' || !date || date > soon) return;
                var due = date < today;
                add(byGold[code], code, r[1], r[2], 'MBC', due ? 'เลยกำหนดส่ง' : 'ใกล้ถึงกำหนดส่ง',
                    'กำหนด ' + date + (meta.round ? ' (รอบ ' + meta.round + ')' : '') + (r[3] === 'Yes' ? ' · ⚠️ Critical' : ''), due);
            });
        } else notes.push('ยังไม่มีตาราง Upload Schedule (Mini Big C)');
    } catch (e) { notes.push('Mini Big C schedule: ' + e); }

    return { amms: amms, notes: notes };
}

// Order: manual override → this app's Employee DB (ID, then name) → MNC People Employee DB (ID, then name).
// For Hyper stores the store DB's "AMM MTN" column holds a hub code (HUB01-BKK1), so the ID is what matches.
// Also returns the person's name (Employee DB "Full Name" of that email) — for Hyper stores the store DB
// only gives a hub code, so emails greet the person instead of "คุณHUB01-BKK1".
function _fuResolveEmail_(a, emp, ov) {
    var r = _fuResolveEmailOnly_(a, emp, ov);
    if (r.email) {
        var k = r.email.toLowerCase(), m = emp.mnc || (emp.mnc = _fuMncEmployees_());
        r.name = emp.nameByMail[k] || (m.nameByMail || {})[k] || '';
    }
    return r;
}
function _fuResolveEmailOnly_(a, emp, ov) {
    if (ov[a.key]) return { email: ov[a.key], src: 'manual' };
    var id = a.ammId ? String(a.ammId).trim() : '', nid = id ? _fuNormId_(id) : '';
    if (id && (emp.byId[id] || emp.byId[nid])) return { email: emp.byId[id] || emp.byId[nid], src: 'employee-id' };
    if (emp.byName[a.key]) return { email: emp.byName[a.key], src: 'name' };
    var m = emp.mnc || (emp.mnc = _fuMncEmployees_());
    if (nid && m.byId[nid]) return { email: m.byId[nid], src: 'mnc-employee-id' };
    if (m.byName[a.key]) return { email: m.byName[a.key], src: 'mnc-name' };
    return { email: '', src: '' };
}
// "นายสมชาย ใจดี" + "HUB01-BKK1" → greeting / list label pieces. Falls back to the store DB value.
function _fuAmmLabel_(a) {
    var hub = a.amm || '', p = String(a.person || '').trim();
    // drop the title — the email already says "คุณ…" ("คุณนายสมชาย" reads wrong)
    p = _fuDisplayName_(p).replace(/^(นางสาว|นาง|นาย|น\.ส\.|Mr\.?|Mrs\.?|Ms\.?|Miss)\s*/i, '').trim();
    return { person: p || hub, hub: p && hub && hub !== p ? hub : '' };
}

function _fuSummaries_(col) {
    var emp = _fuEmployees_(), ov = _fuOverrides_();
    return Object.keys(col.amms).map(function(k) {
        var a = col.amms[k], stores = Object.keys(a.stores).map(function(c) { return a.stores[c]; });
        var cnt = {}, items = 0, overdue = 0;
        stores.forEach(function(s) { s.items.forEach(function(it) { cnt[it.grp] = (cnt[it.grp] || 0) + 1; items++; if (it.overdue) overdue++; }); });
        var r = k === '_none' ? { email: '', src: '' } : _fuResolveEmail_(a, emp, ov);
        if (r.name) a.person = r.name;
        var lb = _fuAmmLabel_(a);
        return { key: k, amm: lb.person + (lb.hub ? ' (' + lb.hub + ')' : ''), ammId: a.ammId, email: r.email, emailSrc: r.src, stores: stores.length, items: items, overdue: overdue, cnt: cnt };
    }).sort(function(x, y) { return (x.key === '_none') - (y.key === '_none') || y.overdue - x.overdue || y.items - x.items; });
}

function _fuEsc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// opts.sgm = true → addressed to the store's SGM (one store) instead of an AMM MTN.
function _fuEmailHtml_(a, note, senderName, opts) {
    opts = opts || {};
    var url = ScriptApp.getService().getUrl();
    var stores = Object.keys(a.stores).map(function(c) { return a.stores[c]; });
    var s0 = stores[0] || {};
    if (opts.thanks) {
        return '<div style="font-family:Tahoma,Arial,sans-serif;font-size:14px;color:#1f2937">' +
            '<p>เรียน SGM สาขา ' + _fuEsc_(s0.code) + ' ' + _fuEsc_(s0.name) + '</p>' +
            '<p>ฝ่ายอาคาร (PPT-MTN) ขอขอบคุณทีมสาขาที่ส่งแบบสำรวจ Hyper <b>ครบถ้วนและถูกต้อง</b> ตามรายการด้านล่าง ข้อมูลนี้ช่วยให้เราวางแผนงานซ่อมบำรุงและงบประมาณได้แม่นยำขึ้น</p>' +
            (note ? '<p style="background:#ecfdf5;border-left:4px solid #10b981;padding:8px 12px">' + _fuEsc_(note).replace(/\n/g, '<br>') + '</p>' : '') +
            _fuItemsHtml_(a) +
            '<p style="margin-top:18px">ขอบคุณสำหรับความร่วมมือ และหวังว่าจะได้รับความร่วมมือที่ดีเช่นนี้ในรอบถัดไป</p>' + _fuSignoff_(senderName);
    }
    var h = '<div style="font-family:Tahoma,Arial,sans-serif;font-size:14px;color:#1f2937">' +
        (opts.sgm
            ? '<p>เรียน SGM สาขา ' + _fuEsc_(s0.code) + ' ' + _fuEsc_(s0.name) + '</p>' +
              '<p>ฝ่ายอาคาร (PPT-MTN) ขอติดตามแบบสำรวจ Hyper ของสาขาท่านที่ยังไม่ได้ส่ง หรือถูกตีกลับและยังไม่ได้แก้ไขส่งใหม่ ดังนี้</p>'
            : '<p>เรียน คุณ' + _fuEsc_(_fuAmmLabel_(a).person) + ' (AMM MTN' + (_fuAmmLabel_(a).hub ? ' ' + _fuEsc_(_fuAmmLabel_(a).hub) : '') + ')</p>' +
              '<p>ฝ่ายอาคาร (PPT-MTN) ขอติดตามรายการที่ยังค้างของสาขาในความรับผิดชอบของท่าน ' + stores.length + ' สาขา ดังนี้</p>') +
        (note ? '<p style="background:#fef3c7;border-left:4px solid #f59e0b;padding:8px 12px">' + _fuEsc_(note).replace(/\n/g, '<br>') + '</p>' : '');
    h += _fuItemsHtml_(a);
    h += (opts.sgm
            ? '<p style="margin-top:18px">รบกวนดำเนินการส่ง/แก้ไขผ่านแอปให้ครบ (เมนูแบบสำรวจ Hyper) หากส่งแล้วหรือข้อมูลไม่ถูกต้อง กรุณาตอบกลับอีเมลนี้</p>'
            : '<p style="margin-top:18px">รบกวนติดตามให้สาขาดำเนินการ หากข้อมูลไม่ถูกต้อง (เช่น สาขาไม่ได้อยู่ในความรับผิดชอบ) กรุณาตอบกลับอีเมลนี้</p>');
    return h + _fuSignoff_(senderName);
}

// Sign-off + footer, closes the wrapper <div> opened by the caller.
function _fuSignoff_(senderName) {
    return '<p>ขอบคุณครับ<br>' + _fuEsc_(senderName || 'ฝ่ายอาคาร') + '<br>ฝ่ายอาคาร (Building Management) · PPT-MTN</p>' +
           '<p style="font-size:11px;color:#94a3b8">ข้อมูล ณ ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm') + ' · ส่งจาก MTN Survey App</p></div>';
}

// The outstanding-items tables, one per group — always built from real data (never by the AI).
function _fuItemsHtml_(a) {
    var url = ScriptApp.getService().getUrl();
    var stores = Object.keys(a.stores).map(function(c) { return a.stores[c]; });
    var h = '';
    // One table per group — the fixed groups plus every standalone module in ModuleRegistry.gs
    var groups = FU_GROUPS.slice();
    HYPER_EXTRA_MODULES.forEach(function(m) {
        if (!groups.some(function(g) { return g.key === m.key; })) groups.push({ key: m.key, label: m.label, page: m.page });
    });
    groups.forEach(function(g) {
        var rows = [];
        stores.forEach(function(s) { s.items.forEach(function(it) { if (it.grp === g.key) rows.push({ s: s, it: it }); }); });
        if (!rows.length) return;
        rows.sort(function(x, y) { return (y.it.overdue - x.it.overdue) || String(x.s.code).localeCompare(String(y.s.code)); });
        h += '<h3 style="margin:18px 0 6px;font-size:15px">' + _fuEsc_(g.label) + ' — ' + rows.length + ' รายการ' +
             ' <a href="' + url + '?page=' + g.page + '" style="font-size:12px;font-weight:normal">เปิดรายงาน</a></h3>' +
             '<table cellpadding="6" style="border-collapse:collapse;font-size:13px;width:100%"><tr style="background:#f1f5f9">' +
             '<th style="border:1px solid #cbd5e1;text-align:left">สาขา</th><th style="border:1px solid #cbd5e1;text-align:left">สถานะ</th><th style="border:1px solid #cbd5e1;text-align:left">รายละเอียด</th></tr>';
        rows.forEach(function(x) {
            h += '<tr><td style="border:1px solid #cbd5e1;white-space:nowrap"><b>' + _fuEsc_(x.s.code) + '</b> ' + _fuEsc_(x.s.name) + '</td>' +
                 '<td style="border:1px solid #cbd5e1;white-space:nowrap;color:' + (x.it.overdue ? '#b91c1c' : /^ส่งแล้ว/.test(x.it.label) ? '#047857' : '#b45309') + '">' + _fuEsc_(x.it.label) + '</td>' +
                 '<td style="border:1px solid #cbd5e1">' + _fuEsc_(x.it.detail) + '</td></tr>';
        });
        h += '</table>';
    });
    return h;
}

// ── Page API ──
function getFollowUpPreview(clientEmail) {
    if (!_fuIsSuperAdmin_(clientEmail)) return { success: false, error: 'Super Admin only' };
    try {
        var col = _fuCollect_();
        return { success: true, generatedAt: Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm'), dueDays: FU_DUE_DAYS,
                 groups: FU_GROUPS.map(function(g) { return { key: g.key, label: g.label }; }), notes: col.notes, amms: _fuSummaries_(col) };
    } catch (e) { return { success: false, error: e.toString() }; }
}

function getFollowUpEmailHtml(clientEmail, ammKey, note) {
    if (!_fuIsSuperAdmin_(clientEmail)) return { success: false, error: 'Super Admin only' };
    try {
        var a = _fuCollect_().amms[ammKey];
        if (!a) return { success: false, error: 'ไม่มีรายการค้างของ AMM นี้แล้ว' };
        return { success: true, html: _fuEmailHtml_(a, note, _fuSenderName_(clientEmail)) };
    } catch (e) { return { success: false, error: e.toString() }; }
}

function saveFollowUpAmmEmail(clientEmail, ammKey, email) {
    if (!_fuIsSuperAdmin_(clientEmail)) return { success: false, error: 'Super Admin only' };
    email = String(email || '').trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { success: false, error: 'อีเมลไม่ถูกต้อง' };
    var ov = _fuOverrides_();
    if (email) ov[ammKey] = email; else delete ov[ammKey];
    PropertiesService.getScriptProperties().setProperty(FU_EMAIL_OVERRIDE_PROP, JSON.stringify(ov));
    return { success: true };
}

function _fuSenderName_(email) {
    return _fuEmployees_().nameByMail[String(email || '').trim().toLowerCase()] || email;
}

function sendFollowUpEmails(clientEmail, ammKeys, note, ccMe) {
    if (!_fuIsSuperAdmin_(clientEmail)) return { success: false, error: 'Super Admin only' };
    try {
        var col = _fuCollect_(), sums = {};
        _fuSummaries_(col).forEach(function(s) { sums[s.key] = s; });
        var sender = _fuSenderName_(clientEmail), results = [], logRows = [];
        (ammKeys || []).forEach(function(k) {
            var a = col.amms[k], s = sums[k];
            if (!a || !s) { results.push({ key: k, ok: false, error: 'ไม่มีรายการค้างแล้ว' }); return; }
            if (!s.email) { results.push({ key: k, amm: s.amm, ok: false, error: 'ไม่มีอีเมล' }); return; }
            var cc = ccMe ? clientEmail : '';
            try {
                var r = sendAppEmail_({ to: s.email, cc: cc || undefined,
                    subject: '[ติดตามงาน PPT-MTN] รายการค้าง ' + s.stores + ' สาขา — คุณ' + _fuAmmLabel_(a).person,
                    htmlBody: _fuEmailHtml_(a, note, sender) });
                results.push({ key: k, amm: s.amm, ok: true, via: r && r.via });
                logRows.push([new Date(), clientEmail, s.amm, s.email, cc, s.stores, s.items, 'Sent' + (r && r.via ? ' (' + r.via + ')' : '')]);
            } catch (e) {
                results.push({ key: k, amm: s.amm, ok: false, error: String(e) });
                logRows.push([new Date(), clientEmail, s.amm, s.email, cc, s.stores, s.items, 'Failed: ' + e]);
            }
        });
        if (logRows.length) {
            var _wlock = _acquireWriteLock_();
            var ss = SpreadsheetApp.getActiveSpreadsheet();
            var sh = ss.getSheetByName(FU_LOG_SHEET) || ss.insertSheet(FU_LOG_SHEET);
            if (sh.getLastRow() === 0) sh.appendRow(FU_LOG_HEADERS);
            sh.getRange(sh.getLastRow() + 1, 1, logRows.length, FU_LOG_HEADERS.length).setValues(logRows);
        }
        try { logUserActivity(clientEmail, 'FOLLOWUP_EMAIL', results.filter(function(r) { return r.ok; }).length + ' sent / ' + results.length); } catch (le) {}
        return { success: true, results: results };
    } catch (e) { return { success: false, error: e.toString() }; }
}

// ── Hyper Upload Schedule page: follow up / thank SGM (per store) or AMM MTN (per AMM) ──────────
// mode 'sgm'    follow-up, one email per store to its SGM
//      'mtn'    follow-up, one email per AMM MTN listing their stores
//      'thanks' thank-you, one email per store to its SGM (AMM MTN in CC) — every applicable module
//               submitted this round and none Rejected (opts.reviewedOnly: all reviewer-Acknowledged too).
// Modules = the 8 Hyper surveys + Fixed Asset (Asset Check). Per store, a module can be marked as not
// applicable (HYPER_STORE_NA_PROP) — it is then never chased, thanked for, or counted in the schedule.
// opts.extraCodes = stores hand-picked by the sender: follow-up includes them even before they are due.
// Allowed for the same people who get the page's admin tools: Super Admin or Schedule Admin.
function _fuHyperCanSend_(email) {
    if (!email) return false;
    try { var s = checkSurveyAdminStatus(email); return !!(s && (s.isAdmin || s.isScheduleAdmin)); } catch (e) { return false; }
}
function _fuPerStore_(mode) { return mode !== 'mtn'; }

// Modules come from ModuleRegistry.gs — scheduled Hyper surveys + standalone modules (Fixed Asset, …).
function _fuHyperModules_() { return hyperModules_().map(function(m) { return { key: m.key, label: m.label }; }); }

// { code: ['Pk', 'FA', …] } — modules that do NOT apply to that store (6-digit Hyper code; gold for FA-only stores)
var HYPER_STORE_NA_PROP = 'HYPER_STORE_MODULES_NA_V1';
function _hyperStoreNa_() {
    try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(HYPER_STORE_NA_PROP) || '{}') || {}; } catch (e) { return {}; }
}

function _fuRvLabel_(c) {
    if (!c) return '';
    return c.st === 'Acknowledged' ? 'ตรวจรับแล้ว' : c.st === 'Rejected' ? 'ถูกตีกลับ' : 'รอตรวจ';
}

function _fuHyperCollect_(mode, modules, opts) {
    opts = opts || {};
    var modOk = function(k) { return !modules || modules.indexOf(k) > -1; };
    var ix = _fuStoreIndex_(), na = _hyperStoreNa_(), b = _fuBucket_(), notes = [];
    var applies = function(code, k) { return modOk(k) && !(na[code] && na[code].indexOf(k) > -1); };
    var extra = {};
    (opts.extraCodes || []).forEach(function(c) { extra[String(c).trim()] = true; });
    var thanks = mode === 'thanks', today = _fuTodayStr_(0), soon = _fuTodayStr_(FU_DUE_DAYS);

    var hs = getHyperScheduleData(), meta = (hs && hs.meta) || {};
    var rows = hs && hs.success && hs.exists ? hs.rows : [];
    if (!rows.length) notes.push('ยังไม่มีตารางนัดส่ง Hyper — แสดงเฉพาะ Fixed Asset');
    var round = meta.round ? ' (รอบ ' + meta.round + ')' : '';
    // Review status: follow-up reads the latest ever (a Rejected from an earlier round is still owed);
    // thanks reads this round only.
    var rsBy = {};
    try {
        var rs = getHyperSubmissionStatus(thanks ? (meta.startDate || '') : '');
        if (rs && rs.success) rs.stores.forEach(function(s) { rsBy[s.code] = s.s || {}; });
    } catch (e) { notes.push('Hyper review status: ' + e); }

    // Standalone modules (ModuleRegistry.gs HYPER_EXTRA_MODULES, e.g. Fixed Asset): their stores keyed by
    // the 6-digit Hyper code when known, so one store still gets one email covering every module.
    var ext = {};
    HYPER_EXTRA_MODULES.forEach(function(m) {
        if (!modOk(m.key)) return;
        try {
            var done = m.done(), map = {};
            m.stores().forEach(function(s) { s.done = done[s.gold] || done[s.code] || (s.alias && done[s.alias]) || ''; map[s.code] = s; });
            ext[m.key] = { m: m, map: map };
        } catch (e) { notes.push(m.label + ': ' + e); }
    });
    var extFor = function(code) {
        return Object.keys(ext).map(function(k) { return { k: k, m: ext[k].m, s: ext[k].map[code] }; })
            .filter(function(x) { return x.s && applies(code, x.k); });
    };
    var extThank = function(db, code, name, fmt, list) {
        list.forEach(function(x) { b.add(db, code, name, fmt, x.k, 'ส่งแล้ว ✓', x.m.label + ' · ส่ง ' + x.s.done); });
    };
    var extChase = function(db, code, name, fmt, list) {
        list.forEach(function(x) { if (!x.s.done) b.add(db, code, name, fmt, x.k, 'ยังไม่ส่งแบบสำรวจ', x.m.label + (x.s.note ? ' · ' + x.s.note : ''), true); });
    };

    var seen = {};
    rows.forEach(function(r) {
        var code = r.code, db = ix.hyperDb(code), rv = rsBy[code] || {};
        seen[code] = true;
        var ap = HSCH_TYPES.filter(function(t) { return applies(code, t.key); });
        var ex = extFor(code);
        if (thanks) {
            if (!ap.length && !ex.length) return;
            var allSent = ap.every(function(t) { return r.st[t.key]; }) && ex.every(function(x) { return x.s.done; });
            var anyRej = ap.some(function(t) { return rv[t.key] && rv[t.key].st === 'Rejected'; });
            var allAck = ap.every(function(t) { return rv[t.key] && rv[t.key].st === 'Acknowledged'; });
            if (!allSent || anyRej || (opts.reviewedOnly && !allAck)) {
                if (extra[code]) notes.push(code + ' ' + r.name + ': ยังส่งไม่ครบ / ถูกตีกลับ' + (opts.reviewedOnly ? ' / ยังตรวจไม่ครบ' : '') + ' — ไม่ได้ใส่ในรายการขอบคุณ');
                return;
            }
            ap.forEach(function(t) { b.add(db, code, r.name, r.format, 'Hyper', 'ส่งแล้ว ✓', t.label + ' · ส่ง ' + r.st[t.key] + (rv[t.key] ? ' · ' + _fuRvLabel_(rv[t.key]) : '')); });
            extThank(db, code, r.name, r.format, ex);
            return;
        }
        var due = r.date && r.date < today, near = r.date && r.date <= soon;
        var miss = ap.filter(function(t) { return !r.st[t.key]; }).map(function(t) { return t.label; });
        if (miss.length && (near || extra[code]))
            b.add(db, code, r.name, r.format, 'Hyper', due ? 'เลยกำหนดส่ง' : near ? 'ใกล้ถึงกำหนดส่ง' : 'ยังไม่ส่ง', 'กำหนด ' + r.date + round + ' — ยังไม่ส่ง: ' + miss.join(', '), due);
        ap.forEach(function(t) {
            var c = rv[t.key];
            if (c && c.st === 'Rejected') b.add(db, code, r.name, r.format, 'Hyper', 'ถูกตีกลับ — แก้ไขแล้วส่งใหม่',
                t.label + ' ส่งเมื่อ ' + (c.ts || '-') + (c.note ? ' · หมายเหตุผู้ตรวจ: ' + c.note : ''), true);
        });
        extChase(db, code, r.name, r.format, ex);
    });
    // Standalone-module stores that are not on the Hyper schedule
    var others = {};
    Object.keys(ext).forEach(function(k) { Object.keys(ext[k].map).forEach(function(c) { if (!seen[c]) others[c] = ext[k].map[c]; }); });
    Object.keys(others).forEach(function(code) {
        var ex = extFor(code); if (!ex.length) return;
        var s0 = others[code], db = ix.hyperDb(code) || ix.byGold[s0.gold];
        if (thanks) { if (ex.every(function(x) { return x.s.done; })) extThank(db, code, s0.name, s0.fmt, ex); }
        else extChase(db, code, s0.name, s0.fmt, ex);
    });
    Object.keys(extra).forEach(function(c) {
        var found = Object.keys(b.amms).some(function(k) { return b.amms[k].stores[c]; });
        if (!found && !thanks) notes.push(c + ': ไม่มีรายการค้างในโมดูลที่เลือก');
    });
    return { amms: b.amms, notes: notes };
}

// When each store was last thanked (from the follow-up log) — so nobody is thanked twice by mistake.
function _fuThankedAt_() {
    var out = {};
    try {
        var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FU_LOG_SHEET);
        if (!sh || sh.getLastRow() < 2) return out;
        sh.getRange(2, 1, sh.getLastRow() - 1, FU_LOG_HEADERS.length).getValues().forEach(function(r) {
            if (!/THANKS/.test(String(r[7])) || !/^Sent/.test(String(r[7]))) return;
            var m = String(r[2]).match(/\b(\d{5,6})\b/);
            if (m) out[m[1]] = r[0] instanceof Date ? Utilities.formatDate(r[0], 'Asia/Bangkok', 'dd/MM/yyyy') : String(r[0]);
        });
    } catch (e) {}
    return out;
}

// Per-store recipients for 'sgm' / 'thanks' (store DB "e-mail SGM"); one per AMM MTN for 'mtn'.
// Override emails share FU_EMAIL_OVERRIDE_PROP: AMM keys as on the Super Admin page, SGM as 'sgm:<code>'.
function _fuHyperTargets_(col, mode) {
    var emp = _fuEmployees_(), ov = _fuOverrides_(), list = [], byKey = {};
    var thanked = mode === 'thanks' ? _fuThankedAt_() : {};
    Object.keys(col.amms).forEach(function(ak) {
        var a = col.amms[ak];
        var am = ak === '_none' ? { email: '', src: '' } : _fuResolveEmail_(a, emp, ov);
        if (am.name) a.person = am.name;
        var lb = _fuAmmLabel_(a), ammShow = lb.person + (lb.hub ? ' (' + lb.hub + ')' : '');
        var groups = _fuPerStore_(mode)
            ? Object.keys(a.stores).map(function(c) {
                var st = a.stores[c], one = {}; one[c] = st;
                var e = ov['sgm:' + c] ? { email: ov['sgm:' + c], src: 'manual' } : { email: st.sgm, src: st.sgm ? 'store-db' : '' };
                return { key: 'sgm:' + c, name: c + ' ' + st.name, email: e.email, src: e.src, obj: { key: ak, amm: a.amm, person: a.person, ammId: a.ammId, stores: one } };
              })
            : [{ key: 'mtn:' + ak, name: ammShow, email: am.email, src: am.src, obj: a }];
        groups.forEach(function(g) {
            var stores = Object.keys(g.obj.stores).map(function(c) { return g.obj.stores[c]; });
            var items = 0, overdue = 0, rejected = 0;
            stores.forEach(function(s) { s.items.forEach(function(it) { items++; if (it.overdue) overdue++; if (/ตีกลับ/.test(it.label)) rejected++; }); });
            byKey[g.key] = { obj: g.obj, email: g.email, ammName: ammShow, ammEmail: am.email };
            var code0 = Object.keys(g.obj.stores)[0];
            list.push({ key: g.key, name: g.name, email: g.email, emailSrc: g.src, ammName: ammShow, ammEmail: am.email,
                        stores: stores.length, items: items, overdue: overdue, rejected: rejected,
                        thankedAt: mode === 'thanks' ? (thanked[code0] || '') : '' });
        });
    });
    list.sort(function(x, y) { return y.overdue - x.overdue || y.rejected - x.rejected || y.items - x.items || String(x.name).localeCompare(String(y.name)); });
    return { list: list, byKey: byKey };
}

// opts = { extraCodes: [...], reviewedOnly: bool } (see _fuHyperCollect_)
function getHyperFollowUpPreview(clientEmail, mode, modules, opts) {
    if (!_fuHyperCanSend_(clientEmail)) return { success: false, error: 'Admin / Schedule Admin only' };
    try {
        var col = _fuHyperCollect_(mode, modules, opts);
        return { success: true, mode: mode, dueDays: FU_DUE_DAYS, notes: col.notes, targets: _fuHyperTargets_(col, mode).list,
                 modules: _fuHyperModules_(),
                 stores: _hschStores_().map(function(s) { return { code: s.code, name: s.name, nameTh: s.nameTh }; }),
                 ai: { configured: !!_fuAiKey_(), canConfigure: _fuIsSuperAdmin_(clientEmail), model: _fuAiModel_() },
                 savedCc: _fuSavedCc_(clientEmail),
                 generatedAt: Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm') };
    } catch (e) { return { success: false, error: e.toString() }; }
}

// tpl (optional) = the AI common message → preview shows it filled for this recipient.
function getHyperFollowUpEmailHtml(clientEmail, mode, key, note, modules, tpl, opts) {
    if (!_fuHyperCanSend_(clientEmail)) return { success: false, error: 'Admin / Schedule Admin only' };
    try {
        var t = _fuHyperTargets_(_fuHyperCollect_(mode, modules, opts), mode).byKey[key];
        if (!t) return { success: false, error: 'ไม่มีรายการแล้ว' };
        var sender = _fuSenderName_(clientEmail);
        if (tpl && String(tpl.bodyHtml || '').trim())
            return { success: true, subject: _fuFillAiSubject_(tpl.subject, t, mode), html: _fuFillAiBody_(tpl.bodyHtml, t, mode, sender) };
        return { success: true, subject: _fuHyperSubject_(mode, _fuHyperSum_(t)), html: _fuEmailHtml_(t.obj, note, sender, { sgm: _fuPerStore_(mode), thanks: mode === 'thanks' }) };
    } catch (e) { return { success: false, error: e.toString() }; }
}

function _fuHyperSum_(t) {
    var stores = Object.keys(t.obj.stores).map(function(c) { return t.obj.stores[c]; });
    var s0 = stores[0] || {};
    var lb = _fuAmmLabel_(t.obj);
    return { stores: stores.length, name: lb.person, hub: lb.hub, storeName: s0.code + ' ' + s0.name };
}
function _fuHyperSubject_(mode, s) {
    if (mode === 'thanks') return '[PPT-MTN] ขอบคุณสาขา ' + s.storeName + ' — ส่งแบบสำรวจ Hyper ครบถ้วน';
    return mode === 'sgm' ? '[ติดตามงาน PPT-MTN] แบบสำรวจ Hyper ค้างส่ง — สาขา ' + s.storeName
                          : '[ติดตามงาน PPT-MTN] แบบสำรวจ Hyper ค้าง ' + s.stores + ' สาขา — คุณ' + s.name;
}

// ── Per-store module applicability (admin) ──
function getHyperStoreModules(clientEmail) {
    if (!_fuHyperCanSend_(clientEmail)) return { success: false, error: 'Admin / Schedule Admin only' };
    return { success: true, na: _hyperStoreNa_(), modules: _fuHyperModules_() };
}
// naKeys = modules that do NOT apply to the store ([] clears it).
function saveHyperStoreModules(clientEmail, code, naKeys) {
    if (!_fuHyperCanSend_(clientEmail)) return { success: false, error: 'Admin / Schedule Admin only' };
    code = String(code || '').trim();
    if (!code) return { success: false, error: 'ไม่ได้ระบุสาขา' };
    var valid = {}; _fuHyperModules_().forEach(function(m) { valid[m.key] = true; });
    var keys = (naKeys || []).filter(function(k) { return valid[k]; });
    var lock = _acquireWriteLock_();
    try {
        var na = _hyperStoreNa_();
        if (keys.length) na[code] = keys; else delete na[code];
        PropertiesService.getScriptProperties().setProperty(HYPER_STORE_NA_PROP, JSON.stringify(na));
    } finally { if (lock) lock.releaseLock(); }
    try { _hschClearCache_(); } catch (e) {}
    return { success: true, na: keys };
}

// ── Extra CC: search staff (this app + MNC People Employee DB) + per-sender remembered addresses ──
var FU_CC_SAVED_PROP = 'FOLLOWUP_CC_SAVED_V1';   // { senderEmail: [email, …] }
function _fuSavedCc_(sender) {
    try { var all = JSON.parse(PropertiesService.getScriptProperties().getProperty(FU_CC_SAVED_PROP) || '{}') || {}; return all[String(sender || '').toLowerCase()] || []; } catch (e) { return []; }
}
function _fuRememberCc_(sender, emails, remove) {
    var p = PropertiesService.getScriptProperties(), key = String(sender || '').toLowerCase();
    var all = {}; try { all = JSON.parse(p.getProperty(FU_CC_SAVED_PROP) || '{}') || {}; } catch (e) {}
    var cur = all[key] || [];
    if (remove) cur = cur.filter(function(e) { return emails.indexOf(e) === -1; });
    else emails.forEach(function(e) { if (cur.indexOf(e) === -1) cur.unshift(e); });
    all[key] = cur.slice(0, 30);
    p.setProperty(FU_CC_SAVED_PROP, JSON.stringify(all));
    return all[key];
}
function removeFollowUpSavedCc(clientEmail, email) {
    if (!_fuHyperCanSend_(clientEmail)) return { success: false, error: 'Admin / Schedule Admin only' };
    return { success: true, saved: _fuRememberCc_(clientEmail, [String(email || '').trim().toLowerCase()], true) };
}
// [{ n: name, e: email }] from both employee lists — cached 30 min in chunks.
function _fuPeople_() {
    var hit = _cacheGetChunked_('FU_PEOPLE_V1');
    if (hit) return hit;
    var seen = {}, out = [];
    var push = function(n, e) { e = String(e || '').trim(); var k = e.toLowerCase(); if (!/@/.test(e) || seen[k]) return; seen[k] = 1; out.push({ n: String(n || '').trim(), e: e }); };
    try {
        var d = findEmployeeSheet().getDataRange().getValues(), h = d[0].map(function(x) { return String(x).trim().toLowerCase(); });
        var iN = h.indexOf('full name'), iM = h.indexOf('email');
        for (var i = 1; i < d.length; i++) push(iN > -1 ? d[i][iN] : '', d[i][iM]);
    } catch (e) {}
    try {
        var sh = SpreadsheetApp.openById(FU_MNC_EMP_SS_ID).getSheetByName('Employee_Database');
        var hh = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(x) { return String(x).trim().toLowerCase(); });
        var jN = hh.indexOf('full name'), jM = hh.indexOf('email'), n = sh.getLastRow() - 1;
        if (jM > -1 && n > 0) {
            var ms = sh.getRange(2, jM + 1, n, 1).getValues(), ns = jN > -1 ? sh.getRange(2, jN + 1, n, 1).getValues() : null;
            for (var r = 0; r < n; r++) push(ns ? ns[r][0] : '', ms[r][0]);
        }
    } catch (e) { Logger.log('_fuPeople_ MNC: ' + e); }
    _cachePutChunked_('FU_PEOPLE_V1', out, 1800);
    return out;
}
function searchFollowUpPeople(clientEmail, q) {
    if (!_fuHyperCanSend_(clientEmail)) return { success: false, error: 'Admin / Schedule Admin only' };
    q = String(q || '').trim().toLowerCase();
    if (q.length < 2) return { success: true, results: [] };
    var res = _fuPeople_().filter(function(p) { return p.e.toLowerCase().indexOf(q) > -1 || p.n.toLowerCase().indexOf(q) > -1; }).slice(0, 12);
    return { success: true, results: res };
}
function _fuCleanCc_(list) {
    var out = [];
    (list || []).forEach(function(e) { e = String(e || '').trim(); if (/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(e) && out.indexOf(e) === -1) out.push(e); });
    return out.slice(0, 20);
}

// ── AI drafting — same engine as the CMS Dashboard vendor follow-up (AIService.gs there): DeepSeek
// chat completions, model in Script Property 'aiModel' (legacy names mapped), the AI writes only the
// wording and leaves {{ITEMS_TABLE}}; the real items table + sign-off are always filled in by code.
// The API key is per Apps Script project, so a Super Admin enters it once here ('deepseekApiKey').
var FU_AI_DEFAULT_MODEL = 'deepseek-v4-flash';
var FU_AI_LEGACY_MODELS = { 'deepseek-chat': 'deepseek-v4-flash', 'deepseek-reasoner': 'deepseek-v4-pro' };
var FU_AI_SYSTEM = 'คุณคือผู้ช่วยฝ่ายอาคาร (Building Management, PPT-MTN) ของ Big C Supercenter ' +
    'ช่วยร่างอีเมลติดตามงานภาษาไทยเชิงวิชาชีพ สุภาพ กระชับ ชัดเจน และนำไปปฏิบัติได้จริง';

function _fuAiKey_() { var k = PropertiesService.getScriptProperties().getProperty('deepseekApiKey'); return (k && k.trim()) ? k.trim() : ''; }
function _fuAiModel_() {
    var m = PropertiesService.getScriptProperties().getProperty('aiModel');
    m = (m && m.trim()) ? m.trim() : FU_AI_DEFAULT_MODEL;
    return FU_AI_LEGACY_MODELS[m] || m;
}
// Raw DeepSeek chat call → the reply text. Shared by follow-up drafting and the executive summary (ExecSummary.gs).
function _fuAiRaw_(system, userPrompt, maxTokens) {
    var key = _fuAiKey_();
    if (!key) throw new Error('ยังไม่ได้ตั้งค่า DeepSeek API key — Super Admin ตั้งค่าได้ที่ปุ่ม ⚙️ AI');
    var body = { model: _fuAiModel_(), temperature: 0.5, messages: [{ role: 'system', content: system }, { role: 'user', content: userPrompt }] };
    if (maxTokens) body.max_tokens = maxTokens;
    var resp = UrlFetchApp.fetch('https://api.deepseek.com/chat/completions', {
        method: 'post', contentType: 'application/json', headers: { 'Authorization': 'Bearer ' + key }, muteHttpExceptions: true,
        payload: JSON.stringify(body)
    });
    var r = JSON.parse(resp.getContentText());
    if (r.error) throw new Error(r.error.message || JSON.stringify(r.error));
    if (!r.choices || !r.choices[0]) throw new Error('DeepSeek: empty response');
    return String(r.choices[0].message.content);
}
function _fuAiCall_(userPrompt) {
    var out = JSON.parse(_fuAiRaw_(FU_AI_SYSTEM, userPrompt).replace(/```json/gi, '').replace(/```/g, '').trim());
    return { subject: String(out.subject || ''), bodyHtml: String(out.bodyHtml || '') };
}
// Only <p>/<ul>/<li>/<b>/<br> survive from the AI text (it is mailed as HTML).
function _fuAiClean_(html) {
    return String(html || '').replace(/<(?!\/?(p|ul|ol|li|b|strong|br)\b)[^>]*>/gi, '').replace(/\son\w+="[^"]*"/gi, '');
}
var FU_AI_RULES = 'ตอบเป็น JSON เท่านั้น: {"subject":"หัวข้ออีเมล","bodyHtml":"เนื้อหา HTML"}\n' +
    'กติกาของ bodyHtml: ใช้แท็ก <p> <ul><li> <b> เท่านั้น, เริ่มด้วยคำขึ้นต้น "เรียน ...", ' +
    'วางข้อความ {{ITEMS_TABLE}} ไว้ตำแหน่งที่ต้องการแสดงตารางรายการค้าง (ห้ามสร้างตาราง/รายการสาขาเอง), ' +
    'ไม่ต้องใส่คำลงท้าย/ลายเซ็น (ระบบจะเติมให้), ห้ามใส่ ```';

function _fuAiItemLines_(obj) {
    var lines = [];
    Object.keys(obj.stores).forEach(function(c) {
        var s = obj.stores[c];
        s.items.forEach(function(it) { lines.push('- สาขา ' + s.code + ' ' + s.name + ' | ' + it.label + ' | ' + it.detail); });
    });
    return lines;
}
function _fuAiAsk_(mode, who, lines, note, modLabels, template) {
    var list = lines.slice(0, 40).join('\n') + (lines.length > 40 ? '\n(และอื่น ๆ อีก ' + (lines.length - 40) + ' รายการ)' : '') + '\n\n';
    if (mode === 'thanks') {
        return (template
                ? 'ร่าง "ข้อความกลาง" อีเมลขอบคุณที่จะส่งถึง SGM หลายสาขา (ส่งแยกฉบับละ 1 สาขา) ใช้ {{RECIPIENT}} แทนชื่อผู้รับในคำขึ้นต้น และ {{ITEMS_TABLE}} แทนตารางของแต่ละฉบับ\nภาพรวม:\n'
                : 'ร่างอีเมลขอบคุณถึง ' + who + '\nรายการที่ส่งครบ:\n') + list +
            'เรื่อง: ขอบคุณสาขาที่ส่งแบบสำรวจ Hyper (Big Format)' + (modLabels ? ' — ' + modLabels : '') + ' ครบถ้วนและถูกต้อง\n' +
            'น้ำเสียงอบอุ่น จริงใจ เป็นทางการ กระชับ ชื่นชมความร่วมมือ บอกว่าข้อมูลช่วยวางแผนงานซ่อมบำรุง/งบประมาณ และขอความร่วมมือต่อในรอบถัดไป\n' +
            (note ? 'ข้อความเพิ่มเติมจากผู้ส่ง (ให้สอดแทรกในเนื้อหา): ' + note + '\n' : '') + FU_AI_RULES.replace('ตารางรายการค้าง', 'ตารางรายการที่ส่งแล้ว');
    }
    return (template
            ? 'ร่าง "ข้อความกลาง" ที่จะใช้ส่งถึง' + (mode === 'sgm' ? ' SGM หลายสาขา (ส่งแยกฉบับละ 1 สาขา)' : ' AMM MTN หลายคน (ส่งแยกฉบับละ 1 คน)') +
              ' ใช้ {{RECIPIENT}} แทนชื่อผู้รับในคำขึ้นต้น และ {{ITEMS_TABLE}} แทนตารางของแต่ละฉบับ\nภาพรวมทั้งหมด:\n'
            : 'ร่างอีเมลติดตามงานถึง ' + who + '\nรายการค้าง:\n') +
        lines.slice(0, 40).join('\n') + (lines.length > 40 ? '\n(และอื่น ๆ อีก ' + (lines.length - 40) + ' รายการ)' : '') + '\n\n' +
        'เรื่อง: แบบสำรวจ Hyper (Big Format)' + (modLabels ? ' — เฉพาะ ' + modLabels : '') + ' ที่ยังไม่ได้ส่ง หรือถูกผู้ตรวจตีกลับและยังไม่ได้แก้ไขส่งใหม่\n' +
        (mode === 'sgm' ? 'ผู้รับคือ SGM ของสาขา — ขอให้สาขาส่ง/แก้ไขผ่านแอปให้ครบ' : 'ผู้รับคือ AMM MTN — ขอให้ติดตามสาขาในความรับผิดชอบให้ดำเนินการ') +
        ' น้ำเสียงสุภาพ เป็นทางการ แต่หนักแน่น เน้นรายการที่เลยกำหนด/ถูกตีกลับ และขอให้ดำเนินการ/ตอบกลับภายใน 3 วันทำการ\n' +
        (note ? 'ข้อความเพิ่มเติมจากผู้ส่ง (ให้สอดแทรกในเนื้อหา): ' + note + '\n' : '') + FU_AI_RULES;
}
function _fuModLabels_(modules) {
    if (!modules || !modules.length) return '';
    return _fuHyperModules_().filter(function(t) { return modules.indexOf(t.key) > -1; }).map(function(t) { return t.label; }).join(', ');
}
// Fills a (possibly user-edited) AI body for one target: {{RECIPIENT}} → name, {{ITEMS_TABLE}} → real table, + sign-off.
function _fuFillAiBody_(bodyHtml, t, mode, senderName) {
    var s = _fuHyperSum_(t);
    var who = _fuPerStore_(mode) ? 'SGM สาขา ' + s.storeName : 'คุณ' + s.name + ' (AMM MTN' + (s.hub ? ' ' + s.hub : '') + ')';
    var table = _fuItemsHtml_(t.obj), b = _fuAiClean_(bodyHtml).replace(/\{\{RECIPIENT\}\}/g, _fuEsc_(who));
    b = b.indexOf('{{ITEMS_TABLE}}') > -1 ? b.replace('{{ITEMS_TABLE}}', table).replace(/\{\{ITEMS_TABLE\}\}/g, '') : b + table;
    return '<div style="font-family:Tahoma,Arial,sans-serif;font-size:14px;color:#1f2937">' + b + _fuSignoff_(senderName);
}
function _fuFillAiSubject_(subject, t, mode) {
    var s = _fuHyperSum_(t);
    return String(subject || _fuHyperSubject_(mode, s)).replace(/\{\{RECIPIENT\}\}/g, _fuPerStore_(mode) ? 'สาขา ' + s.storeName : 'คุณ' + s.name);
}

// One AI draft tailored to one recipient → editable in the preview, then sent with sendHyperFollowUpEmails(tpl).
function generateHyperFollowUpAiDraft(clientEmail, mode, key, modules, note, opts) {
    if (!_fuHyperCanSend_(clientEmail)) return { success: false, error: 'Admin / Schedule Admin only' };
    try {
        var t = _fuHyperTargets_(_fuHyperCollect_(mode, modules, opts), mode).byKey[key];
        if (!t) return { success: false, error: 'ไม่มีรายการแล้ว' };
        var s = _fuHyperSum_(t);
        var ai = _fuAiCall_(_fuAiAsk_(mode, _fuPerStore_(mode) ? 'SGM สาขา ' + s.storeName : 'คุณ' + s.name + ' (AMM MTN' + (s.hub ? ' ' + s.hub : '') + ')', _fuAiItemLines_(t.obj), note, _fuModLabels_(modules), false));
        var body = _fuAiClean_(ai.bodyHtml);
        return { success: true, subject: ai.subject || _fuHyperSubject_(mode, s), bodyHtml: body,
                 previewHtml: _fuFillAiBody_(body, t, mode, _fuSenderName_(clientEmail)), model: _fuAiModel_() };
    } catch (e) { return { success: false, error: e.toString() }; }
}

// One AI "common message" for the whole batch, with {{RECIPIENT}} / {{ITEMS_TABLE}} filled per email on send.
function generateHyperFollowUpAiTemplate(clientEmail, mode, keys, modules, note, opts) {
    if (!_fuHyperCanSend_(clientEmail)) return { success: false, error: 'Admin / Schedule Admin only' };
    try {
        var tg = _fuHyperTargets_(_fuHyperCollect_(mode, modules, opts), mode), lines = [];
        (keys && keys.length ? keys : Object.keys(tg.byKey)).forEach(function(k) { if (tg.byKey[k]) lines = lines.concat(_fuAiItemLines_(tg.byKey[k].obj)); });
        if (!lines.length) return { success: false, error: 'ไม่มีรายการในที่เลือก' };
        var ai = _fuAiCall_(_fuAiAsk_(mode, '', lines, note, _fuModLabels_(modules), true));
        return { success: true, subject: ai.subject, bodyHtml: _fuAiClean_(ai.bodyHtml), model: _fuAiModel_() };
    } catch (e) { return { success: false, error: e.toString() }; }
}

function getFollowUpAiConfig(clientEmail) {
    if (!_fuIsSuperAdmin_(clientEmail)) return { success: false, error: 'Super Admin only' };
    var k = _fuAiKey_();
    return { success: true, configured: !!k, masked: k ? k.slice(0, 4) + '…' + k.slice(-4) : '', model: _fuAiModel_() };
}
// key '' keeps the current key; model '' resets to the default.
function saveFollowUpAiConfig(clientEmail, key, model) {
    if (!_fuIsSuperAdmin_(clientEmail)) return { success: false, error: 'Super Admin only' };
    var p = PropertiesService.getScriptProperties();
    if (key && String(key).trim()) p.setProperty('deepseekApiKey', String(key).trim());
    if (model && String(model).trim()) p.setProperty('aiModel', String(model).trim()); else p.deleteProperty('aiModel');
    return { success: true, model: _fuAiModel_() };
}

function saveHyperFollowUpEmail(clientEmail, key, email) {
    if (!_fuHyperCanSend_(clientEmail)) return { success: false, error: 'Admin / Schedule Admin only' };
    email = String(email || '').trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { success: false, error: 'อีเมลไม่ถูกต้อง' };
    var ovKey = String(key || '').replace(/^mtn:/, '');   // AMM overrides keep the Super Admin page's key
    if (!ovKey || ovKey === '_none') return { success: false, error: 'invalid key' };
    var ov = _fuOverrides_();
    if (email) ov[ovKey] = email; else delete ov[ovKey];
    PropertiesService.getScriptProperties().setProperty(FU_EMAIL_OVERRIDE_PROP, JSON.stringify(ov));
    return { success: true };
}

// ccAmm (per-store modes): copy the store's AMM MTN so they see what was asked of / thanked to their stores.
// tpl = optional { subject, bodyHtml } — an AI draft (possibly edited); {{RECIPIENT}} / {{ITEMS_TABLE}} are
// filled per email from real data. Without tpl the standard wording is used.
// opts = { extraCodes, reviewedOnly, extraCc: [emails] } — extraCc goes on every email and is remembered for the sender.
function sendHyperFollowUpEmails(clientEmail, mode, keys, note, ccMe, ccAmm, modules, tpl, opts) {
    if (!_fuHyperCanSend_(clientEmail)) return { success: false, error: 'Admin / Schedule Admin only' };
    try {
        opts = opts || {};
        var useTpl = tpl && String(tpl.bodyHtml || '').trim();
        var extraCc = _fuCleanCc_(opts.extraCc);
        var tg = _fuHyperTargets_(_fuHyperCollect_(mode, modules, opts), mode), sums = {};
        tg.list.forEach(function(s) { sums[s.key] = s; });
        var sender = _fuSenderName_(clientEmail), results = [], logRows = [];
        (keys || []).forEach(function(k) {
            var t = tg.byKey[k], s = sums[k];
            if (!t || !s) { results.push({ key: k, ok: false, error: 'ไม่มีรายการแล้ว' }); return; }
            if (!s.email) { results.push({ key: k, name: s.name, ok: false, error: 'ไม่มีอีเมล' }); return; }
            var cc = [];
            if (ccMe) cc.push(clientEmail);
            if (_fuPerStore_(mode) && ccAmm && s.ammEmail && s.ammEmail !== s.email) cc.push(s.ammEmail);
            extraCc.forEach(function(e) { if (e !== s.email && cc.indexOf(e) === -1) cc.push(e); });
            var who = _fuPerStore_(mode) ? 'SGM ' + s.name : s.name;
            try {
                var r = sendAppEmail_({ to: s.email, cc: cc.length ? cc.join(',') : undefined,
                    subject: useTpl ? _fuFillAiSubject_(tpl.subject, t, mode) : _fuHyperSubject_(mode, _fuHyperSum_(t)),
                    htmlBody: useTpl ? _fuFillAiBody_(tpl.bodyHtml, t, mode, sender) : _fuEmailHtml_(t.obj, note, sender, { sgm: _fuPerStore_(mode), thanks: mode === 'thanks' }) });
                results.push({ key: k, name: s.name, ok: true, via: r && r.via });
                logRows.push([new Date(), clientEmail, who, s.email, cc.join(','), s.stores, s.items, 'Sent (Hyper ' + mode.toUpperCase() + (useTpl ? ', AI' : '') + ')' + (r && r.via ? ' (' + r.via + ')' : '')]);
            } catch (e) {
                results.push({ key: k, name: s.name, ok: false, error: String(e) });
                logRows.push([new Date(), clientEmail, who, s.email, cc.join(','), s.stores, s.items, 'Failed: ' + e]);
            }
        });
        if (logRows.length) {
            var _wlock = _acquireWriteLock_();
            var ss = SpreadsheetApp.getActiveSpreadsheet();
            var sh = ss.getSheetByName(FU_LOG_SHEET) || ss.insertSheet(FU_LOG_SHEET);
            if (sh.getLastRow() === 0) sh.appendRow(FU_LOG_HEADERS);
            sh.getRange(sh.getLastRow() + 1, 1, logRows.length, FU_LOG_HEADERS.length).setValues(logRows);
        }
        var saved = extraCc.length ? _fuRememberCc_(clientEmail, extraCc.map(function(e) { return e.toLowerCase(); })) : _fuSavedCc_(clientEmail);
        try { logUserActivity(clientEmail, 'HYPER_FOLLOWUP_EMAIL', mode + ': ' + results.filter(function(r) { return r.ok; }).length + ' sent / ' + results.length); } catch (le) {}
        return { success: true, results: results, savedCc: saved };
    } catch (e) { return { success: false, error: e.toString() }; }
}

function getFollowUpLog(clientEmail) {
    if (!_fuIsSuperAdmin_(clientEmail)) return { success: false, error: 'Super Admin only' };
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FU_LOG_SHEET);
    if (!sh || sh.getLastRow() < 2) return { success: true, rows: [] };
    var n = Math.min(50, sh.getLastRow() - 1);
    var rows = sh.getRange(sh.getLastRow() - n + 1, 1, n, FU_LOG_HEADERS.length).getValues().reverse().map(function(r) {
        return [r[0] instanceof Date ? Utilities.formatDate(r[0], 'Asia/Bangkok', 'dd/MM/yyyy HH:mm') : String(r[0])].concat(r.slice(1).map(String));
    });
    return { success: true, rows: rows };
}
