// ============================================================
// HyperReviewStatus.gs — Hyper (Big Format) submission + review tracking
// ============================================================
// Mirrors the Mini Big C Ref/Aircon "Acknowledge" flow for the 6 Hyper surveys:
//   • Every Hyper record carries Review Status / Reviewed By / Review Date / Review Note.
//     Blank (rows submitted before this existed) is read as 'Pending'.
//   • A reviewer (Admin / Schedule admin / SMF / Ops edit toggle — same as _hsCanEdit_)
//     sets Acknowledged or Rejected (note required). When the reporter edits a Rejected
//     record, hyperSurveyUpdate_ flips it to 'Corrected' so it lands back in the review queue.
//   • getHyperSubmissionStatus() builds the store × survey-type matrix for ?page=hyper-status:
//     latest submission per store per type (optionally since a date), with its review state.

var HS_REVIEW_STATUS = 'Review Status';
var HS_REVIEW_BY     = 'Reviewed By';
var HS_REVIEW_DATE   = 'Review Date';
var HS_REVIEW_NOTE   = 'Review Note';
var HS_REVIEW_HEADERS = [HS_REVIEW_STATUS, HS_REVIEW_BY, HS_REVIEW_DATE, HS_REVIEW_NOTE];
var HRS_CACHE_TTL_SEC = 300;

// Resolved lazily — the DEF globals live in other files, which may load after this one.
function _hrsKinds_() {
    return [
        { key: 'Ref', label: 'ตู้แช่',       icon: '🏬', page: 'hyper_ref_survey_report', def: HYPER_REF_DEF },
        { key: 'Ac',  label: 'แอร์',         icon: '❄️', page: 'hyper_ac_survey_report',  def: HYPER_AC_DEF },
        { key: 'Eq',  label: 'อุปกรณ์อาคาร', icon: '🛗', page: 'hyper_eq_survey_report',  def: HYPER_EQ_DEF },
        { key: 'Fo',  label: 'Fresh Food',   icon: '🍞', page: 'hyper_fo_survey_report',  def: HYPER_FO_DEF },
        { key: 'Li',  label: 'แสงสว่าง',     icon: '💡', page: 'hyper_li_survey_report',  def: HYPER_LI_DEF },
        { key: 'To',  label: 'ห้องน้ำ',      icon: '🚻', page: 'hyper_to_survey_report',  def: HYPER_TO_DEF },
        { key: 'Pk',  label: 'ที่จอดรถ/ผู้พิการ', icon: '♿', page: 'hyper_pk_survey_report',  def: HYPER_PK_DEF },
        { key: 'Hb',  label: 'เครื่องเป่ามือ', icon: '🌬️', page: 'hyper_hb_survey_report',  def: HYPER_HB_DEF },
        { key: 'Fi',  label: 'ป้องกันอัคคีภัย', icon: '🧯', page: 'hyper_fi_survey_report',  def: HYPER_FI_DEF }
    ];
}

function _hrsKind_(key) {
    var ks = _hrsKinds_();
    for (var i = 0; i < ks.length; i++) if (ks[i].key === key) return ks[i];
    return null;
}

// Cache entries are keyed by a stamp, so one write invalidates every "since" variant at once.
function _hrsStamp_() {
    var c = CacheService.getScriptCache();
    var s = c.get('HRS_STAMP');
    if (!s) { s = String(Date.now()); c.put('HRS_STAMP', s, 21600); }
    return s;
}
function _hrsCacheClear_() {
    try { CacheService.getScriptCache().put('HRS_STAMP', String(Date.now()), 21600); } catch (e) {}
}

function _hrsDateStr_(v) {
    if (!v) return '';
    var d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? String(v) : Utilities.formatDate(d, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm');
}

// ─── Set review status (Acknowledged / Rejected / Pending = reset) ───────────────
function setHyperReviewStatus(kindKey, id, status, note, clientEmail) {
    try {
        var kind = _hrsKind_(kindKey);
        if (!kind) return { success: false, error: 'Unknown survey type: ' + kindKey };
        if (['Acknowledged', 'Rejected', 'Pending'].indexOf(status) === -1) return { success: false, error: 'Invalid status' };
        note = String(note || '').trim();
        if (status === 'Rejected' && !note) return { success: false, error: 'กรุณาระบุเหตุผลที่ไม่ผ่าน (note required)' };

        var userEmail = String(clientEmail || Session.getActiveUser().getEmail() || '').trim();
        var adminCheck = checkSurveyAdminStatus(userEmail);
        if (!_hsCanEdit_(adminCheck)) return { success: false, error: 'ไม่มีสิทธิ์ตรวจรับ (Admin / SMF / Ops edit only)' };

        _acquireWriteLock_();
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(kind.def.sheet);
        if (!sheet) return { success: false, error: 'Sheet not found' };
        var found = _hsFindRow_(sheet, id);
        if (found.rowIndex === -1) return { success: false, error: 'Record not found (it may have been deleted)' };
        var headers = found.headers;
        var row = found.data[found.rowIndex - 1];

        // No self-acknowledging your own submission (admins exempt — same spirit as approveWorkOrder).
        var repIdx = headers.indexOf('Reporter Email');
        var reporter = repIdx > -1 ? String(row[repIdx] || '').trim().toLowerCase() : '';
        if (status === 'Acknowledged' && reporter && reporter === userEmail.toLowerCase() && !adminCheck.isAdmin) {
            return { success: false, error: 'ไม่สามารถตรวจรับแบบสำรวจที่ตัวเองส่งได้ (cannot acknowledge your own submission)' };
        }

        HS_REVIEW_HEADERS.forEach(function(h) {
            if (headers.indexOf(h) === -1) { headers.push(h); sheet.getRange(1, headers.length).setValue(h); }
        });
        var now = new Date();
        var vals = {};
        vals[HS_REVIEW_STATUS] = status;
        vals[HS_REVIEW_BY]     = status === 'Pending' ? '' : userEmail;
        vals[HS_REVIEW_DATE]   = status === 'Pending' ? '' : now;
        vals[HS_REVIEW_NOTE]   = note;
        HS_REVIEW_HEADERS.forEach(function(h) { sheet.getRange(found.rowIndex, headers.indexOf(h) + 1).setValue(vals[h]); });
        _hrsCacheClear_();
        return { success: true, status: status, by: vals[HS_REVIEW_BY], date: status === 'Pending' ? '' : _hrsDateStr_(now), note: note };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Store × type status matrix ─────────────────────────────────────────────────
// sinceDate: 'yyyy-MM-dd' (Bangkok) or '' = all time. Submissions older than it don't
// count for the round but are flagged as `ever` so the page can say "sent last round".
function getHyperSubmissionStatus(sinceDate) {
    try {
        sinceDate = /^\d{4}-\d{2}-\d{2}$/.test(String(sinceDate || '')) ? String(sinceDate) : '';
        var cacheKey = 'HRS_V1_' + _hrsStamp_() + '_' + (sinceDate || 'all');
        var hit = _cacheGetChunked_(cacheKey);
        if (hit) return hit;

        var sinceMs = sinceDate ? new Date(sinceDate + 'T00:00:00+07:00').getTime() : 0;
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var kinds = _hrsKinds_();
        var byCode = {};    // code -> { s: {kind: cell}, ever: {kind: true}, amm, cm }
        var nowMs = Date.now();

        kinds.forEach(function(k) {
            var sh = ss.getSheetByName(k.def.sheet);
            if (!sh || sh.getLastRow() < 2) return;
            var lastCol = sh.getLastColumn(), n = sh.getLastRow() - 1;
            var hdr = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
            var want = ['Timestamp', 'ID', 'Reporter Email', 'Reporter Name', 'Branch Code', 'AMM MTN', 'CM Area'].concat(HS_REVIEW_HEADERS);
            var idx = {};
            want.forEach(function(h) { idx[h] = hdr.indexOf(h); });
            if (idx['Branch Code'] < 0) return;
            // Read only the columns we need, in clusters of adjacent columns: the form fields sit at
            // the start and the review columns at the end, with the wide Units_JSON /
            // Attachments_JSON cells in between — reading the full row would pull megabytes.
            var cols = want.map(function(h) { return idx[h]; }).filter(function(i) { return i > -1; }).sort(function(a, b) { return a - b; });
            var clusters = [];
            cols.forEach(function(c) {
                var last = clusters[clusters.length - 1];
                if (last && c - last.to <= 3) last.to = c; else clusters.push({ from: c, to: c });
            });
            var colVals = {};   // sheet column index -> array of values per data row
            clusters.forEach(function(cl) {
                var vals = sh.getRange(2, cl.from + 1, n, cl.to - cl.from + 1).getValues();
                for (var c = cl.from; c <= cl.to; c++) colVals[c] = vals;
            });
            var rowIdx = 0;
            var g = function(r, h) {
                var c = idx[h];
                if (c < 0) return '';
                for (var k2 = 0; k2 < clusters.length; k2++) {
                    if (c >= clusters[k2].from && c <= clusters[k2].to) return colVals[c][rowIdx][c - clusters[k2].from];
                }
                return '';
            };

            for (rowIdx = 0; rowIdx < n; rowIdx++) (function(r) {
                var code = String(g(r, 'Branch Code') || '').trim();
                if (!code) return;
                var ts = g(r, 'Timestamp');
                var ms = ts instanceof Date ? ts.getTime() : (ts ? new Date(ts).getTime() : 0);
                if (isNaN(ms)) ms = 0;
                var e = byCode[code] || (byCode[code] = { s: {}, ever: {}, cnt: {}, amm: '', cm: '', infoMs: -1 });
                e.ever[k.key] = true;
                if (g(r, 'AMM MTN') && ms >= e.infoMs) { e.amm = String(g(r, 'AMM MTN')); e.cm = String(g(r, 'CM Area') || ''); e.infoMs = ms; }
                if (ms < sinceMs) return;
                e.cnt[k.key] = (e.cnt[k.key] || 0) + 1;
                var cur = e.s[k.key];
                if (cur && cur._ms >= ms) return;
                var st = String(g(r, HS_REVIEW_STATUS) || '').trim() || 'Pending';
                e.s[k.key] = {
                    _ms: ms, id: String(g(r, 'ID') || ''), ts: _hrsDateStr_(ts),
                    ageDays: ms ? Math.floor((nowMs - ms) / 86400000) : '',
                    st: st, rep: String(g(r, 'Reporter Name') || g(r, 'Reporter Email') || ''),
                    by: String(g(r, HS_REVIEW_BY) || ''), rdate: _hrsDateStr_(g(r, HS_REVIEW_DATE)), note: String(g(r, HS_REVIEW_NOTE) || '')
                };
            })(null);
        });

        var dbInfo = hyperStoreDbMap_();   // AMM / CM from the store DB, not the (possibly wrong) stamp on records
        var stores = HYPER_REF_STORES.map(function(s) {
            var code = String(s[0]).trim(), e = byCode[code] || { s: {}, ever: {}, cnt: {} };
            var cells = {};
            kinds.forEach(function(k) {
                var c = e.s[k.key];
                if (c) { delete c._ms; c.n = e.cnt[k.key] || 1; }
                cells[k.key] = c || null;
            });
            return { code: code, name: String(s[1] || s[2] || code).trim(), nameTh: String(s[2] || '').trim(), format: s[3] || '(ไม่ระบุ)', region: s[4] || '(ไม่ระบุ)',
                     amm: (dbInfo[code] && dbInfo[code].amm) || e.amm || '', cm: (dbInfo[code] && dbInfo[code].cm) || e.cm || '', s: cells, ever: e.ever };
        });

        var meta = {};
        try { meta = _hschMeta_(); } catch (eM) {}
        var out = {
            success: true,
            generatedAt: Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm'),
            since: sinceDate,
            plan: { round: meta['round'] || '', startDate: meta['startDate'] || '', deadline: meta['deadline'] || '' },
            kinds: kinds.map(function(k) { return { key: k.key, label: k.label, icon: k.icon, page: k.page }; }),
            stores: stores
        };
        _cachePutChunked_(cacheKey, out, HRS_CACHE_TTL_SEC);
        return out;
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}
