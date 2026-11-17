// ─── APP BOOTSTRAP (page-load batching) ──────────────────────────────────────
// index.html used to fire ~25 separate google.script.run calls on every load (10 of them
// getEnumFieldOptions, one per group). Each call is its own Apps Script execution: it re-parses
// the whole project (~6.7 MB of .gs incl. the big data files), and executions are throttled
// per user, so they queued behind each other. These wrappers return the SAME objects the
// individual functions return, keyed by name, in 1–2 executions instead of ~25.
// Each part is isolated: one failing part comes back as {__error} and the client falls back
// to calling just that function individually (see _bootDispatch in index.html).

function _bootRun_(out, key, fn) {
    try { out[key] = fn(); }
    catch (e) { out[key] = { __error: String(e && e.message || e) }; }
}

// Batch of getEnumFieldOptions — same {success, options} per key. Shares sheet reads on cache miss.
function getEnumFieldOptionsMap(keys) {
    var memo = {}, out = {};
    (keys || []).forEach(function(k) { out[k] = getEnumFieldOptions(k, memo); });
    return out;
}

// Phase 1 — small, Properties/Cache-backed config that decides which tabs render. Kept separate
// from the data phase so tab visibility isn't held up by a cold store/vendor/sheet read.
function getAppBootstrapConfig(email) {
    var t0 = Date.now(), out = {};
    _bootRun_(out, 'getRegDeptConfig', getRegDeptConfig);
    _bootRun_(out, 'getGeneralTabVisibility', getGeneralTabVisibility);
    _bootRun_(out, 'getDeptLandingTabs', getDeptLandingTabs);
    _bootRun_(out, 'getTeamTabAccess', getTeamTabAccess);
    _bootRun_(out, 'getBrandChipConfig', getBrandChipConfig);
    _bootRun_(out, 'getBrandChipSelection', getBrandChipSelection);
    _bootRun_(out, 'getEquipmentPhotoRequired', getEquipmentPhotoRequired);
    _bootRun_(out, 'getActiveScheduleRound', getActiveScheduleRound);
    if (email) _bootRun_(out, 'checkAdminStatus', function() { return checkAdminStatus(email); });
    out.__ms = Date.now() - t0;
    return out;
}

// Phase 2 — lookup data for dropdowns/search (all already CacheService-backed server-side).
function getAppBootstrapData(enumKeys) {
    var t0 = Date.now(), out = {};
    _bootRun_(out, 'getStoreDBDataForFrontend', getStoreDBDataForFrontend);
    _bootRun_(out, 'getLayoutTargetDocs', getLayoutTargetDocs);
    _bootRun_(out, 'getTradingHoursTargetStores', getTradingHoursTargetStores);
    _bootRun_(out, 'getVendorList', getVendorList);
    _bootRun_(out, 'getSurveyConfig', getSurveyConfig);
    _bootRun_(out, 'getSurveyObjectives', getSurveyObjectives);
    _bootRun_(out, 'getEnumFieldOptionsMap', function() { return getEnumFieldOptionsMap(enumKeys); });
    out.__ms = Date.now() - t0;
    return out;
}
