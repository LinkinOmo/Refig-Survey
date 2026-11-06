// ============================================================
// ModuleRegistry.gs — the survey modules the follow-up / thank-you emails and the AI executive
// summary know about. Add a new module HERE and all of them pick it up (module checkboxes,
// per-store "doesn't apply" settings, email tables, summary sources, PPTX).
// ============================================================
//
// 1) A Hyper survey that is on the Hyper Upload Schedule (one per store per round):
//      • add it to HSCH_TYPES (HyperSchedule.gs) — schedule, follow-up and thank-you pick it up;
//      • add its review kind to _hrsKinds_ (HyperReviewStatus.gs) so "rejected" / "reviewed" work;
//      • if it has a survey dashboard, add its getter to HYPER_MODULE_DASH below (exec summary) —
//        or, without a dashboard, a compact summary function to HYPER_MODULE_SUMMARY;
//      • wire its tab like the others (see HyperFireSurvey.gs header for the full list of places).
// 2) A standalone survey with its own store list (not on the schedule) — like Fixed Asset:
//      • add an entry to HYPER_EXTRA_MODULES below.
// 3) A Mini Big C survey with a dashboard: add it to MINI_MODULE_DASH (exec summary).

// Scheduled Hyper module key → its survey dashboard getter (SurveyDashboardData.gs). Missing = no dashboard yet.
var HYPER_MODULE_DASH = {
    Ref: 'getHyperRefDashboardData', Ac: 'getHyperAcDashboardData', Eq: 'getHyperEqDashboardData', Fo: 'getHyperFoDashboardData',
    Li: 'getHyperLiDashboardData', To: 'getHyperToDashboardData', Pk: 'getHyperPkDashboardData'
};
// Scheduled modules without a dashboard can give the executive summary their own compact numbers instead.
var HYPER_MODULE_SUMMARY = {
    Fi: '_hfiExecSummary_'   // HyperFireSurvey.gs — rating mix, open / high risks, overdue re-checks, sprinkler coverage
};

// Standalone modules. Each entry:
//   key, label, page (report page for the email link)
//   stores()  → [{ code (6-digit Hyper code when known, else its own code), gold, alias, name, fmt, note }]
//               the stores this module applies to (note = shown in the follow-up line, e.g. "VP 5")
//   done()    → { storeCode: 'dd/MM/yyyy' } — submitted stores, keyed by the module's own Branch Code
//   summary() → { data, tiles } for the AI executive summary (optional)
//   prompt    → what the AI should cover for this module (optional)
var HYPER_EXTRA_MODULES = [
    {
        key: 'FA', label: 'Fixed Asset (Asset Check)', page: 'hyper_fa_survey_report',
        stores: function() {
            return HYPER_FA_STORES.filter(function(s) { return s[5]; }).map(function(s) {
                return { code: String(s[1] || s[0]), gold: String(s[0]), alias: String(s[19] || '').split(' ')[0], name: s[3] || s[2], fmt: s[4], note: 'VP ' + s[5] };
            });
        },
        done: function() { return _modDoneBySheet_(HYPER_FA_SHEET); },
        summary: function() {
            var f = _esFa_();
            return { data: f, tiles: [
                { label: 'Fixed Asset สำรวจแล้ว', value: f.surveyed + '/' + f.eligibleStores, color: '#6d28d9' },
                { label: 'ประมาณการค่าแรงตรวจนับ', value: '฿' + f.laborCostTHB.toLocaleString(), color: '#92400e' }] };
        },
        prompt: 'การกระจายระดับสี RED/ORG/YEL/GRE, ค่าแรงตรวจนับประมาณการ, เทียบกับการประเมินของ VP (ยากกว่า/ง่ายกว่า/เท่ากัน), รายชื่อสาขา RED'
    }
];

// Mini Big C survey dashboards for the executive summary.
var MINI_MODULE_DASH = [
    { label: 'ตู้แช่ (Refrigerator)', fn: 'getRefSurveyDashboardData' },
    { label: 'แอร์ (Aircon)', fn: 'getAirconSurveyDashboardData' },
    { label: 'EDMI Solar Meter', fn: 'getEdmiSolarSurveyDashboardData' }
];

// Every Hyper module, scheduled first: [{ key, label, scheduled, page }]
function hyperModules_() {
    return HSCH_TYPES.map(function(t) { return { key: t.key, label: t.label, scheduled: true }; })
        .concat(HYPER_EXTRA_MODULES.map(function(m) { return { key: m.key, label: m.label, scheduled: false, page: m.page }; }));
}
function hyperExtraModule_(key) {
    for (var i = 0; i < HYPER_EXTRA_MODULES.length; i++) if (HYPER_EXTRA_MODULES[i].key === key) return HYPER_EXTRA_MODULES[i];
    return null;
}

// Branch Code → submitted date for a survey sheet (reads only Branch Code + Timestamp).
function _modDoneBySheet_(sheetName) {
    var done = {};
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sh || sh.getLastRow() < 2) return done;
    var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function(h) { return String(h).trim(); });
    var ci = hdr.indexOf('Branch Code'), ti = hdr.indexOf('Timestamp'), n = sh.getLastRow() - 1;
    if (ci < 0) return done;
    var codes = sh.getRange(2, ci + 1, n, 1).getValues(), ts = ti > -1 ? sh.getRange(2, ti + 1, n, 1).getValues() : null;
    for (var i = 0; i < n; i++) {
        var c = String(codes[i][0] || '').trim(); if (!c) continue;
        var d = ts ? ts[i][0] : '';
        done[c] = d instanceof Date ? Utilities.formatDate(d, 'Asia/Bangkok', 'dd/MM/yyyy') : (String(d || '').slice(0, 10) || '✓');
    }
    return done;
}
