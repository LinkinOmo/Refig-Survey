// Offline demo harnesses for the 🎥 CCTV System Survey manual + video screenshots.
//   form.html   — the REAL CctvSystemSurveyTab.html on the index.html helper shims (copied from vendor-fire.html)
//   report.html — the REAL CctvSystemSurveyReport.html
// All numbers come from the REAL server logic (CctvSystemSurvey.gs run in a sandbox) on the REAL LP register
// structure, but every store is RELABELLED to a fictional "Demo" store and the CMS jobs are made up, so no real
// store appears with invented survey results.
//   node build_harness.js && node shoot.js && python -I shrink.py && node build.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');            // Air_Ref_Servey
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ── sandbox with the real server files ──
let SHEET_ROWS = null;   // fake CCTV_System_Survey_Database (headers + rows) for getCctvSysItemRows
const ctx = {
  console, Logger: { log: () => {} },
  Utilities: { formatDate: (d, tz, f) => { const x = new Date(new Date(d).getTime() + 7 * 3600e3); const iso = x.toISOString(); return f === 'yyyy-MM-dd' ? iso.slice(0, 10) : f === 'dd/MM/yyyy HH:mm' ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) + ' ' + iso.slice(11, 16) : iso.slice(0, 16).replace('T', ' '); } },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => null }), openById: () => { throw new Error('offline'); } },
  CacheService: { getScriptCache: () => ({ get: () => null, getAll: () => ({}), putAll: () => {}, remove: () => {} }) },
  Session: { getActiveUser: () => ({ getEmail: () => 'demo@bigc.co.th' }) },
  checkSurveyAdminStatus: () => ({ isAdmin: true, isScheduleAdmin: true }),
  _archSheetFor_: () => SHEET_ROWS && { getLastRow: () => SHEET_ROWS.length, getDataRange: () => ({ getValues: () => SHEET_ROWS }) }
};
vm.createContext(ctx);
vm.runInContext(read('CctvLpRegisterData.gs'), ctx);
vm.runInContext(read('CctvSystemSurvey.gs'), ctx);
const CFG = ctx.getCctvSysConfig_();

// ── demo LP register: the 12 stores with most broken items, relabelled ──
const B = ctx.CSYS_LP_BUILTIN, S = B.s;
const brokenQ = {}; B.broken.forEach(b => { brokenQ[b[0]] = (brokenQ[b[0]] || 0) + b[4]; });
const pick = Object.keys(brokenQ).sort((a, b) => brokenQ[b] - brokenQ[a]).slice(0, 12);
const DEMO = [['19101', 'บิ๊กซี ตัวอย่าง หาดใหญ่ (Demo)', 'HYP', 'South'], ['19102', 'บิ๊กซี ตัวอย่าง ราชบุรี (Demo)', 'HYP', 'West'], ['19103', 'บิ๊กซี ตัวอย่าง สุพรรณบุรี (Demo)', 'HYP', 'Central'],
  ['19104', 'บิ๊กซี ตัวอย่าง บางนา (Demo)', 'HYP', 'BKK'], ['19105', 'บิ๊กซี ตัวอย่าง รังสิต (Demo)', 'HYP', 'BKK'], ['19106', 'บิ๊กซี ตัวอย่าง ชลบุรี (Demo)', 'HYP', 'East'],
  ['19107', 'บิ๊กซี ตัวอย่าง ขอนแก่น (Demo)', 'HYP', 'NE'], ['19108', 'บิ๊กซี ตัวอย่าง เชียงใหม่ (Demo)', 'HYP', 'North'], ['19109', 'บิ๊กซี มาร์เก็ต ตัวอย่าง ลพบุรี (Demo)', 'BMK', 'Central'],
  ['19110', 'บิ๊กซี ตัวอย่าง นครปฐม (Demo)', 'HYP', 'West'], ['29111', 'มินิ บิ๊กซี ตัวอย่าง ปากเกร็ด (Demo)', 'BCM', 'BKK'], ['29112', 'มินิ บิ๊กซี ตัวอย่าง ศรีราชา (Demo)', 'BCM', 'East']];
const MAP = {}; pick.forEach((g, i) => { MAP[g] = DEMO[i]; });
// relabel CMS numbers too (keep the YYMM prefix, scramble the sequence)
const NOMAP = {}; let seq = 41000;
const reno = txt => String(txt).replace(/\b(2\d{3})(\d{5})\b/g, (m, a) => NOMAP[m] || (NOMAP[m] = a + String(seq++).padStart(5, '0')));
const S2 = S.map(reno);
ctx.CSYS_LP_BUILTIN = {
  asOf: B.asOf, file: B.file, cats: B.cats, s: S2,
  stores: B.stores.filter(s => MAP[s[0]]).map(s => [MAP[s[0]][0], MAP[s[0]][1], MAP[s[0]][2], s[3]]),
  broken: B.broken.filter(b => MAP[b[0]]).map(b => [MAP[b[0]][0]].concat(b.slice(1)))
};
// demo branch codes in the form: Hyper/BMK 6-digit "1"+…, Mini = gold (the real app maps via the store DB)
const BRANCH = g => g.charAt(0) === '1' ? '1' + g : g;
ctx._fuStoreIndex_ = () => ({ hyperDb: c => (/^1\d{5}$/.test(c) ? { id: c.slice(1) } : null), byGold: Object.fromEntries(DEMO.map(d => [d[0], { id: d[0], oracle: BRANCH(d[0]) }])), goldToBranch: {} });

// ── demo CMS jobs: LP-cited numbers (store 1 all cancelled — the meeting finding) + some CCTV/EAS jobs ──
const cited = {};
ctx.CSYS_LP_BUILTIN.broken.forEach(b => { const no = (S2[b[6]].match(/\b2\d{8}\b/) || [])[0]; if (no) (cited[b[0]] = cited[b[0]] || new Set()).add(no); });
const CMS = [];
const stName = {}; DEMO.forEach(d => { stName[d[0]] = d[1]; });
let k = 0;
Object.keys(cited).forEach(g => [...cited[g]].forEach(no => {
  const st = g === '19104' ? 'ยกเลิก' : ['ยกเลิก', 'ปิดงาน', 'ดำเนินการ', 'ยกเลิก'][k++ % 4];
  CMS.push([no, '2026-10-' + String(10 + (k % 18)).padStart(2, '0'), g, stName[g], 'Hyper', 'CCTV&SOUND', st, 'สัญญาณภาพไม่มี', 'กล้องไม่มีภาพ', 'หจก. ตัวอย่างเซอร์วิส', '', 0, '']);
}));
[['19101', 'ดำเนินการ'], ['19102', 'ดำเนินการ'], ['19102', 'ยกเลิก'], ['19104', 'ดำเนินการ'], ['19106', 'ยกเลิก'], ['19108', 'ดำเนินการ'], ['19110', 'ดำเนินการ'], ['29111', 'ยกเลิก']].forEach(([g, st], i) =>
  CMS.push(['26110' + String(5100 + i), '2026-11-0' + (1 + i % 8), g, stName[g], 'Hyper', i % 3 ? 'CCTV&SOUND' : 'เสาสัญญาณกันขโมย', st, i % 3 ? 'ไม่มีภาพ' : 'ไม่ตรวจจับสัญญาณ', '', 'หจก. ตัวอย่างเซอร์วิส', '', 0, '']));
ctx._csysCmsData_ = () => ({ asOf: '2026-11-12 13:00', error: '', rows: CMS });

// ── demo surveys built with the real _csysExtraColumns_ ──
function cardsFor(g) { return ctx._csysLpCards_(ctx._csysLp_().broken[g]); }
function mkItems(g, rule) {
  return cardsFor(g).map((c, i) => Object.assign({ iid: 'I' + String(i + 1).padStart(2, '0'), type: c.type, q: c.q, sym: c.sym === 'ชำรุด' ? '' : c.sym, loc: c.descs.join(', '),
    cmsOld: c.cmsText, lp: { st: c.st, flt: c.flt, sym: c.sym, q: c.q, cms: c.cms }, pk: 'csys_it_I' + String(i + 1).padStart(2, '0') }, rule(c, i)));
}
const split = (q, ok, fix, nw) => { ok = Math.min(ok, q); fix = Math.min(fix, q - ok); nw = Math.min(nw, q - ok - fix); return { qOk: ok, qFix: fix, qNew: nw, qNone: q - ok - fix - nw }; };
const RULES = {
  cam: (c) => Object.assign(split(c.q, Math.round(c.q * .2), Math.round(c.q * .55), Math.round(c.q * .2)), { cause: 'สายขาด / หลุด / Adapter เสีย', fix: 'เปลี่ยน Adapter 12V + เข้าหัว BNC ใหม่', cEq: 180 * c.q, cLab: 1500, cClimb: 1200, cTest: 500, unitNew: 3500, brand: 'Hikvision' }),
  mon: (c) => Object.assign(split(c.q, 0, 0, c.q), { cause: 'เสื่อมสภาพตามอายุ', unitNew: 6500 }),
  ups: (c) => Object.assign(split(c.q, 0, c.q, 0), { cause: 'เสื่อมสภาพตามอายุ', fix: 'เปลี่ยนแบตเตอรี่ 12V 9Ah × 2', cEq: 1800, cLab: 500, cTest: 300 }),
  hdd: (c) => Object.assign(split(c.q, 0, 0, c.q), { cause: 'เสื่อมสภาพตามอายุ', unitNew: 3200, reuse: true }),
  eas: (c) => Object.assign(split(c.q, 1, c.q - 1, 0), { cause: 'เสื่อมสภาพตามอายุ', fix: 'ซ่อมบอร์ดเสา EAS + จูนสัญญาณ', cEq: 2500 * Math.max(c.q - 1, 0), cLab: 2000, cTest: 800 }),
  tag: (c) => Object.assign(split(c.q, 0, 0, c.q), { cause: 'ตกรุ่น / อะไหล่ไม่มี', unitNew: 9000, reuse: true })
};
const SURVEYS = [
  { g: '19104', who: 'สมชาย ใจดี', role: 'MTN สาขา', ts: '2026-11-12T03:20:00Z', newCms: true },
  { g: '19102', who: 'บจก. ตัวอย่างซีซีทีวี', role: 'ผู้รับเหมา (Vendor)', vendor: 'บจก. ตัวอย่างซีซีทีวี', ts: '2026-11-11T07:00:00Z' },
  { g: '19101', who: 'วิภา สุขใจ', role: 'AMM / ทีม MTN', ts: '2026-11-11T04:10:00Z', newCms: true },
  { g: '19109', who: 'อนันต์ มั่นคง', role: 'AMM / ทีม MTN', ts: '2026-11-10T08:00:00Z', closing: true }
];
const LIST = [], RECORDS = {}, HDR = ['Timestamp', 'ID', 'Branch Code', 'Gold Code', 'Branch Name', 'Store Format', 'Survey Purpose', 'Items_JSON', 'Attachments_JSON'];
const sheetRows = [HDR];
SURVEYS.forEach((x, n) => {
  const items = x.closing ? [] : mkItems(x.g, c => (RULES[c.type] || RULES.cam)(c));
  if (x.newCms) items.forEach((it, i) => { if (it.qFix + (it.qNew && !it.reuse ? it.qNew : 0) && i % 2 === 0) it.newCms = '26111' + String(6000 + n * 10 + i); });
  const base = x.closing ? {} : { base_cam_total: 96, base_cam_ok: 70, base_cam_bad: 26, base_dvr_total: 4, base_dvr_ok: 4, base_dvr_bad: 0, base_hdd_total: 8, base_hdd_ok: 7, base_hdd_bad: 1,
    base_mon_total: 6, base_mon_ok: 5, base_mon_bad: 1, base_ups_total: 2, base_ups_ok: 1, base_ups_bad: 1, base_eas_total: 36, base_eas_ok: 32, base_eas_bad: 4, base_tag_total: 20, base_tag_ok: 16, base_tag_bad: 4 };
  const checks = {}; CFG.checks.forEach((c, i) => { checks[c.k] = ['days', 'ups', 'cable'].indexOf(c.k) > -1 ? 'NG' : 'OK'; });
  const form = Object.assign({ branchCode: BRANCH(x.g), itemsJson: JSON.stringify(items), checksJson: JSON.stringify(x.closing ? {} : checks), purpose: CFG.purposes[x.closing ? 1 : 0],
    reporterRole: x.role, vendorCompany: x.vendor || '', recDays: x.closing ? '' : 21, online: x.closing ? '' : 'บางส่วน', camAnalog: x.closing ? '' : 58, camIp: x.closing ? '' : 38,
    harvestJson: JSON.stringify(x.closing ? { cam: { ok: 34, bad: 6, old: 4 }, dvr: { ok: 2 }, hdd: { ok: 4, bad: 1 }, mon: { ok: 3 }, ups: { ok: 1, bad: 1 }, eas: { ok: 8 }, tag: { ok: 4 } } : {}),
    harvestDest: x.closing ? 'Warehouse ตลาดนิมิต' : '', removalDate: x.closing ? '2026-12-15' : '' }, base);
  const cols = ctx._csysExtraColumns_(form);
  const id = 'CSYS-17629' + (10000 + n), d = DEMO.find(r => r[0] === x.g);
  const att = {}; JSON.parse(cols.Items_JSON).forEach(it => { if (it.qFix + it.qNew) att[it.pk] = ['https://drive.google.com/thumbnail?id=demo_' + id + it.iid]; });
  const row = Object.assign({ Timestamp: x.ts, ID: id, 'Branch Code': BRANCH(x.g), 'Branch Name': d[1], 'Store Format': d[2] === 'BCM' ? 'Mini Big C' : d[2] === 'BMK' ? 'Market' : 'Hyper', Region: d[3],
    'Reporter Name': x.who, 'Reporter Email': 'demo@bigc.co.th', 'Reporter Phone': '081-234-5678', 'Has Broken': n === 0 ? 'Yes' : 'No',
    'Broken Detail': n === 0 ? 'DVR ชุดที่ 3 (กล้อง CH33–48) ไม่บันทึกภาพตั้งแต่ 3 วันก่อน' : '', Comments: n === 0 ? 'แนะนำเปลี่ยน DVR ชุด 3 เป็น NVR เพราะกล้อง Analog เสียซ้ำ' : '' }, cols);
  const listRow = Object.assign({}, row); ['Items_JSON', 'Checks_JSON', 'Harvest_JSON'].forEach(k => delete listRow[k]);
  LIST.unshift(listRow);
  RECORDS[id] = Object.assign({}, row, { Attachments_JSON: att });
  sheetRows.push(HDR.map(h => h === 'Attachments_JSON' ? JSON.stringify(att) : h === 'Survey Purpose' ? row['Survey Purpose'] : row[h]));
});
LIST.sort((a, b) => a.Timestamp < b.Timestamp ? 1 : -1);
SHEET_ROWS = sheetRows;
ctx.hyperSurveyList_ = () => ({ success: true, data: LIST.map(r => Object.assign({}, r)) });
ctx.hyperSurveyRecordById_ = (def, id) => ({ success: true, data: JSON.parse(JSON.stringify(RECORDS[id])) });

ctx._modDoneBySheet_ = () => Object.fromEntries(SURVEYS.map(x => [BRANCH(x.g), x.ts.slice(8, 10) + '/' + x.ts.slice(5, 7) + '/' + x.ts.slice(0, 4)]));
const OUT = {
  tags: ctx.getCctvSysStoreTags(),
  overview: ctx.getCctvSysOverview(false), items: ctx.getCctvSysItemRows(false), list: ctx.getCctvSysSurveyList(false),
  records: Object.fromEntries(Object.keys(RECORDS).map(id => [id, ctx.getCctvSysSurveyRecordById(id)])),
  ctx: Object.fromEntries(DEMO.map(d => [BRANCH(d[0]), ctx.getCctvSysStoreContext(BRANCH(d[0]))])),
  lpInfo: ctx.getCctvLpRegisterInfo('demo@bigc.co.th')
};
OUT.overview.lpFile = 'Export_ข้อมูลรายสาขา_sent V.3.xlsx (Demo)';

const MOCK = `
<script>
  window.__D = ${JSON.stringify(OUT)};
  (function () {
    const C = x => JSON.parse(JSON.stringify(x));
    const H = {
      getCctvSysOverview: () => C(__D.overview), getCctvSysItemRows: () => C(__D.items), getCctvSysSurveyList: () => C(__D.list),
      getCctvSysSurveyRecordById: id => C(__D.records[id]), getCctvSysStoreContext: code => C(__D.ctx[code] || { success: true, gold: code, lp: { asOf: '2026-11-10', cards: [] }, cms: { jobs: [], cited: {} } }),
      getCctvLpRegisterInfo: () => C(__D.lpInfo), getCctvSysStoreTags: () => C(__D.tags), getUserFlags: () => ({ isAdmin: true, isScheduleAdmin: true, smfEditAllowed: true, opsEditAllowed: true }),
      hyperUploadSurveyPhoto: () => ({ success: true, url: 'https://drive.google.com/thumbnail?id=up' + Math.random() }),
      processCctvSysSurveyForm: () => ({ success: true }), updateCctvSysItemCms: () => ({ success: true }), updateCctvSysSurveyRecord: () => ({ success: true })
    };
    function runner(ok, fail) {
      return new Proxy({}, { get(_, k) {
        if (k === 'withSuccessHandler') return f => runner(f, fail);
        if (k === 'withFailureHandler') return f => runner(ok, f);
        return (...args) => setTimeout(() => {
          if (!H[k]) { console.log('MISSING server fn', k); return; }
          try { const r = H[k](...args); ok && ok(r); } catch (e) { console.log('SERVER ERR', k, e.message); fail && fail(e); }
        }, 150);
      } });
    }
    window.google = { script: { run: runner() } };
  })();
</script>`;
const fill = html => html
  .replace(/<\?!=\s*JSON\.stringify\(getCctvSysConfig_\(\)\)\s*\?>/g, JSON.stringify(CFG))
  .replace(/<\?!=\s*include\('ArchiveToggle'\)\s*\?>/g, '')
  .replace(/<\?=\s*ScriptApp\.getService\(\)\.getUrl\(\)\s*\?>/g, '#')
  .replace(/<\?=\s*MANUALS_URL\s*\?>/g, '#').replace(/<\?=\s*CSYS_VIDEO_ID\s*\?>/g, 'demo');

// form shell: the index.html helper subset from vendor-fire.html + the store list the tab borrows from CctvSurveyTab.html
const vf = read('vendor-fire.html');
const shims = vf.slice(vf.indexOf('<script>', vf.indexOf('successModal')), vf.indexOf('</script>', vf.indexOf('async function hyperUploadPhotos')) + 9)
  .replace("window.HFI_VENDOR_TOKEN = '<?= passToken ?>';", '');
const STORES = DEMO.map(d => ({ code: BRANCH(d[0]), name: d[1], label: BRANCH(d[0]) + ' ' + d[1] + ' · ' + (d[2] === 'BCM' ? 'Mini Big C' : d[2] === 'BMK' ? 'Market' : 'Hyper'), fmt: d[2] === 'BCM' ? 'Mini Big C' : d[2] === 'BMK' ? 'Market' : 'Hyper', region: d[3] }));
const form = `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">${MOCK}
<script src="https://cdn.tailwindcss.com"></script>
<style>body{font-family:'Segoe UI',Tahoma,sans-serif;background:#f8fafc}.tab-content.hidden{display:block}</style></head>
<body><div class="max-w-4xl mx-auto px-3 py-4 bg-white">
<div id="globalLoading" class="hidden fixed inset-0 bg-black/40 z-[100] flex items-center justify-center"><div class="bg-white rounded-xl px-6 py-4"><span>Processing...</span></div></div>
<div id="successModal" class="hidden"></div>
${shims}
<script>
  var CURRENT_USER = { email: 'demo@bigc.co.th' };
  function sdsCheck() {} function sdsSave() {} function showDraftToast() {}
  function _cctvStores() { return ${JSON.stringify(STORES)}; }
</script>
${fill(read('CctvSystemSurveyTab.html'))}
</div></body></html>`;
fs.writeFileSync(path.join(__dirname, 'form.html'), form);
const rep = fill(read('CctvSystemSurveyReport.html')).replace('<head>', '<head>' + MOCK)
  .replace("localStorage.getItem('app_auth_token')", "'demo'").replace("JSON.parse(localStorage.getItem('app_user_data') || 'null')", "({ email: 'demo@bigc.co.th' })");
fs.writeFileSync(path.join(__dirname, 'report.html'), rep);
const ov = OUT.overview.rows;
console.log('form.html + report.html ·', ov.length, 'stores ·', LIST.length, 'surveys ·', OUT.items.rows.length, 'items · store1 cited cancelled', (ov.find(r => r.gold === '19101') || {}).citedCancelled);
