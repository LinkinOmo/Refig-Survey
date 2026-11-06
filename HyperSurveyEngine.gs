// --- Hyper (big-format) survey engine ---
// Shared server logic for the big-format "count equipment per type + size" surveys
// (Hyper Ref Survey, Hyper Aircon Survey). Each survey is described by a definition
// object (HYPER_REF_DEF in HyperRefSurvey.gs, HYPER_AC_DEF in HyperAirconSurvey.gs):
//
//   name, emoji, sheet, folder, idPrefix, keyPrefix ('hyp_' / 'hac_'),
//   photoFilePrefix, headerColor, brokenLabel,
//   categories: [{ id, group, color, header, title, hint, sizes: [[key, label]], noTemp? }]
//   system:     [{ key, header, type: 'number'|'text'|'select'|'temp', section, options? }]
//   groups:     [{ id, label, totalHeader }]      — per-group total columns
//   grandTotal: { label, header }
//   catTemp:    { a: {suffix, headerSuffix, label}, b: {...}, rule: 'gap'|'deltaT', threshold }
//               — one spot-check temperature pair per category (skipped when noTemp)
//
// The definition is the single source of truth for the form (tab include renders from
// hyperSurveyConfig_), the sheet headers, the email and the report page.

function _hsFieldKey_(def, catId, sizeKey) { return def.keyPrefix + catId + '_' + sizeKey; }
function _hsSizeHeader_(cat, size) { return cat.header + ' [' + size[1] + ']'; }
function _hsSumHeader_(cat) { return cat.header + ' [รวม]'; }
function _hsTempKey_(def, cat, which) { return def.keyPrefix + cat.id + '_' + def.catTemp[which].suffix; }
function _hsTempHeader_(def, cat, which) { return cat.header + def.catTemp[which].headerSuffix; }

function _hsInt_(v) {
    var n = parseInt(v, 10);
    return isNaN(n) || n < 0 ? 0 : n;
}

// '' for blank/invalid (not measured) — never 0, which is a real reading.
function _hsTemp_(v) {
    if (v === '' || v === null || v === undefined) return '';
    var n = parseFloat(v);
    return isNaN(n) ? '' : Math.round(n * 10) / 10;
}

// true when a category's temperature pair should be flagged:
//   'gap'    — |a - b| > threshold (controller display vs instrument reading)
//   'deltaT' — (b - a) < threshold  (return air − supply air too small = poor cooling)
function _hsTempFlag_(def, a, b) {
    if (a === '' || b === '') return false;
    if (def.catTemp.rule === 'deltaT') return (b - a) < def.catTemp.threshold;
    return Math.abs(a - b) > def.catTemp.threshold;
}

// Config handed to the client (form include + report page) — headers are computed
// here so client and sheet can never disagree on a column name. ctrlTemp*/measTemp*
// are temperature A/B of the pair (their meaning comes from catTemp labels).
function hyperSurveyConfig_(def) {
    return {
        categories: def.categories.map(function(c) {
            return {
                id: c.id, ff: _hsFFScheme_(def, c), noTotal: !!c.noTotal, products: c.products || null, specs: c.specs || null, cert: c.cert || false, eqPrefix: c.eqPrefix || '', group: c.group, color: c.color, title: c.title, hint: c.hint,
                header: c.header, sumHeader: _hsSumHeader_(c), hasTemp: !c.noTemp, tempRange: c.tempRange || null,
                tempPoints: (def.tempSets && c.tp && def.tempSets[c.tp]) ? def.tempSets[c.tp].points : null,
                tpName: (def.tempSets && c.tp && def.tempSets[c.tp]) ? def.tempSets[c.tp].name : '',
                tpCmp: (def.tempSets && c.tp && def.tempSets[c.tp]) ? def.tempSets[c.tp].cmp : 0,
                ctrlTempKey: _hsTempKey_(def, c, 'a'), ctrlTempHeader: _hsTempHeader_(def, c, 'a'),
                measTempKey: _hsTempKey_(def, c, 'b'), measTempHeader: _hsTempHeader_(def, c, 'b'),
                sizes: c.sizes.map(function(s) {
                    return { key: _hsFieldKey_(def, c.id, s[0]), sizeKey: s[0], label: s[1], header: _hsSizeHeader_(c, s) };
                })
            };
        }),
        system: def.system,
        groups: def.groups,
        grandTotal: def.grandTotal,
        catTemp: def.catTemp,
        perUnit: !!def.perUnit,
        layout: !!def.layout
    };
}

// ─── Per-unit mode (def.perUnit) ────────────────────────────────────────────────
// One entry per physical cabinet, stored as JSON in the "Units_JSON" cell with short
// keys (a 150-cabinet store stays well under the 50k-char cell limit):
//   c cat id · s size key · n index within that size · id Equipment ID · br brand ·
//   sp model/spec · as Asset No. · st status · cr condition 0-5 · ct controller °C ·
//   yr year of manufacture/installation (age = this year - yr) · ys where the year came from · nt free-text note
//   mt IR (measured) °C — with def.tempSets = the reference point of t1/t2/t3 (3 IR points) · tc controller/setpoint °C (Aircon: ct supply, mt return) · am amps · pk photo key (stable across renumbering)
var HS_UNITS_HEADER = 'Units_JSON';
var HS_GAP_HEADER = 'Temp Gap Units';
var HS_PINS_HEADER = 'Layout_Pins_JSON';
var HS_UNITS_MAX_CHARS = 48000;

function _hsParseUnits_(def, raw) {
    var arr = raw;
    if (typeof raw === 'string') { try { arr = JSON.parse(raw); } catch (e) { arr = null; } }
    if (!Array.isArray(arr)) return null;
    var catById = {};
    def.categories.forEach(function(c) { catById[c.id] = c; });
    var txt = function(v, max) { return String(v == null ? '' : v).trim().substring(0, max || 120); };
    var out = [];
    arr.forEach(function(u) {
        var cat = u && catById[u.c];
        if (!cat) return;
        var sizeOk = cat.sizes.some(function(z) { return z[0] === u.s; });
        if (!sizeOk) return;
        var cr = parseInt(u.cr, 10);
        // 3 measuring points (def.tempSets): the stored IR value `mt` is the reference point
        // (the one compared with the controller); legacy/other surveys keep the single `mt`.
        var set = def.tempSets && cat.tp ? def.tempSets[cat.tp] : null;
        var t1 = _hsTemp_(u.t1), t2 = _hsTemp_(u.t2), t3 = _hsTemp_(u.t3);
        var mtv = _hsTemp_(u.mt);
        if (set && (t1 !== '' || t2 !== '' || t3 !== '')) mtv = [t1, t2, t3][set.cmp];
        // pd = products stored in the cabinet (enum values, multi-select), po = free text for 'อื่นๆ'
        var pd = Array.isArray(u.pd) ? u.pd.map(function(v) { return txt(v, 40); }).filter(function(v) { return v; }).slice(0, 12) : [];
        var yrN = parseInt(u.yr, 10), curY = new Date().getFullYear();
        // mc maintenance contractor · ce inspection-certificate expiry (yyyy-MM-dd) · sx type-specific specs {k: v}
        var sx = {};
        if (cat.specs && u.sx && typeof u.sx === 'object') {
            cat.specs.forEach(function(f) { var v = txt(u.sx[f.k], 40); if (v !== '') sx[f.k] = v; });
        }
        var ceS = String(u.ce == null ? '' : u.ce).trim();
        var o = {
            yr: (!isNaN(yrN) && yrN >= 1980 && yrN <= curY + 1) ? yrN : '', ys: txt(u.ys, 40), nt: txt(u.nt, 300),
            mc: txt(u.mc, 80), ce: /^\d{4}-\d{2}-\d{2}$/.test(ceS) ? ceS : '', sx: sx,
            pd: pd, po: txt(u.po, 100),
            c: u.c, s: u.s, n: _hsInt_(u.n), id: txt(u.id, 40), br: txt(u.br), sp: txt(u.sp, 200),
            as: txt(u.as, 60), st: u.st === 'ไม่ใช้งาน' ? 'ไม่ใช้งาน' : 'ใช้งาน',
            cr: isNaN(cr) ? '' : Math.max(0, Math.min(5, cr)),
            ct: _hsTemp_(u.ct), mt: mtv, t1: t1, t2: t2, t3: t3, tc: _hsTemp_(u.tc), am: _hsTemp_(u.am),
            pk: txt(u.pk, 80)
        };
        // Main-machine register attributes (cat.ff / def.ff — see HS_FF_RATINGS); only non-empty
        // values are stored so big stores stay under the Units_JSON cell limit.
        if (cat.ff || def.ff) {
            var ff = _hsFFClean_(u);
            Object.keys(ff).forEach(function(k) { if (ff[k] !== '') o[k] = ff[k]; });
        }
        // rg: card was pre-filled from an imported register (e.g. 'FF-R3') — shown as "📥 จากทะเบียน" in the report
        var rg = txt(u.rg, 20);
        if (rg) o.rg = rg;
        out.push(o);
    });
    return out;
}

// ─── Main-machine register attributes ("FF Attribute" folder: Main machine RHVAC.xlsx, FF Inspection_R3.xlsx) ──
// Per unit of categories flagged `ff` (or every category when def.ff is set):
//   sn serial no. · cp capacity · pn new purchase price (THB) · rc repair cost last 5 years (THB) ·
//   se energy-efficiency score · si branch-impact score · ss spare-part-risk score (1..5, 5 = worst)
// `ff` names a scoring scheme (true = 'rhvac'). The replacement score is the register's "บทสรุป",
// computed at read time (never stored) as a weighted sum of:
//   rp repair ratio (rc > pn → 5, else 4) · ag age (>15 y → 5, >10 → 4, else 3) · the scheme's ratings
// and stays blank until the year and the scheme's ratings are known.
var HS_FF_RATING_DEFS = {
    se: { name: 'ความคุ้มค่าพลังงาน', short: 'พลังงาน', opts: ['ประหยัดไฟมาก (ใหม่ / Inverter)', 'ประหยัดไฟ', 'ปานกลาง', 'กินไฟ', 'กินไฟมาก / ประสิทธิภาพต่ำ'] },
    si: { name: 'ผลกระทบสาขา', short: 'ผลกระทบ', opts: ['แทบไม่กระทบ', 'กระทบน้อย', 'ปานกลาง', 'กระทบมาก', 'กระทบรุนแรง (สินค้าเสีย / ยอดขายทั้งโซน)'] },
    ss: { name: 'ความเสี่ยงอะไหล่', short: 'อะไหล่', opts: ['หาอะไหล่ง่าย', 'หาได้', 'ต้องสั่ง / รอนาน', 'หายาก', 'เลิกผลิต / หาไม่ได้'] }
};
var HS_FF_SCHEMES = {
    // Main machine RHVAC.xlsx (refrigeration, chillers, ice makers)
    rhvac: { rp: 0.4, se: 0.2, ag: 0.2, si: 0.1, ss: 0.1 },
    // FF Inspection_R3.xlsx (fresh-food equipment: ovens, mixers, fryers ...) — no energy score
    food: { rp: 0.4, ag: 0.25, si: 0.2, ss: 0.15 }
};

// Client-facing scheme for a category: { w: weights, ratings: [{k, label, short, opts}] } or null
function _hsFFScheme_(def, cat) {
    var k = (cat && cat.ff) || def.ff;
    if (!k) return null;
    var w = HS_FF_SCHEMES[k === true ? 'rhvac' : k];
    if (!w) return null;
    return {
        w: w,
        ratings: ['se', 'si', 'ss'].filter(function(r) { return w[r]; }).map(function(r) {
            var d = HS_FF_RATING_DEFS[r];
            return { k: r, label: d.name + ' (' + Math.round(w[r] * 100) + '%)', short: d.short, opts: d.opts };
        })
    };
}
function _hsFFSchemeById_(def, catId) {
    var cat = def.categories.filter(function(c) { return c.id === catId; })[0];
    return cat ? _hsFFScheme_(def, cat) : null;
}

function _hsFFClean_(u) {
    var txt = function(v, max) { return String(v == null ? '' : v).trim().substring(0, max); };
    var rate = function(v) { var r = parseInt(v, 10); return isNaN(r) || r < 1 || r > 5 ? '' : r; };
    var money = function(v) {
        if (v === '' || v == null) return '';
        var m = parseFloat(String(v).replace(/,/g, ''));
        return isNaN(m) || m < 0 ? '' : Math.round(m);
    };
    return { sn: txt(u.sn, 60), cp: txt(u.cp, 40), pn: money(u.pn), rc: money(u.rc), se: rate(u.se), si: rate(u.si), ss: rate(u.ss) };
}

// sch = _hsFFScheme_(...) (null → no score). pct = 5-year repair cost as % of the new price.
function _hsFFScore_(u, sch) {
    var age = u.yr ? _hsAge_(u.yr) : '';
    var ag = age === '' ? '' : (age > 15 ? 5 : age > 10 ? 4 : 3);
    var rp = (Number(u.rc) || 0) > (Number(u.pn) || 0) ? 5 : 4;
    var pct = Number(u.pn) > 0 && u.rc !== undefined && u.rc !== '' ? Math.round(Number(u.rc) / Number(u.pn) * 1000) / 10 : '';
    if (!sch) return { rp: rp, ag: ag, pct: pct, total: '' };
    var w = sch.w, ok = ag !== '';
    var total = rp * w.rp + ag * w.ag;
    ['se', 'si', 'ss'].forEach(function(k) { if (!w[k]) return; if (!u[k]) ok = false; else total += u[k] * w[k]; });
    return { rp: rp, ag: ag, pct: pct, total: ok ? Math.round(total * 100) / 100 : '' };
}

// Column/heading names for the per-unit temperature pair (a = ct, b = mt) of each survey.
function _hsUnitTemp_(def) {
    return def.unitTemp || { aHeader: 'Controller °C', bHeader: 'IR / วัดจริง °C', cHeader: '', flagHeader: 'ต่าง >3°C', emailHeader: 'Ctrl / IR °C' };
}

function _hsAge_(yr) { var n = parseInt(yr, 10); return isNaN(n) ? '' : Math.max(0, new Date().getFullYear() - n); }

function _hsPinsJson_(raw, units) {
    var arr = raw;
    if (typeof raw === 'string') { try { arr = JSON.parse(raw); } catch (e) { arr = null; } }
    if (!Array.isArray(arr)) return '[]';
    var ok = null;
    if (units) { ok = {}; units.forEach(function(u) { ok[u.pk] = true; }); }
    var out = [];
    arr.forEach(function(p) {
        var x = parseFloat(p && p.x), y = parseFloat(p && p.y);
        var pk = String((p && p.pk) || '').trim().substring(0, 80);
        if (!pk || isNaN(x) || isNaN(y) || x < 0 || x > 1 || y < 0 || y > 1) return;
        if (ok && !ok[pk]) return;
        out.push({ pk: pk, x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 });
    });
    return JSON.stringify(out.slice(0, 600));
}

function _hsUnitGap_(def, u) {
    return _hsTempFlag_(def, u.ct, u.mt);
}

// Counts + per-category sums + group totals + temps + system fields, keyed by sheet
// header. Shared by create and update so [รวม]/Total columns are always recomputed,
// never trusted from the client.
function _hsCountColumns_(def, form) {
    var out = {}, groupTotals = {}, grand = 0;
    // Per-unit mode: counts come from the units array. A request with no units key at
    // all (an edit of a legacy count-only record) falls back to the count inputs.
    var units = def.perUnit && form.unitsJson !== undefined ? _hsParseUnits_(def, form.unitsJson) : null;
    var unitCounts = {};
    if (units) {
        units.forEach(function(u) { var k = u.c + '|' + u.s; unitCounts[k] = (unitCounts[k] || 0) + 1; });
        out[HS_GAP_HEADER] = units.filter(function(u) { return _hsUnitGap_(def, u); }).length;
    }
    def.groups.forEach(function(g) { groupTotals[g.id] = 0; });
    def.categories.forEach(function(c) {
        var sum = 0;
        c.sizes.forEach(function(s) {
            var n = units ? (unitCounts[c.id + '|' + s[0]] || 0) : _hsInt_(form[_hsFieldKey_(def, c.id, s[0])]);
            out[_hsSizeHeader_(c, s)] = n;
            sum += n;
        });
        out[_hsSumHeader_(c)] = sum;
        if (!c.noTemp && !units) {
            out[_hsTempHeader_(def, c, 'a')] = _hsTemp_(form[_hsTempKey_(def, c, 'a')]);
            out[_hsTempHeader_(def, c, 'b')] = _hsTemp_(form[_hsTempKey_(def, c, 'b')]);
        }
        if (!c.noTotal) {
            if (groupTotals.hasOwnProperty(c.group)) groupTotals[c.group] += sum;
            grand += sum;
        }
    });
    def.system.forEach(function(f) {
        out[f.header] = f.type === 'number' ? _hsInt_(form[f.key])
            : f.type === 'temp' ? _hsTemp_(form[f.key])
            : String(form[f.key] || '').trim();
    });
    // Count columns that are now derived from per-unit categories (e.g. cold-room counts)
    if (units && def.derived) {
        def.derived.forEach(function(d) {
            var f = def.system.filter(function(x) { return x.key === d.key; })[0];
            var cat = def.categories.filter(function(x) { return x.id === d.cat; })[0];
            if (f && cat) out[f.header] = out[_hsSumHeader_(cat)];
        });
    }
    def.groups.forEach(function(g) { out[g.totalHeader] = groupTotals[g.id]; });
    if (def.grandTotal.header) out[def.grandTotal.header] = grand;
    // Layout pins: one {pk, x, y} (0..1 fractions of the layout image) per cabinet
    if (def.layout && form.pinsJson !== undefined) out[HS_PINS_HEADER] = _hsPinsJson_(form.pinsJson, units);
    // Survey-specific extra columns (def.extraColumns, e.g. the lighting survey's zones + OPEX)
    if (def.extraColumns) {
        var extra = def.extraColumns(form);
        Object.keys(extra).forEach(function(k) { out[k] = extra[k]; });
    }
    if (units) {
        var json = JSON.stringify(units);
        if (json.length > HS_UNITS_MAX_CHARS) throw new Error('รายการตู้มากเกินไปสำหรับบันทึกใน 1 รายการ (' + units.length + ' ตู้) กรุณาแจ้งผู้ดูแลระบบ');
        out[HS_UNITS_HEADER] = json;
    }
    return out;
}

function _hsGetSheet_(def, createWithHeaders) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(def.sheet);
    if (!sheet && createWithHeaders) {
        sheet = ss.insertSheet(def.sheet);
        sheet.appendRow(createWithHeaders);
        sheet.setFrozenRows(1);
        var hdr = sheet.getRange(1, 1, 1, createWithHeaders.length);
        hdr.setBackground(def.headerColor);
        hdr.setFontColor('#ffffff');
        hdr.setFontWeight('bold');
    }
    return sheet;
}

function _hsFindRow_(sheet, id) {
    var data = sheet.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).trim(); });
    var idIdx = headers.indexOf('ID');
    if (idIdx === -1) return { data: data, headers: headers, rowIndex: -1 };
    for (var i = 1; i < data.length; i++) {
        if (String(data[i][idIdx]).trim() === String(id).trim()) return { data: data, headers: headers, rowIndex: i + 1 };
    }
    return { data: data, headers: headers, rowIndex: -1 };
}

function _hsCanEdit_(adminCheck) {
    return adminCheck.isAdmin || adminCheck.isScheduleAdmin || adminCheck.smfEditAllowed || adminCheck.opsEditAllowed;
}

function hyperSurveySubmit_(def, form) {
    try {
        var id = def.idPrefix + "-" + new Date().getTime();
        // Validate/compute first so a bad payload fails before any Drive upload.
        var counts = _hsCountColumns_(def, form);

        // Photo uploads happen before taking the lock — Drive writes are slow and
        // don't touch the shared sheet.
        // Photos pre-uploaded one by one via hyperUploadSurveyPhoto (big stores have 100+ photos —
        // sending them all in this call exceeds the payload / 6-min limits). Reuse the client's
        // upload id so the Drive filenames match the record ID.
        if (form.uploadId && new RegExp('^' + def.idPrefix + '-\\d+$').test(form.uploadId)) id = form.uploadId;
        var attachmentLinks = {};
        if (form.uploadedLinks) {
            Object.keys(form.uploadedLinks).forEach(function(cat) {
                var urls = (form.uploadedLinks[cat] || []).filter(function(u) { return /^https:\/\/drive\.google\.com\//.test(u); });
                if (urls.length) attachmentLinks[cat] = urls;
            });
        }
        if (form.attachments) {
            var folders = DriveApp.getFoldersByName(def.folder);
            var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(def.folder);
            for (var category in form.attachments) {
                var files = form.attachments[category];
                if (!files || files.length === 0) continue;
                attachmentLinks[category] = attachmentLinks[category] || [];
                files.forEach(function(fileData) {
                    var filename = id + "_" + (form.branchCode || '') + "_" + category + "_" + fileData.name;
                    var blob = Utilities.newBlob(Utilities.base64Decode(fileData.data), fileData.mimeType, filename);
                    var file = folder.createFile(blob);
                    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                    attachmentLinks[category].push("https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId());
                });
            }
        }

        var dataToSave = {
            "Timestamp":      new Date(),
            "ID":             id,
            "Reporter Email": form.reporterEmail || "",
            "Reporter Name":  form.reporterName || "",
            "Reporter Phone": form.reporterPhone || "",
            "Branch Code":    form.branchCode || "",
            "Branch Name":    form.branchName || "",
            "Store Format":   form.storeFormat || "",
            "Region":         form.region || "",
            "DM Area":        form.dmArea || "",
            "CM Area":        form.cmArea || "",
            "AMM MTN":        form.ammMtn || ""
        };
        Object.keys(counts).forEach(function(k) { dataToSave[k] = counts[k]; });
        dataToSave["Has Broken"] = form.hasBroken === 'Yes' ? 'Yes' : 'No';
        dataToSave["Broken Detail"] = form.hasBroken === 'Yes' ? (form.brokenDetail || '') : '';
        dataToSave["Comments"] = form.comments || "";
        dataToSave["CC Email 1"] = form.ccEmail1 || "";
        dataToSave["CC Email 2"] = form.ccEmail2 || "";
        dataToSave["Attachments_JSON"] = JSON.stringify(attachmentLinks);
        dataToSave[HS_REVIEW_STATUS] = "Pending";

        var _wlock = _acquireWriteLock_();
        var sheet = _hsGetSheet_(def, Object.keys(dataToSave));
        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) { return String(h).trim(); });
        Object.keys(dataToSave).forEach(function(key) {
            if (headers.indexOf(key) === -1) {
                headers.push(key);
                sheet.getRange(1, headers.length).setValue(key);
            }
        });
        sheet.appendRow(headers.map(function(h) { return dataToSave[h] !== undefined ? dataToSave[h] : ""; }));
        _hsHistSafe_(function() {
            var us = def.perUnit && counts[HS_UNITS_HEADER] ? JSON.parse(counts[HS_UNITS_HEADER]) : [];
            _hsHistAppend_(us.map(function(u) { return _hsHistRow_(def, 'Survey', id, form.branchCode, form.branchName, u, form.reporterName || form.reporterEmail, ''); }));
        });
        _closeSurveyDraft_(form.draftId, id);
        _wlock.releaseLock();

        _hsEquipCacheClear_();
        try { _hsSendConfirmEmail_(def, form, counts, attachmentLinks); } catch (mailErr) {
            Logger.log(def.name + " email error: " + mailErr);
        }
        return { success: true, id: id };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// One photo per call — the submission form uploads each photo here first, then submits only the links.
function hyperUploadSurveyPhoto(idPrefix, uploadId, branchCode, category, fileData) {
    try {
        var defs = [HYPER_REF_DEF, HYPER_AC_DEF, HYPER_EQ_DEF, HYPER_LI_DEF, HYPER_TO_DEF, HYPER_FO_DEF, HYPER_PK_DEF, HYPER_FA_DEF, HYPER_HB_DEF, HYPER_FI_DEF, STORE_CLOSE_DEF, CCTV_DEF];
        var def = null;
        for (var i = 0; i < defs.length; i++) if (defs[i].idPrefix === idPrefix) def = defs[i];
        // Aircon / NP draft saves reuse this one-photo-per-call uploader (see SurveyDraftStore.gs)
        if (!def && idPrefix === 'ACS') def = { folder: 'Aircon_Survey_Attachments' };
        if (!def && idPrefix === 'NPS') def = { folder: 'NewProduct_Survey_Attachments' };
        if (!def) return { success: false, error: "Unknown survey type." };
        if (!fileData || !fileData.data) return { success: false, error: "No file data." };
        var folders = DriveApp.getFoldersByName(def.folder);
        var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(def.folder);
        var filename = String(uploadId || '') + "_" + (branchCode || '') + "_" + category + "_" + (fileData.name || 'photo.jpg');
        var blob = Utilities.newBlob(Utilities.base64Decode(fileData.data), fileData.mimeType || "image/jpeg", filename);
        var file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        return { success: true, url: "https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId() };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function _hsSendConfirmEmail_(def, form, counts, attachmentLinks) {
    var toEmail = form.reporterEmail || Session.getActiveUser().getEmail();
    if (!toEmail) return;
    var esc = function(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var h = '<html><body style="font-family:sans-serif;color:#333;background:#f4f4f4;margin:0;padding:0;">';
    h += '<div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">';
    h += '<div style="background:' + def.headerColor + ';color:white;padding:20px;text-align:center;">';
    h += '<h2 style="margin:0 0 8px 0;">' + def.emoji + ' ' + esc(def.name) + '</h2>';
    h += '<p style="margin:0;font-size:14px;">Branch: ' + esc(form.branchCode) + ' - ' + esc(form.branchName) + '</p></div>';
    h += '<div style="padding:20px;">';
    h += '<p><b>Reporter:</b> ' + esc(form.reporterName || toEmail) + '</p>';
    if (def.grandTotal.header) h += '<p>' + def.groups.map(function(g) { return '<b>' + esc(g.label) + ':</b> ' + counts[g.totalHeader]; }).join(' | ') +
        ' | <b>' + esc(def.grandTotal.label) + ':</b> ' + counts[def.grandTotal.header] + '</p>';
    h += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    def.categories.forEach(function(c) {
        var sum = counts[_hsSumHeader_(c)];
        if (!sum) return;
        var detail = c.sizes.filter(function(s) { return counts[_hsSizeHeader_(c, s)] > 0; })
            .map(function(s) { return s[1] + ' × ' + counts[_hsSizeHeader_(c, s)]; }).join(', ');
        if (!c.noTemp) {
            var a = counts[_hsTempHeader_(def, c, 'a')], b = counts[_hsTempHeader_(def, c, 'b')];
            if (a !== '' || b !== '') {
                detail += ' | 🌡️ ' + def.catTemp.a.label + ' ' + (a === '' ? '-' : a) + '°C / ' + def.catTemp.b.label + ' ' + (b === '' ? '-' : b) + '°C';
                if (_hsTempFlag_(def, a, b)) detail += ' ⚠️';
            }
        }
        h += '<tr><td style="padding:6px;border-bottom:1px solid #f1f5f9;">' + esc(c.header) + '</td><td style="padding:6px;border-bottom:1px solid #f1f5f9;">' + esc(detail) + '</td><td style="padding:6px;border-bottom:1px solid #f1f5f9;text-align:right;"><b>' + sum + '</b></td></tr>';
    });
    h += '</table>';
    if (def.perUnit && counts[HS_UNITS_HEADER]) {
        var units = [];
        try { units = JSON.parse(counts[HS_UNITS_HEADER]); } catch (e) {}
        if (units.length) {
            var catTitle = {};
            def.categories.forEach(function(c) { catTitle[c.id] = c.title; });
            h += '<p style="margin:12px 0 4px;"><b>รายการตู้รายเครื่อง (' + units.length + ' ตู้)</b>' +
                (counts[HS_GAP_HEADER] ? ' <span style="color:#b45309;">⚠️ Temp ต่างจาก Controller &gt;' + def.catTemp.threshold + '°C: ' + counts[HS_GAP_HEADER] + ' ตู้</span>' : '') + '</p>';
            h += '<table style="width:100%;border-collapse:collapse;font-size:11px;"><tr style="background:#f1f5f9;text-align:left;">' +
                '<th style="padding:4px;">Equipment ID</th><th style="padding:4px;">ประเภท / ขนาด</th><th style="padding:4px;">ยี่ห้อ / รุ่น</th><th style="padding:4px;">ปีผลิต (อายุ)</th><th style="padding:4px;">สินค้าในตู้</th><th style="padding:4px;">Asset No.</th><th style="padding:4px;">สถานะ</th><th style="padding:4px;">สภาพ</th><th style="padding:4px;">' + esc(_hsUnitTemp_(def).emailHeader) + '</th></tr>';
            units.forEach(function(u) {
                var sizeLabel = '';
                def.categories.forEach(function(c) { if (c.id === u.c) c.sizes.forEach(function(z) { if (z[0] === u.s) sizeLabel = z[1]; }); });
                var gap = _hsUnitGap_(def, u);
                h += '<tr><td style="padding:4px;border-bottom:1px solid #f1f5f9;font-family:monospace;">' + esc(u.id) + '</td>' +
                    '<td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + esc((catTitle[u.c] || u.c).replace(/\s*\(.*$/, '')) + ' · ' + esc(sizeLabel) + '</td>' +
                    '<td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + esc([u.br, u.sp].filter(Boolean).join(' / ') || '-') + (u.sn ? '<br><span style="color:#64748b;">SN ' + esc(u.sn) + (u.cp ? ' · ' + esc(u.cp) : '') + '</span>' : (u.cp ? '<br><span style="color:#64748b;">' + esc(u.cp) + '</span>' : '')) + '</td>' +
                    '<td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + (u.yr ? esc(u.yr) + ' (' + _hsAge_(u.yr) + ' ปี)' : '-') + '</td>' +
                    '<td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + esc(((u.pd || []).join(', ') + (u.po ? ' / ' + u.po : '')) || '-') + '</td>' +
                    '<td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + esc(u.as || '-') + '</td>' +
                    '<td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + esc(u.st) + '</td>' +
                    '<td style="padding:4px;border-bottom:1px solid #f1f5f9;">' + (u.cr === '' ? '-' : u.cr + '/5') + (function() { var fs = _hsFFScore_(u, _hsFFSchemeById_(def, u.c)).total; return fs === '' ? '' : '<br><span style="color:' + (fs >= 4.5 ? '#b91c1c' : fs >= 4 ? '#b45309' : '#15803d') + ';">คะแนน ' + fs + '</span>'; })() + '</td>' +
                    (_hsUnitTemp_(def).noTemp ? '<td style="padding:4px;border-bottom:1px solid #f1f5f9;' + (u.ce && u.ce < Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd') ? 'color:#b91c1c;font-weight:bold;' : '') + '">' + esc(u.ce || '-') + '</td></tr>' :
                    '<td style="padding:4px;border-bottom:1px solid #f1f5f9;' + (gap ? 'color:#b45309;font-weight:bold;' : '') + '">' + (u.ct === '' ? '-' : u.ct) + ' / ' +
                    ((u.t1 !== undefined && (u.t1 !== '' || u.t2 !== '' || u.t3 !== '')) ? [u.t1, u.t2, u.t3].map(function(t) { return t === '' ? '-' : t; }).join(' · ') : (u.mt === '' ? '-' : u.mt)) + (gap ? ' ⚠️' : '') + '</td></tr>');
            });
            h += '</table>';
        }
    }
    if (def.emailExtra) h += def.emailExtra(counts, esc);
    h += '<hr/>';
    def.system.forEach(function(f) {
        var v = counts[f.header];
        if (v === '' || (v === 0 && f.type !== 'temp')) return;
        h += '<p style="margin:4px 0;"><b>' + esc(f.header) + ':</b> ' + esc(v) + '</p>';
    });
    if (form.hasBroken === 'Yes') h += '<p style="color:#b91c1c;"><b>⚠️ ' + esc(def.brokenLabel) + ':</b> ' + esc(form.brokenDetail || '-') + '</p>';
    if (form.comments) h += '<p><b>Comments:</b> ' + esc(form.comments) + '</p>';
    var photoCount = Object.keys(attachmentLinks).reduce(function(s, k) { return s + attachmentLinks[k].length; }, 0);
    if (photoCount) h += '<p style="color:#64748b;font-size:12px;">📸 แนบรูปทั้งหมด ' + photoCount + ' รูป</p>';
    h += '</div></div></body></html>';

    var cc = [form.ccEmail1, form.ccEmail2].filter(function(e) { return e && String(e).indexOf('@') > 0; }).join(',');
    var opts = { to: toEmail, subject: def.name + " Submitted: " + form.branchCode + " " + form.branchName, htmlBody: h };
    if (cc) opts.cc = cc;
    sendAppEmail_(opts);
}

// ─── Store DB lookup for Hyper codes ──
// { 6-digit code: { amm, dm, cm } } from the master store DB (getStoreDBDataV2), matched on its Oracle (6-digit)
// column, else via the FAD gold code (HYPER_FA_STORES). Never strip/add a leading "1": gold and 6-digit codes drift
// apart from ~11220 (Ban Phai = gold 11230 / 111236, while 11236 is Nam Yuen). Hyper/BMK/Depot gold codes start
// with "1"; a Pure store can share the Oracle code (Pure Kanchanaburi), so those win.
function hyperStoreDbMap_() {
    var map = {};
    try {
        var list = getStoreDBDataV2() || [], byGold = {};
        list.forEach(function(x) { if (x.id) byGold[String(x.id)] = x; });
        var put = function(code, x) {
            if (!code || !x) return;
            var cur = map[code];
            if (cur && cur._g && !(String(x.id).charAt(0) === '1')) return;
            map[code] = { amm: x.ammMtn || '', dm: x.dmName || '', cm: x.cmName || '', _g: String(x.id).charAt(0) === '1' };
        };
        list.forEach(function(x) { if (/^\d{6}$/.test(x.oracle || '')) put(x.oracle, x); });
        if (typeof HYPER_FA_STORES !== 'undefined') HYPER_FA_STORES.forEach(function(s) { if (s[1] && !map[s[1]]) put(s[1], byGold[s[0]]); });
    } catch (e) { Logger.log('hyperStoreDbMap_: ' + e); }
    return map;
}
// Records stamped AMM MTN / DM / CM at submit time via the old leading-"1" lookup (wrong for ~28 stores) —
// show the store DB's current values instead.
function _hsFixStoreInfo_(rows, map) {
    map = map || hyperStoreDbMap_();
    (rows || []).forEach(function(r) {
        var m = r && map[String(r['Branch Code'] || '').trim()];
        if (!m) return;
        if (m.amm) r['AMM MTN'] = m.amm;
        if (m.dm) r['DM Area'] = m.dm;
        if (m.cm) r['CM Area'] = m.cm;
    });
    return rows;
}

// ─── Report list — full rows (one per store visit, small sheet; no slim cache needed) ──
function hyperSurveyList_(def, includeArchive) {
    try {
        var config = hyperSurveyConfig_(def);
        var sheet = _archSheetFor_(def.sheet, includeArchive);
        if (!sheet || sheet.getLastRow() < 2) return { success: true, config: config, data: [] };
        var values = sheet.getDataRange().getValues();
        var headers = values[0].map(function(h) { return String(h).trim(); });
        var results = [];
        // Inspection-certificate status per survey (computed now, so it never goes stale):
        // _certExpired / _certDue60 / _certMissing counts over units of categories with `cert`
        var certCats = {};
        def.categories.forEach(function(c) { if (c.cert) certCats[c.id] = c.cert; });
        var hasCert = Object.keys(certCats).length > 0;
        var unitsIdxL = headers.indexOf(HS_UNITS_HEADER);
        var today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
        var in60 = Utilities.formatDate(new Date(Date.now() + 60 * 86400000), 'Asia/Bangkok', 'yyyy-MM-dd');
        // Replacement-score buckets per survey (surveys whose categories carry an ff scheme):
        // _ffHigh = units scoring ≥ 4.5, _ffPlan = 4.0–4.49
        var ffSch = {};
        def.categories.forEach(function(c) { var sc = _hsFFScheme_(def, c); if (sc) ffSch[c.id] = sc; });
        var hasFFL = Object.keys(ffSch).length > 0;
        for (var i = 1; i < values.length; i++) {
            var row = {};
            if (hasFFL && unitsIdxL > -1 && values[i][unitsIdxL]) {
                var fu = [];
                try { fu = JSON.parse(values[i][unitsIdxL]); } catch (eF) {}
                row._ffHigh = 0; row._ffPlan = 0;
                fu.forEach(function(u) {
                    if (!ffSch[u.c]) return;
                    var t = _hsFFScore_(u, ffSch[u.c]).total;
                    if (t === '') return;
                    if (t >= 4.5) row._ffHigh++; else if (t >= 4) row._ffPlan++;
                });
            }
            if (hasCert && unitsIdxL > -1 && values[i][unitsIdxL]) {
                var cu = [];
                try { cu = JSON.parse(values[i][unitsIdxL]); } catch (eU) {}
                row._certExpired = 0; row._certDue60 = 0; row._certMissing = 0;
                cu.forEach(function(u) {
                    if (!certCats[u.c]) return;
                    if (!u.ce) { if (certCats[u.c] === 'req') row._certMissing++; return; }
                    if (u.ce < today) row._certExpired++;
                    else if (u.ce <= in60) row._certDue60++;
                });
            }
            for (var j = 0; j < headers.length; j++) {
                if (headers[j] === 'Attachments_JSON' || headers[j] === HS_UNITS_HEADER || (def.listSkip && def.listSkip.indexOf(headers[j]) > -1)) continue;
                var v = values[i][j];
                row[headers[j]] = v instanceof Date ? v.toISOString() : v;
            }
            // per-survey derived fields from a skipped column (e.g. Parking 6-facility status from Parking_JSON)
            if (def.listRow) { var lrIdx = headers.indexOf(def.listRow.col); if (lrIdx > -1) { try { def.listRow.fn(row, values[i][lrIdx]); } catch (eL) {} } }
            results.push(row);
        }
        results.reverse();
        _hsFixStoreInfo_(results);
        return { success: true, config: config, data: results };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function hyperSurveyRecordById_(def, id) {
    try {
        var sheet = _archLookupSheet_(def.sheet, id);
        if (!sheet) return { success: false, error: 'Sheet not found' };
        var found = _hsFindRow_(sheet, id);
        if (found.rowIndex === -1) return { success: false, error: 'Record not found: ' + id };
        var rowVals = found.data[found.rowIndex - 1];
        var row = {};
        found.headers.forEach(function(h, j) {
            var v = rowVals[j];
            row[h] = v instanceof Date ? v.toISOString() : v;
        });
        try { row['Attachments_JSON'] = JSON.parse(row['Attachments_JSON'] || '{}'); } catch (e) { row['Attachments_JSON'] = {}; }
        var units = null;
        try { units = row[HS_UNITS_HEADER] ? JSON.parse(row[HS_UNITS_HEADER]) : null; } catch (e) { units = null; }
        row[HS_UNITS_HEADER] = units;
        var pins = [];
        try { pins = row[HS_PINS_HEADER] ? JSON.parse(row[HS_PINS_HEADER]) : []; } catch (e) { pins = []; }
        row[HS_PINS_HEADER] = pins;
        _hsFixStoreInfo_([row]);
        return { success: true, data: row, config: hyperSurveyConfig_(def) };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Edit — Admin / SMF / Ops (when their toggle is on) or the original reporter ──
// The client sends EVERY count/system key (the edit modal renders all of them from
// config), so a full recompute here can't blank a field the modal didn't show.
function hyperSurveyUpdate_(def, form) {
    try {
        var _wlock = _acquireWriteLock_();
        var userEmail = form.clientEmail || Session.getActiveUser().getEmail();
        var adminCheck = checkSurveyAdminStatus(userEmail);
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.sheet);
        if (!sheet) return { success: false, error: "Sheet not found" };
        var found = _hsFindRow_(sheet, form.id);
        if (found.rowIndex === -1) return { success: false, error: "Record not found" };
        var headers = found.headers;

        var ownerIdx = headers.indexOf('Reporter Email');
        var ownerEmail = ownerIdx > -1 ? String(found.data[found.rowIndex - 1][ownerIdx] || '').trim().toLowerCase() : '';
        var isOwner = ownerEmail && userEmail && ownerEmail === String(userEmail).trim().toLowerCase();
        if (!_hsCanEdit_(adminCheck) && !isOwner) {
            return { success: false, error: "Administrator privileges or original reporter required." };
        }

        var updates = _hsCountColumns_(def, form);
        _hsHistSafe_(function() {
            if (!def.perUnit || !updates[HS_UNITS_HEADER]) return;
            var oldIdx = headers.indexOf(HS_UNITS_HEADER);
            var oldUnits = [];
            try { oldUnits = oldIdx > -1 ? JSON.parse(found.data[found.rowIndex - 1][oldIdx] || '[]') : []; } catch (e0) {}
            var newUnits = JSON.parse(updates[HS_UNITS_HEADER]);
            var diff = _hsDiffUnits_(oldUnits, newUnits);
            var bc = found.data[found.rowIndex - 1][headers.indexOf('Branch Code')], bn = found.data[found.rowIndex - 1][headers.indexOf('Branch Name')];
            var rows = [];
            newUnits.forEach(function(u) {
                if (diff.changed[u.pk]) rows.push(_hsHistRow_(def, 'Edit', form.id, bc, bn, u, userEmail, diff.changed[u.pk].join(' | ')));
            });
            diff.removed.forEach(function(u) { rows.push(_hsHistRow_(def, 'Removed', form.id, bc, bn, u, userEmail, 'ลบออกจากรายการสำรวจ')); });
            _hsHistAppend_(rows);
        });
        updates['Has Broken'] = form.hasBroken === 'Yes' ? 'Yes' : 'No';
        updates['Broken Detail'] = form.hasBroken === 'Yes' ? (form.brokenDetail || '') : '';
        updates['Comments'] = form.comments || '';
        // Reporter fixing a record a reviewer rejected → back into the review queue as Corrected.
        var rsIdx = headers.indexOf(HS_REVIEW_STATUS);
        if (rsIdx > -1 && !_hsCanEdit_(adminCheck) && String(found.data[found.rowIndex - 1][rsIdx]).trim() === 'Rejected') updates[HS_REVIEW_STATUS] = 'Corrected';

        var rowVals = found.data[found.rowIndex - 1].slice();
        Object.keys(updates).forEach(function(k) {
            var idx = headers.indexOf(k);
            if (idx === -1) {
                headers.push(k);
                sheet.getRange(1, headers.length).setValue(k);
                idx = headers.length - 1;
            }
            rowVals[idx] = updates[k];
        });
        while (rowVals.length < headers.length) rowVals.push('');
        sheet.getRange(found.rowIndex, 1, 1, headers.length).setValues([rowVals]);
        _hsEquipCacheClear_();
        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function hyperSurveyDelete_(def, id, clientEmail) {
    try {
        var _wlock = _acquireWriteLock_();
        var adminCheck = checkSurveyAdminStatus(clientEmail || Session.getActiveUser().getEmail());
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin) return { success: false, error: "Administrator privileges required." };
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.sheet);
        if (!sheet) return { success: false, error: "Sheet not found" };
        var found = _hsFindRow_(sheet, id);
        if (found.rowIndex === -1) return { success: false, error: "Record not found" };
        sheet.deleteRow(found.rowIndex);
        _hsEquipCacheClear_();
        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Add / delete photos on an existing record (Admin / SMF / Ops edit toggle) ──
function hyperSurveyAddPhotos_(def, id, unitKey, files, clientEmail) {
    try {
        var adminCheck = checkSurveyAdminStatus(clientEmail);
        if (!_hsCanEdit_(adminCheck)) return { success: false, error: "Administrator privileges required." };

        var folders = DriveApp.getFoldersByName("Survey_Photos_Added");
        var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("Survey_Photos_Added");
        var newUrls = [];
        var ts = new Date().getTime();
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            if (!f.data || !f.name) continue;
            var blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.mimeType || "image/jpeg", def.photoFilePrefix + "_" + id + "_" + unitKey + "_" + ts + "_" + i + "_" + f.name);
            var file = folder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            newUrls.push("https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId());
        }
        if (newUrls.length === 0) return { success: false, error: "No valid files received." };

        var _wlock = _acquireWriteLock_();
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.sheet);
        if (!sheet) return { success: false, error: "Sheet not found." };
        var found = _hsFindRow_(sheet, id);
        if (found.rowIndex === -1) return { success: false, error: "Record not found." };
        var attachIdx = found.headers.indexOf('Attachments_JSON');
        if (attachIdx === -1) return { success: false, error: "Attachments_JSON column not found." };
        var existing = {};
        try { existing = JSON.parse(found.data[found.rowIndex - 1][attachIdx] || "{}"); } catch (e) {}
        existing[unitKey] = (existing[unitKey] || []).concat(newUrls);
        sheet.getRange(found.rowIndex, attachIdx + 1).setValue(JSON.stringify(existing));
        return { success: true, newUrls: newUrls };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function hyperSurveyDeletePhoto_(def, id, unitKey, url, clientEmail) {
    try {
        var _wlock = _acquireWriteLock_();
        var adminCheck = checkSurveyAdminStatus(clientEmail);
        if (!_hsCanEdit_(adminCheck)) return { success: false, error: "Administrator privileges required." };
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.sheet);
        if (!sheet) return { success: false, error: "Sheet not found." };
        var found = _hsFindRow_(sheet, id);
        if (found.rowIndex === -1) return { success: false, error: "Record not found." };
        var attachIdx = found.headers.indexOf('Attachments_JSON');
        if (attachIdx === -1) return { success: false, error: "Attachments_JSON column not found." };
        var existing = {};
        try { existing = JSON.parse(found.data[found.rowIndex - 1][attachIdx] || "{}"); } catch (e) {}
        if (existing[unitKey]) existing[unitKey] = existing[unitKey].filter(function(u) { return u !== url; });
        sheet.getRange(found.rowIndex, attachIdx + 1).setValue(JSON.stringify(existing));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Per-cabinet rows for the report's Excel export (one row per unit, all surveys) ──
// Units live in a JSON cell the list payload deliberately omits, so the report fetches
// this flat view on export and filters it to the surveys currently shown.
function hyperSurveyUnitRows_(def) {
    try {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.sheet);
        if (!sheet || sheet.getLastRow() < 2) return { success: true, rows: [] };
        var values = sheet.getDataRange().getValues();
        var headers = values[0].map(function(h) { return String(h).trim(); });
        var ix = function(name) { return headers.indexOf(name); };
        var unitsIdx = ix(HS_UNITS_HEADER);
        if (unitsIdx === -1) return { success: true, rows: [] };
        var catById = {};
        def.categories.forEach(function(c) { catById[c.id] = c; });
        var rows = [];
        var ut = _hsUnitTemp_(def);
        var hasFF = !!def.ff || def.categories.some(function(c) { return c.ff; });
        for (var i = 1; i < values.length; i++) {
            var raw = values[i][unitsIdx];
            if (!raw) continue;
            var units;
            try { units = JSON.parse(raw); } catch (e) { continue; }
            var ts = values[i][ix('Timestamp')];
            units.forEach(function(u) {
                var cat = catById[u.c];
                var sizeLabel = u.s;
                if (cat) cat.sizes.forEach(function(z) { if (z[0] === u.s) sizeLabel = z[1]; });
                var row = {
                    'Branch Code': values[i][ix('Branch Code')], 'Branch Name': values[i][ix('Branch Name')],
                    'Survey ID': values[i][ix('ID')], 'Survey Date': ts instanceof Date ? ts.toISOString() : ts,
                    'Equipment ID': u.id, 'ประเภท': cat ? cat.title : u.c, 'ขนาด': sizeLabel,
                    'ยี่ห้อ': u.br, 'รุ่น / สเปค': u.sp, 'Asset No.': u.as, 'สถานะ': u.st, 'สภาพ (0-5)': u.cr,
                    'กระแสไฟ (A)': u.am, 'สินค้าในตู้': ((u.pd || []).join(', ') + (u.po ? ' / ' + u.po : '')),
                    'ปีที่ผลิต/ติดตั้ง': u.yr === undefined ? '' : u.yr, 'อายุ (ปี)': u.yr ? _hsAge_(u.yr) : '', 'แหล่งที่มาของปี': u.ys || '', 'หมายเหตุ': u.nt || ''
                };
                if (!ut.noTemp) {
                    row[ut.aHeader] = u.ct;
                    row[ut.bHeader] = u.mt;
                    if (ut.cHeader) row[ut.cHeader] = u.tc;
                    row[ut.flagHeader] = _hsUnitGap_(def, u) ? 'Y' : '';
                }
                row['ผู้รับเหมาดูแล'] = u.mc || '';
                row['ใบตรวจหมดอายุ'] = u.ce || '';
                row['สเปค'] = _hsSpecText_(def, u);
                if (hasFF) {
                    var sch = cat ? _hsFFScheme_(def, cat) : null;
                    var sc = sch ? _hsFFScore_(u, sch) : null;
                    row['Serial No.'] = u.sn || '';
                    row['Capacity'] = u.cp || '';
                    row['ราคาซื้อใหม่ (THB)'] = u.pn === undefined ? '' : u.pn;
                    row['มูลค่างานซ่อม 5 ปี (THB)'] = u.rc === undefined ? '' : u.rc;
                    row['% ค่าซ่อม'] = sc ? sc.pct : '';
                    row['คะแนน สัดส่วนการซ่อม'] = sc ? sc.rp : '';
                    if (!sch || sch.w.se) row['คะแนน ความคุ้มค่าพลังงาน'] = u.se || '';
                    row['คะแนน อายุการใช้งาน'] = sc ? sc.ag : '';
                    row['คะแนน ผลกระทบสาขา'] = u.si || '';
                    row['คะแนน ความเสี่ยงอะไหล่'] = u.ss || '';
                    row['บทสรุป (คะแนนรวม)'] = sc ? sc.total : '';
                }
                if (ut.pointHeaders) {
                    var set = def.tempSets && cat && cat.tp ? def.tempSets[cat.tp] : null;
                    [u.t1, u.t2, u.t3].forEach(function(t, k) { row[ut.pointHeaders[k]] = t === undefined ? '' : t; });
                    row[ut.pointNameHeader] = set ? set.points.map(function(p) { return p.label; }).join(' / ') : '';
                }
                rows.push(row);
            });
        }
        return { success: true, rows: rows };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Brand enum for the Hyper per-unit forms ─────────────────────────────────
// Same auto-growing enum as the Ref / Aircon surveys (getEnumFieldOptions: defaults UNION
// every brand already submitted), plus every brand already used in this Hyper survey's
// Units_JSON — brands the Hyper stores really use come first (most-used first), then the
// rest of the shared list. `extraDefaults` seeds brands that are common in big-format
// plant but absent from the Mini Big C list. Cached 6h like the shared enum.
function hyperBrandOptions_(def, baseGroupKey, extraDefaults) {
    try {
        var cache = CacheService.getScriptCache();
        var cacheKey = 'HYPER_BRAND_OPTS_V1_' + def.idPrefix;
        var cached = cache.get(cacheKey);
        if (cached) return { success: true, options: JSON.parse(cached) };

        var base = getEnumFieldOptions(baseGroupKey);
        var canonical = {}, order = [];
        var add = function(v) {
            var t = String(v || '').trim();
            if (!t || canonical[t.toLowerCase()]) return;
            canonical[t.toLowerCase()] = t;
            order.push(t.toLowerCase());
        };
        if (base.success) base.options.forEach(add);
        (extraDefaults || []).forEach(add);

        var freq = {}, casings = {};
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.sheet);
        if (sheet && sheet.getLastRow() > 1) {
            var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) { return String(h).trim(); });
            var ui = headers.indexOf(HS_UNITS_HEADER);
            if (ui > -1) {
                sheet.getRange(2, ui + 1, sheet.getLastRow() - 1, 1).getValues().forEach(function(r) {
                    if (!r[0]) return;
                    var units;
                    try { units = JSON.parse(r[0]); } catch (e) { return; }
                    units.forEach(function(u) {
                        var t = String(u.br || '').trim();
                        if (!t) return;
                        var k = t.toLowerCase();
                        freq[k] = (freq[k] || 0) + 1;
                        (casings[k] = casings[k] || {})[t] = (casings[k][t] || 0) + 1;
                    });
                });
            }
        }
        Object.keys(freq).forEach(function(k) {
            if (canonical[k]) return; // an existing option's casing wins
            var best = null, bestN = -1;
            Object.keys(casings[k]).forEach(function(c) { if (casings[k][c] > bestN) { best = c; bestN = casings[k][c]; } });
            canonical[k] = best;
            order.push(k);
        });
        var used = order.filter(function(k) { return freq[k]; }).sort(function(a, b) { return freq[b] - freq[a]; });
        var rest = order.filter(function(k) { return !freq[k]; });
        var options = used.concat(rest).map(function(k) { return canonical[k]; });
        cache.put(cacheKey, JSON.stringify(options), 21600);
        return { success: true, options: options };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── Equipment history (per-unit timeline) ───────────────────────────────────────
// One row per unit per survey submission ("Survey") and per edited / removed unit ("Edit" / "Removed"),
// kept in "Hyper_Equipment_History" for BOTH Hyper surveys. A unit is followed across surveys by Asset
// No. when it has one (stable), otherwise by Equipment ID (a sequence number — it can shift if the
// counts of a type change between surveys, so Asset No. is the reliable key).
var HS_HIST_SHEET = 'Hyper_Equipment_History';
var HS_HIST_HEADERS = ['Timestamp', 'Event', 'Survey ID', 'Survey Type', 'Branch Code', 'Branch Name', 'Equipment ID', 'Asset No',
    'Category', 'Size', 'Brand', 'Model/Spec', 'Year', 'Age', 'Year Source', 'Status', 'Condition', 'Controller', 'Temp 1', 'Temp 2', 'Temp 3',
    'Ref Temp (IR / Return)', 'Controller/Setpoint', 'Products', 'Note', 'By', 'Changes', 'Contractor', 'Cert Expiry', 'Spec',
    'Serial No', 'Capacity', 'New Price THB', 'Repair 5Y THB', 'Energy Score', 'Impact Score', 'Spare Risk Score', 'Replace Score'];

// fields compared when a survey is edited, with the label shown in the "Changes" column
var HS_TRACKED = [['br', 'ยี่ห้อ'], ['sp', 'รุ่น/สเปค'], ['as', 'Asset No'], ['st', 'สถานะ'], ['cr', 'สภาพ'], ['ct', 'Controller'],
    ['t1', 'Temp 1'], ['t2', 'Temp 2'], ['t3', 'Temp 3'], ['mt', 'Temp อ้างอิง'], ['tc', 'Setpoint'], ['yr', 'ปีผลิต'], ['ys', 'แหล่งที่มาปี'],
    ['nt', 'หมายเหตุ'], ['pd', 'สินค้า'], ['po', 'สินค้าอื่นๆ'], ['am', 'กระแสไฟ'], ['mc', 'ผู้รับเหมาดูแล'], ['ce', 'ใบตรวจหมดอายุ'], ['sx', 'สเปค'],
    ['sn', 'Serial No.'], ['cp', 'Capacity'], ['pn', 'ราคาซื้อใหม่'], ['rc', 'ค่าซ่อม 5 ปี'], ['se', 'คะแนนพลังงาน'], ['si', 'คะแนนผลกระทบ'], ['ss', 'คะแนนอะไหล่']];

function _hsHistType_(def) { return def.histType || def.idPrefix; }

function _hsHistSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(HS_HIST_SHEET);
    if (!sh) {
        sh = ss.insertSheet(HS_HIST_SHEET);
        sh.appendRow(HS_HIST_HEADERS);
        sh.setFrozenRows(1);
        var h = sh.getRange(1, 1, 1, HS_HIST_HEADERS.length);
        h.setBackground('#334155'); h.setFontColor('#ffffff'); h.setFontWeight('bold');
    }
    return sh;
}

function _hsHistRow_(def, event, surveyId, branchCode, branchName, u, by, changes) {
    var catTitle = u.c, sizeLabel = u.s;
    def.categories.forEach(function(c) {
        if (c.id === u.c) { catTitle = c.title; c.sizes.forEach(function(z) { if (z[0] === u.s) sizeLabel = z[1]; }); }
    });
    var v = function(x) { return x === undefined || x === null ? '' : x; };
    return [new Date(), event, surveyId, _hsHistType_(def), String(branchCode || ''), branchName || '', u.id || '', u.as || '',
        catTitle, sizeLabel, u.br || '', u.sp || '', v(u.yr), u.yr ? _hsAge_(u.yr) : '', u.ys || '', u.st || '', v(u.cr), v(u.ct), v(u.t1), v(u.t2), v(u.t3),
        v(u.mt), v(u.tc), ((u.pd || []).join(', ') + (u.po ? ' / ' + u.po : '')), u.nt || '', by || '', changes || '',
        u.mc || '', u.ce || '', _hsSpecText_(def, u),
        u.sn || '', u.cp || '', v(u.pn), v(u.rc), v(u.se), v(u.si), v(u.ss), _hsFFScore_(u, _hsFFSchemeById_(def, u.c)).total];
}

// "LP: น้ำหนักบรรทุก (kg) 1000, จำนวนชั้นที่จอด 3" — readable spec text from the category's spec labels
function _hsSpecText_(def, u) {
    if (!u.sx) return '';
    var cat = def.categories.filter(function(c) { return c.id === u.c; })[0];
    var lab = {};
    ((cat && cat.specs) || []).forEach(function(f) { lab[f.k] = f.l; });
    return Object.keys(u.sx).map(function(k) { return (lab[k] || k) + ' ' + u.sx[k]; }).join(', ');
}

function _hsHistAppend_(rows) {
    if (!rows || !rows.length) return;
    var sh = _hsHistSheet_();
    // sheets created before columns were added: extend the header row first
    if (sh.getMaxColumns() < HS_HIST_HEADERS.length) sh.insertColumnsAfter(sh.getMaxColumns(), HS_HIST_HEADERS.length - sh.getMaxColumns());
    if (sh.getLastColumn() < HS_HIST_HEADERS.length) sh.getRange(1, 1, 1, HS_HIST_HEADERS.length).setValues([HS_HIST_HEADERS]);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, HS_HIST_HEADERS.length).setValues(rows);
}

// Never lets a history problem break the survey itself.
function _hsHistSafe_(fn) { try { fn(); } catch (e) { Logger.log('Equipment history: ' + e); } }

function _hsUnitVal_(u, f) {
    var x = u[f];
    if (Array.isArray(x)) return x.join(', ');
    if (x && typeof x === 'object') return Object.keys(x).map(function(k) { return k + '=' + x[k]; }).join(', ');
    return x === undefined || x === null ? '' : String(x);
}

// {pk: [labels of changed fields]} for units present in both, plus the list of removed units
function _hsDiffUnits_(oldUnits, newUnits) {
    var oldBy = {}, changed = {}, removed = [];
    (oldUnits || []).forEach(function(u) { oldBy[u.pk] = u; });
    var seen = {};
    (newUnits || []).forEach(function(n) {
        seen[n.pk] = true;
        var o = oldBy[n.pk];
        if (!o) { changed[n.pk] = ['(ตู้/เครื่องใหม่)']; return; }
        var diffs = [];
        HS_TRACKED.forEach(function(t) {
            var a = _hsUnitVal_(o, t[0]), b = _hsUnitVal_(n, t[0]);
            if (a !== b) diffs.push(t[1] + ': ' + (a || '-') + ' → ' + (b || '-'));
        });
        if (diffs.length) changed[n.pk] = diffs;
    });
    (oldUnits || []).forEach(function(o) { if (!seen[o.pk]) removed.push(o); });
    return { changed: changed, removed: removed };
}

// Timeline of one unit, newest first
function hyperUnitHistory_(def, branchCode, equipId, assetNo) {
    try {
        var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HS_HIST_SHEET);
        if (!sh || sh.getLastRow() < 2) return { success: true, rows: [], maint: hyperMaintList_(def, branchCode, equipId, assetNo), maintStatuses: HS_MAINT_STATUSES };
        var vals = sh.getRange(1, 1, sh.getLastRow(), Math.min(HS_HIST_HEADERS.length, sh.getMaxColumns())).getValues();
        var hdr = vals[0].map(function(h) { return String(h).trim(); });
        var ix = function(n) { return hdr.indexOf(n); };
        var type = _hsHistType_(def), code = String(branchCode || '').trim(), asset = String(assetNo || '').trim(), id = String(equipId || '').trim();
        var out = [];
        for (var i = vals.length - 1; i >= 1; i--) {
            var r = vals[i];
            if (String(r[ix('Survey Type')]) !== type || String(r[ix('Branch Code')]).trim() !== code) continue;
            var rAsset = String(r[ix('Asset No')]).trim(), rId = String(r[ix('Equipment ID')]).trim();
            var match = (asset && rAsset === asset) || (rId === id && (!asset || !rAsset));
            if (!match) continue;
            var o = {};
            hdr.forEach(function(h, j) { var v = r[j]; o[h] = v instanceof Date ? v.toISOString() : v; });
            out.push(o);
            if (out.length >= 200) break;
        }
        return { success: true, rows: out, maint: hyperMaintList_(def, branchCode, equipId, assetNo), maintStatuses: HS_MAINT_STATUSES };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// ─── PM / CM maintenance log per unit ────────────────────────────────────────────
// Manually recorded preventive (PM) and corrective (CM) work, one row per job, in
// "Hyper_Equipment_Maintenance" (both Hyper surveys). Matched to a unit exactly like the survey history
// (Asset No. when present, otherwise Equipment ID) and shown in the same timeline.
var HS_MAINT_SHEET = 'Hyper_Equipment_Maintenance';
var HS_MAINT_HEADERS = ['Record ID', 'Timestamp', 'Survey Type', 'Branch Code', 'Branch Name', 'Equipment ID', 'Asset No', 'Category',
    'Maint Type', 'Work Date', 'Title', 'Details', 'Done By', 'Cost (THB)', 'Status', 'Next PM Date', 'CMS Ticket', 'Recorded By'];
var HS_MAINT_STATUSES = ['เสร็จสิ้น', 'วางแผน', 'ค้าง / รออะไหล่'];

function _hsMaintSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(HS_MAINT_SHEET);
    if (!sh) {
        sh = ss.insertSheet(HS_MAINT_SHEET);
        sh.appendRow(HS_MAINT_HEADERS);
        sh.setFrozenRows(1);
        var h = sh.getRange(1, 1, 1, HS_MAINT_HEADERS.length);
        h.setBackground('#9a3412'); h.setFontColor('#ffffff'); h.setFontWeight('bold');
        sh.getRange(2, 10, sh.getMaxRows() - 1, 1).setNumberFormat('@');   // dates stay yyyy-MM-dd text
        sh.getRange(2, 16, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    }
    return sh;
}

function _hsDateText_(v) {
    var s = String(v == null ? '' : v).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s).getTime()) ? s : '';
}

function _hsMatchUnit_(rowAsset, rowId, asset, id) {
    rowAsset = String(rowAsset || '').trim(); rowId = String(rowId || '').trim();
    return (asset && rowAsset === asset) || (rowId === id && (!asset || !rowAsset));
}

// rec: {branchCode, branchName, equipId, assetNo, category, type 'PM'|'CM', date, title, details, doneBy, cost, status, nextPm, ticket}
function hyperMaintAdd_(def, rec, clientEmail) {
    try {
        var email = clientEmail || Session.getActiveUser().getEmail();
        var adminCheck = checkSurveyAdminStatus(email);
        if (!_hsCanEdit_(adminCheck)) return { success: false, error: 'Administrator / edit permission required.' };
        rec = rec || {};
        var type = rec.type === 'CM' ? 'CM' : rec.type === 'PM' ? 'PM' : '';
        var date = _hsDateText_(rec.date);
        var title = String(rec.title || '').trim().substring(0, 150);
        if (!type) return { success: false, error: 'กรุณาเลือกประเภท PM / CM' };
        if (!date) return { success: false, error: 'กรุณาระบุวันที่ทำงาน (รูปแบบ ปปปป-ดด-วว)' };
        if (!title) return { success: false, error: 'กรุณาระบุรายการงาน' };
        if (!String(rec.branchCode || '').trim() || !String(rec.equipId || '').trim()) return { success: false, error: 'Missing branch / equipment' };
        var cost = parseFloat(rec.cost);
        var status = HS_MAINT_STATUSES.indexOf(rec.status) > -1 ? rec.status : HS_MAINT_STATUSES[0];
        var id = 'MNT-' + new Date().getTime();
        var row = [id, new Date(), _hsHistType_(def), String(rec.branchCode).trim(), String(rec.branchName || ''), String(rec.equipId).trim(), String(rec.assetNo || '').trim(),
            String(rec.category || ''), type, date, title, String(rec.details || '').trim().substring(0, 1000), String(rec.doneBy || '').trim().substring(0, 100),
            isNaN(cost) ? '' : cost, status, _hsDateText_(rec.nextPm), String(rec.ticket || '').trim().substring(0, 60), email];
        var _wlock = _acquireWriteLock_();
        var sh = _hsMaintSheet_();
        var r0 = sh.getLastRow() + 1;
        sh.getRange(r0, 1, 1, HS_MAINT_HEADERS.length).setValues([row]);
        sh.getRange(r0, 10).setNumberFormat('@').setValue(date);
        sh.getRange(r0, 16).setNumberFormat('@').setValue(row[15]);
        _wlock.releaseLock();
        return { success: true, id: id };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

function hyperMaintDelete_(def, recordId, clientEmail) {
    try {
        var adminCheck = checkSurveyAdminStatus(clientEmail || Session.getActiveUser().getEmail());
        if (!adminCheck.isAdmin && !adminCheck.isScheduleAdmin) return { success: false, error: 'Administrator privileges required.' };
        var _wlock = _acquireWriteLock_();
        var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HS_MAINT_SHEET);
        if (!sh) return { success: false, error: 'Sheet not found' };
        var ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
        for (var i = 1; i < ids.length; i++) {
            if (String(ids[i][0]) === String(recordId)) { sh.deleteRow(i + 1); return { success: true }; }
        }
        return { success: false, error: 'Record not found' };
    } catch (e) {
        return { success: false, error: e.toString() };
    }
}

// All PM / CM records of one unit, newest work date first
function hyperMaintList_(def, branchCode, equipId, assetNo) {
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HS_MAINT_SHEET);
    if (!sh || sh.getLastRow() < 2) return [];
    var vals = sh.getRange(1, 1, sh.getLastRow(), HS_MAINT_HEADERS.length).getValues();
    var hdr = vals[0].map(function(h) { return String(h).trim(); });
    var ix = function(n) { return hdr.indexOf(n); };
    var type = _hsHistType_(def), code = String(branchCode || '').trim(), asset = String(assetNo || '').trim(), id = String(equipId || '').trim();
    var out = [];
    for (var i = 1; i < vals.length; i++) {
        var r = vals[i];
        if (String(r[ix('Survey Type')]) !== type || String(r[ix('Branch Code')]).trim() !== code) continue;
        if (!_hsMatchUnit_(r[ix('Asset No')], r[ix('Equipment ID')], asset, id)) continue;
        var o = {};
        hdr.forEach(function(h, j) { var v = r[j]; o[h] = v instanceof Date ? v.toISOString() : v; });
        out.push(o);
    }
    out.sort(function(a, b) { return String(b['Work Date']).localeCompare(String(a['Work Date'])); });
    return out.slice(0, 200);
}

// ─── Equipment page (?page=equip) — every unit of the latest survey per store, all Hyper surveys ──
// Index rows are compact (search / list); the detail call returns one unit with its photos and history.
var HS_EQUIP_DEFS_ = function() { return [HYPER_REF_DEF, HYPER_AC_DEF, HYPER_EQ_DEF, HYPER_FO_DEF]; };
var HS_KIND_LABEL = { Ref: '🏬 ตู้แช่ Hyper', Ac: '❄️ แอร์ Hyper', Eq: '🛗 อุปกรณ์อาคาร Hyper', Fo: '🍞 อุปกรณ์ Fresh Food Hyper' };

function _hsDefByKind_(kind) {
    var defs = HS_EQUIP_DEFS_();
    for (var i = 0; i < defs.length; i++) if (_hsHistType_(defs[i]) === kind) return defs[i];
    return null;
}

function hyperEquipIndex_() {
    var cache = CacheService.getScriptCache();
    var cached = cache.get('HS_EQUIP_INDEX_V1');
    if (cached) return JSON.parse(cached);
    var out = [];
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    HS_EQUIP_DEFS_().forEach(function(def) {
        var sh = ss.getSheetByName(def.sheet);
        if (!sh || sh.getLastRow() < 2) return;
        var vals = sh.getDataRange().getValues();
        var hdr = vals[0].map(function(h) { return String(h).trim(); });
        var ix = function(n) { return hdr.indexOf(n); };
        var ui = ix(HS_UNITS_HEADER);
        if (ui === -1) return;
        var cat = {};
        def.categories.forEach(function(c) { cat[c.id] = c; });
        // newest row per branch wins (rows are appended, so walk from the bottom)
        var seen = {};
        for (var i = vals.length - 1; i >= 1; i--) {
            var code = String(vals[i][ix('Branch Code')]).trim();
            if (!code || seen[code] || !vals[i][ui]) continue;
            seen[code] = true;
            var units;
            try { units = JSON.parse(vals[i][ui]); } catch (e) { continue; }
            var ts = vals[i][ix('Timestamp')];
            units.forEach(function(u) {
                var c = cat[u.c] || {};
                var size = u.s;
                (c.sizes || []).forEach(function(z) { if (z[0] === u.s) size = z[1]; });
                out.push({ k: _hsHistType_(def), sid: vals[i][ix('ID')], d: ts instanceof Date ? ts.toISOString() : ts, code: code,
                    sn: vals[i][ix('Branch Name')], id: u.id, cat: c.title || u.c, size: size, br: u.br || '', as: u.as || '',
                    yr: u.yr || '', st: u.st || '', cr: u.cr === undefined ? '' : u.cr, ce: u.ce || '', sp: u.sp || '',
                    fs: _hsFFScore_(u, _hsFFScheme_(def, c)).total });
            });
        }
    });
    try { cache.put('HS_EQUIP_INDEX_V1', JSON.stringify(out), 300); } catch (e) {}
    return out;
}

function getHyperEquipIndex() {
    try { return JSON.stringify({ success: true, rows: hyperEquipIndex_(), kinds: HS_KIND_LABEL }); }
    catch (e) { return JSON.stringify({ success: false, error: e.toString() }); }
}

// One unit: all fields, its category config, photos and the survey / PM-CM history
function getHyperUnitDetail(kind, surveyId, equipId) {
    try {
        var def = _hsDefByKind_(kind);
        if (!def) return JSON.stringify({ success: false, error: 'Unknown survey type' });
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.sheet);
        var found = _hsFindRow_(sheet, surveyId);
        if (found.rowIndex === -1) return JSON.stringify({ success: false, error: 'Survey not found' });
        var row = found.data[found.rowIndex - 1], h = found.headers;
        var units = [];
        try { units = JSON.parse(row[h.indexOf(HS_UNITS_HEADER)] || '[]'); } catch (e) {}
        var u = units.filter(function(x) { return x.id === equipId; })[0];
        if (!u) return JSON.stringify({ success: false, error: 'Equipment not found in this survey' });
        var att = {};
        try { att = JSON.parse(row[h.indexOf('Attachments_JSON')] || '{}'); } catch (e) {}
        var cfg = hyperSurveyConfig_(def);
        var cat = cfg.categories.filter(function(c) { return c.id === u.c; })[0] || {};
        var hist = hyperUnitHistory_(def, row[h.indexOf('Branch Code')], u.id, u.as || '');
        var ts = row[h.indexOf('Timestamp')];
        return JSON.stringify({
            success: true, kind: kind, kindLabel: HS_KIND_LABEL[kind], unit: u, category: cat, photos: att[u.pk] || [],
            ffScore: cat.ff ? _hsFFScore_(u, cat.ff) : null,
            survey: { id: surveyId, date: ts instanceof Date ? ts.toISOString() : ts, code: row[h.indexOf('Branch Code')], name: row[h.indexOf('Branch Name')],
                      reporter: row[h.indexOf('Reporter Name')] },
            history: hist.rows || [], maint: hist.maint || [], maintStatuses: hist.maintStatuses || HS_MAINT_STATUSES
        });
    } catch (e) {
        return JSON.stringify({ success: false, error: e.toString() });
    }
}

function addHyperUnitMaintenance(kind, rec, clientEmail) {
    var def = _hsDefByKind_(kind);
    if (!def) return { success: false, error: 'Unknown survey type' };
    return hyperMaintAdd_(def, rec, clientEmail);
}

function _hsEquipCacheClear_() {
    try { CacheService.getScriptCache().remove('HS_EQUIP_INDEX_V1'); } catch (e) {}
    try { _dashHyperClearAll_(); } catch (e) {}
    try { _hrsCacheClear_(); } catch (e) {}
}
