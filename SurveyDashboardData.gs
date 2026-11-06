// ─────────────────────────────────────────────────────────────────────────────
// Pre-calculated, cached analytics dashboards — one per survey report type
// (Ref, Aircon, EDMI Solar, Layout, Trading Hours). Each getXSurveyDashboardData()
// aggregates from the type's existing (already-cached) slim-list function, so
// the expensive full-sheet scan happens at most once per cache window
// regardless of how many people open the dashboard. The AGGREGATED payload
// itself is also cached (chunked — aggregated payloads can exceed the 100KB
// CacheService per-key limit), so repeat dashboard loads are near-instant.
//
// BU toggle: submissions don't carry their own BU field (only DM/CM/AMM), so
// every row is tagged with its store's BU via a Branch-Code join against the
// master store list (getStoreDBDataV2, already 6h-cached). Rather than cache
// one payload per BU (cache-key/invalidation explosion), the WHOLE payload is
// pre-broken-out by BU (groupBreakdown rows, daily trend buckets, condition
// histogram) in ONE cache entry — the frontend's BU toggle re-slices this
// client-side with no extra server round trip. Only "duplicates pending" and
// the EDMI/Layout summary rate cards stay BU-unscoped (operational housekeeping
// figures, not really a per-BU metric).
//
// Invalidation: each type's existing _invalidateXSlimCache() (already called
// from every create/update/delete/merge path) now also clears this dashboard
// cache — see the one-line addition at the bottom of each of those functions
// in Survey.gs/EdmiSolarSurvey.gs/LayoutSurvey.gs/TradingHoursSurvey.gs. No
// new invalidation call sites were needed anywhere else.
//
// Frontend: one shared page, SurveyDashboard.html (?page=survey_dashboard&type=ref),
// parameterized like RefSurveyReport.html's Ref/NP reuse — not 5 separate files.
// NOTE: this file is named SurveyDashboardData.gs, NOT SurveyDashboard.gs —
// Apps Script forbids a .gs and .html file sharing a base filename in one
// project (hit this as a real `clasp push` error).
// ─────────────────────────────────────────────────────────────────────────────

var DASH_CACHE_TTL_SEC = 600; // 10 minutes
var DASH_TREND_DAYS = 30;

function _cachePutChunked_(key, obj, ttlSec) {
    try {
        var json = JSON.stringify(obj);
        var cache = CacheService.getScriptCache();
        var chunkSize = 90000;
        var n = Math.max(1, Math.ceil(json.length / chunkSize));
        for (var i = 0; i < n; i++) {
            cache.put(key + '_' + i, json.substring(i * chunkSize, (i + 1) * chunkSize), ttlSec);
        }
        cache.put(key + '_n', String(n), ttlSec);
    } catch (e) { Logger.log('_cachePutChunked_ error: ' + e); }
}

function _cacheGetChunked_(key) {
    try {
        var cache = CacheService.getScriptCache();
        var nStr = cache.get(key + '_n');
        if (nStr === null) return null;
        var n = parseInt(nStr, 10);
        var parts = [];
        for (var i = 0; i < n; i++) {
            var part = cache.get(key + '_' + i);
            if (part === null) return null; // partial expiry — treat as a miss
            parts.push(part);
        }
        return JSON.parse(parts.join(''));
    } catch (e) { return null; }
}

// Called from each type's _invalidateXSlimCache(). Safe to call even if
// nothing is cached (n defaults to a small upper bound and removeAll on
// already-expired keys is a no-op).
function _cacheClearChunked_(key) {
    try {
        var cache = CacheService.getScriptCache();
        var nStr = cache.get(key + '_n');
        var n = nStr !== null ? parseInt(nStr, 10) : 30;
        var keys = [key + '_n'];
        for (var i = 0; i < n; i++) keys.push(key + '_' + i);
        cache.removeAll(keys);
    } catch (e) {}
}

// ── Shared aggregation helpers ──────────────────────────────────────────────

// Branch Code -> BU lookup, plus the distinct BU list for the toggle UI.
// Built from the master store list (already 6h-cached), not the survey sheets.
function _dashCodeToBu_() {
    var storeList = getStoreDBDataV2();
    var map = {};
    var buSet = {};
    storeList.forEach(function(s) {
        var code = String(s.id || '').trim();
        var bu = s.bu || '(ไม่ระบุ)';
        if (code) map[code] = bu;
        buSet[bu] = true;
    });
    return { map: map, buList: Object.keys(buSet).sort() };
}

function _dashDayKey_(tsRaw) {
    var d = tsRaw instanceof Date ? tsRaw : new Date(tsRaw);
    if (isNaN(d.getTime())) return null;
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function _dashGroupKey_(bu, dm, cm, am) {
    return (bu || '(ไม่ระบุ)') + '|' + (dm || '(ไม่ระบุ)') + '|' + (cm || '(ไม่ระบุ)') + '|' + (am || '(ไม่ระบุ)');
}

// Daily submission counts for the last DASH_TREND_DAYS calendar days,
// 0-filled, broken out per BU so the frontend's BU toggle can re-slice this
// without another server call. taggedRows: [{ts, bu}, ...].
function _dashTrendDailyByBu_(taggedRows) {
    var days = [];
    var now = new Date();
    for (var i = DASH_TREND_DAYS - 1; i >= 0; i--) {
        var d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        days.push(Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'));
    }
    var buckets = {}; // "bu|yyyy-MM-dd" -> count
    var bus = {};
    taggedRows.forEach(function(r) {
        var day = _dashDayKey_(r.ts);
        if (!day) return;
        bus[r.bu] = true;
        var key = r.bu + '|' + day;
        buckets[key] = (buckets[key] || 0) + 1;
    });
    var out = [];
    Object.keys(bus).forEach(function(bu) {
        days.forEach(function(day) {
            out.push({ bu: bu, period: day, count: buckets[bu + '|' + day] || 0 });
        });
    });
    return out;
}

// Condition-rating histogram, broken out per BU. Auto-discovers every header
// matching /cond\s*rating/i — works across Ref's many type-prefixed columns
// (e.g. "Ref Open Cond Rating_1") and Aircon's per-unit columns ("Unit 1
// Cond Rating") without hardcoding either type's full field list. Reads only
// the matched columns + Branch Code (for the BU join) + Status, not full rows.
function _dashConditionHistogramByBu_(sheetName, hasStatus, codeToBu) {
    var histByBu = {};
    function emptyHist() { return { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, unrated: 0 }; }
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
        if (!sheet || sheet.getLastRow() < 2) return histByBu;
        var lastCol = sheet.getLastColumn();
        var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        var condCols = [], statusIdx = -1, codeIdx = -1;
        headers.forEach(function(h, i) {
            var hs = String(h);
            if (/cond\s*rating/i.test(hs)) condCols.push(i);
            if (hasStatus && hs.trim().toLowerCase() === 'status') statusIdx = i;
            if (hs.trim().toLowerCase() === 'branch code') codeIdx = i;
        });
        if (condCols.length === 0) return histByBu;

        var nRows = sheet.getLastRow() - 1;
        var data = sheet.getRange(2, 1, nRows, lastCol).getValues();
        data.forEach(function(row) {
            if (statusIdx >= 0 && String(row[statusIdx] || '').trim() === 'Draft') return;
            var code = codeIdx >= 0 ? String(row[codeIdx] || '').trim() : '';
            var bu = codeToBu[code] || '(ไม่ระบุ)';
            if (!histByBu[bu]) histByBu[bu] = emptyHist();
            condCols.forEach(function(ci) {
                var v = row[ci];
                if (v === '' || v === null || v === undefined) return; // not rated — skip, don't count as 0
                var n = parseInt(v, 10);
                if (n >= 0 && n <= 5) histByBu[bu][n]++; else histByBu[bu].unrated++;
            });
        });
    } catch (e) {
        Logger.log('_dashConditionHistogramByBu_ error: ' + e);
    }
    return histByBu;
}

// Coverage against the FULL active-store master list (getStoreDBDataV2),
// grouped by BU/DM/CM/AMM. "coveredCodes" is a {code: true} set the caller
// builds — the scoping decision (latest round only, last-N-days, etc.) is
// entirely up to the caller; this just does the store roster join + grouping.
// Totals returned are all-BU; the frontend re-sums `groups` for the selected BU.
function _dashCoverageByStore_(coveredCodes) {
    var storeList = getStoreDBDataV2();
    var byGroup = {};
    storeList.forEach(function(s) {
        var code = String(s.id || '').trim();
        if (!code) return;
        var key = _dashGroupKey_(s.bu, s.dmName, s.cmName, s.ammMtn);
        if (!byGroup[key]) {
            byGroup[key] = { bu: s.bu || '(ไม่ระบุ)', dm: s.dmName || '(ไม่ระบุ)', cm: s.cmName || '(ไม่ระบุ)', am: s.ammMtn || '(ไม่ระบุ)', total: 0, covered: 0 };
        }
        byGroup[key].total++;
        if (coveredCodes[code]) byGroup[key].covered++;
    });
    var groups = Object.keys(byGroup).map(function(k) { return byGroup[k]; });
    groups.sort(function(a, b) { return (a.covered / (a.total || 1)) - (b.covered / (b.total || 1)); });
    var totalEligible = storeList.length;
    var totalCovered  = groups.reduce(function(acc, g) { return acc + g.covered; }, 0);
    return {
        totalEligible: totalEligible,
        covered:       totalCovered,
        pct:           totalEligible ? Math.round((totalCovered / totalEligible) * 100) : 0,
        groups:        groups
    };
}

function _dashDefaultBu_(buList) {
    return buList.indexOf('BCM') !== -1 ? 'BCM' : (buList[0] || '');
}

// ─────────────────────────────────────────────────────────────────────────────
// Ref Survey Dashboard
// ─────────────────────────────────────────────────────────────────────────────
function getRefSurveyDashboardData(clientEmail) {
    var CACHE_KEY = 'DASH_REF_V2';
    try {
        var cached = _cacheGetChunked_(CACHE_KEY);
        if (cached) return cached;

        var slimRes = getRefSurveyListSlim();
        var rows = (slimRes && slimRes.success) ? slimRes.data : [];
        var nonDraft = rows.filter(function(r) { return String(r['Status'] || '').trim() !== 'Draft'; });

        var buLookup = _dashCodeToBu_();

        // "Latest round" = the Survey Round value whose newest submission is
        // the most recent overall — coverage is scoped to that round only,
        // matching how the app treats rounds everywhere else.
        var roundLatestTs = {};
        nonDraft.forEach(function(r) {
            var round = String(r['Survey Round'] || '').trim();
            if (!round) return;
            var t = new Date(r['Timestamp']).getTime();
            if (!roundLatestTs[round] || t > roundLatestTs[round]) roundLatestTs[round] = t;
        });
        var latestRound = '';
        Object.keys(roundLatestTs).forEach(function(r) {
            if (!latestRound || roundLatestTs[r] > roundLatestTs[latestRound]) latestRound = r;
        });

        var coveredCodes = {};
        nonDraft.forEach(function(r) {
            if (String(r['Survey Round'] || '').trim() === latestRound) {
                coveredCodes[String(r['Branch Code'] || '').trim()] = true;
            }
        });

        var QTY_FIELDS = ['Ref Open Qty', 'Ref Bev Plugin Qty', 'Ref Bev Walk In Qty', 'Ref Bev Remote Qty',
            'Ref Frozen1 Door Qty', 'Ref Frozen2 Door Qty', 'Ref Frozen3 Door Qty', 'Ref Frozen4 Door Qty',
            'Ref Frozen Plugin Qty', 'Ref Frozen Remote Qty', 'Ref Frozen Walk In Qty',
            'Ref Ice Cream Qty', 'Ref Ice Qty', 'Ref Ss4 Door Qty', 'Ref Dump Chiller Qty'];

        var byGroup = {};
        var taggedRows = [];
        nonDraft.forEach(function(r) {
            var code = String(r['Branch Code'] || '').trim();
            var bu = buLookup.map[code] || '(ไม่ระบุ)';
            taggedRows.push({ ts: r['Timestamp'], bu: bu });

            var key = _dashGroupKey_(bu, r['DM Area'], r['CM Area'], r['AMM MTN']);
            if (!byGroup[key]) {
                byGroup[key] = { bu: bu, dm: r['DM Area'] || '(ไม่ระบุ)', cm: r['CM Area'] || '(ไม่ระบุ)', am: r['AMM MTN'] || '(ไม่ระบุ)', submissions: 0 };
                QTY_FIELDS.forEach(function(f) { byGroup[key][f] = 0; });
            }
            byGroup[key].submissions++;
            // Qty fields are raw user-entered numbers (forms use novalidate, so
            // the inputs' min="0" is not browser-enforced) — clamp negative
            // typos to 0 here so a stray "-2" can't drag a dashboard bar
            // negative. See feedback_gas_novalidate_required.
            QTY_FIELDS.forEach(function(f) { var v = parseInt(r[f], 10) || 0; byGroup[key][f] += Math.max(0, v); });
        });

        var dup = getDuplicateSurveyDataForType('ref');

        var payload = {
            success: true,
            generatedAt: new Date().toISOString(),
            buList: buLookup.buList,
            defaultBu: _dashDefaultBu_(buLookup.buList),
            summary: {
                totalSubmissions:  nonDraft.length,
                latestRound:       latestRound,
                duplicatesPending: (dup && dup.success) ? dup.summary.totalExtraRows : 0
            },
            trendDaily:          _dashTrendDailyByBu_(taggedRows),
            typeFieldOrder:      QTY_FIELDS,
            groupBreakdown:      Object.keys(byGroup).map(function(k) { return byGroup[k]; }),
            coverage:            _dashCoverageByStore_(coveredCodes),
            conditionHistByBu:   _dashConditionHistogramByBu_('Ref_Survey_Database', true, buLookup.map)
        };
        _cachePutChunked_(CACHE_KEY, payload, DASH_CACHE_TTL_SEC);
        return payload;
    } catch (e) {
        Logger.log('getRefSurveyDashboardData Error: ' + e.toString());
        return { success: false, error: e.toString() };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Aircon Survey Dashboard
// ─────────────────────────────────────────────────────────────────────────────
function getAirconSurveyDashboardData(clientEmail) {
    var CACHE_KEY = 'DASH_AIRCON_V3';
    try {
        var cached = _cacheGetChunked_(CACHE_KEY);
        if (cached) return cached;

        var slimRes = getAirconSurveyListSlim();
        var rows = (slimRes && slimRes.success) ? slimRes.data : [];
        var nonDraft = rows.filter(function(r) { return String(r.status || '').trim() !== 'Draft'; });

        var buLookup = _dashCodeToBu_();

        var roundLatestTs = {};
        nonDraft.forEach(function(r) {
            var round = String(r.round || '').trim();
            if (!round) return;
            var t = new Date(r.timestamp).getTime();
            if (!roundLatestTs[round] || t > roundLatestTs[round]) roundLatestTs[round] = t;
        });
        var latestRound = '';
        Object.keys(roundLatestTs).forEach(function(r) {
            if (!latestRound || roundLatestTs[r] > roundLatestTs[latestRound]) latestRound = r;
        });

        // otherQty catches any "Unit N Type" value that isn't one of the 5 known
        // types/aliases (e.g. a free-text entry) — see the fix note in
        // getAirconSurveyListSlim (Survey.gs) for the real bug this covers.
        var TYPE_FIELDS = { wtQty: 'Wall Type', htQty: 'Hanging Type', ctQty: 'Cassette Type', fsQty: 'Floor Standing', ptQty: 'Package Type', otherQty: 'อื่นๆ (Other)' };

        var coveredCodes = {};
        var byGroup = {};
        var taggedRows = [];
        nonDraft.forEach(function(r) {
            var code = String(r.station || '').split(' - ')[0].trim();
            var bu = buLookup.map[code] || '(ไม่ระบุ)';
            taggedRows.push({ ts: r.timestamp, bu: bu });

            if (String(r.round || '').trim() === latestRound) coveredCodes[code] = true;

            var key = _dashGroupKey_(bu, r.dm, r.cluster, r.ammMtn);
            if (!byGroup[key]) {
                byGroup[key] = { bu: bu, dm: r.dm || '(ไม่ระบุ)', cm: r.cluster || '(ไม่ระบุ)', am: r.ammMtn || '(ไม่ระบุ)', submissions: 0, wtQty: 0, htQty: 0, ctQty: 0, fsQty: 0, ptQty: 0, otherQty: 0 };
            }
            byGroup[key].submissions++;
            Object.keys(TYPE_FIELDS).forEach(function(f) { byGroup[key][f] += r[f] || 0; });
        });

        var dup = getDuplicateSurveyDataForType('aircon');

        var payload = {
            success: true,
            generatedAt: new Date().toISOString(),
            buList: buLookup.buList,
            defaultBu: _dashDefaultBu_(buLookup.buList),
            summary: {
                totalSubmissions:  nonDraft.length,
                latestRound:       latestRound,
                duplicatesPending: (dup && dup.success) ? dup.summary.totalExtraRows : 0
            },
            trendDaily:          _dashTrendDailyByBu_(taggedRows),
            typeLabels:          TYPE_FIELDS,
            typeFieldOrder:      Object.keys(TYPE_FIELDS),
            groupBreakdown:      Object.keys(byGroup).map(function(k) { return byGroup[k]; }),
            coverage:            _dashCoverageByStore_(coveredCodes),
            conditionHistByBu:   _dashConditionHistogramByBu_('Aircon_Survey_Database', true, buLookup.map)
        };
        _cachePutChunked_(CACHE_KEY, payload, DASH_CACHE_TTL_SEC);
        return payload;
    } catch (e) {
        Logger.log('getAirconSurveyDashboardData Error: ' + e.toString());
        return { success: false, error: e.toString() };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EDMI Solar Survey Dashboard
// No Status/Draft concept, no Survey Round, no equipment/condition rating —
// this is a weekly meter reading, not an equipment survey. Coverage here
// means "active stores with at least one reading in the last 14 days" (~2
// reading cycles) — an approximation against the FULL active-store list since
// there is no dedicated solar-equipped-stores allowlist in this codebase to
// scope the true denominator down to. Flagged in the payload as approximate.
// ─────────────────────────────────────────────────────────────────────────────
function getEdmiSolarSurveyDashboardData(clientEmail) {
    var CACHE_KEY = 'DASH_EDMI_V2';
    try {
        var cached = _cacheGetChunked_(CACHE_KEY);
        if (cached) return cached;

        var slimRes = getEdmiSolarSurveyListSlim();
        var rows = (slimRes && slimRes.success) ? slimRes.data : [];
        var buLookup = _dashCodeToBu_();

        var cutoffMs = Date.now() - 14 * 24 * 60 * 60 * 1000;
        var coveredCodes = {};
        var blockedCount = 0;
        var byGroup = {};
        var taggedRows = [];
        rows.forEach(function(r) {
            var code = String(r['Branch Code'] || '').trim();
            var bu = buLookup.map[code] || '(ไม่ระบุ)';
            taggedRows.push({ ts: r['Timestamp'], bu: bu });

            var t = new Date(r['Timestamp']).getTime();
            if (!isNaN(t) && t >= cutoffMs) coveredCodes[code] = true;

            var isBlocked = String(r['Access Blocked'] || '').trim() === 'Yes';
            if (isBlocked) blockedCount++;

            var key = _dashGroupKey_(bu, r['DM Area'], r['CM Area'], r['AMM MTN']);
            if (!byGroup[key]) byGroup[key] = { bu: bu, dm: r['DM Area'] || '(ไม่ระบุ)', cm: r['CM Area'] || '(ไม่ระบุ)', am: r['AMM MTN'] || '(ไม่ระบุ)', submissions: 0, accessBlocked: 0 };
            byGroup[key].submissions++;
            if (isBlocked) byGroup[key].accessBlocked++;
        });

        var dup = getDuplicateSurveyDataForType('edmi');
        var coverage = _dashCoverageByStore_(coveredCodes);
        coverage.approximate = true;
        coverage.windowDays = 14;

        var payload = {
            success: true,
            generatedAt: new Date().toISOString(),
            buList: buLookup.buList,
            defaultBu: _dashDefaultBu_(buLookup.buList),
            summary: {
                totalSubmissions:  rows.length,
                accessBlockedRate: rows.length ? Math.round((blockedCount / rows.length) * 100) : 0,
                duplicatesPending: (dup && dup.success) ? dup.summary.totalExtraRows : 0
            },
            trendDaily:      _dashTrendDailyByBu_(taggedRows),
            typeFieldOrder:  null,
            groupBreakdown:  Object.keys(byGroup).map(function(k) { return byGroup[k]; }),
            coverage:        coverage,
            conditionHistByBu: null
        };
        _cachePutChunked_(CACHE_KEY, payload, DASH_CACHE_TTL_SEC);
        return payload;
    } catch (e) {
        Logger.log('getEdmiSolarSurveyDashboardData Error: ' + e.toString());
        return { success: false, error: e.toString() };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Layout Survey Dashboard
// No fixed target-store allowlist exists for Layout (LayoutTargetStores.gs is
// reference-document links, not an eligibility list) — coverage isn't a
// meaningful percentage here, so this dashboard reports submission counts per
// Project Name instead of a coverage %.
// ─────────────────────────────────────────────────────────────────────────────
function getLayoutSurveyDashboardData(clientEmail) {
    var CACHE_KEY = 'DASH_LAYOUT_V2';
    try {
        var cached = _cacheGetChunked_(CACHE_KEY);
        if (cached) return cached;

        var slimRes = getLayoutSurveyListSlim();
        var rows = (slimRes && slimRes.success) ? slimRes.data : [];
        var buLookup = _dashCodeToBu_();

        var beamCount = 0, acAboveCount = 0, otherObstacleCount = 0;
        var byProject = {};
        var byGroup = {};
        var taggedRows = [];
        rows.forEach(function(r) {
            var code = String(r['Branch Code'] || '').trim();
            var bu = buLookup.map[code] || '(ไม่ระบุ)';
            taggedRows.push({ ts: r['Timestamp'], bu: bu });

            var beam = String(r['Beam Obstruction'] || '').trim() === 'Yes';
            var acAbove = String(r['Aircon Above Area'] || '').trim() === 'Yes';
            var other = String(r['Other Obstacles'] || '').trim() !== '';
            if (beam) beamCount++;
            if (acAbove) acAboveCount++;
            if (other) otherObstacleCount++;

            var proj = String(r['Project Name'] || '(ไม่ระบุโครงการ)').trim() || '(ไม่ระบุโครงการ)';
            var projKey = bu + '|' + proj;
            if (!byProject[projKey]) byProject[projKey] = { bu: bu, project: proj, submissions: 0, beamObstruction: 0, acAbove: 0, otherObstacles: 0 };
            byProject[projKey].submissions++;
            if (beam) byProject[projKey].beamObstruction++;
            if (acAbove) byProject[projKey].acAbove++;
            if (other) byProject[projKey].otherObstacles++;

            var key = _dashGroupKey_(bu, r['DM Area'], r['CM Area'], r['AMM MTN']);
            if (!byGroup[key]) byGroup[key] = { bu: bu, dm: r['DM Area'] || '(ไม่ระบุ)', cm: r['CM Area'] || '(ไม่ระบุ)', am: r['AMM MTN'] || '(ไม่ระบุ)', submissions: 0 };
            byGroup[key].submissions++;
        });

        var dup = getDuplicateSurveyDataForType('layout');

        var payload = {
            success: true,
            generatedAt: new Date().toISOString(),
            buList: buLookup.buList,
            defaultBu: _dashDefaultBu_(buLookup.buList),
            summary: {
                totalSubmissions:    rows.length,
                beamObstructionRate: rows.length ? Math.round((beamCount / rows.length) * 100) : 0,
                acAboveRate:         rows.length ? Math.round((acAboveCount / rows.length) * 100) : 0,
                duplicatesPending:  (dup && dup.success) ? dup.summary.totalExtraRows : 0
            },
            trendDaily:         _dashTrendDailyByBu_(taggedRows),
            typeFieldOrder:     null,
            groupBreakdown:     Object.keys(byGroup).map(function(k) { return byGroup[k]; }),
            projectBreakdown:   Object.keys(byProject).map(function(k) { return byProject[k]; }),
            coverage:           null,
            conditionHistByBu:  null
        };
        _cachePutChunked_(CACHE_KEY, payload, DASH_CACHE_TTL_SEC);
        return payload;
    } catch (e) {
        Logger.log('getLayoutSurveyDashboardData Error: ' + e.toString());
        return { success: false, error: e.toString() };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Trading Hours Survey Dashboard
// coverageByAM reuses the existing getTradingHoursCoverageByAM() (built for
// the report page's own "By AM" panel, already correctly separates Pre-/
// Post-Conversion) rather than re-deriving readiness logic. That panel isn't
// BU-broken-out today, so it stays a single (all-BU) table here too.
// ─────────────────────────────────────────────────────────────────────────────
function getTradingHoursSurveyDashboardData(clientEmail) {
    var CACHE_KEY = 'DASH_HOURS_V2';
    try {
        var cached = _cacheGetChunked_(CACHE_KEY);
        if (cached) return cached;

        var slimRes = getTradingHoursSurveyListSlim();
        var rows = (slimRes && slimRes.success) ? slimRes.data : [];
        var buLookup = _dashCodeToBu_();

        var readyCount = 0, notReadyCount = 0, verifiedCount = 0, issueCount = 0;
        var byGroup = {};
        var taggedRows = [];
        rows.forEach(function(r) {
            var code = String(r['Branch Code'] || '').trim();
            var bu = buLookup.map[code] || '(ไม่ระบุ)';
            taggedRows.push({ ts: r['Timestamp'], bu: bu });

            var stage = r['Survey Stage'] || 'Pre-Conversion';
            var status = r['Overall Status'] || '';
            if (stage === 'Pre-Conversion') {
                if (status === 'พร้อม (Ready)') readyCount++; else notReadyCount++;
            } else {
                if (status === 'ตรวจสอบผ่าน (Verified OK)') verifiedCount++; else issueCount++;
            }
            var key = _dashGroupKey_(bu, r['DM Area'], r['CM Area'], r['AMM MTN']);
            if (!byGroup[key]) byGroup[key] = { bu: bu, dm: r['DM Area'] || '(ไม่ระบุ)', cm: r['CM Area'] || '(ไม่ระบุ)', am: r['AMM MTN'] || '(ไม่ระบุ)', submissions: 0 };
            byGroup[key].submissions++;
        });

        var amCoverage = getTradingHoursCoverageByAM();
        var dup = getDuplicateSurveyDataForType('hours');

        var payload = {
            success: true,
            generatedAt: new Date().toISOString(),
            buList: buLookup.buList,
            defaultBu: _dashDefaultBu_(buLookup.buList),
            summary: {
                totalSubmissions:  rows.length,
                readyCount:        readyCount,
                notReadyCount:     notReadyCount,
                verifiedCount:     verifiedCount,
                issueCount:        issueCount,
                duplicatesPending: (dup && dup.success) ? dup.summary.totalExtraRows : 0
            },
            trendDaily:         _dashTrendDailyByBu_(taggedRows),
            typeFieldOrder:     null,
            groupBreakdown:     Object.keys(byGroup).map(function(k) { return byGroup[k]; }),
            coverageByAM:       (amCoverage && amCoverage.success) ? amCoverage.data : [],
            coverage:           null,
            conditionHistByBu:  null
        };
        _cachePutChunked_(CACHE_KEY, payload, DASH_CACHE_TTL_SEC);
        return payload;
    } catch (e) {
        Logger.log('getTradingHoursSurveyDashboardData Error: ' + e.toString());
        return { success: false, error: e.toString() };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hyper (big-format) dashboards — Hyper Ref / Aircon / Equipment / Lighting
// ─────────────────────────────────────────────────────────────────────────────
// Same payload shape as the Mini Big C dashboards so SurveyDashboard.html renders them unchanged:
//   "BU" toggle = store format (Hyper / Market / Foodplace), coverage denominator = the big-format
//   store list (HYPER_REF_STORES) grouped by format + region, equipment counts / condition from the
//   LATEST survey of each store. Extra figures go in summary.extraCards (rendered generically).
// Cache keys are cleared by _hsEquipCacheClear_() on every Hyper submit / edit / delete.
var DASH_HYPER_KEYS = { hyperRef: 'DASH_HREF_V1', hyperAc: 'DASH_HAC_V1', hyperEq: 'DASH_HEQ_V1', hyperFo: 'DASH_HFO_V1', hyperLi: 'DASH_HLI_V1', hyperTo: 'DASH_HTO_V1', hyperPk: 'DASH_HPK_V1' };

function _dashHyperClearAll_() { Object.keys(DASH_HYPER_KEYS).forEach(function(k) { _cacheClearChunked_(DASH_HYPER_KEYS[k]); }); }

function _dashHyperStores_() {
    var byCode = {};
    HYPER_REF_STORES.forEach(function(s) { byCode[String(s[0])] = { fmt: s[3] || '(ไม่ระบุ)', region: s[4] || '(ไม่ระบุ)' }; });
    return byCode;
}

function _dashHyperRows_(def) {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.sheet);
    if (!sh || sh.getLastRow() < 2) return [];
    var vals = sh.getDataRange().getValues();
    var hdr = vals[0].map(function(h) { return String(h).trim(); });
    return vals.slice(1).map(function(r) { var o = {}; hdr.forEach(function(h, i) { o[h] = r[i]; }); return o; });
}

function _dashHyperBuild_(def, type) {
    var stores = _dashHyperStores_();
    var rows = _dashHyperRows_(def);
    var fmtOf = function(code) { return (stores[String(code).trim()] || {}).fmt || '(ไม่ระบุ)'; };
    // latest submission per store (rows are appended → walk backwards)
    var latest = [], seen = {};
    for (var i = rows.length - 1; i >= 0; i--) {
        var c = String(rows[i]['Branch Code'] || '').trim();
        if (!c || seen[c]) continue;
        seen[c] = true;
        latest.push(rows[i]);
    }
    var buSet = {};
    Object.keys(stores).forEach(function(c) { buSet[stores[c].fmt] = true; });
    var buList = Object.keys(buSet).sort();

    // coverage: every big-format store, grouped by format + region
    var cov = {};
    Object.keys(stores).forEach(function(code) {
        var s = stores[code], key = s.fmt + '|' + s.region;
        if (!cov[key]) cov[key] = { bu: s.fmt, dm: s.region, cm: '-', am: s.fmt + ' · ' + s.region, total: 0, covered: 0 };
        cov[key].total++;
        if (seen[code]) cov[key].covered++;
    });
    var covGroups = Object.keys(cov).map(function(k) { return cov[k]; });
    var covered = covGroups.reduce(function(a, g) { return a + g.covered; }, 0), total = Object.keys(stores).length;

    var typeFields = [], typeLabels = {};
    (def.categories || []).forEach(function(c) {
        var h = c.header + ' [รวม]';
        typeFields.push(h);
        typeLabels[h] = String(c.title).replace(/\s*[—(].*$/, '').replace(/ Showcase$/, '');
    });

    var byGroup = {}, hist = {}, units = [];
    latest.forEach(function(r) {
        var bu = fmtOf(r['Branch Code']);
        var key = _dashGroupKey_(bu, r['Region'], r['CM Area'], r['AMM MTN']);
        if (!byGroup[key]) {
            byGroup[key] = { bu: bu, dm: r['Region'] || '(ไม่ระบุ)', cm: r['CM Area'] || '(ไม่ระบุ)', am: r['AMM MTN'] || '(ไม่ระบุ)', submissions: 0 };
            typeFields.forEach(function(f) { byGroup[key][f] = 0; });
        }
        byGroup[key].submissions++;
        typeFields.forEach(function(f) { byGroup[key][f] += Math.max(0, parseInt(r[f], 10) || 0); });
        var us = [];
        try { us = r['Units_JSON'] ? JSON.parse(r['Units_JSON']) : []; } catch (e) {}
        if (!hist[bu]) hist[bu] = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, unrated: 0 };
        us.forEach(function(u) {
            var n = parseInt(u.cr, 10);
            if (n >= 0 && n <= 5) hist[bu][n]++; else hist[bu].unrated++;
            units.push(u);
        });
    });

    var payload = {
        success: true,
        generatedAt: new Date().toISOString(),
        buList: buList,
        defaultBu: '__ALL__',
        buLabel: 'รูปแบบสาขา',
        summary: { totalSubmissions: rows.length, duplicatesPending: 0, extraCards: [] },
        trendDaily: _dashTrendDailyByBu_(rows.map(function(r) { return { ts: r['Timestamp'], bu: fmtOf(r['Branch Code']) }; })),
        typeFieldOrder: typeFields.length ? typeFields : null,
        typeLabels: typeLabels,
        groupBreakdown: Object.keys(byGroup).map(function(k) { return byGroup[k]; }),
        groupLabels: { dm: 'ภาค', cm: 'CM', am: 'AMM' },
        coverage: { totalEligible: total, covered: covered, pct: total ? Math.round(covered / total * 100) : 0, groups: covGroups, label: 'สาขา Big Format' },
        conditionHistByBu: units.length ? hist : null
    };
    var cards = payload.summary.extraCards;
    if (units.length) {
        var curY = new Date().getFullYear();
        var known = units.filter(function(u) { return u.yr; });
        var old15 = known.filter(function(u) { return curY - u.yr >= 15; }).length;
        var avgAge = known.length ? Math.round(known.reduce(function(a, u) { return a + (curY - u.yr); }, 0) / known.length * 10) / 10 : '-';
        cards.push({ label: 'อุปกรณ์ทั้งหมด (รายเครื่อง)', value: units.length, sub: 'จากการสำรวจล่าสุดของแต่ละสาขา' });
        cards.push({ label: 'อายุเฉลี่ย', value: avgAge + (known.length ? ' ปี' : ''), sub: 'อายุ ≥15 ปี ' + old15 + ' เครื่อง · ทราบปี ' + known.length + '/' + units.length, warn: old15 > 0 });
        var bad = units.filter(function(u) { return u.st === 'ไม่ใช้งาน' || (u.cr !== '' && u.cr != null && parseInt(u.cr, 10) <= 2); }).length;
        cards.push({ label: 'สภาพ ≤2 / ไม่ใช้งาน', value: bad, sub: 'เครื่องที่ควรตรวจซ้ำ / วางแผนเปลี่ยน', warn: bad > 0 });
    }
    // Replacement score (register attributes, see HS_FF_SCHEMES) — Ref (all cards), Ac (chillers), Fresh Food
    var ffSch = {};
    (def.categories || []).forEach(function(c) { var sc = _hsFFScheme_(def, c); if (sc) ffSch[c.id] = sc; });
    var ffUnits = units.filter(function(u) { return ffSch[u.c]; });
    if (ffUnits.length) {
        var scored = ffUnits.map(function(u) { return _hsFFScore_(u, ffSch[u.c]).total; }).filter(function(t) { return t !== ''; });
        var hi = scored.filter(function(t) { return t >= 4.5; }).length, plan = scored.filter(function(t) { return t >= 4 && t < 4.5; }).length;
        cards.push({ label: '🔴 ควรพิจารณาเปลี่ยน', value: hi, sub: 'คะแนนประเมิน ≥ 4.5' + (type === 'hyperAc' ? ' (Chiller)' : ''), warn: hi > 0 });
        cards.push({ label: '🟠 วางแผน / เฝ้าระวัง', value: plan, sub: 'คะแนน 4.0–4.49 · ให้คะแนนแล้ว ' + scored.length + '/' + ffUnits.length + ' เครื่อง', warn: plan > 0 });
    }
    if (type === 'hyperRef' || type === 'hyperAc') {
        var gaps = latest.reduce(function(a, r) { return a + (parseInt(r['Temp Gap Units'], 10) || 0); }, 0);
        cards.push({ label: type === 'hyperRef' ? 'IR ต่างจาก Controller >3°C' : 'ΔT ลมจ่าย/ลมกลับ ต่ำ (<6°C)', value: gaps, sub: 'เครื่อง (สำรวจล่าสุด)', warn: gaps > 0 });
    }
    if (type === 'hyperEq') {
        var today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
        var in60 = Utilities.formatDate(new Date(Date.now() + 60 * 864e5), 'Asia/Bangkok', 'yyyy-MM-dd');
        var exp = units.filter(function(u) { return u.ce && u.ce < today; }).length;
        var due = units.filter(function(u) { return u.ce && u.ce >= today && u.ce <= in60; }).length;
        cards.push({ label: '⛔ ใบตรวจหมดอายุ', value: exp, sub: 'ลิฟต์ / บันไดเลื่อน / อื่นๆ', warn: exp > 0 });
        cards.push({ label: '⏰ ใบตรวจหมดใน 60 วัน', value: due, sub: 'ต้องนัดผู้รับเหมาตรวจ', warn: due > 0 });
    }
    if (type === 'hyperTo') {
        var tsum = function(k) { return latest.reduce(function(a, r) { return a + (parseFloat(r[k]) || 0); }, 0); };
        // condition chart = every element rating (floor, wall, sanitary ...) of every room
        var th = {};
        latest.forEach(function(r) {
            var bu = fmtOf(r['Branch Code']);
            if (!th[bu]) th[bu] = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, unrated: 0 };
            var rooms = [];
            try { rooms = JSON.parse(r['Rooms_JSON'] || '[]'); } catch (e) {}
            rooms.forEach(function(rm) {
                Object.keys(rm.el || {}).forEach(function(k) { var n = rm.el[k]; if (n >= 0 && n <= 5) th[bu][n]++; });
                // v2 rooms: MTN form items 1–5 (N/A not counted)
                Object.keys(rm.it || {}).forEach(function(k) { var n = rm.it[k].s; if (n >= 1 && n <= 5) th[bu][n]++; });
            });
        });
        payload.conditionHistByBu = th;
        cards.push({ label: 'ห้องน้ำทั้งหมด', value: tsum('Rooms'), sub: 'ลูกค้า ' + tsum('Customer Rooms') + ' ห้อง' });
        cards.push({ label: 'ห้องสภาพ ≤2', value: tsum('Rooms Condition ≤2'), sub: 'ควรปรับปรุงก่อน', warn: tsum('Rooms Condition ≤2') > 0 });
        var tv2 = latest.filter(function(r) { return r['Score Scale'] === '1-5' && r['Survey %'] !== ''; });
        cards.push({ label: 'คะแนนแบบตรวจ MTN', value: tv2.length ? (tv2.reduce(function(a, r) { return a + (parseFloat(r['Survey %']) || 0); }, 0) / tv2.length).toFixed(1) + '%' : '-', sub: 'รายการ ≤2: ' + tsum('Items ≤2') + ' · ' + tv2.length + ' สาขา (แบบใหม่)', warn: tsum('Items ≤2') > 0 });
        cards.push({ label: 'Touch Up / Improvement', value: tsum('Touch Up Rooms') + ' / ' + tsum('Improvement Rooms'), sub: Math.round(tsum('Touch Up Budget')).toLocaleString() + ' ฿ / ' + Math.round(tsum('Improvement Budget')).toLocaleString() + ' ฿' });
        cards.push({ label: 'ห้องเร่งด่วน', value: tsum('High Priority Rooms'), sub: 'ความเร่งด่วน “สูง”', warn: tsum('High Priority Rooms') > 0 });
        cards.push({ label: 'สุขภัณฑ์ / อุปกรณ์เสีย', value: tsum('Fixtures Broken'), sub: 'จาก ' + tsum('Fixtures Total') + ' ชิ้น', warn: tsum('Fixtures Broken') > 0 });
        cards.push({ label: 'ห้องผู้พิการ', value: tsum('Accessible Rooms'), sub: 'ขาดอุปกรณ์ ' + tsum('Accessible Items Missing') + ' รายการ', warn: tsum('Accessible Items Missing') > 0 });
        cards.push({ label: 'งบประมาณประมาณการ', value: Math.round(tsum('Est. Budget (THB)')).toLocaleString() + ' ฿', sub: 'รวมทุกห้องที่ระบุงบ' });
    }
    if (type === 'hyperPk') {
        var psum = function(k) { return latest.reduce(function(a, r) { return a + (parseFloat(r[k]) || 0); }, 0); };
        // condition chart = lot ratings + disabled-bay paint / sign + route-point condition
        var ph = {};
        latest.forEach(function(r) {
            var bu = fmtOf(r['Branch Code']);
            if (!ph[bu]) ph[bu] = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, unrated: 0 };
            var d = {};
            try { d = JSON.parse(r['Parking_JSON'] || '{}'); } catch (e) {}
            var add = function(n) { if (n !== '' && n >= 0 && n <= 5) ph[bu][n]++; };
            (d.zones || []).forEach(function(z) {
                Object.keys(z.el || {}).forEach(function(k) { add(z.el[k]); });
                if (z.dis) { add(z.dis.paint); add(z.dis.sign); }
            });
            (d.points || []).forEach(function(p) { add(p.cond); });
        });
        payload.conditionHistByBu = ph;
        var shortStores = latest.filter(function(r) { return (parseInt(r['Disabled Bays Short'], 10) || 0) > 0; }).length;
        var noGuard = latest.filter(function(r) { return r['Guard Monitoring'] === HYPER_PK_GUARD[HYPER_PK_GUARD.length - 1]; }).length;
        cards.push({ label: 'ช่องจอดรถยนต์', value: psum('Total Parking Bays'), sub: psum('Parking Zones') + ' โซน · มอเตอร์ไซค์ ' + psum('Motorcycle Bays') + ' · EV ' + psum('EV Bays') });
        cards.push({ label: 'ช่องจอดผู้พิการ', value: psum('Disabled Bays') + ' / ' + psum('Disabled Bays Required'), sub: 'มีจริง / ขั้นต่ำตามกฎกระทรวง', warn: psum('Disabled Bays') < psum('Disabled Bays Required') });
        cards.push({ label: 'สาขาไม่ถึงขั้นต่ำ', value: shortStores, sub: 'ช่องจอดผู้พิการไม่พอ', warn: shortStores > 0 });
        cards.push({ label: 'รายการที่ยังขาด', value: psum('Zone Items Missing') + psum('Access Items Missing'), sub: 'ที่จอด ' + psum('Zone Items Missing') + ' · เส้นทาง ' + psum('Access Items Missing'), warn: psum('Zone Items Missing') + psum('Access Items Missing') > 0 });
        cards.push({ label: 'พบรถทั่วไปจอด', value: psum('Misuse Cars Seen'), sub: 'คัน (ขณะสำรวจ) · ไม่มี รปภ. ' + noGuard + ' สาขา', warn: psum('Misuse Cars Seen') > 0 || noGuard > 0 });
        cards.push({ label: 'จุดเร่งด่วน', value: psum('High Priority Items'), sub: 'ความเร่งด่วน “สูง”', warn: psum('High Priority Items') > 0 });
        cards.push({ label: 'งบประมาณประมาณการ', value: Math.round(psum('Est. Budget (THB)')).toLocaleString() + ' ฿', sub: 'รวมทุกจุดที่ระบุงบ' });
        var wcls = function(c) { return latest.filter(function(r) { return r['Work Class'] === c; }).length; };
        cards.push({ label: 'Ready / Touch Up / Improvement', value: wcls('Ready') + ' / ' + wcls('Touch Up') + ' / ' + wcls('Improvement'), sub: 'สาขา · Improvement งบ ' + Math.round(psum('Improvement Budget (THB)')).toLocaleString() + ' ฿ (Pool Bid)' });
        cards.push({ label: 'รถเข็นขาด · ทางลาดไม่ผ่าน', value: psum('Wheelchairs Short') + ' · ' + psum('Ramps Fail'), sub: 'คัน · จุด (จาก ' + psum('Ramps') + ' ทางลาดที่วัด)', warn: psum('Wheelchairs Short') + psum('Ramps Fail') > 0 });
    }
    if (type === 'hyperLi') {
        var sum = function(k) { return latest.reduce(function(a, r) { return a + (parseFloat(r[k]) || 0); }, 0); };
        cards.push({ label: 'กำลังไฟแสงสว่างติดตั้ง', value: (sum('Sales Floor Installed kW') + sum('Town Center Installed kW')).toFixed(1) + ' kW', sub: 'ค่าไฟแสงสว่าง ~' + Math.round(sum('Lighting OPEX Now (THB/month)')).toLocaleString() + ' ฿/เดือน' });
        cards.push({ label: 'โซนต่ำกว่าเป้า Lux', value: sum('Zones Below Target'), sub: 'จาก ' + sum('Zones') + ' โซน', warn: sum('Zones Below Target') > 0 });
        cards.push({ label: 'โคมเสีย', value: sum('Fixtures Broken'), sub: 'จาก ' + sum('Fixtures Total') + ' โคม', warn: sum('Fixtures Broken') > 0 });
        cards.push({ label: 'ข้อเสนอเพิ่มโคม', value: sum('Proposed Added kW').toFixed(2) + ' kW', sub: '+' + Math.round(sum('Proposed Added OPEX (THB/month)')).toLocaleString() + ' ฿/เดือน' });
    }
    return payload;
}

function _dashHyperGet_(type, def) {
    var key = DASH_HYPER_KEYS[type];
    try {
        var cached = _cacheGetChunked_(key);
        if (cached) return cached;
        var payload = _dashHyperBuild_(def, type);
        _cachePutChunked_(key, payload, DASH_CACHE_TTL_SEC);
        return payload;
    } catch (e) {
        Logger.log('Hyper dashboard ' + type + ': ' + e);
        return { success: false, error: e.toString() };
    }
}
function getHyperRefDashboardData() { return _dashHyperGet_('hyperRef', HYPER_REF_DEF); }
function getHyperAcDashboardData() { return _dashHyperGet_('hyperAc', HYPER_AC_DEF); }
function getHyperEqDashboardData() { return _dashHyperGet_('hyperEq', HYPER_EQ_DEF); }
function getHyperFoDashboardData() { return _dashHyperGet_('hyperFo', HYPER_FO_DEF); }
function getHyperLiDashboardData() { return _dashHyperGet_('hyperLi', HYPER_LI_DEF); }
function getHyperToDashboardData() { return _dashHyperGet_('hyperTo', HYPER_TO_DEF); }
function getHyperPkDashboardData() { return _dashHyperGet_('hyperPk', HYPER_PK_DEF); }
