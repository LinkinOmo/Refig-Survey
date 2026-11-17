// ─── FF Renovate unit register + QR codes ──────────────────────────────────────
// One row per PHYSICAL cabinet unit of a store's latest FF Renovate survey (user's choice 2026-11-17: QR per cabinet unit,
// created automatically when the survey is submitted). The QR on each unit's label opens ?page=ffr-unit&id=<Unit ID> and
// is the key for the next steps: procurement (PO / vendor), delivery, installation and job acceptance (ตรวจรับงาน).
//
// Unit ID = FFR-<oracle>-<purchasing code without "FF-" and dashes>-<NN>, e.g. FFR-111128-FRZ01-03.
//   Cards without a purchasing code (cabinets found outside the plan) use X<card id>, e.g. FFR-111128-XC12-01.
// Units per (store, code) are numbered in card order: Refurbish units first, then Workable, then Request New.
// Re-survey / edit of the latest survey KEEPS existing IDs (labels may already be printed): results are updated, extra
// units are added, units no longer in the result are set to Cancelled — rows are never deleted.
// "ไม่พบ" (not found) units have no physical cabinet → no unit / QR.

var FFR_UNIT_SHEET = 'FF_Renovate_Units';
var FFR_UNIT_COLS = ['Unit ID', 'Status', 'Branch Code', 'Gold Code', 'Branch Name', 'Team', 'Equip Code', 'Category', 'Cabinet', 'System',
    'Result', 'Card', 'Seq', 'Survey ID', 'Equipment ID', 'Asset No', 'Created', 'Updated',
    'PO No', 'Vendor', 'Delivered', 'Installed', 'Accepted', 'Accepted By', 'Note', 'Accept Photo', 'Log'];
var FFR_UNIT_RESULTS = [['qRef', 'Refurbish'], ['qWork', 'Workable'], ['qNew', 'Request New']];
// Status flow (next phases fill PO / Delivered / Installed / Accepted): Surveyed → Ordered → Delivered → Installed → Accepted
var FFR_UNIT_STATUS = ['Surveyed', 'Ordered', 'Delivered', 'Installed', 'Accepted', 'Cancelled'];

function _ffrUnitSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(FFR_UNIT_SHEET);
    if (!sh) {
        sh = ss.insertSheet(FFR_UNIT_SHEET);
        sh.getRange(1, 1, 1, FFR_UNIT_COLS.length).setValues([FFR_UNIT_COLS]).setFontWeight('bold');
        sh.setFrozenRows(1);
    } else if (sh.getLastColumn() < FFR_UNIT_COLS.length) {   // columns added later (Accept Photo, Log) - append headers in place
        sh.getRange(1, 1, 1, FFR_UNIT_COLS.length).setValues([FFR_UNIT_COLS]).setFontWeight('bold');
    }
    return sh;
}
function _ffrUnitKey_(ec, iid) {
    var k = String(ec || '').toUpperCase().replace(/^FF-/, '').replace(/[^A-Z0-9]/g, '');
    return k || ('X' + String(iid || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
}
function _ffrUnitId_(oracle, key, seq) { return 'FFR-' + oracle + '-' + key + '-' + (seq < 10 ? '0' + seq : seq); }
function _ffrSplitList_(v) { return String(v || '').split(/\s*,\s*/).map(function(x) { return x.trim(); }).filter(Boolean); }

// Desired units of a survey result: [{ key, ec, cat, name, sys, result, card, eq, asset }] in card order.
function _ffrDesiredUnits_(items) {
    var out = [];
    (items || []).forEach(function(it) {
        var key = _ffrUnitKey_(it.ec, it.iid), eqs = _ffrSplitList_(it.eq), assets = _ffrSplitList_(it.asset), k = 0, nNew = 0;
        FFR_UNIT_RESULTS.forEach(function(rs) {
            for (var i = 0; i < (it[rs[0]] || 0); i++) {
                out.push({ key: key, ec: it.ec || '', cat: it.cat, name: it.name, sys: it.sys === 'remote' ? 'Remote' : 'Plug-in', result: rs[1], card: it.iid,
                           eq: eqs[k] || '', asset: rs[1] === 'Request New' ? (assets[nNew++] || '') : '' });
                k++;
            }
        });
    });
    return out;
}

// Sync the unit register of one store with a survey result. Caller may hold the write lock already (pass hasLock).
function _ffrSyncUnits_(oracle, surveyId, items, hasLock) {
    oracle = String(oracle || '').trim();
    var st = _ffrStoreIndex_()[oracle];
    if (!st) return { success: false, error: 'store not in project: ' + oracle };
    var lock = hasLock ? null : _acquireWriteLock_();
    try {
        var sh = _ffrUnitSheet_(), last = sh.getLastRow(), now = new Date();
        var vals = last > 1 ? sh.getRange(2, 1, last - 1, FFR_UNIT_COLS.length).getValues() : [];
        var C = {}; FFR_UNIT_COLS.forEach(function(c, i) { C[c] = i; });
        var existing = {};   // key -> [{ row (0-based in vals), seq }]
        vals.forEach(function(r, i) {
            if (String(r[C['Branch Code']]).trim() !== oracle) return;
            var key = String(r[C['Unit ID']]).split('-').slice(2, -1).join('-');
            (existing[key] = existing[key] || []).push({ i: i, seq: parseInt(r[C['Seq']], 10) || 0 });
        });
        Object.keys(existing).forEach(function(k) { existing[k].sort(function(a, b) { return a.seq - b.seq; }); });
        var desired = _ffrDesiredUnits_(items), byKey = {}, order = [];
        desired.forEach(function(u) { if (!byKey[u.key]) { byKey[u.key] = []; order.push(u.key); } byKey[u.key].push(u); });
        var changed = {}, added = [], stat = { created: 0, updated: 0, cancelled: 0 };
        var fill = function(r, u) {
            r[C['Gold Code']] = st.c; r[C['Branch Name']] = st.n; r[C['Team']] = st.t; r[C['Equip Code']] = u.ec; r[C['Category']] = u.cat;
            r[C['Cabinet']] = u.name; r[C['System']] = u.sys; r[C['Result']] = u.result; r[C['Card']] = u.card; r[C['Survey ID']] = surveyId || '';
            r[C['Equipment ID']] = u.eq; r[C['Asset No']] = u.asset; r[C['Updated']] = now;
        };
        order.forEach(function(key) {
            var want = byKey[key], have = existing[key] || [], maxSeq = have.reduce(function(m, h) { return Math.max(m, h.seq); }, 0);
            want.forEach(function(u, n) {
                if (n < have.length) {
                    var r = vals[have[n].i];
                    if (String(r[C['Status']]) === 'Cancelled') r[C['Status']] = 'Surveyed';
                    fill(r, u); changed[have[n].i] = 1; stat.updated++;
                } else {
                    var seq = ++maxSeq, r2 = FFR_UNIT_COLS.map(function() { return ''; });
                    r2[C['Unit ID']] = _ffrUnitId_(oracle, key, seq); r2[C['Status']] = 'Surveyed'; r2[C['Branch Code']] = oracle;
                    r2[C['Seq']] = seq; r2[C['Created']] = now; fill(r2, u); added.push(r2); stat.created++;
                }
            });
        });
        // units not in the latest result → Cancelled (only while nothing further happened to them)
        Object.keys(existing).forEach(function(key) {
            var keep = (byKey[key] || []).length;
            existing[key].slice(keep).forEach(function(h) {
                var r = vals[h.i], s = String(r[C['Status']]);
                if (s === 'Cancelled') return;
                if (s === 'Surveyed' || !s) { r[C['Status']] = 'Cancelled'; stat.cancelled++; }
                else r[C['Note']] = 'ไม่อยู่ในผลสำรวจล่าสุด (' + Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd') + ') — ตรวจสอบ';
                r[C['Updated']] = now; changed[h.i] = 1;
            });
        });
        Object.keys(changed).forEach(function(i) { sh.getRange(+i + 2, 1, 1, FFR_UNIT_COLS.length).setValues([vals[i]]); });
        if (added.length) sh.getRange(sh.getLastRow() + 1, 1, added.length, FFR_UNIT_COLS.length).setValues(added);
        stat.success = true; stat.total = desired.length;
        _ffrUnitSyncedSet_(oracle, surveyId);
        return stat;
    } finally { if (lock) lock.releaseLock(); }
}

// Hook: after a submit (items from the submitted form) — never fails the submit itself.
function _ffrUnitsAfterSubmit_(form, surveyId) {
    try { return _ffrSyncUnits_(String(form.branchCode || '').trim(), surveyId, _ffrParseItems_(form.itemsJson || '[]'), false); }
    catch (e) { Logger.log('FFR units after submit: ' + e); return { success: false, error: e.toString() }; }
}
// Hook: after an edit — only when the edited record is still the store's latest survey.
function _ffrUnitsAfterEdit_(id) {
    try {
        var r = hyperSurveyRecordById_(FF_RENOVATE_DEF, id);
        if (!r.success) return;
        var code = String(r.data['Branch Code'] || '').trim(), latest = _ffrLatest_(false)[code];
        if (!latest || String(latest.ID) !== String(id)) return;
        _ffrSyncUnits_(code, id, _ffrParseItems_(r.data['Items_JSON'] || '[]'), false);
    } catch (e) { Logger.log('FFR units after edit: ' + e); }
}

// Admin: (re)build units from the latest survey of every store (backfill for surveys sent before QR existed).
function syncFfrUnitsFromSurveys(email) {
    try {
        var a = checkSurveyAdminStatus(email || Session.getActiveUser().getEmail());
        if (!_hsCanEdit_(a)) return { success: false, error: 'ต้องเป็น Admin / ผู้มีสิทธิ์แก้ไข' };
        var sheet = _archSheetFor_(FFR_SHEET, false);
        if (!sheet || sheet.getLastRow() < 2) return { success: true, stores: 0, created: 0, updated: 0, cancelled: 0 };
        var v = sheet.getDataRange().getValues(), h = v[0].map(function(x) { return String(x).trim(); });
        var ci = h.indexOf('Branch Code'), ii = h.indexOf('ID'), ji = h.indexOf('Items_JSON'), last = {};
        for (var i = 1; i < v.length; i++) last[String(v[i][ci]).trim()] = i;
        var tot = { success: true, stores: 0, created: 0, updated: 0, cancelled: 0 };
        var lock = _acquireWriteLock_();
        try {
            Object.keys(last).forEach(function(code) {
                var r = v[last[code]];
                var s = _ffrSyncUnits_(code, r[ii], _ffrParseItems_(r[ji] || '[]'), true);
                if (s.success) { tot.stores++; tot.created += s.created; tot.updated += s.updated; tot.cancelled += s.cancelled; }
            });
        } finally { lock.releaseLock(); }
        return tot;
    } catch (e) { return { success: false, error: e.toString() }; }
}

function _ffrUnitObj_(r, C) {
    var o = {};
    ['Unit ID', 'Status', 'Branch Code', 'Gold Code', 'Branch Name', 'Team', 'Equip Code', 'Category', 'Cabinet', 'System', 'Result', 'Card', 'Seq',
     'Survey ID', 'Equipment ID', 'Asset No', 'Updated', 'PO No', 'Vendor', 'Delivered', 'Installed', 'Accepted', 'Accepted By', 'Note', 'Accept Photo'].forEach(function(k) {
        var x = r[C[k]]; o[k] = x instanceof Date ? Utilities.formatDate(x, 'Asia/Bangkok', 'yyyy-MM-dd') : x;
    });
    return o;
}
// Units for the label sheet / report export — same store scope as the report (Admin / HO all, AMM own stores).
function getFfrUnits(email, oracle, includeCancelled) {
    try {
        _ffrUnitsAutoSync_();   // fully automatic QR: stores whose latest survey has no units yet get them now
        var sc = _ffrScope_(email), want = String(oracle || '').trim();
        if (want && !_ffrInScope_(sc, want)) return { success: false, error: 'สาขานี้ไม่อยู่ในความรับผิดชอบของคุณ' };
        var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FFR_UNIT_SHEET);
        var stores = Object.keys(_ffrStoreIndex_()).filter(function(o) { return _ffrInScope_(sc, o); }).map(function(o) { var s = _ffrStoreIndex_()[o]; return { o: o, c: s.c, n: s.n, t: s.t }; });
        if (!sh || sh.getLastRow() < 2) return { success: true, units: [], stores: stores };
        _ffrUnitSheet_();   // upgrades the header if new columns were added
        var v = sh.getRange(1, 1, sh.getLastRow(), FFR_UNIT_COLS.length).getValues(), C = {};
        v[0].forEach(function(c, i) { C[String(c).trim()] = i; });
        var units = [];
        for (var i = 1; i < v.length; i++) {
            var code = String(v[i][C['Branch Code']]).trim();
            if (want ? code !== want : !_ffrInScope_(sc, code)) continue;
            if (!includeCancelled && String(v[i][C['Status']]) === 'Cancelled') continue;
            units.push(_ffrUnitObj_(v[i], C));
        }
        return { success: true, units: units, stores: stores, appUrl: ScriptApp.getService().getUrl() };
    } catch (e) { return { success: false, error: e.toString() }; }
}
// One unit for the QR scan page — public (vendors / inspectors scan it): no prices, no lease, no emails.
// With a logged-in email it also says whether that person may update the status (canEdit) or correct it (canFix).
function getFfrUnit(id, email) {
    try {
        id = String(id || '').trim().toUpperCase();
        if (!/^FFR-\d{6}-[A-Z0-9]+-\d+$/.test(id)) return { success: false, error: 'รหัส QR ไม่ถูกต้อง' };
        var f = _ffrUnitFind_([id]);
        if (!f.rows[id]) return { success: false, error: 'ไม่พบรหัสนี้ในทะเบียนตู้' };
        var r = f.rows[id], u = _ffrUnitObj_(r.vals, f.C), perm = _ffrUnitPerm_(email, u['Branch Code']);
        if (!perm.canEdit) delete u['Note'];
        return { success: true, unit: u, statusFlow: FFR_UNIT_STATUS, canEdit: perm.canEdit, canFix: perm.canFix, loggedIn: !!String(email || '').trim(),
                 log: _ffrUnitLog_(r.vals[f.C['Log']]) };
    } catch (e) { return { success: false, error: e.toString() }; }
}

// ─── Project management: status updates by QR scan / tracker (2026-11-17) ──────────────────────────────────
// Who: logged-in people whose store scope includes the unit's store (_ffrScope_: Admin / SysAdmin / Schedule Admin / SMF = all
// stores, AMM MTN = own stores). They can move a unit FORWARD only (steps may be skipped). Going back, Cancel / restore =
// "canFix" (Admin / edit-allowed, _hsCanEdit_). Every change is appended to the Log column (time, name, status, fields).
var FFR_UNIT_FLOW = ['Surveyed', 'Ordered', 'Delivered', 'Installed', 'Accepted'];
function _ffrUnitPerm_(email, oracle) {
    email = String(email || '').trim();
    if (!email) return { canEdit: false, canFix: false };
    var a = null;
    try { a = checkSurveyAdminStatus(email); } catch (e) {}
    var fix = !!(a && _hsCanEdit_(a));
    return { canEdit: fix || _ffrInScope_(_ffrScope_(email), oracle), canFix: fix };
}
function _ffrUnitFind_(ids) {
    var sh = _ffrUnitSheet_(), last = sh.getLastRow(), C = {}, rows = {}, want = {};
    FFR_UNIT_COLS.forEach(function(c, k) { C[c] = k; });
    ids.forEach(function(x) { want[String(x).trim().toUpperCase()] = 1; });
    if (last < 2) return { sh: sh, C: C, rows: rows };
    var v = sh.getRange(2, 1, last - 1, FFR_UNIT_COLS.length).getValues();
    for (var i = 0; i < v.length; i++) {
        var id = String(v[i][0]).trim().toUpperCase();
        if (want[id]) rows[id] = { row: i + 2, vals: v[i] };
    }
    return { sh: sh, C: C, rows: rows };
}
function _ffrUnitLog_(raw) {   // public view: names only, never emails
    var a = [];
    try { a = JSON.parse(raw || '[]'); } catch (e) {}
    return (a || []).map(function(x) { return { t: x.t, by: x.by, s: x.s, f: x.f || '' }; });
}
function _ffrDateIn_(d) {
    d = String(d || '').trim();
    if (!d) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('วันที่ไม่ถูกต้อง: ' + d);
    return d;
}
// Update one or many units (scan page = 1 id, tracker bulk = many). patch: { status, po, vendor, date, note, photo }
// status '' = keep the status, only edit fields. → { success, updated, units, skipped: [{ id, why }] }
function updateFfrUnits(email, name, ids, patch) {
    try {
        email = String(email || '').trim();
        if (!email) return { success: false, error: 'กรุณาเข้าสู่ระบบก่อน' };
        ids = (ids || []).map(function(x) { return String(x).trim().toUpperCase(); }).filter(Boolean);
        if (!ids.length) return { success: false, error: 'ไม่ได้เลือกตู้' };
        if (ids.length > 500) return { success: false, error: 'เลือกได้ครั้งละไม่เกิน 500 ตู้' };
        patch = patch || {};
        var to = String(patch.status || '').trim();
        if (to && FFR_UNIT_STATUS.indexOf(to) < 0) return { success: false, error: 'สถานะไม่ถูกต้อง' };
        var po = String(patch.po || '').trim().substring(0, 60), vendor = String(patch.vendor || '').trim().substring(0, 120);
        var date = _ffrDateIn_(patch.date) || Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
        var note = String(patch.note || '').trim().substring(0, 500), photo = String(patch.photo || '').trim();
        if (photo && !/^https:\/\/drive\.google\.com\//.test(photo)) photo = '';
        name = String(name || '').trim().substring(0, 80) || email;
        var a = null; try { a = checkSurveyAdminStatus(email); } catch (e) {}
        var fix = !!(a && _hsCanEdit_(a)), sc = _ffrScope_(email);
        var lock = _acquireWriteLock_();
        try {
            var f = _ffrUnitFind_(ids), C = f.C, now = new Date(), stamp = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd HH:mm');
            var out = [], skipped = [];
            ids.forEach(function(id) {
                var hit = f.rows[id];
                if (!hit) { skipped.push({ id: id, why: 'ไม่พบรหัส' }); return; }
                var r = hit.vals, code = String(r[C['Branch Code']]).trim(), cur = String(r[C['Status']] || 'Surveyed');
                if (!fix && !_ffrInScope_(sc, code)) { skipped.push({ id: id, why: 'สาขาไม่อยู่ในความรับผิดชอบ' }); return; }
                var ci = FFR_UNIT_FLOW.indexOf(cur), ti = FFR_UNIT_FLOW.indexOf(to), changes = [];
                if (to && to !== cur) {
                    if (!fix && (cur === 'Cancelled' || to === 'Cancelled' || ti < ci)) { skipped.push({ id: id, why: 'ย้อนสถานะ / ยกเลิก ต้องเป็น Admin' }); return; }
                    if (to === 'Ordered' && !(po || r[C['PO No']])) { skipped.push({ id: id, why: 'ต้องใส่เลข PO' }); return; }
                    if (to === 'Ordered' && !(vendor || r[C['Vendor']])) { skipped.push({ id: id, why: 'ต้องใส่ผู้ขาย' }); return; }
                    r[C['Status']] = to; changes.push(cur + ' → ' + to);
                    [['Delivered', 2], ['Installed', 3], ['Accepted', 4]].forEach(function(p) { if (ti >= p[1] && !r[C[p[0]]]) r[C[p[0]]] = date; });
                    if (ti >= 4 && !r[C['Accepted By']]) r[C['Accepted By']] = name;
                    if (ti > -1 && ci > -1 && ti < ci) {   // Admin moved back: clear the dates of the steps undone
                        [['Delivered', 2], ['Installed', 3], ['Accepted', 4]].forEach(function(p) { if (ti < p[1]) r[C[p[0]]] = ''; });
                        if (ti < 4) r[C['Accepted By']] = '';
                    }
                }
                if (po && po !== String(r[C['PO No']])) { r[C['PO No']] = po; changes.push('PO ' + po); }
                if (vendor && vendor !== String(r[C['Vendor']])) { r[C['Vendor']] = vendor; changes.push('ผู้ขาย ' + vendor); }
                if (photo) { r[C['Accept Photo']] = photo; changes.push('รูปตรวจรับ'); }
                if (note) { r[C['Note']] = (r[C['Note']] ? r[C['Note']] + '\n' : '') + stamp + ' ' + name + ': ' + note; changes.push('หมายเหตุ'); }
                if (!changes.length) { skipped.push({ id: id, why: 'ไม่มีอะไรเปลี่ยน' }); return; }
                var log = []; try { log = JSON.parse(r[C['Log']] || '[]'); } catch (e) {}
                log.push({ t: stamp, by: name, em: email, s: r[C['Status']], f: changes.join(' · ') + (note ? ' — ' + note : '') });
                r[C['Log']] = JSON.stringify(log.slice(-50));
                r[C['Updated']] = now;
                f.sh.getRange(hit.row, 1, 1, FFR_UNIT_COLS.length).setValues([r]);
                out.push(_ffrUnitObj_(r, C));
            });
            return { success: true, updated: out.length, units: out, skipped: skipped };
        } finally { lock.releaseLock(); }
    } catch (e) { return { success: false, error: e.toString() }; }
}
// Job-acceptance photo for one unit (scan page) → Drive folder FF_Renovate_Unit_Photos; the link then goes into updateFfrUnits.
function uploadFfrUnitPhoto(email, id, fileData) {
    try {
        id = String(id || '').trim().toUpperCase();
        var f = _ffrUnitFind_([id]);
        if (!f.rows[id]) return { success: false, error: 'ไม่พบรหัสนี้' };
        if (!_ffrUnitPerm_(email, String(f.rows[id].vals[f.C['Branch Code']]).trim()).canEdit) return { success: false, error: 'ไม่มีสิทธิ์บันทึกตู้นี้' };
        if (!fileData || !fileData.data) return { success: false, error: 'ไม่มีไฟล์' };
        var it = DriveApp.getFoldersByName('FF_Renovate_Unit_Photos'), folder = it.hasNext() ? it.next() : DriveApp.createFolder('FF_Renovate_Unit_Photos');
        var blob = Utilities.newBlob(Utilities.base64Decode(fileData.data), fileData.mimeType || 'image/jpeg', id + '_' + new Date().getTime() + '.jpg');
        var file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        return { success: true, url: 'https://drive.google.com/thumbnail?sz=w1000&id=' + file.getId() };
    } catch (e) { return { success: false, error: e.toString() }; }
}

// ─── Fully automatic QR (2026-11-17) ────────────────────────────────────────────────────────────────────────
// Submit / edit already build units. Safety net (surveys sent before QR existed, a hook that failed): every load of the
// label sheet / tracker compares each store's latest survey ID with the survey last synced (script property) and syncs the
// stores that differ. Checked at most every 5 min (cache flag) so page loads stay fast. Replaces the admin backfill button.
function _ffrUnitSyncedGet_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('FFR_UNIT_SYNCED_V1') || '{}'); } catch (e) { return {}; } }
function _ffrUnitSyncedSet_(oracle, surveyId) {
    try { var m = _ffrUnitSyncedGet_(); m[oracle] = String(surveyId || ''); PropertiesService.getScriptProperties().setProperty('FFR_UNIT_SYNCED_V1', JSON.stringify(m)); } catch (e) {}
}
function _ffrUnitsAutoSync_(force) {
    try {
        var cache = CacheService.getScriptCache();
        if (!force && cache.get('FFR_UNIT_AUTOSYNC_V1')) return { success: true, skipped: true };
        var sheet = _archSheetFor_(FFR_SHEET, false);
        if (!sheet || sheet.getLastRow() < 2) return { success: true, stores: 0 };
        var v = sheet.getDataRange().getValues(), h = v[0].map(function(x) { return String(x).trim(); });
        var ci = h.indexOf('Branch Code'), ii = h.indexOf('ID'), ji = h.indexOf('Items_JSON'), last = {};
        for (var i = 1; i < v.length; i++) last[String(v[i][ci]).trim()] = i;
        var done = _ffrUnitSyncedGet_(), todo = Object.keys(last).filter(function(code) { return String(done[code] || '') !== String(v[last[code]][ii]); });
        var tot = { success: true, stores: 0, created: 0, updated: 0, cancelled: 0 };
        if (todo.length) {
            var lock = _acquireWriteLock_();
            try {
                todo.forEach(function(code) {
                    var r = v[last[code]], s = _ffrSyncUnits_(code, r[ii], _ffrParseItems_(r[ji] || '[]'), true);
                    if (s.success) { tot.stores++; tot.created += s.created; tot.updated += s.updated; tot.cancelled += s.cancelled; }
                });
            } finally { lock.releaseLock(); }
        }
        cache.put('FFR_UNIT_AUTOSYNC_V1', '1', 300);
        return tot;
    } catch (e) { Logger.log('FFR units auto-sync: ' + e); return { success: false, error: e.toString() }; }
}
