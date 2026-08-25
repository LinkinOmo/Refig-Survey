// ─────────────────────────────────────────────────────────────────────────────
// Duplicate submission cleanup — shared engine for ALL survey types (Ref, Aircon,
// EDMI Solar, Layout, Trading Hours). Super Admin only.
//
// "Duplicate" is never just "same Branch Code" — every survey type has a
// legitimate reason a store gets more than one submission, so each type is
// scoped to its own natural repeat key:
//   - Ref / Aircon:      Branch Code + Survey Round   (one submission per quarter)
//   - EDMI Solar:        Branch Code + Reading Date    (weekly recurring reading —
//                         same branch every Friday is normal, NOT a duplicate)
//   - Layout Survey:     Branch Code + Project Name    (one per layout-change project)
//   - Trading Hours:     Branch Code + Survey Stage     (Pre-/Post-Conversion are
//                         two different, both-legitimate records per store)
// Only rows that share BOTH Branch Code and that scope key are ever touched.
//
// Cleanup keeps the newest row (by Timestamp) and MERGES data into it before
// deleting the rest: any column left blank on the newest row is backfilled from
// the next-newest row that has a value there, so no answered field is lost just
// because the most recent submission happened to skip it. Timestamp/ID are
// never touched — the kept row keeps its own identity. Attachments_JSON is
// merged separately by UNION (not blank-fill): every category's photo URLs
// across all matched rows are combined and deduped, so a re-survey's photos
// don't silently discard an earlier submission's still-useful equipment photos.
//
// Every row in a duplicate group is copied to a "<Sheet>_DupBackup" tab BEFORE
// any merge/delete happens, so a Super Admin can always recover the original
// data if a merge turns out wrong.
// ─────────────────────────────────────────────────────────────────────────────

var DUP_CLEANUP_TYPES = {
    ref: {
        sheet:       'Ref_Survey_Database',
        scopeHeader: 'Survey Round',
        hasStatus:   true,
        invalidate:  function() { _invalidateRefSlimCache(); }
    },
    aircon: {
        sheet:       'Aircon_Survey_Database',
        scopeHeader: 'Survey Round',
        hasStatus:   true,
        invalidate:  function() { _invalidateAcSlimCache(); }
    },
    edmi: {
        sheet:       'EDMI_Solar_Survey_Database',
        scopeHeader: 'Reading Date',
        hasStatus:   false,
        invalidate:  function() { _invalidateEdmiSlimCache(); }
    },
    layout: {
        sheet:       'Layout_Survey_Database',
        scopeHeader: 'Project Name',
        hasStatus:   false,
        invalidate:  function() { _invalidateLayoutSlimCache(); }
    },
    hours: {
        sheet:       'Trading_Hours_Survey_Database',
        scopeHeader: 'Survey Stage',
        hasStatus:   false,
        invalidate:  function() { _invalidateTradingHoursSlimCache(); }
    }
};

function _dupColIndex_(headers, name) {
    var target = name.toLowerCase();
    for (var h = 0; h < headers.length; h++) {
        if (String(headers[h]).toLowerCase().trim() === target) return h;
    }
    return -1;
}

// Numbers (including 0) and booleans are real values — only null/undefined and
// whitespace-only strings count as "blank" for merge-backfill purposes.
function _dupIsBlank_(v) {
    if (v === null || v === undefined) return true;
    if (v instanceof Date) return false;
    if (typeof v === 'string') return v.trim() === '';
    return false;
}

// Dates (e.g. EDMI's "Reading Date") need a stable, timezone-consistent string
// key rather than object identity so the same calendar date always groups together.
function _dupScopeKeyValue_(raw) {
    if (raw instanceof Date) {
        if (isNaN(raw.getTime())) return '';
        return Utilities.formatDate(raw, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    return String(raw || '').trim();
}

// ── List duplicate groups for one survey type — used by the Super Admin
// "ตรวจสอบข้อมูลซ้ำ" widget on each report page. Not itself admin-gated (matches
// the existing central getDuplicateSurveyData behavior) — only the actual
// merge/delete call re-checks isAdmin server-side.
function getDuplicateSurveyDataForType(typeKey) {
    try {
        var def = DUP_CLEANUP_TYPES[typeKey];
        if (!def) return { success: false, error: 'Unknown survey type: ' + typeKey };

        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName(def.sheet);
        if (!sheet || sheet.getLastRow() < 2) {
            return { success: true, scopeLabel: def.scopeHeader, sites: [], summary: { totalSites: 0, totalExtraRows: 0 } };
        }

        var data    = sheet.getDataRange().getValues();
        var headers = data[0];

        var tsIdx     = _dupColIndex_(headers, 'Timestamp');
        var codeIdx   = _dupColIndex_(headers, 'Branch Code');
        var nameIdx   = _dupColIndex_(headers, 'Branch Name');
        var statusIdx = def.hasStatus ? _dupColIndex_(headers, 'Status') : -1;
        var scopeIdx  = _dupColIndex_(headers, def.scopeHeader);
        var dmIdx     = _dupColIndex_(headers, 'DM Area');
        var cmIdx     = _dupColIndex_(headers, 'CM Area');
        var amIdx     = _dupColIndex_(headers, 'AMM MTN');
        if (codeIdx < 0) return { success: false, error: 'Branch Code column not found in ' + def.sheet };

        var siteMap = {}; // "code|scopeVal" -> { code, scope, name, dm, cm, am, subs: [] }

        for (var i = 1; i < data.length; i++) {
            var row  = data[i];
            var code = String(row[codeIdx] || '').trim();
            if (!code) continue;
            if (statusIdx >= 0 && String(row[statusIdx] || '').trim() === 'Draft') continue;

            var scopeVal = scopeIdx >= 0 ? _dupScopeKeyValue_(row[scopeIdx]) : '';
            var key = code + '|' + scopeVal;

            var tsRaw  = tsIdx >= 0 ? row[tsIdx] : '';
            var tsDate = tsRaw instanceof Date ? tsRaw : new Date(String(tsRaw));
            var tsMs   = isNaN(tsDate.getTime()) ? 0 : tsDate.getTime();
            var tsStr  = tsMs > 0
                ? Utilities.formatDate(tsDate, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')
                : '-';

            if (!siteMap[key]) {
                siteMap[key] = {
                    code:  code,
                    scope: scopeVal,
                    name:  nameIdx >= 0 ? String(row[nameIdx] || '').trim() : '',
                    dm:    dmIdx   >= 0 ? String(row[dmIdx]   || '').trim() : '',
                    cm:    cmIdx   >= 0 ? String(row[cmIdx]   || '').trim() : '',
                    am:    amIdx   >= 0 ? String(row[amIdx]   || '').trim() : '',
                    subs:  []
                };
            } else if (!siteMap[key].name && nameIdx >= 0) {
                siteMap[key].name = String(row[nameIdx] || '').trim();
            }

            siteMap[key].subs.push({ ts: tsStr, tsMs: tsMs });
        }

        var duplicates = [];
        Object.keys(siteMap).forEach(function(key) {
            var site = siteMap[key];
            if (site.subs.length <= 1) return;
            site.subs.sort(function(a, b) { return a.tsMs - b.tsMs; });
            duplicates.push({
                code:  site.code,
                scope: site.scope,
                name:  site.name,
                dm:    site.dm,
                cm:    site.cm,
                am:    site.am,
                count: site.subs.length,
                extra: site.subs.length - 1,
                subs:  site.subs
            });
        });
        duplicates.sort(function(a, b) { return b.extra - a.extra; });

        var totalExtraRows = duplicates.reduce(function(acc, s) { return acc + s.extra; }, 0);

        return {
            success:    true,
            scopeLabel: def.scopeHeader,
            sites:      duplicates,
            summary:    { totalSites: duplicates.length, totalExtraRows: totalExtraRows }
        };

    } catch (e) {
        Logger.log('getDuplicateSurveyDataForType Error: ' + e.toString());
        return { success: false, error: e.toString() };
    }
}

// ── Merge + backup + delete duplicates for one site+scope, one survey type.
// Super Admin (isAdmin) only. Backs up every matched row (pre-mutation) to
// "<Sheet>_DupBackup", merges blanks-only into the newest row, overwrites that
// row in place, then deletes the rest bottom-row-first.
function mergeDuplicateSurveysForSite(typeKey, code, scope, clientEmail) {
    try {
        var def = DUP_CLEANUP_TYPES[typeKey];
        if (!def) return { success: false, error: 'Unknown survey type: ' + typeKey };

        var adminCheck = checkSurveyAdminStatus(clientEmail || Session.getActiveUser().getEmail());
        if (!adminCheck.isAdmin && !adminCheck.sysAdminDedupAllowed) return { success: false, error: 'Super Admin privileges required.' };

        code = String(code || '').trim();
        if (!code) return { success: false, error: 'Branch code required.' };
        scope = String(scope || '').trim();

        var _wlock = _acquireWriteLock_();
        var ss    = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName(def.sheet);
        if (!sheet || sheet.getLastRow() < 2) return { success: false, error: 'Sheet not found or empty: ' + def.sheet };

        var data    = sheet.getDataRange().getValues();
        var headers = data[0];

        var tsIdx     = _dupColIndex_(headers, 'Timestamp');
        var codeIdx   = _dupColIndex_(headers, 'Branch Code');
        var statusIdx = def.hasStatus ? _dupColIndex_(headers, 'Status') : -1;
        var scopeIdx  = _dupColIndex_(headers, def.scopeHeader);
        if (codeIdx < 0) return { success: false, error: 'Branch Code column not found in ' + def.sheet };

        var matches = [];
        for (var i = 1; i < data.length; i++) {
            var rowCode = String(data[i][codeIdx] || '').trim();
            if (rowCode !== code) continue;
            if (statusIdx >= 0 && String(data[i][statusIdx] || '').trim() === 'Draft') continue;
            var rowScope = scopeIdx >= 0 ? _dupScopeKeyValue_(data[i][scopeIdx]) : '';
            if (rowScope !== scope) continue;

            var tsRaw  = tsIdx >= 0 ? data[i][tsIdx] : '';
            var tsDate = tsRaw instanceof Date ? tsRaw : new Date(String(tsRaw));
            matches.push({
                rowIndex: i + 1,
                tsMs: isNaN(tsDate.getTime()) ? 0 : tsDate.getTime(),
                values: data[i]
            });
        }

        if (matches.length <= 1) {
            return { success: true, merged: false, deleted: 0, message: 'No duplicates found for this site.' };
        }

        // Newest first — the newest row is the one that survives.
        matches.sort(function(a, b) { return b.tsMs - a.tsMs; });

        // ── Backup every matched row BEFORE any mutation ────────────────────────
        _backupDupRows_(ss, def.sheet, headers, matches, clientEmail || Session.getActiveUser().getEmail());

        // ── Merge: fill any blank cell on the newest row from the next-newest
        // row (matches is already newest-first) that has a non-blank value there.
        // Never touches Timestamp/ID — those stay the kept row's own identity.
        // Attachments_JSON is excluded from this generic pass and merged
        // separately below (union, not blank-fill) since every submission's
        // photos are worth keeping, not just whichever happened to be newest.
        var idIdx  = _dupColIndex_(headers, 'ID');
        var attIdx = _dupColIndex_(headers, 'Attachments_JSON');
        var skipCols = {};
        if (tsIdx  >= 0) skipCols[tsIdx]  = true;
        if (idIdx  >= 0) skipCols[idIdx]  = true;
        if (attIdx >= 0) skipCols[attIdx] = true;

        var merged = matches[0].values.slice();
        for (var c = 0; c < headers.length; c++) {
            if (skipCols[c]) continue;
            if (!_dupIsBlank_(merged[c])) continue;
            for (var m = 1; m < matches.length; m++) {
                if (!_dupIsBlank_(matches[m].values[c])) { merged[c] = matches[m].values[c]; break; }
            }
        }

        // ── Attachments_JSON: union photo URLs per category across every
        // matched row (deduped), newest row's own photos first within each
        // category. Every submission's photos are equipment evidence — losing
        // an older submission's photos just because a newer one re-surveyed
        // the same site would throw away real, still-useful photos.
        if (attIdx >= 0) {
            var mergedAtt = {};
            matches.forEach(function(m) {
                var raw = m.values[attIdx];
                if (!raw) return;
                var parsed;
                try { parsed = JSON.parse(raw); } catch (e) { return; }
                if (!parsed || typeof parsed !== 'object') return;
                Object.keys(parsed).forEach(function(cat) {
                    var urls = parsed[cat];
                    if (!Array.isArray(urls)) return;
                    if (!mergedAtt[cat]) mergedAtt[cat] = [];
                    urls.forEach(function(u) {
                        if (u && mergedAtt[cat].indexOf(u) === -1) mergedAtt[cat].push(u);
                    });
                });
            });
            merged[attIdx] = JSON.stringify(mergedAtt);
        }

        var keptRowIndex = matches[0].rowIndex;
        var changed = merged.some(function(v, idx) { return v !== matches[0].values[idx]; });
        if (changed) {
            sheet.getRange(keptRowIndex, 1, 1, headers.length).setValues([merged]);
        }

        // Delete the rest, bottom-row-first so earlier deletes never shift a
        // later row's index.
        var toDelete = matches.slice(1)
            .map(function(m) { return m.rowIndex; })
            .sort(function(a, b) { return b - a; });
        toDelete.forEach(function(rowIdx) { sheet.deleteRow(rowIdx); });

        def.invalidate();

        return { success: true, merged: changed, deleted: toDelete.length, keptRow: keptRowIndex };

    } catch (e) {
        Logger.log('mergeDuplicateSurveysForSite Error: ' + e.toString());
        return { success: false, error: e.toString() };
    }
}

// ─── System Admin Duplicate-Cleanup Toggle ─────────────────────────────────
// Off by default — dedup is destructive (merges + deletes real submission
// rows), so a Super Admin must explicitly opt System Admins into it. Only a
// Super Admin (isAdmin) may flip this toggle — unlike the SMF/Operation
// survey-edit toggles elsewhere in this app (which isSysAdmin can also flip),
// isSysAdmin deliberately cannot self-escalate this one.
function getSysAdminDupCleanupSetting() {
    return _sysAdminDupCleanupToggleOn_();
}

function setSysAdminDupCleanupSetting(enabled, clientEmail) {
    try {
        var status = checkSurveyAdminStatus(clientEmail || Session.getActiveUser().getEmail());
        if (!status.isAdmin) return { success: false, error: 'Super Admin privileges required.' };
        PropertiesService.getScriptProperties().setProperty('SYSADMIN_DUP_CLEANUP_ENABLED_V1', enabled ? 'true' : 'false');
        return { success: true, enabled: enabled };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function _sysAdminDupCleanupToggleOn_() {
    try {
        return PropertiesService.getScriptProperties().getProperty('SYSADMIN_DUP_CLEANUP_ENABLED_V1') === 'true';
    } catch (e) { return false; }
}

// Appends every pre-mutation row in the group to "<sourceSheetName>_DupBackup",
// creating that tab (with the source's current headers + audit columns) if it
// doesn't exist yet. Best-effort audit trail, not itself part of the app's data
// contract — if the source sheet's schema changes later, older backup rows
// simply keep whatever column layout was current when they were written.
function _backupDupRows_(ss, sourceSheetName, headers, matches, byEmail) {
    var backupName = sourceSheetName + '_DupBackup';
    var backupSheet = ss.getSheetByName(backupName);
    var auditHeaders = headers.concat(['_BackupTimestamp', '_BackupBy']);

    if (!backupSheet) {
        backupSheet = ss.insertSheet(backupName);
        backupSheet.appendRow(auditHeaders);
        backupSheet.setFrozenRows(1);
        var hdrRng = backupSheet.getRange(1, 1, 1, auditHeaders.length);
        hdrRng.setBackground('#b91c1c');
        hdrRng.setFontColor('#ffffff');
        hdrRng.setFontWeight('bold');
    }

    var now = new Date();
    var rows = matches.map(function(m) {
        return m.values.concat([now, byEmail || '']);
    });
    backupSheet.getRange(backupSheet.getLastRow() + 1, 1, rows.length, auditHeaders.length).setValues(rows);
}
