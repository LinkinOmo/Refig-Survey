// Offline demo harnesses for the 🥩 FF Renovate Survey manual screenshots.
//   form.html   — the REAL FfRenovateSurveyTab.html on the index.html helper shims (copied from vendor-fire.html)
//   report.html — the REAL FfRenovateSurveyReport.html
// Numbers come from the REAL server logic (FfRenovateSurvey.gs in a sandbox) on REAL BOQ lines, but every store is
// RELABELLED to a fictional "Demo" store, so no real store appears with invented survey results.
//   node build_harness.js && node shoot.js && python -I shrink.py && node build.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');            // Air_Ref_Servey
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let SHEET_ROWS = null;
const ctx = {
  console, Logger: { log: () => {} },
  Utilities: { formatDate: (d) => new Date(new Date(d).getTime() + 7 * 3600e3).toISOString().slice(0, 10) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => null }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  Session: { getActiveUser: () => ({ getEmail: () => 'demo@bigc.co.th' }) },
  checkSurveyAdminStatus: () => ({ isAdmin: true, isScheduleAdmin: true }),
  _hsCanEdit_: () => true,
  hyperStoreDbMap_: () => ({}),
  _archSheetFor_: () => SHEET_ROWS && { getLastRow: () => SHEET_ROWS.length, getDataRange: () => ({ getValues: () => SHEET_ROWS }) }
};
vm.createContext(ctx);
vm.runInContext(read('FfRenovateStores.gs'), ctx);
vm.runInContext(read('FfRenovateSurvey.gs'), ctx);
vm.runInContext(read('ManualsLink.gs'), ctx);   // MANUALS_URL for the 📖 links

// ── demo stores: 8 real BOQ stores (with refurbish plans), relabelled ──
const NAMES = ['หาดใหญ่', 'ราชบุรี', 'สุพรรณบุรี', 'บางนา', 'รังสิต', 'ชลบุรี', 'ขอนแก่น', 'เชียงใหม่'];
const src = ctx.FFR_STORES.filter(s => s.L.some(l => l[1] > 0) && s.L.some(l => l[2] > 0) && /^[SML]$/.test(s.m)).slice(0, 8);
ctx.FFR_STORES = src.map((s, i) => Object.assign({}, s, { c: '191' + String(i + 1).padStart(2, '0'), o: '1191' + String(i + 1).padStart(2, '0'), n: 'Big C Demo ' + NAMES[i] + ' (ตัวอย่าง)' }));
const ST = ctx.FFR_STORES;
// PM contract baseline for the demo stores: each relabelled demo store borrows the real PM figures of its source store
vm.runInContext(read('FfRenovatePm.gs'), ctx);
const PM0 = ctx.FFR_PM; ctx.FFR_PM = {};
src.forEach((s, i) => { if (PM0[s.o]) ctx.FFR_PM[ST[i].o] = PM0[s.o]; });
ctx._ffrLayoutMap_ = () => ({ [ST[0].c]: [{ name: 'Demo.pdf', fid: 'demo0', kind: 'To-Be', at: '2026-11-16' },
                                            { name: ST[0].c.slice(-3) + '_DEMO_AS IS_(10-09-26).pdf', fid: 'demo1', kind: 'As-Is', at: '2026-11-16' }],
                              [ST[1].c]: [{ name: 'Demo 2.pdf', fid: 'demo2', kind: 'To-Be', at: '2026-11-16' }] });
// demo Equipment IDs (the Hyper Ref / Fresh Food equipment index) so the card's Equipment ID picker shows
ctx.hyperEquipIndex_ = () => [].concat.apply([], ST.map(s => [
    { k: 'Ref', code: s.o, id: s.o + '-HC01', cat: 'High Chilled glass door', size: 'L2500', br: 'Arneg', as: '1100231245', yr: 2009 },
    { k: 'Ref', code: s.o, id: s.o + '-HC02', cat: 'High Chilled glass door', size: 'L2500', br: 'Arneg', as: '1100231246', yr: 2009 },
    { k: 'Ref', code: s.o, id: s.o + '-LF01', cat: 'Low frozen', size: 'L2500', br: 'Sanden', as: '', yr: 2016 }]));
const CFG = ctx.getFfrConfig_();
const IDX = ctx._ffrStoreIndex_();

// ── demo surveys built with the real _ffrExtraColumns_ ──
function itemsFor(st, k) {
  const out = []; let n = 0;
  st.lines.filter(l => l.kind === 'plug' || l.kind === 'remote').forEach((l, j) => {
    const base = { bx: l.bx, sys: l.kind, pos: l.kind === 'plug' ? CFG.pos[0] : CFG.pos[1], yr: 2008 + (j % 7), brand: ['Carrier', 'Arneg', 'Daikin', 'Sanden'][j % 4], tm: l.cat === 'Frozen' ? -19.5 : 3.5,
                   body: String(1 + (j + k) % 3), cool: String(1 + (j + 2 * k) % 2), door: '2', rep: (j * 3 + k) % 7, repCost: ((j * 3 + k) % 7) * 2500 };
    if (l.ref) {
      const ok = Math.ceil(l.ref * 0.6), work = l.ref > 2 ? 1 : 0, nw = Math.max(l.ref - ok - work, 0);
      out.push(Object.assign({}, base, { iid: 'C' + String(++n).padStart(2, '0'), plan: 'ref', q: l.ref, qRef: ok, qWork: work, qNew: nw, qNone: 0,
        why: nw ? CFG.why[(j + k) % 4] : '', wo: nw ? CFG.wo[j % 2] : '', asset: nw ? '1100' + (230000 + j * 17 + k) : '' }));
    }
    if (l.nw) {
      const work = Math.floor(l.nw * 0.15), none = l.cat === 'Butchery' ? Math.floor(l.nw * 0.3) : 0, nw = l.nw - work - none;
      out.push(Object.assign({}, base, { iid: 'C' + String(++n).padStart(2, '0'), plan: 'new', q: l.nw, qRef: 0, qWork: work, qNew: nw, qNone: none, wo: nw ? CFG.wo[(j + 1) % 2] : '', asset: nw && j % 3 ? '1100' + (240000 + j * 13) : '' }));
    }
  });
  return out.map(it => Object.assign(it, { pk: 'ffr_it_' + it.iid }));
}
const site = k => Object.fromEntries(CFG.site.map((c, i) => [c.k, c.v[(i + k) % 3 === 0 && c.v.length > 2 ? 2 : (i + k) % 2]]));
const SURVEYS = [
  { s: 0, who: 'สมชาย ใจดี', role: 'MTN สาขา', ts: '2026-11-18T04:20:00Z', amb: [26.1, 27.8, 24.5, 23.9, 25.2], rec: 2 },
  { s: 1, who: 'วิภา สุขใจ', role: 'AMM / Area MTN', ts: '2026-11-18T08:10:00Z', amb: [24.1, 24.8, 23.5, 22.9, 24.0], rec: 0 },
  { s: 2, who: 'อนันต์ มั่นคง', role: 'AMM / Area MTN', ts: '2026-11-19T03:00:00Z', amb: [28.4, 29.1, 27.0, 26.6, 27.7], rec: 1 },
  { s: 3, who: 'ประเสริฐ รักงาน', role: 'MTN สาขา', ts: '2026-11-19T07:30:00Z', amb: [25.0, 25.9, 24.2, 23.8, 24.4], rec: 2 }
];
const RECORDS = {}, HDR = ['Timestamp', 'ID', 'Branch Code', 'Gold Code', 'Branch Name', 'Team', 'Reporter Name', 'Survey Date', 'Layout Status'].concat(ctx.FFR_OV_COLS.filter(c => ['ID', 'Timestamp', 'Branch Code', 'Reporter Name', 'Survey Date', 'Layout Status'].indexOf(c) < 0)).concat(['Items_JSON', 'Racks_JSON', 'Attachments_JSON']);
const rows = [HDR];
SURVEYS.forEach((x, n) => {
  const st = IDX[ST[x.s].o];
  const items = itemsFor(st, n);
  const racks = [
    { rid: 'R1', type: CFG.rackTypes[0], brand: 'Bitzer', model: 'Multiset 4×4CES', yr: 2006 + n, refg: 'R404A', comp: 4, compOk: 3 - (n % 2), feeds: 'High chilled ริมผนัง + Open high chill produce', cond: String(2 + (n % 2)), cdu: '2', leak: n % 2 ? 'มี' : 'ไม่มี', ctrl: 'ปกติ', spare: 'ไม่มี', rep: 6 + n, repCost: 48000 + n * 9000, rec: CFG.rackRec[x.rec], asset: '1100' + (210100 + n), wo: x.rec === 2 ? CFG.wo[0] : '', nt: x.rec === 2 ? 'R22 เดิม retrofit แล้ว คอมเพรสเซอร์เปลี่ยน 2 ตัวในปีนี้' : '', pk: 'ffr_rk_R1' },
    { rid: 'R2', type: CFG.rackTypes[1], brand: 'Copeland', model: 'Multiset NEG', yr: 2010, refg: 'R404A', comp: 3, compOk: 3, feeds: 'Low frozen island + High frozen', cond: '1', cdu: '2', leak: 'ไม่มี', ctrl: 'ปกติ', spare: 'มี', rep: 2, repCost: 12000, rec: CFG.rackRec[0], pk: 'ffr_rk_R2' }];
  const amb = CFG.zones.slice(0, 5).map((z, i) => ({ z, t: x.amb[i], rh: 55 + i * 2 + n, tm: '14:' + String(10 + i * 5) }));
  const form = { branchCode: st.o, itemsJson: JSON.stringify(items), racksJson: JSON.stringify(racks), ambJson: JSON.stringify(amb), siteJson: JSON.stringify(site(n)),
    equipJson: JSON.stringify({ saw: { ok: 1 }, grind: { ok: 1, fix: 1 }, slice: { nw: 1 }, vac: { ok: 2 }, scale: { ok: 3, fix: 1 } }),
    reporterRole: x.role, surveyDate: x.ts.slice(0, 10), layoutStatus: CFG.layoutSt[n === 2 ? 1 : n === 3 ? 2 : 0], layoutNote: n === 2 ? 'เสาตรงตำแหน่งตู้ Beef counter / End cap ชนทางเดิน' : '',
    sysRec: CFG.sysRec[[0, 1, 1, 0][n]], pipeLen: [120, 0, 95, 150][n],
    capJson: JSON.stringify([{ acType: 'Chiller (น้ำเย็น)', acTR: 350, chTot: 3, chRun: 3, acLoad: 92, acCond: 'พอใช้', trKva: 3000, mdbRated: 4000, mdbPeak: 3300, spareCb: 2 },
      { acType: 'Chiller (น้ำเย็น)', acTR: 300, chTot: 3, chRun: 2, acLoad: 85, acCond: 'ดี', trKva: 2500, mdbRated: 3200, mdbPeak: 2100, spareCb: 4 },
      { acType: 'Package / Rooftop', acTR: 180, acLoad: 70, acCond: 'ดี', trKva: 1600, mdbRated: 2500, mdbPeak: 1500, spareCb: 6 },
      { acType: 'Chiller (น้ำเย็น)', acTR: 320, chTot: 2, chRun: 2, acLoad: 95, acCond: 'แย่', trKva: 2000, mdbRated: 3200, mdbPeak: 2900 }][n]),
    installJson: JSON.stringify(Object.assign(Object.fromEntries(CFG.install.map((c, i) => [c.k, c.v[(i + n) % 4 === 3 && c.bad.length ? c.v.indexOf(c.bad[0]) : 0]])),
      n === 0 ? { note: 'ประตูหลังกว้าง 1.0 ม. ต้องขนผ่านหน้าร้าน · ห้างอนุญาต 22:00–06:00' } : {})) };
  const cols = ctx._ffrExtraColumns_(form);
  const id = 'FFR-17634' + (10000 + n);
  const att = { ffr_amb: ['https://drive.google.com/thumbnail?id=amb' + n] };
  items.forEach(it => { att[it.pk] = ['https://drive.google.com/thumbnail?id=' + id + it.iid]; });
  racks.forEach(r => { att[r.pk] = ['https://drive.google.com/thumbnail?id=' + id + r.rid + 'a', 'https://drive.google.com/thumbnail?id=' + id + r.rid + 'b']; att['ffr_cd_' + r.rid] = ['https://drive.google.com/thumbnail?id=' + id + r.rid + 'cd']; });
  const row = Object.assign({ Timestamp: x.ts, ID: id, 'Branch Code': st.o, 'Branch Name': st.n, 'Reporter Name': x.who, 'Reporter Email': 'demo@bigc.co.th', 'Has Broken': n === 2 ? 'Yes' : 'No',
    'Broken Detail': n === 2 ? 'Multiset Negative คอมเพรสเซอร์ดับ 1 ตัว ตู้ Low frozen -14 °C' : '', Comments: n === 0 ? 'แนะนำเปลี่ยน Rack positive (อายุ 20 ปี ซ่อมบ่อย) · ตู้ High chilled ริมผนังยังใช้ต่อได้' : '' }, cols, form);
  RECORDS[id] = Object.assign({}, row, { Attachments_JSON: att });
  rows.push(HDR.map(h => h === 'Attachments_JSON' ? JSON.stringify(att) : row[h] === undefined ? '' : row[h]));
});
SHEET_ROWS = rows;
ctx.hyperSurveyRecordById_ = (def, id) => ({ success: true, data: JSON.parse(JSON.stringify(RECORDS[id])) });

// report shots are full-edition (Super Admin) only → build the report data as a Super Admin so prices are included;
// the form context is built as a normal user (no prices there for the user edition is handled by the shot scrub)
ctx.checkAdminStatus = () => ({ isAdmin: true });
const SA = 'demo@bigc.co.th';
const OUT = {
  overview: ctx.getFfRenovateOverview(false, SA), items: ctx.getFfRenovateItemRows(false, SA),
  records: Object.fromEntries(Object.keys(RECORDS).map(id => [id, ctx.getFfRenovateSurveyRecordById(id, SA)])),
  ctx: Object.fromEntries(ST.map(s => [s.o, ctx.getFfrStoreContext(s.o, SA)])),
  tags: { success: true, tags: Object.fromEntries(SURVEYS.map(x => [ST[x.s].o, x.ts.slice(0, 10)])), total: ST.length, done: SURVEYS.length }
};

const MOCK = `
<script>
  window.__D = ${JSON.stringify(OUT)};
  (function () {
    const C = x => JSON.parse(JSON.stringify(x));
    const H = {
      getFfRenovateOverview: () => C(__D.overview), getFfRenovateItemRows: () => C(__D.items), getFfRenovateSurveyRecordById: id => C(__D.records[id]),
      getFfrStoreContext: code => C(__D.ctx[code]), getFfrStoreTags: () => C(__D.tags),
      getUserFlags: () => ({ isAdmin: true, isScheduleAdmin: true, smfEditAllowed: true, opsEditAllowed: true }),
      refreshFfrLayouts: () => ({ success: true, stores: 2, files: 2 }),
      hyperUploadSurveyPhoto: () => ({ success: true, url: 'https://drive.google.com/thumbnail?id=up' + Math.random() }),
      processFfRenovateSurveyForm: () => ({ success: true })
    };
    function runner(ok, fail) {
      return new Proxy({}, { get(_, k) {
        if (k === 'withSuccessHandler') return f => runner(f, fail);
        if (k === 'withFailureHandler') return f => runner(ok, f);
        return (...args) => setTimeout(() => {
          if (!H[k]) { console.log('MISSING server fn', k); return; }
          try { const r = H[k](...args); ok && ok(r); } catch (e) { console.log('SERVER ERR', k, e.message); fail && fail(e); }
        }, 120);
      } });
    }
    window.google = { script: { run: runner() } };
  })();
</script>`;
// Evaluate the template scriptlets against the sandbox (config, store list, thresholds).
const fill = html => html.replace(/<\?(!?)=\s*([\s\S]*?)\s*\?>/g, (m, raw, expr) => {
  if (/ScriptApp/.test(expr)) return '#';
  if (/includeTailwindCss_/.test(expr)) return '<script src="https://cdn.tailwindcss.com"></script>';
  if (/include\(/.test(expr)) return '';
  return String(vm.runInContext(expr, ctx));
});

const vf = read('vendor-fire.html');
const shims = vf.slice(vf.indexOf('<script>', vf.indexOf('successModal')), vf.indexOf('</script>', vf.indexOf('async function hyperUploadPhotos')) + 9)
  .replace("window.HFI_VENDOR_TOKEN = '<?= passToken ?>';", '');
const form = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${MOCK}
<script src="https://cdn.tailwindcss.com"></script>
<style>body{font-family:'Segoe UI',Tahoma,sans-serif;background:#f8fafc}.tab-content.hidden{display:block}</style></head>
<body><div class="max-w-4xl mx-auto px-3 py-4 bg-white">
<div id="globalLoading" class="hidden fixed inset-0 bg-black/40 z-[100] flex items-center justify-center"><div class="bg-white rounded-xl px-6 py-4"><span>Processing...</span></div></div>
<div id="successModal" class="hidden"></div>
${shims}
<script>
  var CURRENT_USER = { email: 'demo@bigc.co.th' };
  function sdsCheck() {} function sdsSave() {} function sdsReset() {} function sdsDraftId() { return null; } function showDraftToast() {}
  document.querySelectorAll && setTimeout(function () { document.querySelectorAll('.report-view-link').forEach(function (e) { e.classList.remove('hidden'); }); }, 50);
</script>
${fill(read('FfRenovateSurveyTab.html'))}
</div></body></html>`;
fs.writeFileSync(path.join(__dirname, 'form.html'), form);
const rep = fill(read('FfRenovateSurveyReport.html')).replace('<head>', '<head>' + MOCK)
  .replace("localStorage.getItem('app_auth_token')", "'demo'").replace("JSON.parse(localStorage.getItem('app_user_data') || 'null')", "({ email: 'demo@bigc.co.th' })");
fs.writeFileSync(path.join(__dirname, 'report.html'), rep);
fs.writeFileSync(path.join(__dirname, 'demo.json'), JSON.stringify({ stores: ST.map(s => ({ o: s.o, c: s.c, n: s.n, m: s.m, t: s.t })), surveys: Object.keys(RECORDS) }, null, 1));
console.log('form.html + report.html ·', OUT.overview.rows.length, 'stores ·', Object.keys(RECORDS).length, 'surveys ·', OUT.items.items.length, 'cabinet cards ·', OUT.items.racks.length, 'racks');
