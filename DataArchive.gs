// ─────────────────────────────────────────────────────────────────────────────
// Data Archive ("flush to Drive") — Super Admin only.
//
// Every report/survey page reads whole sheets with getDataRange().getValues(),
// so append-only sheets get slower forever. This engine MOVES old rows out of
// the live spreadsheet into a monthly archive Google Sheet in a Drive folder
// ("Air Ref Survey — Data Archive" / "Archive YYYY-MM", one tab per source sheet).
//
// Rules per policy kind:
//   - log:       rows whose date is older than N months.
//   - business:  same, but only rows in a final status (open work orders /
//                pending trips are never moved, however old).
//   - survey:    same, but the NEWEST row per keep-key (usually Branch Code) is
//                always kept live so every store still shows its last known
//                equipment state; rows with Status = 'Draft' are never moved.
//   - backupTab: whole *_DupBackup / *_TypeCleanupBackup tabs are moved out
//                (they are recreated on demand by their cleanup tools).
//
// Safety: each sheet is processed under the shared write lock; rows are
// written to the archive and the archive row count is verified BEFORE the
// source rows are deleted (contiguous blocks, bottom-up). Anything that fails
// verification is left untouched in the live sheet.
// ─────────────────────────────────────────────────────────────────────────────

var ARCHIVE_FOLDER_NAME     = 'Air Ref Survey — Data Archive';
var ARCHIVE_PROP_FOLDER     = 'ARCHIVE_FOLDER_ID';
var ARCHIVE_PROP_OVERRIDES  = 'ARCHIVE_POLICY_OVERRIDES';
var ARCHIVE_PROP_LAST_RUN   = 'ARCHIVE_LAST_RUN';
var ARCHIVE_PROP_RESUME     = 'ARCHIVE_RESUME_AT';
var ARCHIVE_TRIGGER_FN      = 'runScheduledArchive';
var ARCHIVE_RESUME_FN       = 'runScheduledArchiveResume';
var ARCHIVE_TIME_BUDGET_MS  = 4.5 * 60 * 1000;   // GAS hard limit is 6 min
var ARCHIVE_BACKUP_TAB_RE   = /(_DupBackup|_TypeCleanupBackup)$/;

function _archInv_(fnName) {
    return function() {
        try { var fn = globalThis[fnName]; if (typeof fn === 'function') fn(); } catch (e) {}
    };
}
function _archInvHyper_() {
    try { CacheService.getScriptCache().remove('HS_EQUIP_INDEX_V1'); } catch (e) {}
}

var ARCHIVE_FINAL_WO   = ['Closed', 'Rejected', 'Cancelled'];
var ARCHIVE_FINAL_TRIP = ['Closed', 'Rejected', 'Cancelled', 'Approved'];

// Order matters only for resume — logs first (cheapest, safest), surveys last.
var ARCHIVE_POLICIES = [
    // ── Logs ──
    { key: 'activityLog',  group: 'Logs', kind: 'log', sheet: 'Activity_Log',   dates: ['Timestamp'], months: 6 },
    { key: 'debugLog',     group: 'Logs', kind: 'log', sheet: 'Debug_Log',      dates: ['Timestamp'], months: 1 },
    { key: 'emailOutbox',  group: 'Logs', kind: 'log', sheet: 'email_outbox',   dates: ['created_at'], months: 3,
      statusHeader: 'status', statusIn: ['sent', 'failed', 'cancelled'] },
    { key: 'surveyDrafts', group: 'Logs', kind: 'log', sheet: 'Survey_Drafts',  dates: ['Updated', 'Created'], months: 2 },
    { key: 'tripComments', group: 'Logs', kind: 'log', sheet: 'Trip_Comments',  dates: ['Timestamp'], months: 18 },

    // ── Business records (final status only) ──
    { key: 'tripPlans',    group: 'Business', kind: 'business', sheet: 'Trip_Plans',        dates: ['Start Date', 'Timestamp'], months: 12,
      statusHeader: 'Status', statusIn: ARCHIVE_FINAL_TRIP },
    { key: 'workOrders',   group: 'Business', kind: 'business', sheet: 'Work_Orders',       dates: ['Timestamp'], months: 12,
      statusHeader: 'Status', statusIn: ARCHIVE_FINAL_WO },
    { key: 'bigcWorkOrders', group: 'Business', kind: 'business', sheet: 'BigC_Work_Orders', dates: ['Timestamp'], months: 12,
      statusHeader: 'Status', statusIn: ARCHIVE_FINAL_WO },
    { key: 'refBroken',    group: 'Business', kind: 'log', sheet: 'Ref_Broken_History', dates: ['Logged At'], months: 24 },
    { key: 'acBroken',     group: 'Business', kind: 'log', sheet: 'Ac_Broken_History',  dates: ['Logged At'], months: 24 },
    { key: 'hyperEqHist',  group: 'Business', kind: 'log', sheet: 'Hyper_Equipment_History',     dates: ['Timestamp'], months: 36, invalidate: _archInvHyper_ },
    { key: 'hyperEqMaint', group: 'Business', kind: 'log', sheet: 'Hyper_Equipment_Maintenance', dates: ['Timestamp'], months: 36, invalidate: _archInvHyper_ },

    // ── Surveys (latest per keep-key always stays live) ──
    { key: 'ref',      group: 'Surveys', kind: 'survey', sheet: 'Ref_Survey_Database',     keepBy: ['Branch Code'], invalidate: _archInv_('_invalidateRefSlimCache') },
    { key: 'aircon',   group: 'Surveys', kind: 'survey', sheet: 'Aircon_Survey_Database',  keepBy: ['Branch Code'], invalidate: _archInv_('_invalidateAcSlimCache') },
    { key: 'np',       group: 'Surveys', kind: 'survey', sheet: 'NewProduct_Survey_Database', keepBy: ['Branch Code'], invalidate: _archInv_('_invalidateNpSlimCache') },
    { key: 'edmi',     group: 'Surveys', kind: 'survey', sheet: 'EDMI_Solar_Survey_Database', keepBy: ['Branch Code'], invalidate: _archInv_('_invalidateEdmiSlimCache') },
    { key: 'layout',   group: 'Surveys', kind: 'survey', sheet: 'Layout_Survey_Database',  keepBy: ['Branch Code', 'Project Name'], invalidate: _archInv_('_invalidateLayoutSlimCache') },
    { key: 'hours',    group: 'Surveys', kind: 'survey', sheet: 'Trading_Hours_Survey_Database', keepBy: ['Branch Code', 'Survey Stage'], invalidate: _archInv_('_invalidateTradingHoursSlimCache') },
    { key: 'siteVisit', group: 'Surveys', kind: 'survey', sheet: 'Site_Visit_Database',    keepBy: ['Branch Code'] },
    { key: 'cctv',     group: 'Surveys', kind: 'survey', sheet: 'CCTV_Survey_Database',    keepBy: ['Branch Code'] },
    { key: 'hyperRef', group: 'Surveys', kind: 'survey', sheet: 'Hyper_Ref_Survey_Database',       keepBy: ['Branch Code'], invalidate: _archInvHyper_ },
    { key: 'hyperAc',  group: 'Surveys', kind: 'survey', sheet: 'Hyper_Aircon_Survey_Database',    keepBy: ['Branch Code'], invalidate: _archInvHyper_ },
    { key: 'hyperEq',  group: 'Surveys', kind: 'survey', sheet: 'Hyper_Equipment_Survey_Database', keepBy: ['Branch Code'], invalidate: _archInvHyper_ },
    { key: 'hyperFo',  group: 'Surveys', kind: 'survey', sheet: 'Hyper_FreshFood_Survey_Database', keepBy: ['Branch Code'], invalidate: _archInvHyper_ },
    { key: 'hyperLi',  group: 'Surveys', kind: 'survey', sheet: 'Hyper_Lighting_Survey_Database',  keepBy: ['Branch Code'], invalidate: _archInvHyper_ },
    { key: 'hyperTo',  group: 'Surveys', kind: 'survey', sheet: 'Hyper_Toilet_Survey_Database',    keepBy: ['Branch Code'], invalidate: _archInvHyper_ },
    { key: 'hyperPk',  group: 'Surveys', kind: 'survey', sheet: 'Hyper_Parking_Survey_Database',   keepBy: ['Branch Code'], invalidate: _archInvHyper_ },
    { key: 'hyperHb',  group: 'Surveys', kind: 'survey', sheet: 'Hyper_HandBlower_Survey_Database', keepBy: ['Branch Code'], invalidate: _archInvHyper_ },
    { key: 'hyperFi',  group: 'Surveys', kind: 'survey', sheet: 'Hyper_Fire_Survey_Database', keepBy: ['Branch Code'], invalidate: _archInvHyper_ },
    { key: 'storeClose', group: 'Surveys', kind: 'survey', sheet: 'Store_Closing_Checklist_Database', keepBy: ['Branch Code'], invalidate: _archInvHyper_ },

    // ── Backup tabs (whole tab) ──
    { key: 'backupTabs', group: 'Backups', kind: 'backupTab', sheet: '*_DupBackup / *_TypeCleanupBackup', months: 0 }
];
ARCHIVE_POLICIES.forEach(function(p) {
    if (p.kind === 'survey') { p.dates = p.dates || ['Timestamp']; p.months = p.months || 12; p.protectStatus = ['Draft']; }
});

// ── Settings ────────────────────────────────────────────────────────────────

function _archOverrides_() {
    try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(ARCHIVE_PROP_OVERRIDES) || '{}'); }
    catch (e) { return {}; }
}

function _archEffective_(p, ov) {
    var o = ov[p.key] || {};
    return {
        enabled: o.enabled === undefined ? true : !!o.enabled,
        months:  (o.months !== undefined && !isNaN(parseInt(o.months, 10))) ? Math.max(1, parseInt(o.months, 10)) : p.months
    };
}

function _archRequireAdmin_(clientEmail) {
    var chk = checkSurveyAdminStatus(clientEmail || Session.getActiveUser().getEmail());
    if (!chk.isAdmin) throw new Error('Super Admin privileges required.');
    return chk.email || clientEmail || '';
}

// ── Row selection ───────────────────────────────────────────────────────────

function _archColIdx_(headers, name) {
    var t = String(name).toLowerCase().trim();
    for (var h = 0; h < headers.length; h++) if (String(headers[h]).toLowerCase().trim() === t) return h;
    return -1;
}

function _archToMs_(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? 0 : v.getTime();
    if (v === '' || v === null || v === undefined) return 0;
    var d = new Date(String(v));
    return isNaN(d.getTime()) ? 0 : d.getTime();
}

function _archRowMs_(row, dateIdxs) {
    for (var k = 0; k < dateIdxs.length; k++) {
        var ms = _archToMs_(row[dateIdxs[k]]);
        if (ms > 0) return ms;
    }
    return 0;
}

// Returns { archive: [dataIdx...], total, keptLatest, protectedCount, error }
function _archSelectRows_(p, eff, data) {
    var headers = data[0];
    var dateIdxs = (p.dates || []).map(function(n) { return _archColIdx_(headers, n); }).filter(function(i) { return i >= 0; });
    if (!dateIdxs.length) return { archive: [], total: data.length - 1, error: 'No date column (' + (p.dates || []).join('/') + ')' };

    var cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - eff.months);
    var cutoffMs = cutoff.getTime();

    var statusIdx = p.statusHeader ? _archColIdx_(headers, p.statusHeader) : -1;
    if (p.statusHeader && statusIdx < 0) return { archive: [], total: data.length - 1, error: 'No "' + p.statusHeader + '" column' };
    var statusSet = {};
    (p.statusIn || []).forEach(function(s) { statusSet[s.toLowerCase()] = true; });

    var protIdx = p.protectStatus ? _archColIdx_(headers, 'Status') : -1;
    var keepIdxs = (p.keepBy || []).map(function(n) { return _archColIdx_(headers, n); });
    if (p.keepBy && keepIdxs[0] < 0) return { archive: [], total: data.length - 1, error: 'No "' + p.keepBy[0] + '" column' };

    // Survey: find the newest row per keep-key (ignoring protected Draft rows).
    var latestByKey = {};
    if (p.keepBy) {
        for (var i = 1; i < data.length; i++) {
            if (protIdx >= 0 && p.protectStatus.indexOf(String(data[i][protIdx]).trim()) >= 0) continue;
            var key = keepIdxs.map(function(ix) { return ix >= 0 ? String(data[i][ix] || '').trim() : ''; }).join('|');
            if (!key.replace(/\|/g, '')) continue;
            var ms = _archRowMs_(data[i], dateIdxs);
            if (!latestByKey[key] || ms >= latestByKey[key].ms) latestByKey[key] = { ms: ms, idx: i };
        }
    }
    var keepRow = {};
    Object.keys(latestByKey).forEach(function(k) { keepRow[latestByKey[k].idx] = true; });

    var out = [], keptLatest = 0, protectedCount = 0;
    for (var r = 1; r < data.length; r++) {
        var row = data[r];
        if (row.join('') === '') continue;                         // blank row — leave alone
        var rms = _archRowMs_(row, dateIdxs);
        if (!rms || rms >= cutoffMs) continue;                     // undated or recent
        if (statusIdx >= 0 && !statusSet[String(row[statusIdx]).trim().toLowerCase()]) { protectedCount++; continue; }
        if (protIdx >= 0 && p.protectStatus.indexOf(String(row[protIdx]).trim()) >= 0) { protectedCount++; continue; }
        if (keepRow[r]) { keptLatest++; continue; }
        out.push(r);
    }
    return { archive: out, total: data.length - 1, keptLatest: keptLatest, protectedCount: protectedCount };
}

// ── Archive file ────────────────────────────────────────────────────────────

function _archFolder_() {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty(ARCHIVE_PROP_FOLDER);
    if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
    var it = DriveApp.getFoldersByName(ARCHIVE_FOLDER_NAME);
    var folder = it.hasNext() ? it.next() : DriveApp.createFolder(ARCHIVE_FOLDER_NAME);
    props.setProperty(ARCHIVE_PROP_FOLDER, folder.getId());
    return folder;
}

function _archMonthFile_(ctx) {
    if (ctx.archiveSS) return ctx.archiveSS;
    var month = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
    var name = 'Archive ' + month;
    var folder = _archFolder_();
    var files = folder.getFilesByName(name);
    var ss;
    if (files.hasNext()) {
        ss = SpreadsheetApp.openById(files.next().getId());
    } else {
        ss = SpreadsheetApp.create(name);
        DriveApp.getFileById(ss.getId()).moveTo(folder);
        var logTab = ss.getSheets()[0];
        logTab.setName('_Run_Log');
        logTab.appendRow(['Run At', 'Run By', 'Policy', 'Source Sheet', 'Rows Moved', 'Note']);
        logTab.setFrozenRows(1);
    }
    ctx.archiveSS = ss;
    return ss;
}

// Strings Sheets would re-interpret (numbers like branch code "0012", dates,
// booleans, formulas) get a leading apostrophe so the archive stores them as-is.
function _archSafeCell_(v) {
    if (typeof v !== 'string' || v === '') return v;
    if (/^[=+\-@]/.test(v) || /^[\d\s.,:\/%$]+$/.test(v) || /^(true|false)$/i.test(v)) return "'" + v;
    return v;
}

// Appends rows to the archive tab, mapping columns by header name (sources
// gain columns over time; the archive header grows to match). Returns the
// number of rows verified written.
function _archWriteRows_(archiveSS, tabName, srcHeaders, rows) {
    var tab = archiveSS.getSheetByName(tabName);
    if (!tab) {
        tab = archiveSS.insertSheet(tabName);
        tab.getRange(1, 1, 1, srcHeaders.length).setValues([srcHeaders.map(String)]).setFontWeight('bold');
        tab.setFrozenRows(1);
    }
    var lastCol = Math.max(tab.getLastColumn(), 1);
    var arcHeaders = tab.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
    var map = srcHeaders.map(function(h) {
        var name = String(h);
        var ix = arcHeaders.indexOf(name);
        if (ix < 0) { arcHeaders.push(name); ix = arcHeaders.length - 1; }
        return ix;
    });
    if (arcHeaders.length > lastCol || tab.getLastRow() === 0) {
        tab.getRange(1, 1, 1, arcHeaders.length).setValues([arcHeaders]).setFontWeight('bold');
    }
    var width = arcHeaders.length;
    var out = rows.map(function(row) {
        var o = new Array(width).fill('');
        for (var c = 0; c < map.length; c++) o[map[c]] = _archSafeCell_(row[c]);
        return o;
    });
    var before = tab.getLastRow();
    var CHUNK = 2000;
    for (var s = 0; s < out.length; s += CHUNK) {
        var part = out.slice(s, s + CHUNK);
        tab.getRange(tab.getLastRow() + 1, 1, part.length, width).setValues(part);
    }
    SpreadsheetApp.flush();
    return tab.getLastRow() - before;
}

// Deletes data rows (0-based data indices, header = 0) in contiguous blocks, bottom-up.
function _archDeleteRows_(sheet, dataIdxs) {
    var rows = dataIdxs.map(function(i) { return i + 1; }).sort(function(a, b) { return b - a; });
    // Sheets refuses to delete every non-frozen row; keep one spare blank row.
    if (rows.length && rows.length >= sheet.getLastRow() - sheet.getFrozenRows()) sheet.insertRowAfter(sheet.getLastRow());
    var i = 0;
    while (i < rows.length) {
        var end = rows[i], start = end;
        while (i + 1 < rows.length && rows[i + 1] === start - 1) { start--; i++; }
        sheet.deleteRows(start, end - start + 1);
        i++;
    }
}

// ── Per-policy runner ───────────────────────────────────────────────────────

function _archRunPolicy_(p, eff, ctx, dryRun) {
    var res = { key: p.key, group: p.group, sheet: p.sheet, months: eff.months, enabled: eff.enabled, total: 0, archived: 0 };
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (p.kind === 'backupTab') {
        var tabs = ss.getSheets().filter(function(s) { return ARCHIVE_BACKUP_TAB_RE.test(s.getName()); });
        res.total = tabs.length;
        res.detail = tabs.map(function(s) { return s.getName() + ' (' + Math.max(0, s.getLastRow() - 1) + ' rows)'; }).join(', ');
        if (dryRun || !tabs.length) { res.archived = dryRun ? tabs.length : 0; return res; }
        var lock = _acquireWriteLock_();
        try {
            var arc = _archMonthFile_(ctx);
            tabs.forEach(function(s) {
                var name = s.getName();
                var copy = s.copyTo(arc);
                var target = arc.getSheetByName(name) ? name + ' ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd HHmm') : name;
                copy.setName(target);
                SpreadsheetApp.flush();
                if (copy.getLastRow() !== s.getLastRow()) throw new Error('Copy verification failed for ' + name);
                ss.deleteSheet(s);
                res.archived++;
            });
        } finally { lock.releaseLock(); }
        return res;
    }

    var sheet = ss.getSheetByName(p.sheet);
    if (!sheet || sheet.getLastRow() < 2) { res.note = sheet ? 'empty' : 'sheet not found'; return res; }

    var lock2 = dryRun ? null : _acquireWriteLock_();
    try {
        var data = sheet.getDataRange().getValues();
        var sel = _archSelectRows_(p, eff, data);
        res.total = sel.total;
        res.keptLatest = sel.keptLatest || 0;
        res.protectedCount = sel.protectedCount || 0;
        if (sel.error) { res.error = sel.error; return res; }
        if (dryRun) { res.archived = sel.archive.length; return res; }
        if (!sel.archive.length) return res;

        var rows = sel.archive.map(function(i) { return data[i]; });
        var written = _archWriteRows_(_archMonthFile_(ctx), p.sheet, data[0], rows);
        if (written !== rows.length) {
            res.error = 'Archive verification failed (' + written + '/' + rows.length + ' written) — live sheet left untouched';
            return res;
        }
        _archDeleteRows_(sheet, sel.archive);
        SpreadsheetApp.flush();
        res.archived = rows.length;
    } finally { if (lock2) lock2.releaseLock(); }

    if (p.invalidate) { try { p.invalidate(); } catch (e) {} }
    return res;
}

// Runs enabled policies from startAt until done or out of time budget.
function _archRun_(dryRun, startAt, runBy) {
    var t0 = Date.now();
    var ov = _archOverrides_();
    var ctx = {};
    var results = [];
    var nextAt = -1;
    for (var i = startAt || 0; i < ARCHIVE_POLICIES.length; i++) {
        if (!dryRun && Date.now() - t0 > ARCHIVE_TIME_BUDGET_MS) { nextAt = i; break; }
        var p = ARCHIVE_POLICIES[i];
        var eff = _archEffective_(p, ov);
        if (!eff.enabled) { results.push({ key: p.key, group: p.group, sheet: p.sheet, months: eff.months, enabled: false, skipped: true }); continue; }
        try { results.push(_archRunPolicy_(p, eff, ctx, dryRun)); }
        catch (e) { results.push({ key: p.key, group: p.group, sheet: p.sheet, months: eff.months, enabled: true, error: e.toString() }); }
    }

    var summary = {
        dryRun: !!dryRun,
        at: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
        by: runBy || '',
        done: nextAt < 0,
        nextAt: nextAt,
        results: results,
        totalArchived: results.reduce(function(a, r) { return a + (r.archived || 0); }, 0),
        fileUrl: ctx.archiveSS ? ctx.archiveSS.getUrl() : ''
    };

    if (!dryRun) {
        if (summary.totalArchived > 0) _archBumpGen_();
        if (ctx.archiveSS) {
            var log = ctx.archiveSS.getSheetByName('_Run_Log');
            if (log) results.forEach(function(r) {
                if (r.archived || r.error) log.appendRow([new Date(), runBy || '', r.key, r.sheet, r.archived || 0, r.error || r.detail || '']);
            });
        }
        var props = PropertiesService.getScriptProperties();
        var prev = {};
        try { prev = JSON.parse(props.getProperty(ARCHIVE_PROP_LAST_RUN) || '{}'); } catch (e) {}
        // A resumed run accumulates into the same summary.
        if (startAt > 0 && prev.results) {
            summary.results = prev.results.concat(results);
            summary.totalArchived += prev.totalArchived || 0;
            summary.fileUrl = summary.fileUrl || prev.fileUrl;
        }
        props.setProperty(ARCHIVE_PROP_LAST_RUN, JSON.stringify(summary));
        try { if (typeof logUserActivity === 'function') logUserActivity(runBy, 'Data Archive', summary.totalArchived + ' rows moved to Drive'); } catch (e) {}
    }
    return summary;
}

// ── Client API (access-console.html) ────────────────────────────────────────

function getArchiveConfig(clientEmail) {
    try {
        _archRequireAdmin_(clientEmail);
        var ov = _archOverrides_();
        var props = PropertiesService.getScriptProperties();
        var folderId = props.getProperty(ARCHIVE_PROP_FOLDER);
        var last = null;
        try { last = JSON.parse(props.getProperty(ARCHIVE_PROP_LAST_RUN) || 'null'); } catch (e) {}
        return {
            success: true,
            policies: ARCHIVE_POLICIES.map(function(p) {
                var eff = _archEffective_(p, ov);
                return { key: p.key, group: p.group, kind: p.kind, sheet: p.sheet, months: eff.months, defaultMonths: p.months,
                         enabled: eff.enabled, keepBy: p.keepBy || null, statusIn: p.statusIn || null };
            }),
            triggerInstalled: ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === ARCHIVE_TRIGGER_FN; }),
            folderUrl: folderId ? 'https://drive.google.com/drive/folders/' + folderId : '',
            lastRun: last
        };
    } catch (e) { return { success: false, error: e.message || e.toString() }; }
}

function saveArchivePolicies(overrides, clientEmail) {
    try {
        _archRequireAdmin_(clientEmail);
        var clean = {};
        ARCHIVE_POLICIES.forEach(function(p) {
            var o = (overrides || {})[p.key];
            if (!o) return;
            clean[p.key] = { enabled: !!o.enabled };
            if (p.kind !== 'backupTab') clean[p.key].months = Math.max(1, parseInt(o.months, 10) || p.months);
        });
        PropertiesService.getScriptProperties().setProperty(ARCHIVE_PROP_OVERRIDES, JSON.stringify(clean));
        return { success: true };
    } catch (e) { return { success: false, error: e.message || e.toString() }; }
}

function previewArchive(clientEmail) {
    try {
        var by = _archRequireAdmin_(clientEmail);
        return { success: true, summary: _archRun_(true, 0, by) };
    } catch (e) { return { success: false, error: e.message || e.toString() }; }
}

// The client calls this again with summary.nextAt while summary.done is false.
function runArchiveNow(startAt, clientEmail) {
    try {
        var by = _archRequireAdmin_(clientEmail);
        return { success: true, summary: _archRun_(false, parseInt(startAt, 10) || 0, by) };
    } catch (e) { return { success: false, error: e.message || e.toString() }; }
}

function setArchiveTrigger(enabled, clientEmail) {
    try {
        _archRequireAdmin_(clientEmail);
        ScriptApp.getProjectTriggers().forEach(function(t) {
            if (t.getHandlerFunction() === ARCHIVE_TRIGGER_FN) ScriptApp.deleteTrigger(t);
        });
        // 1st of every month, ~02:00 Bangkok — outside working hours.
        if (enabled) ScriptApp.newTrigger(ARCHIVE_TRIGGER_FN).timeBased().onMonthDay(1).atHour(2).create();
        return { success: true, installed: !!enabled };
    } catch (e) { return { success: false, error: e.message || e.toString() }; }
}

// ── Trigger handlers ────────────────────────────────────────────────────────

function runScheduledArchive() {
    _archScheduledStep_(0);
}

function runScheduledArchiveResume() {
    ScriptApp.getProjectTriggers().forEach(function(t) {
        if (t.getHandlerFunction() === ARCHIVE_RESUME_FN) ScriptApp.deleteTrigger(t);
    });
    var at = parseInt(PropertiesService.getScriptProperties().getProperty(ARCHIVE_PROP_RESUME) || '0', 10) || 0;
    _archScheduledStep_(at);
}

function _archScheduledStep_(startAt) {
    var props = PropertiesService.getScriptProperties();
    var summary = _archRun_(false, startAt, 'monthly trigger');
    if (!summary.done) {
        props.setProperty(ARCHIVE_PROP_RESUME, String(summary.nextAt));
        ScriptApp.newTrigger(ARCHIVE_RESUME_FN).timeBased().after(2 * 60 * 1000).create();
    } else {
        props.deleteProperty(ARCHIVE_PROP_RESUME);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// "Include archive" read path for reports.
//
// Report loaders only ever call getLastRow / getLastColumn / getRange(r,c,nr,nc)
// .getValues() / getDataRange().getValues() on their sheet, so instead of
// rewriting each loader, they ask _archSheetFor_(name, includeArchive) for a
// sheet: the real one normally, or a read-only in-memory stand-in holding
// [live headers] + archived rows (oldest first) + live rows. Loaders that
// cache their output must skip the cache when includeArchive is on.
// ─────────────────────────────────────────────────────────────────────────────

var ARCHIVE_PROP_GEN = 'ARCHIVE_GEN';   // bumped after every flush → invalidates archive read cache
var ARCHIVE_READ_CACHE_TTL = 6 * 3600;

function _ArchSheet_(name, values) {
    this._name = name;
    this._v = values;
    this._w = values.length ? values[0].length : 0;
}
_ArchSheet_.prototype.getName       = function() { return this._name; };
_ArchSheet_.prototype.getLastRow    = function() { return this._v.length; };
_ArchSheet_.prototype.getLastColumn = function() { return this._w; };
_ArchSheet_.prototype.getMaxRows    = function() { return this._v.length; };
_ArchSheet_.prototype.getMaxColumns = function() { return this._w; };
_ArchSheet_.prototype.getDataRange  = function() { return this.getRange(1, 1, this._v.length, this._w); };
_ArchSheet_.prototype.getRange = function(r, c, nr, nc) {
    var v = this._v, self = this;
    nr = nr || 1; nc = nc || 1;
    var vals = function() {
        var out = [];
        for (var i = r - 1; i < r - 1 + nr; i++) {
            var src = v[i] || [], row = new Array(nc);
            for (var j = 0; j < nc; j++) { var x = src[c - 1 + j]; row[j] = x === undefined ? '' : x; }
            out.push(row);
        }
        return out;
    };
    var ro = function() { throw new Error('Archived records are read-only (' + self._name + ')'); };
    return {
        getValues: vals,
        getDisplayValues: function() { return vals().map(function(row) { return row.map(function(x) { return x === null ? '' : String(x); }); }); },
        getValue: function() { return vals()[0][0]; },
        getNumRows: function() { return nr; },
        getNumColumns: function() { return nc; },
        setValue: ro, setValues: ro, clear: ro, clearContent: ro
    };
};
['appendRow', 'deleteRow', 'deleteRows', 'insertRowAfter', 'insertRowBefore', 'insertColumnAfter'].forEach(function(m) {
    _ArchSheet_.prototype[m] = function() { throw new Error('Archived records are read-only (' + this._name + ')'); };
});

function _archGen_() {
    return PropertiesService.getScriptProperties().getProperty(ARCHIVE_PROP_GEN) || '0';
}

function _archBumpGen_() {
    PropertiesService.getScriptProperties().setProperty(ARCHIVE_PROP_GEN, String(Date.now()));
}

// JSON turns Dates into ISO strings — turn them back so loaders' `instanceof Date` checks still work.
var _ARCH_ISO_RE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
function _archRevive_(k, v) { return (typeof v === 'string' && _ARCH_ISO_RE.test(v)) ? new Date(v) : v; }

// All archived rows for one source sheet across every monthly archive file
// (oldest file first). Returns { headers: [...], rows: [[...]] } in archive-header order.
function _archReadArchived_(sheetName) {
    var cacheKey = 'ARCH_RD_' + _archGen_() + '_' + sheetName.replace(/[^A-Za-z0-9_]/g, '_');
    try {
        var cache = CacheService.getScriptCache();
        var nStr = cache.get(cacheKey + '_n');
        if (nStr !== null) {
            var n = parseInt(nStr, 10), parts = [], keys = [];
            for (var i = 0; i < n; i++) keys.push(cacheKey + '_' + i);
            var got = cache.getAll(keys);
            for (var k = 0; k < keys.length; k++) { if (got[keys[k]] === undefined) { parts = null; break; } parts.push(got[keys[k]]); }
            if (parts) return JSON.parse(parts.join(''), _archRevive_);
        }
    } catch (e) {}

    var out = { headers: [], rows: [] };
    var folderId = PropertiesService.getScriptProperties().getProperty(ARCHIVE_PROP_FOLDER);
    if (!folderId) return out;
    var folder;
    try { folder = DriveApp.getFolderById(folderId); } catch (e) { return out; }

    var files = [];
    var it = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
    while (it.hasNext()) { var f = it.next(); if (/^Archive \d{4}-\d\d$/.test(f.getName())) files.push(f); }
    files.sort(function(a, b) { return a.getName() < b.getName() ? -1 : 1; });

    files.forEach(function(f) {
        var tab = SpreadsheetApp.openById(f.getId()).getSheetByName(sheetName);
        if (!tab || tab.getLastRow() < 2) return;
        var vals = tab.getDataRange().getValues();
        var map = vals[0].map(function(h) {
            h = String(h);
            var ix = out.headers.indexOf(h);
            if (ix < 0) { out.headers.push(h); ix = out.headers.length - 1; }
            return ix;
        });
        for (var r = 1; r < vals.length; r++) {
            var row = [];
            for (var c = 0; c < map.length; c++) row[map[c]] = vals[r][c];
            out.rows.push(row);
        }
    });

    try {
        var json = JSON.stringify(out);
        if (json.length < 5 * 1024 * 1024) {
            var store = {}, nc = 0;
            for (var s = 0; s < json.length; s += 90000) store[cacheKey + '_' + nc++] = json.substring(s, s + 90000);
            store[cacheKey + '_n'] = String(nc);
            CacheService.getScriptCache().putAll(store, ARCHIVE_READ_CACHE_TTL);
        }
    } catch (e) {}
    return out;
}

// Live values + archived rows mapped onto the live header order (archive-only
// columns appended). Archived rows come first, so loaders that reverse() for
// newest-first still list them last.
function _archMergedValues_(sheetName) {
    var live = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    var liveVals = (live && live.getLastRow() > 0) ? live.getDataRange().getValues() : [[]];
    var headers = liveVals[0].slice();
    var arc = _archReadArchived_(sheetName);
    if (!headers.length && arc.headers.length) headers = arc.headers.slice();
    var map = arc.headers.map(function(h) {
        var ix = -1;
        for (var i = 0; i < headers.length; i++) if (String(headers[i]).trim() === String(h).trim()) { ix = i; break; }
        if (ix < 0) { headers.push(h); ix = headers.length - 1; }
        return ix;
    });
    var w = headers.length;
    var pad = function(row) { var o = new Array(w); for (var j = 0; j < w; j++) o[j] = row[j] === undefined ? '' : row[j]; return o; };
    var merged = [headers];
    arc.rows.forEach(function(row) {
        var o = new Array(w).fill('');
        for (var c = 0; c < map.length; c++) if (row[c] !== undefined && row[c] !== null) o[map[c]] = row[c];
        merged.push(o);
    });
    for (var r = 1; r < liveVals.length; r++) merged.push(pad(liveVals[r]));
    return merged;
}

// For report list loaders.
function _archSheetFor_(sheetName, includeArchive) {
    if (!includeArchive) return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    try { return new _ArchSheet_(sheetName, _archMergedValues_(sheetName)); }
    catch (e) { Logger.log('_archSheetFor_ ' + sheetName + ': ' + e); return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName); }
}

// For get*RecordById(): the real sheet when the ID is live (normal path, one
// TextFinder of extra cost), otherwise the merged stand-in so an archived
// record still opens read-only from an "include archive" report.
function _archLookupSheet_(sheetName, id) {
    var live = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    try {
        if (!PropertiesService.getScriptProperties().getProperty(ARCHIVE_PROP_FOLDER)) return live;
        var target = String(id || '').trim();
        if (!target) return live;
        if (live && live.getLastRow() > 1 && live.createTextFinder(target).matchEntireCell(true).findNext()) return live;
        var arc = _archReadArchived_(sheetName);
        var idIx = arc.headers.indexOf('ID');
        if (idIx < 0) return live;
        for (var i = 0; i < arc.rows.length; i++) {
            if (String(arc.rows[i][idIx]).trim() === target) return new _ArchSheet_(sheetName, _archMergedValues_(sheetName));
        }
    } catch (e) { Logger.log('_archLookupSheet_ ' + sheetName + ': ' + e); }
    return live;
}
