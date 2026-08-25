// =============================================================================
//  CAPEX Budget Cross-Check
//  Lets MTN (SMF) / Admin cross-reference the BCM 7-year CAPEX plan
//  (Refrigeration Open Display + Air Conditioning replacement, 2027-2033)
//  against the latest field-survey equipment data for a store — including
//  per-unit condition rating and store/equipment age, not just quantity —
//  before confirming the budget is OK to use.
//
//  Sheets used:
//    CAPEX_Budget_Store          — one row per store per year (seeded from
//                                  CAPEX_BUDGET_SEED in CapexBudgetData.gs)
//    Capex_Budget_Confirmations  — audit log of confirmations (append-only)
// =============================================================================

var CAPEX_BUDGET_SHEET  = 'CAPEX_Budget_Store';
var CAPEX_CONFIRM_SHEET = 'Capex_Budget_Confirmations';

// Replacement-age assumptions used by the CAPEX plan itself (see
// capex_open_display.py / capex_aircon.py) — shown as a quick "due/overdue"
// signal next to the survey's condition rating. 0-5 rating scale matches the
// one already used in AirconSurveyReport.html / RefSurveyReport.html
// (0 = ชำรุด/หมดสภาพ ... 5 = ใหม่/สมบูรณ์).
var REFRIG_USEFUL_LIFE_YEARS = 7;
var AC_USEFUL_LIFE_YEARS     = 12;
var POOR_CONDITION_RATING    = 2; // rating <= this counts as "poor" for the summary

var CAPEX_BUDGET_HEADERS = [
    'Branch Code', 'Branch Name', 'Region', 'Year',
    'Refrig Budget (THB)', 'Refrig Qty (Planned)',
    'AC Budget (THB)', 'AC Qty (Planned)', 'Store Open Year'
];

var CAPEX_CONFIRM_HEADERS = [
    'Log ID', 'Timestamp', 'Branch Code', 'Branch Name', 'Year', 'Equipment Type',
    'Planned Budget (THB)', 'Planned Qty', 'Surveyed Qty', 'Surveyed Date',
    'Store Age (yrs)', 'Avg Condition Rating', 'Confirmed By', 'Notes'
];

// ── Lease status (LEASE_STORE_SEED in LeaseData.gs, Site Acquisition weekly) ─
// Mirrors lease_status() in Pyhon ANL/All Equip Ananysis/build_store_allocation.py:
// a store is safe to invest in a given year only if its CURRENT lease contract
// runs through the end of that year (leases renew ~every 3 years, so out-years
// simply aren't on record yet — that's "renew first", not "closed").
function _leaseInfoFor_(code, year) {
    var base = { leaseEnd: '', tier: '', phase: '', progress: '', closedDate: '', statusCode: 'none',
                 statusText: 'ไม่อยู่ในรอบติดตามต่อสัญญา' };
    var L = (typeof LEASE_STORE_SEED !== 'undefined') ? LEASE_STORE_SEED[String(code).trim()] : null;
    if (!L) return base;
    base.leaseEnd = L[0] || '';
    base.tier = L[1] || '';
    base.phase = L[2] || '';
    base.progress = L[3] || '';
    base.closedDate = L[4] || '';
    if (base.closedDate) {
        // Shouldn't appear in the CAPEX plan (closed stores are cut upstream),
        // but guard in case the seed and plan ever get out of step.
        base.statusCode = 'closed';
        base.statusText = 'สาขาปิดแล้ว (' + base.closedDate + ')';
        return base;
    }
    if (base.phase && base.phase.indexOf('หมดคำมั่น') > -1) {
        base.statusCode = 'hold';
        base.statusText = 'HOLD — หมดคำมั่นต่อสัญญา';
        return base;
    }
    if (!base.leaseEnd) return base; // in the file but no contract end on record
    year = Number(year) || 0;
    if (!year) { base.statusCode = 'tracked'; base.statusText = 'สิ้นสุดสัญญา ' + base.leaseEnd; return base; }
    // ISO yyyy-mm-dd strings compare correctly as strings
    if (base.leaseEnd >= (year + '-12-31')) {
        base.statusCode = 'ok';
        base.statusText = 'สัญญาครอบคลุมปีลงทุน (สิ้นสุด ' + base.leaseEnd + ')';
    } else {
        base.statusCode = 'renew';
        base.statusText = 'ต่อสัญญาก่อนลงทุน (สิ้นสุด ' + base.leaseEnd + ')';
    }
    return base;
}

// ── Create + seed the budget sheet once, if it doesn't exist yet ────────────
function ensureCapexBudgetSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CAPEX_BUDGET_SHEET);
    if (sheet && sheet.getLastRow() > 1) return sheet;

    if (!sheet) {
        sheet = ss.insertSheet(CAPEX_BUDGET_SHEET);
    } else {
        sheet.clear();
    }

    sheet.getRange(1, 1, 1, CAPEX_BUDGET_HEADERS.length).setValues([CAPEX_BUDGET_HEADERS]);
    var hdrRng = sheet.getRange(1, 1, 1, CAPEX_BUDGET_HEADERS.length);
    hdrRng.setBackground('#1A237E');
    hdrRng.setFontColor('#ffffff');
    hdrRng.setFontWeight('bold');
    sheet.setFrozenRows(1);

    if (typeof CAPEX_BUDGET_SEED !== 'undefined' && CAPEX_BUDGET_SEED.length) {
        sheet.getRange(2, 1, CAPEX_BUDGET_SEED.length, CAPEX_BUDGET_HEADERS.length)
             .setValues(CAPEX_BUDGET_SEED);
    }
    return sheet;
}

// Force-rewrite CAPEX_Budget_Store from CAPEX_BUDGET_SEED (unlike ensure…,
// which returns early once the sheet has data). Run after regenerating the
// seed via export_capex_budget_for_app.py. Callable from the editor, or from
// the cross-check page via refreshCapexBudgetSheet() (admin only).
function setupCapexBudgetSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CAPEX_BUDGET_SHEET);
    if (!sheet) sheet = ss.insertSheet(CAPEX_BUDGET_SHEET);
    sheet.clear();
    sheet.getRange(1, 1, 1, CAPEX_BUDGET_HEADERS.length).setValues([CAPEX_BUDGET_HEADERS]);
    var hdrRng = sheet.getRange(1, 1, 1, CAPEX_BUDGET_HEADERS.length);
    hdrRng.setBackground('#1A237E');
    hdrRng.setFontColor('#ffffff');
    hdrRng.setFontWeight('bold');
    sheet.setFrozenRows(1);
    if (typeof CAPEX_BUDGET_SEED !== 'undefined' && CAPEX_BUDGET_SEED.length) {
        sheet.getRange(2, 1, CAPEX_BUDGET_SEED.length, CAPEX_BUDGET_HEADERS.length)
             .setValues(CAPEX_BUDGET_SEED);
    }
    return CAPEX_BUDGET_SEED.length;
}

function refreshCapexBudgetSheet(clientEmail) {
    try {
        var auth = checkSurveyAdminStatus(clientEmail);
        if (!auth.isAdmin) {
            return { success: false, error: 'Permission denied. Admin only.' };
        }
        var n = setupCapexBudgetSheet_();
        return { success: true, rows: n };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function _ensureConfirmSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CAPEX_CONFIRM_SHEET);
    if (sheet) return sheet;

    sheet = ss.insertSheet(CAPEX_CONFIRM_SHEET);
    sheet.getRange(1, 1, 1, CAPEX_CONFIRM_HEADERS.length).setValues([CAPEX_CONFIRM_HEADERS]);
    var hdrRng = sheet.getRange(1, 1, 1, CAPEX_CONFIRM_HEADERS.length);
    hdrRng.setBackground('#1A237E');
    hdrRng.setFontColor('#ffffff');
    hdrRng.setFontWeight('bold');
    sheet.setFrozenRows(1);
    return sheet;
}

// ── Store list for the search box ───────────────────────────────────────────
// year: optional. When given, only stores with budget in that specific year
// are returned (and totalBudget/yearBudget reflect that year), so MTN/SMF can
// target one submission year (e.g. 2027) at a time. Omit/0 for all 7 years.
function getCapexBudgetStoreList(clientEmail, year) {
    try {
        var auth = checkSurveyAdminStatus(clientEmail);
        if (!auth.isAdmin && !auth.isSMF) {
            return { success: false, error: 'Permission denied. SMF team or Admin only.' };
        }
        year = Number(year) || 0;

        var sheet = ensureCapexBudgetSheet_();
        var lastRow = sheet.getLastRow();
        if (lastRow < 2) return { success: true, stores: [], year: year };

        var data = sheet.getRange(2, 1, lastRow - 1, CAPEX_BUDGET_HEADERS.length).getValues();
        var byCode = {};
        data.forEach(function(row) {
            var code = String(row[0]).trim();
            if (!code) return;
            var rowYear = Number(row[3]);
            if (year && rowYear !== year) return;

            if (!byCode[code]) {
                byCode[code] = {
                    code: code, name: row[1], region: row[2], totalBudget: 0, yearBudget: 0, years: [],
                    ammMtn: '', dmName: '', cmName: '',
                    refrigQtyYear: 0, acQtyYear: 0, refrigQtyTotal: 0, acQtyTotal: 0
                };
            }
            var refrigQty = Number(row[5]) || 0;
            var acQty = Number(row[7]) || 0;
            var total = (Number(row[4]) || 0) + (Number(row[6]) || 0);
            byCode[code].totalBudget += total;
            byCode[code].refrigQtyTotal += refrigQty;
            byCode[code].acQtyTotal += acQty;
            if (year && rowYear === year) {
                byCode[code].yearBudget += total;
                byCode[code].refrigQtyYear += refrigQty;
                byCode[code].acQtyYear += acQty;
            }
            if (total > 0) byCode[code].years.push(rowYear);
        });

        // Enrich with AMM MTN / DM / CM from the Master Store Database, so MTN
        // (SMF)/AM can filter the list down to the stores they're responsible for.
        try {
            var storeMap = _buildStoreEnrichMap();
            Object.keys(byCode).forEach(function(code) {
                var s = storeMap[code];
                if (s) {
                    byCode[code].ammMtn = s.ammMtn || '';
                    byCode[code].dmName = s.dmName || '';
                    byCode[code].cmName = s.cmName || '';
                }
            });
        } catch (enrichErr) {
            Logger.log('getCapexBudgetStoreList enrich error: ' + enrichErr);
        }

        // Lease status per store, judged against the year being screened:
        // the selected filter year, or the store's first budgeted year for "all".
        Object.keys(byCode).forEach(function(code) {
            var s = byCode[code];
            var judgeYear = year || (s.years.length ? Math.min.apply(null, s.years) : 0);
            var li = _leaseInfoFor_(code, judgeYear);
            s.leaseEnd = li.leaseEnd;
            s.leaseTier = li.tier;
            s.leaseStatusCode = li.statusCode;
            s.leaseStatusText = li.statusText;
        });

        var stores = Object.keys(byCode).map(function(k) { return byCode[k]; });
        if (year) {
            stores = stores.filter(function(s) { return s.yearBudget > 0; });
            stores.sort(function(a, b) { return b.yearBudget - a.yearBudget; });
        } else {
            stores.sort(function(a, b) { return b.totalBudget - a.totalBudget; });
        }

        return { success: true, stores: stores, year: year, isAdmin: auth.isAdmin, isSMF: auth.isSMF };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// Other refrigeration equipment types surveyed at a store, beyond the Open
// Display units the CAPEX plan actually budgets for — shown for context only
// (label -> Ref_Survey_Database column name).
var OTHER_REF_TYPE_QTY_COLS = {
    'ตู้ Bev Plugin':        'Ref Bev Plugin Qty',
    'ตู้ Bev Walk-in':       'Ref Bev Walk In Qty',
    'ตู้ Bev Remote':        'Ref Bev Remote Qty',
    'ตู้แช่แข็ง Plugin':      'Ref Frozen Plugin Qty',
    'ตู้แช่แข็ง Remote':      'Ref Frozen Remote Qty',
    'ตู้แช่แข็ง Walk-in':     'Ref Frozen Walk In Qty',
    'ตู้แช่แข็ง 1 ประตู (เก่า)':     'Ref Frozen1 Door Qty',
    'ตู้แช่แข็ง 2 ประตู (เก่า)':     'Ref Frozen2 Door Qty',
    'ตู้แช่แข็ง 3 ประตู (เก่า)':     'Ref Frozen3 Door Qty',
    'ตู้แช่แข็ง 4 ประตูขึ้นไป (เก่า)': 'Ref Frozen4 Door Qty',
    'ตู้ไอศกรีม':            'Ref Ice Cream Qty',
    'ตู้น้ำแข็ง':             'Ref Ice Qty',
    'ตู้ 4 ประตู Stainless': 'Ref Ss4 Door Qty'
};

// ── Latest non-Draft survey snapshot for a branch, incl. per-unit condition ──
// ratingColFn(n) returns the column name holding unit n's 0-5 condition
// rating (see REFRIG_/AC_ constants above), or null if not applicable.
// extraQtyCols (optional): { label: columnName } for other equipment types to
// report alongside qtyCol, purely informational (not part of the CAPEX plan).
function _latestSurveySnapshot_(sheetName, branchCode, qtyCol, brokenFlagCol, ratingColFn, maxUnits, extraQtyCols) {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return null;

    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var idx = {};
    headers.forEach(function(h, i) { idx[String(h).trim()] = i; });
    if (idx['Branch Code'] === undefined) return null;

    // Full-width read: unit-level condition rating columns can sit far to the
    // right of the core fields, so a narrow maxIdx-based read (as used by the
    // list-view functions elsewhere) would silently miss them.
    var nRows = sheet.getLastRow() - 1;
    var data = sheet.getRange(2, 1, nRows, lastCol).getValues();

    var best = null;
    for (var i = 0; i < data.length; i++) {
        var row = data[i];
        if (String(row[idx['Branch Code']]).trim() !== String(branchCode).trim()) continue;
        var status = idx['Status'] !== undefined ? String(row[idx['Status']] || '').trim() : '';
        var ts = idx['Timestamp'] !== undefined ? row[idx['Timestamp']] : null;
        var tsMs = (ts instanceof Date) ? ts.getTime() : 0;
        // Prefer the newest non-Draft row; fall back to newest Draft if that's all there is.
        var rank = (status === 'Draft' ? 0 : 1) * 1e15 + tsMs;
        if (!best || rank > best._rank) {
            var qty = idx[qtyCol] !== undefined ? (parseInt(row[idx[qtyCol]], 10) || 0) : 0;

            var ratings = [];
            if (ratingColFn) {
                var cap = Math.min(qty || maxUnits, maxUnits);
                for (var u = 1; u <= cap; u++) {
                    var colName = ratingColFn(u);
                    if (idx[colName] === undefined) continue;
                    var rv = row[idx[colName]];
                    if (rv === '' || rv === null || rv === undefined) continue;
                    var rn = parseInt(rv, 10);
                    if (!isNaN(rn) && rn >= 0 && rn <= 5) ratings.push(rn);
                }
            }
            var avgRating = ratings.length ? (ratings.reduce(function(a, b) { return a + b; }, 0) / ratings.length) : null;
            var worstRating = ratings.length ? Math.min.apply(null, ratings) : null;
            var poorCount = ratings.filter(function(r) { return r <= POOR_CONDITION_RATING; }).length;

            var otherQuantities = {};
            if (extraQtyCols) {
                Object.keys(extraQtyCols).forEach(function(label) {
                    var col = extraQtyCols[label];
                    if (idx[col] === undefined) return;
                    var v = parseInt(row[idx[col]], 10) || 0;
                    if (v > 0) otherQuantities[label] = v;
                });
            }

            best = {
                _rank: rank,
                status: status,
                timestamp: (ts instanceof Date) ? ts.toISOString() : null,
                qty: idx[qtyCol] !== undefined ? qty : null,
                hasBroken: idx[brokenFlagCol] !== undefined ? String(row[idx[brokenFlagCol]] || '').trim() : '',
                brokenUnits: idx['Broken Units'] !== undefined ? String(row[idx['Broken Units']] || '') : '',
                reporter: idx['Reporter Name'] !== undefined && row[idx['Reporter Name']]
                    ? row[idx['Reporter Name']]
                    : (idx['Reporter Email'] !== undefined ? row[idx['Reporter Email']] : ''),
                conditionRatings: ratings,
                avgRating: avgRating !== null ? Number(avgRating.toFixed(1)) : null,
                worstRating: worstRating,
                poorConditionCount: poorCount,
                otherQuantities: otherQuantities
            };
        }
    }
    if (best) delete best._rank;
    return best;
}

// ── Main cross-check payload for one store: plan vs latest survey vs history ─
function getCapexCrossCheck(storeCode, clientEmail) {
    try {
        var auth = checkSurveyAdminStatus(clientEmail);
        if (!auth.isAdmin && !auth.isSMF) {
            return { success: false, error: 'Permission denied. SMF team or Admin only.' };
        }
        storeCode = String(storeCode || '').trim();
        if (!storeCode) return { success: false, error: 'Store code required' };

        var sheet = ensureCapexBudgetSheet_();
        var lastRow = sheet.getLastRow();
        var budget = [];
        var storeName = null;
        var storeOpenYear = null;
        if (lastRow >= 2) {
            var data = sheet.getRange(2, 1, lastRow - 1, CAPEX_BUDGET_HEADERS.length).getValues();
            data.forEach(function(row) {
                if (String(row[0]).trim() !== storeCode) return;
                if (storeName === null) storeName = row[1];
                if (storeOpenYear === null && row[8] !== '' && row[8] !== null && row[8] !== undefined) {
                    storeOpenYear = Number(row[8]);
                }
                var bYear = Number(row[3]);
                var yearLease = _leaseInfoFor_(storeCode, bYear);
                budget.push({
                    year: bYear,
                    refrigBudget: Number(row[4]) || 0,
                    refrigQtyPlanned: Number(row[5]) || 0,
                    acBudget: Number(row[6]) || 0,
                    acQtyPlanned: Number(row[7]) || 0,
                    leaseStatusCode: yearLease.statusCode,
                    leaseStatusText: yearLease.statusText
                });
            });
        }
        budget.sort(function(a, b) { return a.year - b.year; });

        var currentYear = new Date().getFullYear();
        var storeAgeYears = storeOpenYear ? (currentYear - storeOpenYear) : null;

        var refSurvey = _latestSurveySnapshot_(
            'Ref_Survey_Database', storeCode, 'Ref Open Qty', 'Has Broken Ref',
            function(n) { return 'Ref Open Cond Rating_' + n; }, 20, OTHER_REF_TYPE_QTY_COLS);
        var acSurvey = _latestSurveySnapshot_(
            'Aircon_Survey_Database', storeCode, 'AC Quantity', 'Has Broken AC',
            function(n) { return 'Unit ' + n + ' Cond Rating'; }, 20);

        // Confirmation history for this store
        var confirmations = [];
        var cSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CAPEX_CONFIRM_SHEET);
        if (cSheet && cSheet.getLastRow() > 1) {
            var cData = cSheet.getRange(2, 1, cSheet.getLastRow() - 1, CAPEX_CONFIRM_HEADERS.length).getValues();
            cData.forEach(function(row) {
                if (String(row[2]).trim() !== storeCode) return;
                confirmations.push({
                    logId: row[0],
                    timestamp: (row[1] instanceof Date) ? row[1].toISOString() : String(row[1]),
                    year: row[4],
                    equipType: row[5],
                    plannedBudget: row[6],
                    plannedQty: row[7],
                    surveyedQty: row[8],
                    surveyedDate: (row[9] instanceof Date) ? row[9].toISOString() : String(row[9] || ''),
                    storeAgeYears: row[10],
                    avgConditionRating: row[11],
                    confirmedBy: row[12],
                    notes: row[13]
                });
            });
            confirmations.reverse();
        }

        return {
            success: true,
            storeCode: storeCode,
            storeName: storeName || storeCode,
            lease: _leaseInfoFor_(storeCode, 0),
            storeOpenYear: storeOpenYear,
            storeAgeYears: storeAgeYears,
            refrigUsefulLifeYears: REFRIG_USEFUL_LIFE_YEARS,
            acUsefulLifeYears: AC_USEFUL_LIFE_YEARS,
            budget: budget,
            survey: { refrig: refSurvey, ac: acSurvey },
            confirmations: confirmations,
            isAdmin: auth.isAdmin,
            isSMF: auth.isSMF
        };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ── Log a confirmation that the surveyed equipment (age + condition + qty) ──
// supports using the budget.
// payload: { storeCode, storeName, year, equipType ('Refrigeration'|'Air Conditioning'),
//            plannedBudget, plannedQty, surveyedQty, surveyedDate,
//            storeAgeYears, avgConditionRating, notes }
function confirmCapexBudgetUse(payload, clientEmail) {
    try {
        var _wlock = _acquireWriteLock_();
        var auth = checkSurveyAdminStatus(clientEmail || Session.getActiveUser().getEmail());
        if (!auth.isAdmin && !auth.isSMF) {
            return { success: false, error: 'Permission denied. SMF team or Admin only.' };
        }
        if (!payload || !payload.storeCode || !payload.year || !payload.equipType) {
            return { success: false, error: 'storeCode, year and equipType are required' };
        }

        var sheet = _ensureConfirmSheet_();
        var logId = 'CBC-' + new Date().getTime();
        sheet.appendRow([
            logId,
            new Date(),
            String(payload.storeCode).trim(),
            payload.storeName || '',
            payload.year,
            payload.equipType,
            payload.plannedBudget || 0,
            payload.plannedQty || 0,
            payload.surveyedQty !== undefined ? payload.surveyedQty : '',
            payload.surveyedDate || '',
            payload.storeAgeYears !== undefined ? payload.storeAgeYears : '',
            payload.avgConditionRating !== undefined && payload.avgConditionRating !== null ? payload.avgConditionRating : '',
            auth.email || clientEmail || '',
            payload.notes || ''
        ]);

        return { success: true, logId: logId };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}
